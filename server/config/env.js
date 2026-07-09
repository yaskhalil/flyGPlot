import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

export default {
  port: parseInt(process.env.PORT || '4000', 10),

  // External API configs
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

  // Cache
  cacheDir: process.env.CACHE_DIR || resolve(__dirname, '../cache/data'),

  // CORS
  allowedOrigins: [
    'http://localhost:5173',
    'http://localhost:5174',
    process.env.ALLOWED_ORIGIN,
  ].filter(Boolean),
};
