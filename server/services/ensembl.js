// Ensembl REST API client — gene synonym resolution & cross-referencing
// Docs: https://rest.ensembl.org/documentation/
// Used as fallback when FlyBase doesn't return a result.

import { DROSOPHILA, HTTP_TIMEOUT } from '../config/constants.js';

const BASE = 'https://rest.ensembl.org';

async function ensemblFetch(path) {
  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'fly-expression-explorer/1.0',
      },
    });
    if (!res.ok) {
      if (res.status === 404 || res.status === 400) return null;
      throw new Error(`Ensembl HTTP ${res.status}: ${res.statusText}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Look up a gene by symbol using Ensembl's lookup endpoint.
 * This resolves the symbol to its stable ID and display name.
 */
export async function lookupGene(symbol) {
  const data = await ensemblFetch(
    `/lookup/symbol/${DROSOPHILA.ensemblName}/${encodeURIComponent(symbol)}`
  );
  if (!data) return null;
  return {
    geneId: data.id || null,
    symbol: data.display_name || data.id || symbol,
    name: data.description ? data.description.split('[')[0].trim() : null,
    biotype: data.biotype || null,
    chromosome: data.seq_region_name || null,
    start: data.start || null,
    end: data.end || null,
    strand: data.strand || null,
    source: 'ensembl',
  };
}

/**
 * Resolve a synonym to a canonical gene ID using Ensembl xrefs.
 * Returns array of potential matches, sorted by confidence.
 */
export async function resolveSynonym(synonym) {
  const data = await ensemblFetch(
    `/xrefs/symbol/${DROSOPHILA.ensemblName}/${encodeURIComponent(synonym)}`
  );
  if (!data) return [];
  const geneMatches = data.filter(x => x.type === 'gene');
  if (geneMatches.length === 0) return [];

  // Fetch display names for each match
  const results = [];
  for (const match of geneMatches.slice(0, 5)) {
    const lookup = await ensemblFetch(`/lookup/id/${match.id}`);
    results.push({
      geneId: match.id,
      symbol: lookup?.display_name || match.display_id || match.id,
      dbType: match.db_display_name || match.db_type || null,
      description: lookup?.description || null,
    });
  }
  return results;
}

/**
 * Fetch orthologs from Ensembl Compara.
 */
export async function getOrthologs(geneId) {
  const data = await ensemblFetch(`/homology/id/${geneId}?type=orthologues`);
  if (!data || !data.data) return [];
  const hom = data.data[0]?.homologies || [];
  return hom
    .filter(h => h.type === 'orthologue')
    .map(h => ({
      species: h.target.species || null,
      symbol: h.target.display_name || h.target.id || null,
      identity: h.identity || h.perc_id || null,
      type: h.sub_type || 'ortholog_one2one',
    }));
}
