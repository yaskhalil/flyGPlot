# Fly TF Expression Explorer — Backend API & UI Implementation Plan

> Plan: 2026-07-09
> Architecture: Node.js/Express backend (port 4000) + React frontend (port 5173)
> Data client: Swappable via `DrosophilaDataClient` interface — already designed

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React 19 + Vite 8 + Plotly)                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  StaticJsonDataClient  ←→  /data/*.json (static files)  │   │
│  │  ApiDataClient         ←→  http://localhost:4000/api/*   │   │
│  │  (Swapped via setDataClient())                           │   │
│  │                                                          │   │
│  │  Existing:                                                │   │
│  │  └─ utils/resolver.ts → Ensembl REST API (direct HTTP)   │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────────┘
                       │ http://localhost:4000
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend Server (Express + Elysia)                             │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  API Routes (/api/*)                                │     │
│  │                                                     │     │
│  │  ┌─────────────────────────────────────────────┐   │     │
│  │  │  Phase 1 — Gene & Annotation               │   │     │
│  │  │  GET  /api/genes/resolve?symbol=           │──┼──┼──► FlyBase API │
│  │  │  GET  /api/genes/metadata?gene=            │──┼──┼──► Ensembl API │
│  │  │  GET  /api/genes/synonyms?gene=            │──┼──┼──► MyGene.info │
│  │  │  GET  /api/genes/batch                     │──┼──┼──► All sources  │
│  │  └─────────────────────────────────────────────┘   │     │
│  │                                                     │     │
│  │  ┌─────────────────────────────────────────────┐   │     │
│  │  │  Phase 2 — Analysis & Networks             │   │     │
│  │  │  GET  /api/enrichment?genes=...&db=...     │──┼──┼──► Enrichr API │
│  │  │  GET  /api/network/ppi?genes=...&score=    │──┼──┼──► STRING-DB   │
│  │  │  GET  /api/network/genemania?genes=...     │──┼──┼──► GeneMANIA   │
│  │  └─────────────────────────────────────────────┘   │     │
│  │                                                     │     │
│  │  ┌─────────────────────────────────────────────┐   │     │
│  │  │  Phase 3 — External Data Pipeline          │   │     │
│  │  │  GET  /api/geo/search?q=...                │──┼──┼──► NCBI GEO   │
│  │  │  GET  /api/geo/dataset?id=...              │──┼──┼──► NCBI GEO   │
│  │  │  POST /api/geo/import (id, ...)            │──┼──┼──► Processing │
│  │  │  GET  /api/datasets/list                   │   │  ├── SQLite     │
│  │  │  GET  /api/datasets/:id/export             │──┼──┼──► JSON gen   │
│  │  └─────────────────────────────────────────────┘   │     │
│  │                                                     │     │
│  │  ┌─────────────────────────────────────────────┐   │     │
│  │  │  Phase 4 — Co-expression & Cache           │   │     │
│  │  │  GET  /api/coexpression?genes=...&metric=  │──┼──┼──► Server-side │
│  │  │  POST /api/coexpression/precompute         │   │  ├── SQLite     │
│  │  │  GET  /api/coexpression/status/:jobId      │   │  │  cache      │
│  │  └─────────────────────────────────────────────┘   │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  Cache Layer (SQLite via better-sqlite3)            │     │
│  │  ├── gene_cache      (lookup results, TTL 24h)      │     │
│  │  ├── enrich_cache    (enrichment results, TTL 7d)   │     │
│  │  ├── string_cache    (PPI networks, TTL 7d)         │     │
│  │  ├── geo_cache       (dataset metadata, TTL 30d)    │     │
│  │  └── datasets        (imported expression data)     │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  API Key Management (.env)                          │     │
│  │  ├── ENSEMBL_KEY (optional, higher rate limits)     │     │
│  │  ├── NCBI_API_KEY (optional, 10 req/s instead of 3) │     │
│  │  ├── STRING_DB (free, no key needed)                │     │
│  │  └── ENRICHR (free, no key needed)                  │     │
│  └─────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Backend API — Complete Route Specification

### Phase 1: Gene & Annotation Services

#### `GET /api/genes/resolve?symbol={symbol}`
Resolve a gene symbol to its canonical ID using FlyBase + Ensembl fallback.

```
Request:   GET /api/genes/resolve?symbol=achi
Response:  {
             symbol: "achi",
             fbgn: "FBgn0000015",
             canonical: "achi",
             synonyms: ["achintya", "achaete-scute", "CG...", "l(2)…"],
             source: "flybase",   // or "ensembl" if FlyBase missed
             warnings: ["Synonym also maps to FBgn0000020"]
           }
```

**Backend logic**: Query FlyBase REST API first. Fall back to Ensembl `xrefs/symbol` if FlyBase returns nothing. Cache result in SQLite for 24h.

**Wraps**: `GET https://api.flybase.org/api/v1.0/gene/{symbol}` + `GET https://rest.ensembl.org/xrefs/symbol/drosophila_melanogaster/{symbol}`

---

#### `GET /api/genes/metadata?gene={gene}`
Fetch comprehensive gene metadata.

```
Request:   GET /api/genes/metadata?gene=achi
Response:  {
             gene: "achi",
             fbgn: "FBgn0000015",
             name: "achintya, achaete-scute homolog",
             chromosome: "2R",
             cytogenetic: "60E1-60E2",
             synonyms: ["CG10374", "l(2)35Be", "achaete-scute"],
             go_terms: [
               { id: "GO:0000978", term: "RNA pol II cis-reg region", evidence: "IDA" },
               { id: "GO:0007399", term: "neurogenesis", evidence: "IMP" }
             ],
             phenotypes: [
               { allele: "achi¹", phenotype: "embryonic lethal" },
               { allele: "achi²", phenotype: "defective neural development" }
             ],
             orthologs: [
               { species: "human", symbol: "ASCL1", identity: 0.72 },
               { species: "mouse", symbol: "Ascl1", identity: 0.70 }
             ],
             expression_summary: { max_stage: "P15", max_cell: "Dm4 (#9)", peak_value: 3.42 }
           }
```

**Backend logic**:
1. Query FlyBase API for gene record → FBgn, name, chromosome, synonyms
2. Query FlyBase GO annotations endpoint → GO terms
3. Query FlyBase alleles/phenotypes endpoint
4. Query Ensembl Compara for orthologs
5. Merge all into single response
6. Cache in SQLite for 24h

---

#### `GET /api/genes/synonyms?gene={gene}&limit={n}`
Get known synonyms for a gene.

```
Request:   GET /api/genes/synonyms?gene=achi
Response:  {
             gene: "achi",
             fbgn: "FBgn0000015",
             synonyms: [
               { symbol: "achintya", type: "full_name" },
               { symbol: "achaete-scute", type: "synonym" },
               { symbol: "CG10374", type: "cg_number" },
               { symbol: "l(2)35Be", type: "allele" }
             ]
           }
```

---

#### `POST /api/genes/batch`
Batch resolve & enrich multiple genes at once.

```
Request:   POST /api/genes/batch
Body:      { genes: ["ab", "achi", "unknown_gene", "abd-b"] }
Response:  {
             resolved: [
               { input: "ab", symbol: "ab", fbgn: "FBgn0000015" },
               { input: "achi", symbol: "achi", fbgn: "FBgn0000017" },
               { input: "abd-b", symbol: "abd-b", fbgn: "FBgn0000015" }
             ],
             unresolved: ["unknown_gene"],
             total: 4, resolved: 3, unresolved: 1
           }
```

**Backend logic**: Parallel queries to FlyBase, cache individual results, combine.

---

### Phase 2: Analysis & Network Services

#### `POST /api/enrichment`
Run enrichment analysis on a gene set.

```
Request:   POST /api/enrichment
Body:      {
             genes: ["achi", "ab", "abd-b", "acj6", "Adf1", "Aef1"],
             databases: [
               "GO_Biological_Process_2023",
               "GO_Molecular_Function_2023",
               "KEGG_2021_Human",
               "WikiPathway_2023_Drosophila"
             ]
           }
Response:  {
             job_id: "enc_a1b2c3",
             genes_submitted: 6,
             genes_mapped: 5,
             databases: ["GO_Biological_Process_2023", ...],
             results: {
               "GO_Biological_Process_2023": [
                 {
                   rank: 1,
                   term: "neuron differentiation",
                   go_id: "GO:0030182",
                   p_value: 1.2e-8,
                   z_score: -2.14,
                   combined_score: 12.45,
                   overlapping_genes: ["achi", "acj6", "ab"]
                 },
                 // ... more results
               ]
             },
             source: "enrichr",
             cached: false
           }
```

**Backend logic**:
1. Submit to Enrichr: `POST /Enrichr/addList` → get `userListId`
2. For each database: `GET /Enrichr/enrich?userListId={id}&backgroundType={db}`
3. Return combined results
4. Cache for 7 days (keyed by sorted genes + databases hash)

**Wraps**: `https://maayanlab.cloud/Enrichr/addList` + `https://maayanlab.cloud/Enrichr/enrich`

---

#### `POST /api/network/ppi`
Query protein-protein interaction network.

```
Request:   POST /api/network/ppi
Body:      {
             genes: ["achi", "ab", "abd-b", "acj6"],
             min_score: 400,    // STRING-DB score threshold (0-1000)
             species: 7227     // D. melanogaster taxon ID
           }
Response:  {
             query_genes: ["achi", "ab", "abd-b", "acj6"],
             nodes: [
               { id: "achi", preferred_name: "achi", annotation: "achintya", db_id: "FBgn0000017" },
               { id: "ab", preferred_name: "ab", annotation: "abrupt", db_id: "FBgn0000014" },
               // ...
             ],
             edges: [
               { source: "achi", target: "ab", score: 0.98, escores: { nscore: 0.94, ascore: 0.89 } },
               { source: "achi", target: "abd-b", score: 0.94, escores: { ... } },
               // ...
             ],
             metrics: {
               node_count: 24,
               edge_count: 68,
               avg_clustering: 0.42,
               ppi_enrichment_p: 3.2e-5
             },
             source: "string-db"
           }
```

**Backend logic**:
1. Submit to STRING-DB: `POST /api/json/interactionPartners` with identifiers
2. Also fetch: `POST /api/json/network` for full graph
3. Map STRING IDs back to gene symbols
4. Cache for 7 days

**Wraps**: `https://string-db.org/api/json/interactionPartners` + `https://string-db.org/api/json/network`

---

#### `POST /api/network/genemania`
Query GeneMANIA interaction network.

```
Request:   POST /api/network/genemania
Body:      { genes: ["achi", "ab", "abd-b"] }
Response:  {
             nodes: [...],
             edges: [...],
             weighting: {
               coexpression: 0.42,
               physical_interactions: 0.31,
               pathway: 0.15,
               predicted: 0.12
             },
             source: "genemania"
           }
```

**Wraps**: `https://genemania.org/api/tools/search` + network query

---

### Phase 3: External Data Pipeline

#### `GET /api/geo/search?q={query}&max={n}`
Search NCBI GEO for expression datasets.

```
Request:   GET /api/geo/search?q=Drosophila+melanogaster+brain+RNA-seq&max=10
Response:  {
             total_count: 142,
             datasets: [
               {
                 accession: "GSE123456",
                 title: "Drosophila brain single-cell RNA-seq...",
                 organism: "Drosophila melanogaster",
                 platform: "GPL25244",
                 sample_count: 6,
                 design: "Expression profiling by high throughput sequencing",
                 pubmed_id: "34567890",
                 summary: "We analyzed Drosophila brain...",
                 supp_files: ["GSE123456_raw_counts.csv.gz"],
                 geo_link: "https://ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE123456"
               }
             ]
           }
```

**Backend logic**:
1. `esearch.fcgi?db=gds&term={query}&retmax={n}` → gets GEO IDs
2. `esummary.fcgi?db=gds&id={ids}` → gets dataset metadata
3. Parse XML responses
4. Cache metadata for 30 days

**Wraps**: NCBI E-utilities (ESearch + ESummary)

---

#### `GET /api/geo/dataset?id={accession}`
Get full details for a single GEO dataset including sample table.

```
Request:   GET /api/geo/dataset?id=GSE123456
Response:  {
             accession: "GSE123456",
             title: "...",
             samples: [
               { id: "GSM1234", title: "brain_rep1", source: "brain" },
               { id: "GSM1235", title: "brain_rep2", source: "brain" },
             ],
             raw_data_available: true,
             processed_data_available: true,
             estimated_size_mb: 45,
             compatible_format: "gene_expression_matrix"
           }
```

---

#### `POST /api/geo/import`
Import a GEO dataset into the local expression database.

```
Request:   POST /api/geo/import
Body:      {
             accession: "GSE123456",
             samples: ["GSM1234", "GSM1235"],
             gene_id_type: "symbol",
             normalize: true
           }
Response:  {
             job_id: "geo_imp_a1b2c3",
             status: "processing",
             estimated_minutes: 3,
             dataset_id: "ds_abc123"
           }
```

**Backend logic**:
1. Fetch supplementary files from GEO FTP
2. Parse expression matrix (expecting CSV/TSV)
3. Map probe IDs to gene symbols (via FlyBase/Ensembl)
4. Normalize if requested (TPM/FPKM → log-normalized)
5. Store in SQLite datasets table
6. Generate `{gene}.json` files compatible with frontend format

---

#### `GET /api/datasets/list`
List all imported datasets.

```
Request:   GET /api/datasets/list
Response:  {
             datasets: [
               { id: "ds_abc123", accession: "GSE123456", title: "...", gene_count: 13521, cell_samples: 48, imported_at: "2026-07-09T..." }
             ]
           }
```

---

#### `GET /api/datasets/:id/export?format={format}`
Export imported dataset in a format the frontend can consume.

```
Request:   GET /api/datasets/ds_abc123/export?format=gene_json
Response:  (HTTP 200, application/json) — Pre-generated gene JSON files
                                      — or triggers generation if not cached
```

---

### Phase 4: Co-expression & Cache

#### `POST /api/coexpression/precompute`
Compute co-expression matrix on demand (for a new dataset).

```
Request:   POST /api/coexpression/precompute
Body:      {
             dataset_id: "ds_abc123",
             metrics: ["pearson", "spearman"],
             min_cells: 3
           }
Response:  {
             job_id: "coexp_a1b2c3",
             status: "queued",
             estimated_minutes: 5
           }
```

**Backend logic**:
1. Load expression matrix from dataset
2. Compute pairwise Pearson/Spearman for all genes
3. Store results in SQLite (gene → { pearson: [{gene, score}], spearman: [...] })
4. Generate gene JSON files for frontend consumption

---

#### `GET /api/coexpression/status/:jobId`
Check status of a running/precomputed co-expression job.

```
Request:   GET /api/coexpression/status/coexp_a1b2c3
Response:  {
             job_id: "coexp_a1b2c3",
             dataset_id: "ds_abc123",
             status: "completed",  // "queued" | "processing" | "completed" | "failed"
             progress_pct: 100,
             gene_count: 13521,
             metric: "pearson",
             completed_at: "2026-07-09T..."
           }
```

---

### Cache Management

#### `GET /api/cache/stats`
View cache hit rates and sizes.

```
Response:  {
             gene_cache: { entries: 1245, hit_rate: 0.87, ttl_hours: 24 },
             enrich_cache: { entries: 89, hit_rate: 0.62, ttl_hours: 168 },
             string_cache: { entries: 34, hit_rate: 0.71, ttl_hours: 168 },
             geo_cache: { entries: 12, hit_rate: 0.95, ttl_hours: 720 }
           }
```

#### `POST /api/cache/clear?target={target}`
Clear a specific cache or all caches.

---

### Health & Status

#### `GET /api/health`
Server health check.

```
Response:  {
             status: "ok",
             version: "1.0.0",
             uptime_seconds: 123456,
             memory_mb: 45.2,
             cache_size_mb: 12.8,
             external_apis: {
               flybase: "reachable",
               enrichr: "reachable",
               string_db: "reachable",
               ncbi_geo: "reachable"
             }
           }
```

---

## Backend Implementation Guide

### Project Structure

```
flies/
├── server/
│   ├── index.js                    # Express bootstrap + middleware + error handling
│   ├── package.json                # express, cors, better-sqlite3, node-fetch
│   │
│   ├── config/
│   │   ├── env.js                  # .env loader (API keys, ports, TTLs)
│   │   └── constants.js            # Species IDs, URLs, cache durations
│   │
│   ├── routes/
│   │   ├── genes.js                # /api/genes/* — resolve, metadata, synonyms, batch
│   │   ├── enrichment.js           # /api/enrichment — submit, results
│   │   ├── network.js              # /api/network/* — ppi, genemania
│   │   ├── geo.js                  # /api/geo/* — search, dataset, import
│   │   ├── datasets.js             # /api/datasets/* — list, export
│   │   ├── coexpression.js         # /api/coexpression/* — precompute, status
│   │   ├── cache.js                # /api/cache/* — stats, clear
│   │   └── health.js               # /api/health
│   │
│   ├── services/
│   │   ├── flybase.js              # FlyBase REST API client
│   │   ├── ensembl.js              # Ensembl REST API client
│   │   ├── mygene.js               # MyGene.info API client
│   │   ├── enrichr.js              # Enrichr API client
│   │   ├── stringdb.js             # STRING-DB API client
│   │   ├── genemania.js            # GeneMANIA API client
│   │   ├── geo.js                  # NCBI E-utilities client
│   │   └── coexpression.js         # Server-side co-expression engine
│   │
│   ├── cache/
│   │   ├── db.js                   # SQLite initialization + migrations
│   │   ├── gene-cache.js           # Gene lookup cache
│   │   ├── enrich-cache.js         # Enrichment cache
│   │   └── string-cache.js         # STRING-DB cache
│   │
│   └── lib/
│       ├── xml-parser.js           # GEO XML → JSON parser
│       ├── expression-matrix.js    # Expression data processing
│       └── error-handler.js        # Unified error responses
│
├── frontend/
│   └── src/
│       └── services/
│           ├── dataClient.ts       # ← MODIFY: add ApiDataClient
│           └── apiClient.ts        # ← NEW: backend proxy client
```

### Service Implementation Patterns

Each service follows the same pattern:

```javascript
// server/services/flybase.js
const BASE = "https://api.flybase.org/api/v1.0";

const cache = {}; // Will be replaced by SQLite cache

export async function resolveGene(symbol) {
  const res = await fetch(`${BASE}/gene/${encodeURIComponent(symbol)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return {
    symbol: data.symbol,
    fbgn: data.id,
    name: data.name,
    synonyms: data.synonyms || [],
    // ...
  };
}

export async function getGoTerms(fbgn) {
  const res = await fetch(`${BASE}/gene/${fbgn}/go`);
  if (!res.ok) return [];
  return (await res.json()).map(g => ({
    id: g.go_id,
    term: g.term_name,
    evidence: g.evidence_code,
  }));
}
```

```javascript
// server/services/stringdb.js
const BASE = "https://string-db.org/api/json";
const DROSOPHILA_TAXON = 7227;

export async function getInteractions(genes, minScore = 400) {
  const res = await fetch(`${BASE}/interactionPartners`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      identifiers: genes.join("%0D"),
      species: String(DROSOPHILA_TAXON),
      required_score: String(minScore),
    }),
  });
  const data = await res.json();
  // Map STRING IDs → gene symbols, build node/edge graph
  return buildGraph(data, genes);
}
```

---

## Frontend — UI Implementation Phases

### Phase 1: Gene & Annotation (2–3 days)

**Step 1 — Create `ApiDataClient`** (1 day)

```typescript
// frontend/src/services/apiClient.ts
import type { DrosophilaDataClient, GenePayload, CellPayload } from '../store/useAppStore';

const API = 'http://localhost:4000/api';

export class ApiDataClient implements DrosophilaDataClient {
  async loadIndex() {
    // Keep using static JSON for the core expression data
    const genesRes = await fetch('/data/gene_list.json');
    const cellsRes = await fetch('/data/cell_list.json');
    return {
      genes: await genesRes.json(),
      stages: ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult'],
      cells: (await cellsRes.json()).cells || [],
    };
  }

  async fetchGeneData(gene: string) {
    // Try backend first, fall back to static JSON
    try {
      const res = await fetch(`${API}/coexpression/genes/${gene}`);
      if (res.ok) return res.json();
    } catch {}
    // Fallback
    const res = await fetch(`/data/genes/${gene}.json`);
    return res.ok ? res.json() : null;
  }

  async fetchCellData(cell: string) {
    const res = await fetch(`/data/cells/${encodeURIComponent(cell)}.json`);
    return res.ok ? res.json() : null;
  }

  // New methods specific to ApiDataClient
  async resolveGene(symbol: string) {
    const res = await fetch(`${API}/genes/resolve?symbol=${symbol}`);
    return res.ok ? res.json() : null;
  }

  async getGeneMetadata(gene: string) {
    const res = await fetch(`${API}/genes/metadata?gene=${gene}`);
    return res.ok ? res.json() : null;
  }

  async runEnrichment(genes: string[], databases: string[]) {
    const res = await fetch(`${API}/enrichment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genes, databases }),
    });
    return res.ok ? res.json() : null;
  }

  async getPPINetwork(genes: string[], minScore = 400) {
    const res = await fetch(`${API}/network/ppi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genes, min_score: minScore }),
    });
    return res.ok ? res.json() : null;
  }

  async searchGEO(query: string) {
    const res = await fetch(`${API}/geo/search?q=${encodeURIComponent(query)}`);
    return res.ok ? res.json() : null;
  }
}
```

**Step 2 — Replace resolver.ts** (1 day)

```typescript
// frontend/src/utils/resolver.ts — UPDATED
import { ApiDataClient } from '../services/apiClient';

const apiClient = new ApiDataClient();

export async function resolveSynonym(symbol: string) {
  const result = await apiClient.resolveGene(symbol);
  if (!result) return { canonical: null, warning: 'Unresolved' };
  return {
    canonical: result.symbol,
    warning: result.warnings?.[0] || null,
  };
}

export async function fetchGeneMetadata(gene: string) {
  const meta = await apiClient.getGeneMetadata(gene);
  if (!meta) return null;
  return {
    flybase: meta.fbgn,
    name: meta.name,
    summary: `${meta.name}: ${meta.go_terms.slice(0, 3).map(g => g.term).join(', ')}`,
  };
}

export async function resolveBulk(input: string, allGenesMapLower: Record<string, string>) {
  const tokens = input.split(/[\s,;\n]+/).map(t => t.trim()).filter(Boolean);
  const batch = await apiClient.resolveBatch(tokens);
  return {
    resolved: batch.resolved.map(r => r.symbol),
    unresolved: batch.unresolved,
    warnings: batch.warnings || [],
  };
}
```

**Step 3 — GeneDetailsView enrichment** (1 day)

```
Changes to GeneDetailsView.tsx:
┌──────────────────────────────────────────────┐
│  Gene: achi                                   │
│  FlyBase: FBgn0000015                         │
│  Name: achintya, achaete-scute...             │
│  Chromosome: 2R  Cytogenetic: 60E1-60E2       │
│                                               │
│  ┌── GO Terms ──────────────────────────┐     │
│  │ GO:0000978 RNA pol II cis-reg region │     │ ✦ NEW
│  │ GO:0007399 neurogenesis              │     │
│  │ GO:0045944 transcription activation  │     │
│  └──────────────────────────────────────┘     │
│                                               │
│  ┌── Alleles & Phenotypes ─────────────┐      │
│  │ achi¹ → embryonic lethal            │      │ ✦ NEW
│  │ achi² → defective neural dev.       │      │
│  └──────────────────────────────────────┘     │
│                                               │
│  ┌── Orthologs ────────────────────────┐      │
│  │ Human: ASCL1 (72%)  Mouse: Ascl1    │      │ ✦ NEW
│  └──────────────────────────────────────┘     │
└──────────────────────────────────────────────┘
```

### Phase 2: Analysis & Networks (4–5 days)

**Step 4 — Enrichment tab**

```
New component: frontend/src/components/EnrichmentLab/
├── EnrichmentLab.tsx          ← New tab root component
├── EnrichmentResultsTable.tsx  ← Sortable results table
└── EnrichmentChart.tsx         ← P-value volcano plot

Changes to App.tsx:
- Add "04_ENRICHMENT_LAB" to sidebar nav
- Add to tab switch: case 'EnrichmentLab' → <EnrichmentLab />

EnrichmentLab.tsx structure:
┌──────────────────────────────────────────────┐
│  [Specimen Bag: 7 genes loaded]             │
│  [Database: GO_Biological_Process_2023 ▾]   │
│  [🧪 RUN_ENRICHMENT]                        │
│                                              │
│  Results (sorted by p-value):                │
│  ┌────────────────────────────────────┐      │
│  │ # │ Term                    │ p-val │      │
│  │ 1 │ neuron differentiation │ 1e-8  │      │
│  │ 2 │ axon guidance         │ 3e-6  │      │
│  │ 3 │ transcription by...   │ 2e-4  │      │
│  │ 4 │ asymmetric cell div.  │ 2e-2  │      │
│  └────────────────────────────────────┘      │
│                                              │
│  [Export CSV] [GO_Molecular_Function ▾]      │
└──────────────────────────────────────────────┘
```

**Step 5 — Network view tab**

```
New component: frontend/src/components/NetworkView/
├── NetworkView.tsx               ← Tab root
├── NetworkGraph.tsx              ← SVG/Plotly force-directed graph
└── NetworkStatsPanel.tsx         ← Metrics sidebar

Changes to App.tsx:
- Add "05_NETWORK_VIEW" to sidebar
- Add tab switch case

NetworkGraph.tsx renders:
┌──────────────────────────────────────────────┐
│                    achi                       │
│                  /    \                       │
│               abd-b  acj6                    │
│               /   \  /   \                   │
│              ab  sens-2 ...                  │
│                                              │
│  Nodes: 24  Edges: 68  PPI enrichment: 3e-5  │
│  ⬤ Seed  ⬤ Strong  ⬤ Medium  ⬤ Weak        │
└──────────────────────────────────────────────┘
```

### Phase 3: External Data Pipeline (5–7 days)

**Step 6 — GEO importer tab**

```
New component: frontend/src/components/GEOImporter/
├── GEOImporter.tsx           ← Tab root
├── GEOSearchPanel.tsx        ← Search form + results
├── GEOImportDialog.tsx       ← Confirm import modal
└── DatasetList.tsx           ← Previously imported datasets

Changes to App.tsx:
- Add "06_GEO_IMPORTER" to sidebar
- Add tab switch case
```

### Phase 4: Co-expression & Cache (3–4 days)

**Step 7 — Backend co-expression engine**

```
New server module: server/services/coexpression.js
- Load expression matrix from SQLite
- Compute Pearson/Spearman in batches
- Write results to cache
- Generate gene JSON files

Progress reported via:
GET /api/coexpression/status/:jobId
→ { status: "processing", progress_pct: 67 }
```

---

## Implementation Timeline

| Phase | Backend API | Frontend UI | Total Days |
|---|---|---|---|
| **Phase 1** | `server/routes/genes.js` + `server/services/flybase.js` + `server/services/ensembl.js` + SQLite cache | `ApiDataClient`, updated `GeneDetailsView`, GO terms + alleles display | **3 days** |
| **Phase 2** | `server/routes/enrichment.js` + `server/routes/network.js` + `server/services/enrichr.js` + `server/services/stringdb.js` | `EnrichmentLab` tab + `NetworkView` tab | **5 days** |
| **Phase 3** | `server/routes/geo.js` + `server/routes/datasets.js` + `server/services/geo.js` + GEO XML parser + expression matrix processor | `GEOImporter` tab | **6 days** |
| **Phase 4** | `server/routes/coexpression.js` + co-expression engine + cache management routes | Status polling UI, dataset selector | **4 days** |
| **Total** | **10 service files + 8 route files + 4 cache modules** | **5 new components + 3 updated files** | **~18 days** |

---

## Quick Start — Backend Scaffold

```bash
cd flies/server
npm init -y
npm install express cors better-sqlite3 node-fetch dotenv
```

```javascript
// server/index.js — entry point skeleton
import express from 'express';
import cors from 'cors';
import genesRouter from './routes/genes.js';
import enrichmentRouter from './routes/enrichment.js';
import networkRouter from './routes/network.js';
import geoRouter from './routes/geo.js';
import datasetsRouter from './routes/datasets.js';
import coexpressionRouter from './routes/coexpression.js';
import cacheRouter from './routes/cache.js';
import healthRouter from './routes/health.js';

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/genes', genesRouter);
app.use('/api/enrichment', enrichmentRouter);
app.use('/api/network', networkRouter);
app.use('/api/geo', geoRouter);
app.use('/api/datasets', datasetsRouter);
app.use('/api/coexpression', coexpressionRouter);
app.use('/api/cache', cacheRouter);
app.use('/api/health', healthRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[Fly Backend] Running on http://localhost:${PORT}`);
});
```

```javascript
// server/routes/genes.js — route skeleton
import { Router } from 'express';
import { resolveGene, getGoTerms } from '../services/flybase.js';
import { getGeneCache, setGeneCache } from '../cache/gene-cache.js';

const router = Router();

router.get('/resolve', async (req, res) => {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  // Check cache first
  const cached = getGeneCache(symbol);
  if (cached) return res.json(cached);

  // Query FlyBase
  const result = await resolveGene(symbol);
  if (!result) {
    // Fall back to Ensembl
    // ...
  }

  // Cache and return
  if (result) setGeneCache(symbol, result);
  res.json(result || { error: 'Gene not found' });
});

export default router;
```

---

## Frontend `ApiDataClient` — Swap In

```typescript
// In main.tsx or a bootstrap file:
import { setDataClient } from './services/dataClient';
import { ApiDataClient } from './services/apiClient';

// Swap to backend-backed client:
setDataClient(new ApiDataClient());

// The existing store (useAppStore) continues to work unchanged
// because ApiDataClient implements the same DrosophilaDataClient interface
```

This is the **killer feature** — the `DrosophilaDataClient` interface means **zero changes to existing store or component code**. You swap the client once and every `fetchGeneData()` call routes through the backend. The static JSON files remain as a fallback.

---

Want me to scaffold the actual backend server files now?
