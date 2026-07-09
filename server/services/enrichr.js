// Enrichr API client — gene set enrichment analysis
// Docs: https://maayanlab.cloud/Enrichr/help#api
// Free, no API key required. Rate limit: ~10 req/s.

import { HTTP_TIMEOUT, ENRICHR_DATABASES } from '../config/constants.js';

const BASE = 'https://maayanlab.cloud/Enrichr';

/**
 * Submit a gene list to Enrichr and get a userListId back.
 */
async function submitGeneList(genes, description = 'fly-explorer') {
  const url = `${BASE}/addList`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        list: Array.isArray(genes) ? genes.join('\n') : genes,
        description,
      }),
    });
    if (!res.ok) throw new Error(`Enrichr submit HTTP ${res.status}`);
    return res.json(); // { userListId, shortId }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch enrichment results for a submitted gene list against a specific database.
 */
async function getEnrichment(userListId, database) {
  const url = `${BASE}/enrich?userListId=${encodeURIComponent(userListId)}&backgroundType=${encodeURIComponent(database)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Enrichr query HTTP ${res.status}`);
    const data = await res.json();
    const rows = data[database] || [];
    return rows.map((row, index) => ({
      rank: index + 1,
      term: row[1],
      pValue: row[2],
      zScore: row[3],
      combinedScore: row[4],
      overlappingGenes: (row[5] || []).filter(Boolean),
      // row[0] = database-specific term ID
      termId: row[0] || null,
    }));
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Run full enrichment analysis: submit gene list, then query each requested database.
 *
 * @param {string[]} genes - Gene symbols to analyze.
 * @param {string[]} databases - List of Enrichr database names (default: GO_BP).
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
  const validDbs = databases.filter(d => ENRICHR_DATABASES.includes(d) || d.startsWith('GO_') || d.startsWith('KEGG') || d.startsWith('WikiPathway'));

  if (validDbs.length === 0) {
    validDbs.push('GO_Biological_Process_2023');
  }

  // Query each database in parallel
  const results = {};
  const dbPromises = validDbs.map(async (db) => {
    try {
      results[db] = await getEnrichment(userListId, db);
    } catch (err) {
      results[db] = { error: err.message };
    }
  });

  await Promise.all(dbPromises);

  const totalGenes = Object.values(results).reduce((max, r) => {
    if (Array.isArray(r) && r.length > 0) {
      const overlap = r[0]?.overlappingGenes?.length || 0;
      return Math.max(max, overlap);
    }
    return max;
  }, 0);

  return {
    jobId: `enc_${userListId}`,
    genesSubmitted: genes.length,
    genesMapped: Math.max(totalGenes, Math.min(genes.length, 1)),
    databases: validDbs,
    results,
  };
}
