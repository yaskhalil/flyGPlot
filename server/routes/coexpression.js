// Co-expression API routes — compute and serve gene co-expression data
// Two modes:
//   1. On-the-fly: GET /api/coexpression/:gene?metric=pearson&min_score=0.5
//   2. Bulk precompute: POST /api/coexpression/precompute

import { Router } from 'express';
import { computeCoexpression, computePairwise } from '../services/coexpression.js';
import { cacheGet, cacheSet } from '../cache/db.js';
import { CACHE_TTL } from '../config/constants.js';
import { createHash } from 'crypto';

const router = Router();

/**
 * GET /api/coexpression/:gene?metric=pearson&min_score=0.5&stages=P15,P30
 * Compute co-expression for a reference gene against all others.
 */
router.get('/:gene', async (req, res) => {
  const { gene } = req.params;
  const { metric = 'pearson', min_score = '0', stages, max_results = '500' } = req.query;

  if (!gene) return res.status(400).json({ error: 'gene parameter required' });

  const stageList = stages ? stages.split(',').map(s => s.trim()).filter(Boolean) : null;
  const minScore = parseFloat(min_score) || 0;

  // Cache key: gene + metric + stages + minScore
  const cacheKey = `coexp:${gene}:${metric}:${stageList?.join(',') || 'all'}:${minScore}`;
  const cacheHash = createHash('sha256').update(cacheKey).digest('hex').slice(0, 16);

  const cached = cacheGet(cacheHash);
  if (cached) return res.json(cached);

  try {
    const result = await computeCoexpression(gene, {
      stages: stageList,
      metric,
      minScore,
      maxResults: parseInt(max_results) || 500,
    });

    if (result.error) return res.status(404).json(result);

    // Cache for 24 hours
    cacheSet(cacheHash, result, CACHE_TTL.geneLookup);

    res.json(result);
  } catch (err) {
    console.error(`[Coexpression] Error for ${gene}:`, err.message);
    res.status(500).json({ error: 'Co-expression computation failed', details: err.message });
  }
});

/**
 * GET /api/coexpression/status/:gene
 * Check if co-expression data is cached for a gene, with summary stats.
 */
router.get('/status/:gene', (req, res) => {
  const { gene } = req.params;

  // Check cache for the three standard metrics
  const metrics = ['pearson', 'spearman', 'jaccard'];
  const status = {};

  for (const metric of metrics) {
    const cacheKey = `coexp:${gene}:${metric}:all:0`;
    const hash = createHash('sha256').update(cacheKey).digest('hex').slice(0, 16);
    const cached = cacheGet(hash);
    status[metric] = cached ? { cached: true, count: cached.count } : { cached: false };
  }

  res.json({ gene, metrics: status });
});

/**
 * POST /api/coexpression/precompute
 * Precompute pairwise co-expression for a set of genes.
 * Body: { genes: [...], metrics: ["pearson", "spearman"], stages: [...] }
 */
router.post('/precompute', async (req, res) => {
  const { genes, metrics, stages } = req.body;

  if (!Array.isArray(genes) || genes.length < 2) {
    return res.status(400).json({ error: 'At least 2 genes required' });
  }

  const jobId = `coexp_${createHash('sha256').update(genes.sort().join(',')).digest('hex').slice(0, 8)}`;

  // Check if already cached
  const cacheKey = `pairwise:${genes.sort().join(',')}:${(metrics || ['pearson']).join(',')}`;
  const cacheHash = createHash('sha256').update(cacheKey).digest('hex').slice(0, 16);
  const cached = cacheGet(cacheHash);
  if (cached) return res.json({ ...cached, jobId, fromCache: true });

  try {
    const result = await computePairwise(genes, {
      stages: stages || null,
      metrics: metrics || ['pearson', 'spearman'],
    });

    cacheSet(cacheHash, result, CACHE_TTL.geneLookup);

    res.json({ ...result, jobId, fromCache: false });
  } catch (err) {
    console.error('[Coexpression] Precompute error:', err.message);
    res.status(500).json({ error: 'Precomputation failed', details: err.message });
  }
});

export default router;
