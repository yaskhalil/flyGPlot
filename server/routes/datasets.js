// Datasets API routes — manage imported expression datasets.

import { Router } from 'express';
import { listDatasets, getDataset, updateDatasetStatus, getCacheStats } from '../cache/db.js';

const router = Router();

/**
 * GET /api/datasets/list
 * List all imported datasets.
 */
router.get('/list', (req, res) => {
  const datasets = listDatasets();
  res.json({ datasets });
});

/**
 * GET /api/datasets/:id
 * Get details for a specific imported dataset.
 */
router.get('/:id', (req, res) => {
  const ds = getDataset(req.params.id);
  if (!ds) return res.status(404).json({ error: 'Dataset not found' });
  res.json(ds);
});

export default router;
