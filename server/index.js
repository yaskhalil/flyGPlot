// Fly TF Expression Explorer — Backend API Server
// Bootstrap: middleware, routes, error handling.

import express from 'express';
import cors from 'cors';
import config from './config/env.js';

import genesRouter from './routes/genes.js';
import enrichmentRouter from './routes/enrichment.js';
import networkRouter from './routes/network.js';
import healthRouter from './routes/health.js';
import cacheRouter from './routes/cache.js';

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(null, true); // Allow any origin in dev
  },
}));

app.use(express.json({ limit: '5mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// ── Routes ────────────────────────────────────────────────────────────

app.use('/api/genes', genesRouter);
app.use('/api/enrichment', enrichmentRouter);
app.use('/api/network', networkRouter);
app.use('/api/health', healthRouter);
app.use('/api/cache', cacheRouter);

// ── 404 ──────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

// ── Error Handler ─────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('[Server Error]', err.stack || err.message || err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
  });
});

// ── Start ─────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  console.log(``);
  console.log(`  ╔══════════════════════════════════════════╗`);
  console.log(`  ║  Fly TF Expression Backend              ║`);
  console.log(`  ║  http://localhost:${String(config.port).padEnd(5)}              ║`);
  console.log(`  ║  API: /api/genes /api/enrichment...     ║`);
  console.log(`  ╚══════════════════════════════════════════╝`);
  console.log(``);
  console.log(`  Cache dir : ${config.cacheDir}`);
  console.log(`  CORS      : ${config.allowedOrigins.join(', ')}`);
  console.log(``);
});
