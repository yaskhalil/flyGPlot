// GEO API routes — search and inspect public expression datasets.

import { Router } from 'express';
import { searchDatasets, getDataset } from '../services/geo.js';
import { cacheGet, cacheSet } from '../cache/db.js';
import { CACHE_TTL } from '../config/constants.js';

const router = Router();

/**
 * GET /api/geo/search?q=Drosophila+RNA-seq&max=10
 * Search GEO datasets.
 */
router.get('/search', async (req, res) => {
  const { q, max } = req.query;
  if (!q || !q.trim()) {
    return res.status(400).json({ error: 'Search query (q) required' });
  }

  const cacheKey = `geo:search:${q.trim().toLowerCase()}:${max || 10}`;

  // Check cache
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await searchDatasets(q, parseInt(max) || 10);
    cacheSet(cacheKey, result, CACHE_TTL.geoMetadata);
    res.json(result);
  } catch (err) {
    console.error('[GEO] Search error:', err.message);
    res.status(502).json({ error: 'GEO search failed', details: err.message });
  }
});

/**
 * GET /api/geo/dataset?id=GSE123456
 * Get full details for a specific GEO dataset.
 */
router.get('/dataset', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Dataset accession (id) required' });

  const cacheKey = `geo:dataset:${id.toUpperCase()}`;

  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await getDataset(id);
    if (!result) return res.status(404).json({ error: `Dataset '${id}' not found` });
    cacheSet(cacheKey, result, CACHE_TTL.geoMetadata);
    res.json(result);
  } catch (err) {
    console.error(`[GEO] Dataset error for ${id}:`, err.message);
    res.status(502).json({ error: 'GEO dataset fetch failed', details: err.message });
  }
});

export default router;
