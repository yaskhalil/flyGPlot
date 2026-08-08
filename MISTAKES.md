# MISTAKES.md — Lessons Learned

## Enrichr Content-Type Must Be multipart/form-data

Enrichr's `/addList` endpoint rejects `application/x-www-form-urlencoded` with a 400 error. The body must be sent as `FormData`. Using `URLSearchParams` with `Content-Type: application/x-www-form-urlencoded` will fail silently.

## FlyBase API Is Unreliable — Always Fall Back

FlyBase frequently times out or returns empty for gene resolution. The gene routes and enrichment ortholog resolution both need Ensembl as a fallback. Without the fallback, gene lookups fail intermittently.

## better-sqlite3 Native Module Version Sensitivity

The native binary is compiled against a specific Node.js NODE_MODULE_VERSION. Upgrading Node.js without `npm rebuild better-sqlite3` causes `ERR_DLOPEN_FAILED`. Check with `node -e "require('better-sqlite3')"`.

## SVG Zoom/Pan: Use viewBox, Not CSS Transform

The NetworkView initially used CSS `transform: scale() translate()` which caused zoom to center on the wrong point. The correct approach is manipulating the SVG `viewBox` attribute — it's the SVG-native way and works correctly for both zoom and pan.

## g:Profiler Has No `overlapping_genes` Field — Gene Overlap Is Positional

There is no `overlapping_genes` field anywhere in a g:Profiler `/gost/profile` response. The code read one, got `undefined` for every term, and so every enrichment result carried an empty gene list and `genesMapped: 0` — while still rendering a full, plausible-looking table of enriched terms.

The real contract:

- Gene-level detail is returned **only** when the request body sets `no_evidences: false`. Omit it and the response has no per-gene information at all.
- Each result row then carries `intersections`, an array positionally aligned with `meta.genes_metadata.query.<key>.ensgs`. `intersections[i]` holds the evidence codes for the i-th gene in that `ensgs` array; a non-empty entry means that gene is in the term. It is an alignment, not a list of gene IDs.
- Those IDs come back as FBgn, not as the submitted symbols. `meta.genes_metadata.query.<key>.mapping` is a symbol → `[FBgn]` table; invert it to report results in the user's own vocabulary.
- `meta.genes_metadata.failed` lists symbols g:Profiler could not map. A symbol that fails silently shrinks the query the test actually ran, so surface it rather than dropping it.

See `server/services/gprofiler.js`.

**Lesson:** a field name that does not exist reads as `undefined`, and `undefined || []` is an empty list, not an error. Any UI built on it looks like it works and reports zero. Verify a response shape against the live API before mapping it — and treat "the feature returns nothing for every input" as a parsing bug until proven otherwise, never as a real biological result.

## FlyBase Returns 2xx With an Empty Body Instead of an Error

`api.flybase.org` answers an empty body with a success status in at least two situations: CloudFront returns `202 Accepted` with zero bytes when throttling, and the API itself returns `200 OK` with zero bytes and `content-type: application/json` for a route it does not recognise. Neither is an answer — a gene with no annotations comes back as `{"resultset":{"result":[]}}`, never as zero bytes.

Because `res.ok` is true for both, the old client parsed them as "this gene has no data" and every consumer reported zero GO terms, zero alleles, and zero orthologs for genes that have plenty. The reagent lookup — the most load-bearing daily feature, finding MiMIC/CRIMIC/split-GAL4 lines to order — looked fully functional while returning nothing.

Two related traps in the same client:

- **The envelope.** Payloads are wrapped in `{ resultset: { api_version, data_version, result: [...] } }` even for single records. Code that tests the top level with `Array.isArray(data)` sees an object and silently drops a perfectly good response. Unwrap through one shared helper.
- **Empty-200 for unknown routes.** Since a bogus path returns exactly the same empty 200 as a real one, you cannot tell a wrong endpoint from a throttled one by status alone. Confirm a path works by finding one that returns actual bytes.

**Lesson:** "reachable but declining to answer" and "asked and told no" are different states and must not collapse into the same empty result. Give the first one its own error type (`FlyBaseUnavailableError`) and let user-facing responses carry a `degraded` flag, so a zero count is never mistaken for a real one.

## Packed 4-Bit Matrix: Reserve a Sentinel, Then Quantize to One Fewer Level

In `scripts/build-onoff-matrix.mjs` each (gene, cluster, stage) posterior is stored in a 4-bit nibble. A nibble holds 0–15, and value 0 is reserved for "cluster not measured at this stage" so it stays distinct from "measured and OFF". That leaves 15 usable codes, 1–15, for posteriors — so posteriors must quantize to **0–14** and be stored as `value + 1`.

Quantizing to 15 levels instead pushed a posterior of exactly 1.0 to 16, which does not fit in a nibble and wrapped to 0 — reading back as *not measured*. The strongest possible evidence became no evidence at all. It corrupted 821 of 7194 sampled values while the file size, the gene/cluster/stage counts, and the vast majority of spot checks all looked correct.

**Lesson:** when a sentinel shares an integer range with real data, the sentinel costs you one level and the quantizer must be told. Write the arithmetic down where the constant is defined (`LEVELS = 14`, not 15), and validate at the extremes — the bug lives at `prob = 1.0`, which is exactly the value a mid-range spot check never touches.

## Don't Rely on Uppercase/Lowercase for Species Detection

Drosophila genes can start with lowercase (`achi`, `eve`) or uppercase (`Abd-B`, `Ubx`). Using case heuristics to detect organism is unreliable. Since this is a Drosophila tool, always default to `dmelanogaster` in g:Profiler.

## Co-expression Sync Reads Block Event Loop

`loadGeneData()` uses `readFileSync` for every gene. With 13,000+ genes, this blocks the Node.js event loop. Keep batch sizes small (100) and consider async reads for future optimization.
