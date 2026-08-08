// FlyBase REST API client — official Drosophila gene database
// Note: Direct /gene/{symbol} returns empty for symbols — use /search?q= first
//       to resolve symbol → FBgn, then /gene/{fbgn} for full record.

import config from '../config/env.js';

const BASE = config.flybase.baseUrl;
const FLYBASE_TIMEOUT = 5000; // FlyBase is slow — fail fast to Ensembl fallback

/**
 * Thrown when FlyBase answers 2xx with an empty body. It does this both from its
 * CloudFront layer when throttling and from the API itself for a route it does
 * not recognise. Either way it is not an answer: a gene with no annotations
 * comes back as an envelope with an empty `result`, never as zero bytes.
 * Distinct from "no such gene" so callers can report a degraded upstream
 * instead of an empty result.
 */
export class FlyBaseUnavailableError extends Error {
  constructor(path, status) {
    super(`FlyBase returned an empty ${status} body for ${path}`);
    this.name = 'FlyBaseUnavailableError';
    this.status = status;
    this.retryable = true;
  }
}

async function fbFetch(path) {
  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FLYBASE_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`FlyBase HTTP ${res.status}: ${res.statusText}`);
    }
    const text = await res.text();
    // An empty body on a 2xx is never a valid answer — it is not even JSON, and
    // `res.ok` is true for it. Without this check it parses as "gene has no
    // data" and the caller silently reports zero GO terms, zero alleles and
    // zero reagents for a gene that has plenty.
    if (!text || text.trim().length === 0) {
      throw new FlyBaseUnavailableError(path, res.status);
    }
    return JSON.parse(text);
  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn('[FlyBase] Request timed out:', path);
      return null;
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Unwrap FlyBase's `{ resultset: { result: [...] } }` envelope. Payloads arrive
 * wrapped even when they hold a single record, so callers that test the top
 * level with `Array.isArray` see an object and drop a perfectly good response.
 */
function resultsOf(data) {
  if (!data) return [];
  const r = data?.resultset?.result ?? data;
  return Array.isArray(r) ? r : [];
}

/**
 * Search for a gene by symbol — returns first matching FBgn.
 * FlyBase's /gene/{symbol} endpoint returns empty; must search first.
 */
export async function searchGene(symbol) {
  const data = await fbFetch(`/search?q=${encodeURIComponent(symbol)}&type=gene`);
  // Search predates the resultset envelope in this client and was written
  // against a `{ results: [...] }` body; accept either rather than assume.
  const rows = resultsOf(data);
  const hits = rows.length > 0 ? rows : (Array.isArray(data?.results) ? data.results : []);
  if (hits.length === 0) return null;

  const first = hits[0];
  return {
    fbgn: first.id || null,
    symbol: first.symbol || symbol,
    name: first.name || null,
    score: first.score || null,
  };
}

/**
 * Fetch full gene record by FBgn ID.
 */
export async function getGeneByFbgn(fbgn) {
  const data = await fbFetch(`/gene/${encodeURIComponent(fbgn)}`);
  if (!data) return null;

  // A single-record endpoint still answers with the envelope. An envelope that
  // is present but empty is a real "no such gene"; a body with no envelope at
  // all is the record itself.
  const rows = resultsOf(data);
  const rec = rows[0] ?? (data.resultset ? null : data);
  if (!rec) return null;

  return {
    fbgn: rec.id || fbgn,
    symbol: rec.symbol || null,
    name: rec.name || null,
    synonyms: rec.synonyms || [],
    chromosome: rec.chromosome || null,
    cytogeneticLocation: rec.cytogenetic_location || null,
    geneType: rec.gene_type || null,
    summary: rec.description || rec.summary || null,
    organism: rec.organism || null,
  };
}

/**
 * Resolve a gene symbol → full FlyBase gene record.
 * Two-step: search for symbol → get record by FBgn.
 */
