// Enrichment API route — submit gene set, return enrichment results
// Uses g:Profiler for Drosophila genes (native support), Enrichr as fallback
// with auto-resolve to human orthologs.

import { Router } from 'express';
import { runEnrichment } from '../services/enrichr.js';
import { runGProfiler } from '../services/gprofiler.js';
import { resolveGene as fbResolve, getOrthologs as fbOrthologs } from '../services/flybase.js';
import { lookupGene, getOrthologs as ensOrthologs } from '../services/ensembl.js';
import { cacheGet, cacheSet } from '../cache/db.js';
import { CACHE_TTL } from '../config/constants.js';
import { createHash } from 'crypto';

const router = Router();

const HOMO_SAPIENS = ['homo sapiens', 'human', 'homo', '9606'];

// ── Ortholog resolution (used when falling back to Enrichr) ──────

async function fetchHumanOrtholog(gene) {
  let fbgn = null;
  let flySymbol = null;
  let source = null;

  try {
    const r = await fbResolve(gene);
    if (r && r.fbgn) { fbgn = r.fbgn; flySymbol = r.symbol; source = 'flybase'; }
  } catch {}

  if (!fbgn) {
    try {
      const ens = await lookupGene(gene);
      if (ens && ens.geneId) { fbgn = ens.geneId; flySymbol = ens.symbol; source = 'ensembl'; }
    } catch {}
  }

  if (!fbgn) return { original: gene, status: 'unresolved' };

  let orthologCandidates = [];
  if (source === 'flybase') {
    try { orthologCandidates = await fbOrthologs(fbgn); } catch {}
  }
  if (orthologCandidates.length === 0) {
    try { orthologCandidates = await ensOrthologs(fbgn); } catch {}
  }

  const human = orthologCandidates.find(o =>
    o.species && HOMO_SAPIENS.some(h => o.species.toLowerCase().includes(h))
  );

  if (human && human.symbol) {
    return { original: gene, humanSymbol: human.symbol, identity: human.identity, flySymbol, flyFbgn: fbgn, status: 'mapped' };
  }
  return { original: gene, status: 'no_ortholog', flySymbol, flyFbgn: fbgn };
}

/**
 * POST /api/enrichment
 * Body: { genes: [...], databases: [...] }
 *
 * Strategy:
 * 1. If genes look like Drosophila → g:Profiler (native support, no ortholog needed)
 * 2. If genes look like human → Enrichr (direct)
 * 3. If Drosophila but g:Profiler fails → fall back to Enrichr + ortholog conversion
 */
router.post('/', async (req, res) => {
  const { genes, databases } = req.body;

  if (!Array.isArray(genes) || genes.length === 0) {
    return res.status(400).json({ error: 'genes array required' });
  }

  // This is a Drosophila transcriptomics tool — always try g:Profiler first.
  // g:Profiler supports many species and returns results for both fly and human genes.
  // Falls back to Enrichr + ortholog conversion only if g:Profiler fails.
  const sorted = [...genes].sort();
  const dbKey = (databases || []).sort().join(',');
  const cacheKey = `enrich:${createHash('sha256').update(sorted.join('|') + '|' + dbKey).digest('hex').slice(0, 16)}`;

  const cached = cacheGet(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    let result;

    // ── Try g:Profiler (handles Drosophila + many other species) ──────
    try {
      result = await runGProfiler(genes, databases);
      result.enrichmentEngine = 'gprofiler';
    } catch (gpErr) {
      console.warn('[Enrichment] g:Profiler failed, falling back to Enrichr:', gpErr.message);

      // ── Enrichr fallback with ortholog resolution ───────────────────
      const orthologResults = await Promise.all(genes.map(g => fetchHumanOrtholog(g)));
      const mapped = orthologResults.filter(r => r.status === 'mapped');
      const humanGenes = [...new Set(mapped.map(r => r.humanSymbol))].filter(Boolean);
      const useOrthologs = humanGenes.length > 0;
      const enrichmentGenes = useOrthologs ? humanGenes : genes;

      result = await runEnrichment(enrichmentGenes, databases);
      result.enrichmentEngine = 'enrichr';
      result.genesSubmitted = genes.length;
      result.enrichmentGenes = enrichmentGenes.length;
      if (useOrthologs) result.orthologMapping = orthologResults;
      result.orthologFallback = !useOrthologs;
    }

    result.cached = false;
    cacheSet(cacheKey, result, CACHE_TTL.enrichment);
    res.json(result);

  } catch (err) {
    console.error('[Enrichment] Error:', err.message);
    res.status(502).json({ error: 'Enrichment service error', details: err.message });
  }
});

export default router;
