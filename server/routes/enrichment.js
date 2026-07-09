// Enrichment API route — submit gene set, return enrichment results
// Wraps Enrichr with local caching.

import { Router } from 'express';
import { runEnrichment } from '../services/enrichr.js';
import { cacheGet, cacheSet } from '../cache/db.js';
import { CACHE_TTL } from '../config/constants.js';
import { createHash } from 'crypto';

const router = Router();

/**
 * POST /api/enrichment
 * Body: { genes: [...], databases: [...] }
 */
router.post('/', async (req, res) => {
  const { genes, databases } = req.body;

  if (!Array.isArray(genes) || genes.length === 0) {
    return res.status(400).json({ error: 'genes array required' });
  }

  // Generate cache key from sorted genes + databases
  const sorted = [...genes].sort();
  const dbKey = (databases || []).sort().join(',');
  const cacheKey = `enrich:${createHash('sha256').update(sorted.join('|') + '|' + dbKey).digest('hex').slice(0, 16)}`;

  // Check cache
  const cached = cacheGet(cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  try {
    const result = await runEnrichment(genes, databases);

    // Cache for 7 days
    cacheSet(cacheKey, { ...result, cached: false }, CACHE_TTL.enrichment);

    res.json({ ...result, cached: false });
  } catch (err) {
    console.error('[Enrichment] Error:', err.message);
    res.status(502).json({ error: 'Enrichment service error', details: err.message });
  }
});

export default router;