export async function resolveGene(symbol) {
  // First search for the FBgn
  const searchResult = await searchGene(symbol);
  if (!searchResult || !searchResult.fbgn) return null;

  // Then fetch full record
  const full = await getGeneByFbgn(searchResult.fbgn);
  if (full) return full;

  // Return at least what search gave us
  return {
    fbgn: searchResult.fbgn,
    symbol: searchResult.symbol,
    name: searchResult.name,
    synonyms: [],
    chromosome: null,
    cytogeneticLocation: null,
    geneType: null,
    summary: null,
  };
}

/**
 * Fetch GO term annotations for a gene by FBgn ID.
 */
export async function getGoTerms(fbgn) {
  const data = await fbFetch(`/gene/${encodeURIComponent(fbgn)}/go`);
  return resultsOf(data).map(g => ({
    goId: g.go_id || g.id,
    term: g.term_name || g.term,
    evidence: g.evidence_code || g.evidence,
    aspect: g.aspect || null,
  }));
}

/**
 * Fetch alleles and phenotypes for a gene by FBgn ID.
 */
export async function getAlleles(fbgn) {
  const data = await fbFetch(`/gene/${encodeURIComponent(fbgn)}/alleles`);
  return resultsOf(data).map(a => ({
    allele: a.symbol || a.name,
    phenotype: a.phenotype || null,
    type: a.allele_type || null,
  }));
}

/**
 * Fetch reagent/allele information for a gene by FBgn ID.
 * Falls back to providing FlyBase reagent links when API data is unavailable.
 */
export async function getReagents(fbgn) {
  // Try the FlyBase alleles API
  let alleles = [];
  // Distinguishes "this gene genuinely has no lines" from "we could not ask".
  // Reporting alleleCount: 0 for the second case is what made this endpoint
  // look functional while returning nothing usable.
  let degraded = false;
  try {
    const data = await fbFetch(`/gene/${encodeURIComponent(fbgn)}/alleles`);
    const rows = resultsOf(data);
    if (rows.length > 0) {
      alleles = rows.map(a => ({
        symbol: a.symbol || a.name || null,
        type: a.allele_type || a.type || null,
        phenotype: a.phenotype || null,
      }));
    }
  } catch (err) {
    degraded = true;
    console.warn(`[FlyBase] reagents unavailable for ${fbgn}: ${err.message}`);
  }

  // Build FlyBase reagent page URLs
  return {
    fbgn,
    alleles,
    alleleCount: alleles.length,
    // When true, alleleCount reflects a failed lookup, not an empty gene.
    degraded,
    note: degraded
      ? 'FlyBase did not return reagent data for this request. Counts below are not authoritative — use the FlyBase links to check for available lines.'
      : undefined,
    flybaseUrl: `https://flybase.org/reports/${fbgn}`,
    reagentsUrl: `https://flybase.org/reports/${fbgn}#reagents`,
    allelesUrl: `https://flybase.org/reports/${fbgn}#alleles`,
    insertionsUrl: `https://flybase.org/reports/${fbgn}#insertions`,
    // Known MiMIC/CRIMIC line patterns for reference
    lineTypes: [
      { type: 'MiMIC', description: 'Minos-mediated integration cassette — Trojan-GAL4, protein trap, enhancer trap', prefix: 'Mi{' },
      { type: 'CRIMIC', description: 'CRISPR-mediated integration cassette — similar to MiMIC but CRISPR-based', prefix: 'CRIMIC' },
      { type: 'split-GAL4', description: 'Intersectional driver made from two hemi-drivers (AD + DBD)', prefix: 'split-GAL4' },
      { type: 'GAL4', description: 'Classical enhancer trap GAL4 lines', prefix: 'GAL4' },
    ],
  };
}

/**
 * Fetch orthologs in other species for a gene by FBgn ID.
 */
export async function getOrthologs(fbgn) {
  const data = await fbFetch(`/gene/${encodeURIComponent(fbgn)}/orthologs`);
  return resultsOf(data).map(o => ({
    species: o.species_name || o.species,
    symbol: o.symbol || o.gene_symbol,
    identity: o.identity || o.percent_identity || null,
    support: o.support || null,
  }));
}
