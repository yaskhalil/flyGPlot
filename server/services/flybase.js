// FlyBase REST API client — official Drosophila gene database
// Note: Direct /gene/{symbol} returns empty for symbols — use /search?q= first
//       to resolve symbol → FBgn, then /gene/{fbgn} for full record.

import config from '../config/env.js';
import { HTTP_TIMEOUT } from '../config/constants.js';

const BASE = config.flybase.baseUrl;

async function fbFetch(path) {
  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
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
    if (!text || text.trim().length === 0) return null;
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
 * Search for a gene by symbol — returns first matching FBgn.
 * FlyBase's /gene/{symbol} endpoint returns empty; must search first.
 */
export async function searchGene(symbol) {
  const data = await fbFetch(`/search?q=${encodeURIComponent(symbol)}&type=gene`);
  if (!data || !Array.isArray(data.results) || data.results.length === 0) {
    return null;
  }
  const first = data.results[0];
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
  return {
    fbgn: data.id || fbgn,
    symbol: data.symbol || null,
    name: data.name || null,
    synonyms: data.synonyms || [],
    chromosome: data.chromosome || null,
    cytogeneticLocation: data.cytogenetic_location || null,
    geneType: data.gene_type || null,
    summary: data.description || null,
    organism: data.organism || null,
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
  if (!data || !Array.isArray(data)) return [];
  return data.map(g => ({
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
  if (!data || !Array.isArray(data)) return [];
  return data.map(a => ({
    allele: a.symbol || a.name,
    phenotype: a.phenotype || null,
    type: a.allele_type || null,
  }));
}

/**
 * Fetch orthologs for a gene by FBgn ID.
 */
export async function getOrthologs(fbgn) {
  const data = await fbFetch(`/gene/${encodeURIComponent(fbgn)}/orthologs`);
  if (!data || !Array.isArray(data)) return [];
  return data.map(o => ({
    species: o.species_name || o.species,
    symbol: o.symbol || o.gene_symbol,
    identity: o.identity || o.percent_identity || null,
    support: o.support || null,
  }));
}
