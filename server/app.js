// Fly TF Expression Explorer — Express app (no listen, for Vercel serverless)
import express from 'express';
import cors from 'cors';
import config from './config/env.js';
import genesRouter from './routes/genes.js';
import enrichmentRouter from './routes/enrichment.js';
import networkRouter from './routes/network.js';
import healthRouter from './routes/health.js';
import cacheRouter from './routes/cache.js';
import coexpressionRouter from './routes/coexpression.js';
import geoRouter from './routes/geo.js';
import datasetsRouter from './routes/datasets.js';

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
    callback(null, true);
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

app.use('/api/genes', genesRouter);
app.use('/api/enrichment', enrichmentRouter);
app.use('/api/network', networkRouter);
app.use('/api/health', healthRouter);
app.use('/api/cache', cacheRouter);
app.use('/api/coexpression', coexpressionRouter);
app.use('/api/geo', geoRouter);
app.use('/api/datasets', datasetsRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

app.use((err, req, res, _next) => {
  console.error('[Server Error]', err.stack || err.message || err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
  });
});

export default app;
