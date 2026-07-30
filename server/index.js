// Fly TF Expression Explorer — Backend API Server (local entry point)
import app from './app.js';
import config from './config/env.js';

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
