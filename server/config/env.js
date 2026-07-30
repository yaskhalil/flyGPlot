import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isVercel = process.env.VERCEL === '1';

// Load .env only in non-Vercel environments
if (!isVercel) {
  dotenv.config({ path: resolve(__dirname, '../.env') });
}

const defaultCacheDir = isVercel
  ? '/tmp/cache/data'
  : resolve(__dirname, '../cache/data');

// Ensure cache dir exists
const cacheDir = process.env.CACHE_DIR || defaultCacheDir;
if (!existsSync(cacheDir)) {
  mkdirSync(cacheDir, { recursive: true });
}

export default {
  port: parseInt(process.env.PORT || '4000', 10),

  flybase: {
    baseUrl: process.env.FLYBASE_BASE_URL || 'https://api.flybase.org/api/v1.0',
  },
  ensembl: {
    baseUrl: 'https://rest.ensembl.org',
    key: process.env.ENSEMBL_KEY || null,
  },
  ncbi: {
    email: process.env.NCBI_EMAIL || '',
    apiKey: process.env.NCBI_API_KEY || null,
    baseUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
  },

  cacheDir,

  allowedOrigins: [
    'http://localhost:5173',
    'http://localhost:5174',
    process.env.ALLOWED_ORIGIN,
  ].filter(Boolean),
};
