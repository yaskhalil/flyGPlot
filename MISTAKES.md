# MISTAKES.md — Lessons Learned

## Enrichr Content-Type Must Be multipart/form-data

Enrichr's `/addList` endpoint rejects `application/x-www-form-urlencoded` with a 400 error. The body must be sent as `FormData`. Using `URLSearchParams` with `Content-Type: application/x-www-form-urlencoded` will fail silently.

## FlyBase API Is Unreliable — Always Fall Back

FlyBase frequently times out or returns empty for gene resolution. The gene routes and enrichment ortholog resolution both need Ensembl as a fallback. Without the fallback, gene lookups fail intermittently.

## better-sqlite3 Native Module Version Sensitivity

The native binary is compiled against a specific Node.js NODE_MODULE_VERSION. Upgrading Node.js without `npm rebuild better-sqlite3` causes `ERR_DLOPEN_FAILED`. Check with `node -e "require('better-sqlite3')"`.

## SVG Zoom/Pan: Use viewBox, Not CSS Transform

The NetworkView initially used CSS `transform: scale() translate()` which caused zoom to center on the wrong point. The correct approach is manipulating the SVG `viewBox` attribute — it's the SVG-native way and works correctly for both zoom and pan.

## g:Profiler Returns FBgn IDs in overlapping_genes

When querying g:Profiler with Drosophila genes, the `overlapping_genes` field in results contains FlyBase IDs (FBgn...), not the original query symbols. The frontend maps these back by case-insensitive comparison, but some display as FBgn IDs when no match is found.

## Don't Rely on Uppercase/Lowercase for Species Detection

Drosophila genes can start with lowercase (`achi`, `eve`) or uppercase (`Abd-B`, `Ubx`). Using case heuristics to detect organism is unreliable. Since this is a Drosophila tool, always default to `dmelanogaster` in g:Profiler.

## Co-expression Sync Reads Block Event Loop

`loadGeneData()` uses `readFileSync` for every gene. With 13,000+ genes, this blocks the Node.js event loop. Keep batch sizes small (100) and consider async reads for future optimization.
