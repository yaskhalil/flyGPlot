// Network API routes — PPI queries via STRING-DB (and GeneMANIA)
// Caches results for 7 days.

import { Router } from 'express';
import { getInteractions, getFullNetwork } from '../services/stringdb.js';
import { cacheGet, cacheSet } from '../cache/db.js';
import { CACHE_TTL } from '../config/constants.js';
import { createHash } from 'crypto';

const router = Router();

/**
 * POST /api/network/ppi
 * Body: { genes: [...], min_score: 400, limit: 50, full_network: false }
 */
router.post('/ppi', async (req, res) => {
  const { genes, min_score, limit, full_network } = req.body;

  if (!Array.isArray(genes) || genes.length === 0) {
    return res.status(400).json({ error: 'genes array required' });
  }

  const sorted = [...genes].sort().join(',');
  const cacheKey = `string:${createHash('sha256').update(`${sorted}|${min_score || 400}|${!!full_network}`).digest('hex').slice(0, 16)}`;

  const cached = cacheGet(cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  try {
    const result = full_network
      ? await getFullNetwork(genes, { minScore: min_score, limit })
      : await getInteractions(genes, { minScore: min_score, limit });

    result.source = 'string-db';

    cacheSet(cacheKey, { ...result, cached: false }, CACHE_TTL.ppiNetwork);

    res.json({ ...result, cached: false });
  } catch (err) {
    console.error('[Network PPI] Error:', err.message);
    res.status(502).json({ error: 'STRING-DB service error', details: err.message });
  }
});

export default router;
