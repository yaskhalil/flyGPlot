// Enrichr API client — gene set enrichment analysis
// Docs: https://maayanlab.cloud/Enrichr/help#api
// Free, no API key required. Rate limit: ~10 req/s.

import { HTTP_TIMEOUT, ENRICHR_DATABASES } from '../config/constants.js';

const BASE = 'https://maayanlab.cloud/Enrichr';
const PER_DB_TIMEOUT = 20000; // 20s per individual database query

/**
 * Enrichr returns results as positional arrays.
 * This maps array indices to named fields.
 */
function parseEnrichmentRow(row, index) {
  if (!Array.isArray(row) || row.length < 3) return null;
  return {
    rank: index + 1,
    term: String(row[1] || ''),
    pValue: parseFloat(row[2]) || 1,
    zScore: parseFloat(row[3]) || 0,
    combinedScore: parseFloat(row[4]) || 0,
    overlappingGenes: (Array.isArray(row[5]) ? row[5] : []).filter(Boolean),
    termId: row[0] ? String(row[0]) : null,
  };
}

/**
 * Submit a gene list to Enrichr and get a userListId back.
 */
async function submitGeneList(genes, description = 'fly-explorer') {
  const url = `${BASE}/addList`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
  try {
    const formData = new FormData();
    formData.append('list', Array.isArray(genes) ? genes.join('\n') : genes);
    formData.append('description', description);
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      body: formData,
    });
    if (!res.ok) throw new Error(`Enrichr submit HTTP ${res.status}`);
    return res.json(); // { userListId, shortId }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch enrichment results for a submitted gene list against a specific database.
 * Each database query gets its own independent timeout.
 */
async function getEnrichment(userListId, database) {
  const url = `${BASE}/enrich?userListId=${encodeURIComponent(userListId)}&backgroundType=${encodeURIComponent(database)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PER_DB_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Enrichr query HTTP ${res.status}`);
    const data = await res.json();
    const rows = data[database] || [];
    return rows
      .map((row, index) => parseEnrichmentRow(row, index))
      .filter(Boolean);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Validate a database name against known Enrichr databases.
 */
function isValidDatabase(db) {
  return ENRICHR_DATABASES.includes(db);
}

/**
 * Run full enrichment analysis: submit gene list, then query each requested database.
 *
 * @param {string[]} genes - Gene symbols to analyze.
 * @param {string[]} databases - List of Enrichr database names.
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<object>} { job_id, genes_submitted, genes_mapped, databases, results }
 */
export async function runEnrichment(genes, databases = ['GO_Biological_Process_2023'], options = {}) {
  if (!genes || genes.length === 0) {
    return { error: 'At least one gene required', genes_submitted: 0 };
  }

  // Submit once
  const submitResult = await submitGeneList(genes, 'fly-explorer-cohort');
  if (!submitResult || !submitResult.userListId) {
    return { error: 'Failed to submit gene list to Enrichr' };
  }

  const userListId = submitResult.userListId;

  // Filter to known databases, fallback to GO_BP
  let validDbs = (databases || []).filter(isValidDatabase);
  if (validDbs.length === 0) {
    validDbs.push('GO_Biological_Process_2023');
  }

  // Query each database in parallel — each has its own timeout
  const dbPromises = validDbs.map(async (db) => {
    try {
      const rows = await getEnrichment(userListId, db);
      return { db, rows };
    } catch (err) {
      return { db, rows: [], error: err.message };
    }
  });

  const dbResults = await Promise.all(dbPromises);

  // Build results map
  const results = {};
  for (const { db, rows, error } of dbResults) {
    results[db] = error ? { error } : rows;
  }

  // Count how many genes Enrichr actually mapped (from the first non-error result)
  let genesMapped = 0;
  for (const { rows } of dbResults) {
    if (rows.length > 0) {
      const seen = new Set();
      for (const r of rows) {
        for (const g of (r.overlappingGenes || [])) {
          seen.add(g.toLowerCase());
        }
      }
      genesMapped = Math.max(genesMapped, seen.size);
      break; // Use first available result
    }
  }

  return {
    jobId: `enc_${userListId}`,
    genesSubmitted: genes.length,
    genesMapped,
    databases: validDbs,
    results,
  };
}
