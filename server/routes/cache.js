// Cache management routes — stats + selective clearing.

import { Router } from 'express';
import { getCacheStats, clearCache } from '../cache/db.js';

const router = Router();

const VALID_TABLES = ['cache_entries', 'gene_cache', 'imported_datasets'];

/**
 * GET /api/cache/stats
 */
router.get('/stats', (req, res) => {
  res.json(getCacheStats());
});

/**
 * POST /api/cache/clear
 * Body: { table: "cache_entries" | "gene_cache" | "imported_datasets" }
 * Or omit table to clear all.
 */
router.post('/clear', (req, res) => {
  const { table } = req.body || {};
  const tables = table ? [table] : VALID_TABLES;

  for (const t of tables) {
    if (!VALID_TABLES.includes(t)) {
      return res.status(400).json({ error: `Unknown table: ${t}. Valid: ${VALID_TABLES.join(', ')}` });
    }
    clearCache(t);
  }

  res.json({ cleared: tables, stats: getCacheStats() });
});

export default router;
