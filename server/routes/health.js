// Health check route — verifies server status and external API reachability.

import { Router } from 'express';

const router = Router();

/**
 * GET /api/health
 */
router.get('/', async (req, res) => {
  const start = Date.now();

  // Quick external API checks (timeout after 3s each)
  const apiChecks = {
    flybase: await ping('https://api.flybase.org/api/v1.0/gene/FBgn0000015'),
    enrichr: await ping('https://maayanlab.cloud/Enrichr/enrich?userListId=1&backgroundType=GO_Biological_Process_2023'),
    stringDb: await ping('https://string-db.org/api/json/version'),
  };

  const allReachable = Object.values(apiChecks).every(s => s === 'reachable');

  res.json({
    status: allReachable ? 'ok' : 'degraded',
    version: '1.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    responseTimeMs: Date.now() - start,
    externalApis: apiChecks,
    nodeVersion: process.version,
    memoryMb: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1),
  });
});

async function ping(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal, method: 'HEAD' });
    clearTimeout(timeout);
    return res.ok ? 'reachable' : `http_${res.status}`;
  } catch {
    return 'unreachable';
  }
}

export default router;
