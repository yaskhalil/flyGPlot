// Genes API routes — resolve, metadata, synonyms, batch
// Primary: FlyBase (richest data). Fallback: Ensembl (most reliable).
// All results cached in SQLite.

import { Router } from 'express';
import { resolveGene as fbResolve, getGoTerms, getAlleles, getOrthologs, getReagents } from '../services/flybase.js';
import { lookupGene, resolveSynonym as ensemblResolve, getOrthologs as ensOrthologs } from '../services/ensembl.js';
import { getGeneCache, setGeneCache } from '../cache/db.js';

const router = Router();

/**
 * GET /api/genes/resolve?symbol=achi
 * Resolve a gene symbol to canonical ID.
 * Tries FlyBase first (richer data), falls back to Ensembl.
 */
router.get('/resolve', async (req, res) => {
  const { symbol } = req.query;
  if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
    return res.status(400).json({ error: 'symbol query parameter required' });
  }
  const sym = symbol.trim();

  // Check cache
  const cached = getGeneCache(sym);
  if (cached) return res.json(cached);

  // Try FlyBase first
  let result = null;
  let source = 'flybase';
  try {
    result = await fbResolve(sym);
  } catch (err) {
    console.warn(`[Genes] FlyBase error for '${sym}':`, err.message);
  }

  // Fallback to Ensembl
  if (!result || (!result.fbgn && !result.name)) {
    try {
      const ens = await lookupGene(sym);
      if (ens) {
        result = {
          fbgn: ens.geneId,
          symbol: ens.symbol,
          name: ens.name,
          synonyms: [],
          chromosome: ens.chromosome,
          geneType: ens.biotype,
          summary: ens.name,
        };
        source = 'ensembl';
      }
    } catch (err) {
      console.warn(`[Genes] Ensembl error for '${sym}':`, err.message);
    }
  }

  if (!result) {
    return res.status(404).json({ error: `Gene '${sym}' not found in FlyBase or Ensembl` });
  }

  result.source = source;

  // Cache and return
  setGeneCache(sym, result);
  res.json(result);
});

/**
 * GET /api/genes/metadata?gene=achi
 * Comprehensive gene metadata — GO terms, alleles, orthologs.
 */
router.get('/metadata', async (req, res) => {
  const { gene } = req.query;
  if (!gene) return res.status(400).json({ error: 'gene query parameter required' });

  // First resolve the gene to get FBgn
  let fbgn = null;
  let resolved = null;
  let source = 'flybase';

  try { resolved = await fbResolve(gene); } catch {}

  if (resolved && resolved.fbgn) {
    fbgn = resolved.fbgn;
  } else {
    // Try Ensembl
    try {
      const ens = await lookupGene(gene);
      if (ens) {
        fbgn = ens.geneId;
        resolved = {
          symbol: ens.symbol,
          name: ens.name,
          chromosome: ens.chromosome,
          geneType: ens.biotype,
        };
        source = 'ensembl';
      }
    } catch {}
  }

  if (!resolved) {
    return res.status(404).json({ error: `Gene '${gene}' not found` });
  }

  // Fetch annotations in parallel (with timeouts)
  let goTerms = [], alleles = [], orthologs = [];

  if (fbgn && source === 'flybase') {
    [goTerms, alleles, orthologs] = await Promise.all([
      getGoTerms(fbgn).catch(() => []),
      getAlleles(fbgn).catch(() => []),
      getOrthologs(fbgn).catch(() => []),
    ]);
  } else if (fbgn) {
    try { orthologs = await ensOrthologs(fbgn); } catch {}
  }

  res.json({
    gene: resolved.symbol,
    fbgn,
    name: resolved.name,
    chromosome: resolved.chromosome || null,
    geneType: resolved.geneType || null,
    summary: resolved.summary || resolved.name,
    goTerms,
    alleles,
    orthologs,
    source,
  });
});

/**
 * GET /api/genes/synonyms?gene=achi
 * Get known synonyms for a gene — uses Ensembl xrefs (proven reliable).
 */
router.get('/synonyms', async (req, res) => {
  const { gene } = req.query;
  if (!gene) return res.status(400).json({ error: 'gene query parameter required' });

  // Ensembl synonym resolution is the most reliable for this
  const syns = await ensemblResolve(gene).catch(() => []);
  if (syns.length > 0) {
    return res.json({
      gene: syns[0].symbol,
      geneId: syns[0].geneId,
      source: 'ensembl',
      synonyms: syns.map(s => ({
        symbol: s.symbol,
        geneId: s.geneId,
        type: s.dbType || 'ensembl',
      })),
    });
  }

  res.status(404).json({ error: `No synonyms found for '${gene}'` });
});

/**
 * POST /api/genes/batch
 * Batch resolve multiple genes — tries cache first, then FlyBase, then Ensembl.
 * Body: { genes: ["achi", "ab", "unknown"] }
 */
router.post('/batch', async (req, res) => {
  const { genes } = req.body;
  if (!Array.isArray(genes) || genes.length === 0) {
    return res.status(400).json({ error: 'genes array required' });
  }

  const resolved = [];
  const unresolved = [];

  for (const input of genes) {
    // Check cache first
    const cached = getGeneCache(input);
    if (cached) {
      resolved.push({ input, symbol: cached.symbol, fbgn: cached.fbgn || null, source: 'cache' });
      continue;
    }

    let result = null;
    let source = 'flybase';

    // Try FlyBase
    try { result = await fbResolve(input); } catch {}

    // Fallback to Ensembl
    if (!result) {
      try {
        const ens = await lookupGene(input);
        if (ens) {
          result = { fbgn: ens.geneId, symbol: ens.symbol, name: ens.name };
          source = 'ensembl';
        }
      } catch {}
    }

    if (result) {
      setGeneCache(input, result);
      resolved.push({ input, symbol: result.symbol, fbgn: result.fbgn || null, source });
    } else {
      unresolved.push(input);
    }
  }

  res.json({ total: genes.length, resolved, unresolved });
});

/**
 * GET /api/genes/reagents?gene=achi
 * Get available MiMIC/CRIMIC/split-GAL4 reagent info for a gene.
 * Provides FlyBase reagent page links for ordering.
 */
router.get('/reagents', async (req, res) => {
  const { gene } = req.query;
  if (!gene || typeof gene !== 'string' || !gene.trim()) {
    return res.status(400).json({ error: 'gene query parameter required' });
  }
  const sym = gene.trim();

  // Resolve to FBgn first
  let fbgn = null;
  let symbol = sym;
  try {
    const fb = await fbResolve(sym);
    if (fb && fb.fbgn) {
      fbgn = fb.fbgn;
      symbol = fb.symbol || sym;
    }
  } catch {}

  if (!fbgn) {
    try {
      const ens = await lookupGene(sym);
      if (ens && ens.geneId) {
        fbgn = ens.geneId;
        symbol = ens.symbol || sym;
      }
    } catch {}
  }

  if (!fbgn) {
    return res.status(404).json({ error: `Gene '${sym}' not found` });
  }

  try {
    const reagents = await getReagents(fbgn);
    res.json({ gene: symbol, fbgn, ...reagents });
  } catch (err) {
    console.error(`[Reagents] Error for '${sym}':`, err.message);
    res.status(502).json({
      error: 'Failed to fetch reagent data',
      gene: symbol,
      fbgn,
      flybaseUrl: `https://flybase.org/reports/${fbgn}`,
      reagentsUrl: `https://flybase.org/reports/${fbgn}#reagents`,
    });
  }
});

export default router;
