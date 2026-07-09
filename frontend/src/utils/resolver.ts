// Gene Synonym Resolver Client Module
// Now proxies through backend API for caching + FlyBase fallback.
// Falls back to direct Ensembl calls if backend is unreachable.

import { apiClient } from '../services/apiClient';

const DIRECT_ENSEMBL = 'https://rest.ensembl.org';

const resolutionCache = new Map<string, { canonical: string | null; warning: string | null }>();
const metadataCache = new Map<string, { flybase: string; name: string; summary: string } | null>();

/**
 * Resolve a single symbol to its canonical display name.
 * Tries backend API first, falls back to direct Ensembl call.
 */
export async function resolveSynonym(symbol: string): Promise<{ canonical: string | null; warning: string | null }> {
  const cleanSymbol = symbol.trim();
  if (!cleanSymbol) return { canonical: null, warning: null };

  const cacheKey = cleanSymbol.toLowerCase();
  if (resolutionCache.has(cacheKey)) {
    return resolutionCache.get(cacheKey)!;
  }

  // Try backend
  try {
    const result = await apiClient.resolveGene(cleanSymbol);
    if (result && result.symbol) {
      const out = {
        canonical: result.symbol,
        warning: result.source === 'ensembl' ? `Resolved via Ensembl: ${result.symbol}` : null,
      };
      resolutionCache.set(cacheKey, out);
      return out;
    }
  } catch {}

  // Fallback: direct Ensembl
  try {
    const res = await fetch(`${DIRECT_ENSEMBL}/xrefs/symbol/drosophila_melanogaster/${cleanSymbol}?content-type=application/json`);
    if (!res.ok) throw new Error('API Error');
    const data = await res.json();
    const geneMatches = data.filter((x: any) => x.type === 'gene');
    if (geneMatches.length === 0) {
      resolutionCache.set(cacheKey, { canonical: null, warning: null });
      return { canonical: null, warning: null };
    }

    const id = geneMatches[0].id;
    const lookupRes = await fetch(`${DIRECT_ENSEMBL}/lookup/id/${id}?content-type=application/json`);
    if (!lookupRes.ok) throw new Error('Lookup Error');
    const lookupData = await lookupRes.json();
    const canonical = lookupData.display_name || null;

    let warning: string | null = null;
    if (geneMatches.length > 1) {
      const allMatches = geneMatches.map((x: any) => x.display_id || x.id).join(', ');
      warning = `Synonym "${cleanSymbol}" maps to multiple genes: ${allMatches}. Using "${canonical}".`;
    }

    const result = { canonical, warning };
    resolutionCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`Error resolving synonym for "${cleanSymbol}":`, error);
    return { canonical: null, warning: null };
  }
}

/**
 * Resolve a bulk string of space/comma-separated gene symbols/synonyms.
 * Uses backend batch endpoint for efficiency.
 */
export async function resolveBulk(
  bulkInput: string,
  allGenesMapLower: Record<string, string>
): Promise<{ resolved: string[]; unresolved: string[]; warnings: string[] }> {
  const tokens = bulkInput.split(/[\s,;\n]+/).map(t => t.trim()).filter(Boolean);
  const resolved: string[] = [];
  const unresolved: string[] = [];
  const warnings: string[] = [];

  // First pass: check local index
  const remoteBatch: string[] = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (allGenesMapLower[lower]) {
      resolved.push(allGenesMapLower[lower]);
    } else {
      remoteBatch.push(token);
    }
  }

  // Second pass: batch resolve via backend
  if (remoteBatch.length > 0) {
    try {
      const batch = await apiClient.resolveBatch(remoteBatch);
      for (const r of batch.resolved) {
        resolved.push(r.symbol);
        if (r.source !== 'cache') {
          warnings.push(`Resolved "${r.input}" → ${r.symbol} via ${r.source}`);
        }
      }
      unresolved.push(...batch.unresolved);
    } catch {
      // Fallback: one-by-one via Ensembl
      for (const token of remoteBatch) {
        const { canonical, warning } = await resolveSynonym(token);
        if (canonical && allGenesMapLower[canonical.toLowerCase()]) {
          resolved.push(allGenesMapLower[canonical.toLowerCase()]);
          warnings.push(warning || `Resolved synonym "${token}" to "${canonical}"`);
        } else {
          unresolved.push(token);
        }
      }
    }
  }

  const uniqueResolved = Array.from(new Set(resolved));
  return { resolved: uniqueResolved, unresolved, warnings };
}

/**
 * Fetches detailed metadata for a gene symbol — proxies through backend.
 */
export async function fetchGeneMetadata(
  geneSymbol: string
): Promise<{ flybase: string; name: string; summary: string } | null> {
  const cleanSymbol = geneSymbol.trim();
  if (!cleanSymbol) return null;

  if (metadataCache.has(cleanSymbol)) {
    return metadataCache.get(cleanSymbol)!;
  }

  // Try backend
  try {
    const meta = await apiClient.getGeneMetadata(cleanSymbol);
    if (meta) {
      const result = {
        flybase: meta.fbgn || meta.geneId || cleanSymbol,
        name: meta.name || cleanSymbol,
        summary: meta.summary || meta.name || 'No description available.',
      };
      metadataCache.set(cleanSymbol, result);
      return result;
    }
  } catch {}

  // Fallback: direct Ensembl
  try {
    const res = await fetch(`${DIRECT_ENSEMBL}/lookup/symbol/drosophila_melanogaster/${cleanSymbol}?content-type=application/json`);
    if (!res.ok) throw new Error('Symbol lookup failed');
    const data = await res.json();
    if (data && data.id) {
      const descRes = await fetch(`${DIRECT_ENSEMBL}/lookup/id/${data.id}?content-type=application/json;expand=1`);
      if (!descRes.ok) throw new Error('Description lookup failed');
      const data2 = await descRes.json();
      const result = {
        flybase: data.id,
        name: data2.description?.split('[')[0]?.trim() || 'Unknown Description',
        summary: data2.description || 'No detailed description available.',
      };
      metadataCache.set(cleanSymbol, result);
      return result;
    }
    metadataCache.set(cleanSymbol, null);
    return null;
  } catch (error) {
    console.error(`Error fetching gene metadata for "${cleanSymbol}":`, error);
    return null;
  }
}
