// SQLite cache database — stores API responses so we don't hammer external services.
// Auto-creates tables on first import. Each cache table uses a content-hash key so
// the same query always hits the same row.

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../config/env.js';
import { CACHE_TTL } from '../config/constants.js';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure cache directory exists
const cacheDir = config.cacheDir;
if (!existsSync(cacheDir)) {
  mkdirSync(cacheDir, { recursive: true });
}

const DB_PATH = resolve(cacheDir, 'cache.db');
const db = new Database(DB_PATH);

// Enable WAL mode for concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS cache_entries (
    cache_key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    ttl_ms INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cache_expiry
    ON cache_entries(created_at, ttl_ms);

  CREATE TABLE IF NOT EXISTS gene_cache (
    gene TEXT PRIMARY KEY,
    fbgn TEXT,
    data TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    ttl_ms INTEGER NOT NULL DEFAULT 86400000
  );

  CREATE TABLE IF NOT EXISTS imported_datasets (
    id TEXT PRIMARY KEY,
    accession TEXT UNIQUE NOT NULL,
    title TEXT,
    gene_count INTEGER,
    sample_count INTEGER,
    status TEXT DEFAULT 'importing',
    imported_at INTEGER NOT NULL,
    metadata TEXT
  );
`);

// gene_cache predates its ttl_ms column, and CREATE TABLE IF NOT EXISTS will
// not add one to a database that already exists. Without this, an established
// cache keeps serving rows the expiry check cannot see.
const geneCacheColumns = db.prepare('PRAGMA table_info(gene_cache)').all();
if (!geneCacheColumns.some(c => c.name === 'ttl_ms')) {
  db.exec('ALTER TABLE gene_cache ADD COLUMN ttl_ms INTEGER NOT NULL DEFAULT 86400000');
}

// ── Generic Cache ─────────────────────────────────────────────────────

function hashKey(input) {
  return createHash('sha256').update(String(input)).digest('hex').slice(0, 16);
}

export function cacheGet(key) {
  const row = db.prepare('SELECT data FROM cache_entries WHERE cache_key = ? AND (created_at + ttl_ms) > ?')
    .get(hashKey(key), Date.now());
  return row ? JSON.parse(row.data) : null;
}

export function cacheSet(key, data, ttlMs) {
  const cacheKey = hashKey(key);
  db.prepare(
    'INSERT OR REPLACE INTO cache_entries(cache_key, data, created_at, ttl_ms) VALUES(?, ?, ?, ?)'
  ).run(cacheKey, JSON.stringify(data), Date.now(), ttlMs);
}

// ── Gene Cache (lookup by symbol) ────────────────────────────────────

export function getGeneCache(gene) {
  const row = db.prepare(
    'SELECT data FROM gene_cache WHERE gene = lower(?) AND (fetched_at + ttl_ms) > ?'
  ).get(gene, Date.now());
  return row ? JSON.parse(row.data) : null;
}

/**
 * Cache a resolved gene. Results that came from a fallback source get a short
 * TTL: they were produced while the primary was failing, and at the default
 * 24 hours a single outage would keep serving the degraded answer long after
 * FlyBase recovered.
 */
export function setGeneCache(gene, data, ttlMs) {
  const ttl = ttlMs ?? (data.source && data.source !== 'flybase'
    ? CACHE_TTL.geneLookupFallback
    : CACHE_TTL.geneLookup);
  db.prepare(
    'INSERT OR REPLACE INTO gene_cache(gene, fbgn, data, fetched_at, ttl_ms) VALUES(lower(?), ?, ?, ?, ?)'
  ).run(gene, data.fbgn || null, JSON.stringify(data), Date.now(), ttl);
}

// ── Dataset Management ────────────────────────────────────────────────

export function createDataset(accession, title) {
  const id = 'ds_' + hashKey(accession);
  db.prepare(
    'INSERT OR IGNORE INTO imported_datasets(id, accession, title, imported_at, status) VALUES(?, ?, ?, ?, ?)'
  ).run(id, accession, title, Date.now(), 'importing');
  return id;
}

export function updateDatasetStatus(id, status, extra = {}) {
  const updates = ['status = ?'];
  const params = [status];
  if (extra.gene_count !== undefined) { updates.push('gene_count = ?'); params.push(extra.gene_count); }
  if (extra.sample_count !== undefined) { updates.push('sample_count = ?'); params.push(extra.sample_count); }
  params.push(id);
  db.prepare(`UPDATE imported_datasets SET ${updates.join(', ')} WHERE id = ?`).run(...params);
}

export function listDatasets() {
  return db.prepare('SELECT * FROM imported_datasets ORDER BY imported_at DESC').all();
}

export function getDataset(id) {
  return db.prepare('SELECT * FROM imported_datasets WHERE id = ?').get(id);
}

// ── Cache Stats ───────────────────────────────────────────────────────

export function getCacheStats() {
  const total = db.prepare('SELECT COUNT(*) c FROM cache_entries').get().c;
  const expired = db.prepare('SELECT COUNT(*) c FROM cache_entries WHERE (created_at + ttl_ms) < ?').get(Date.now()).c;
  const geneCount = db.prepare('SELECT COUNT(*) c FROM gene_cache').get().c;
  const dsCount = db.prepare('SELECT COUNT(*) c FROM imported_datasets').get().c;
  return { totalCacheEntries: total, expiredEntries: expired, geneCacheEntries: geneCount, importedDatasets: dsCount };
}

export function clearCache(table) {
  const valid = ['cache_entries', 'gene_cache', 'imported_datasets'];
  if (!valid.includes(table)) throw new Error(`Unknown cache table: ${table}`);
  db.prepare(`DELETE FROM ${table}`).run();
}

export default db;
