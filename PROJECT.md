# FlyGPlot — Fly TF Expression Explorer

**URL:** https://github.com/yaskhalil/flyGPlot  
**Stack:** React 19 + Vite + TypeScript (frontend) · Express 5 + SQLite (backend)  
**Ports:** Frontend 5173 · Backend 4000 · Public via Cloudflare tunnel  
**Theme:** Warm industrial lab notebook / ledger paper aesthetic

## What It Does

A computational workbench for *Drosophila melanogaster* transcription factor expression analysis, covering 13,260 genes × 212 annotated clusters × 6 developmental stages (P15, P30, P40, P50, P70, Adult). Supports:

- **Marker selection (cluster-first)** — Pick a cell type, get the genes and two-gene split-GAL4 intersections that mark it and nothing else. See below.
- **Gene resolution** — FlyBase → Ensembl fallback for symbol lookup, synonyms, GO terms, alleles, orthologs
- **Expression visualization** — Boxplot profiles across the 6 stages, cell-type trajectories with splines, ON/OFF matrices
- **Co-expression analysis** — Pearson, Spearman, Jaccard, computed in the browser from the precomputed per-gene JSON; includes aggregate ranking and hierarchical module clustering
- **Functional enrichment** — g:Profiler (native Drosophila) + Enrichr (human ortholog fallback), cached 7 days
- **PPI networks** — STRING-DB force-directed graphs with SVG viewBox zoom/pan

## Marker Selector (MARKERS tab)

Every other tab starts from a gene. This one starts from a **cell type** and asks the question the lab builds reagents around: which gene, or which pair of genes, is ON in this cluster and OFF everywhere else, across development?

- `frontend/src/components/MarkerSelector/MarkerSelectorWorkspace.tsx` — target cluster, stage selection, ON threshold, and a multi-stage rule (ON at **ALL** vs **ANY** selected stages). Results export to CSV and push into the shared gene cohort.
- `frontend/src/services/onoffMatrix.ts` — the query engine. Loads the packed matrix once, builds a per-gene ON bitset over clusters, and scores candidates. Pairs are ranked as split-GAL4 intersections — scored on the clusters where **both** genes are ON, not either alone — with a *gain* column showing how many off-target clusters the second hemidriver actually removes.
- Clusters never measured at a selected stage are neither ON nor OFF and are excluded from both tallies, so a gene is not credited with specificity it was never tested for.

Scans all 13,260 genes in the browser with no server round-trip (~85 ms per query).

### The packed ON/OFF matrix

The per-gene JSON files total ~859 MB, so a cluster-first query cannot scan them at request time. `scripts/build-onoff-matrix.mjs` collapses every (gene, cluster, stage) mixture-modeling posterior into a 4-bit value:

- `frontend/public/data/onoff_matrix.bin` — 8.0 MB, 13,260 × 212 × 6 nibbles, two per byte
- `frontend/public/data/onoff_index.json` — gene/cluster/stage orderings plus `levels` and `notMeasured`
- Layout: `flat = (gene * nCells + cell) * nStages + stage`, low nibble first
- Value `0` means "cluster not measured at this stage"; posteriors quantize to 0–14 and are stored as `value + 1`, so a consumer reconstructs them as `(value - 1) / levels`

Regenerate after the per-gene JSON in `frontend/public/data/genes/` changes:

```bash
/usr/local/bin/node scripts/build-onoff-matrix.mjs    # from repo root
```

## Architecture

```
flies/
├── frontend/               # React 19 + Vite + TypeScript
│   ├── src/
│   │   ├── components/     # Tab components per workspace
│   │   │   ├── shared/     # WorkspaceLayout, etc.
│   │   │   ├── HomeView/
│   │   │   ├── SpecimenIndexWorkspace/
│   │   │   ├── MarkerSelector/
│   │   │   ├── LedgerChartsWorkspace/
│   │   │   ├── CoexpWorkbenchWorkspace/
│   │   │   ├── EnrichmentLab/
│   │   │   └── NetworkView/
│   │   ├── store/          # Zustand global state
│   │   ├── services/       # apiClient, dataClient, onoffMatrix query engine
│   │   └── utils/          # Gene resolver, CSV export
│   └── public/data/        # Static JSON (genes/, cells/, lists)
│                           #   + onoff_matrix.bin / onoff_index.json
├── server/                 # Express 5 backend
│   ├── routes/             # genes, enrichment, network, cache, health
│   ├── services/           # flybase, ensembl, enrichr, gprofiler, stringdb
│   ├── cache/              # SQLite (better-sqlite3) with WAL mode
│   └── config/             # env.js, constants.js
└── scripts/
    └── build-onoff-matrix.mjs   # regenerates the packed ON/OFF matrix
```

## Data Flow

**Local static JSON** (fast) → gene expression + co-expression data  
**Packed binary matrix** (in-browser) → cluster-first marker search, no round-trip  
**Backend API** (cached SQLite) → gene resolution, enrichment, PPI  
**External APIs** (with timeouts + caching) → FlyBase, Ensembl, Enrichr, g:Profiler, STRING-DB

## Key Dependencies

- **Frontend:** react, plotly.js, zustand, lucide-react
- **Backend:** express 5, better-sqlite3, cors, dotenv

## Running

```bash
cd server && /usr/local/bin/node index.js    # Backend :4000
cd frontend && npx vite --host               # Frontend :5173
```

## Status

Actively developed. 7 tabs, in sidebar order:

| Label | Component | What it does |
|---|---|---|
| HOME | `HomeView` | Overview, workflow guide, data sources |
| GENES | `SpecimenIndexWorkspace` | Search, resolve, and manage the gene cohort; per-gene details incl. reagent links |
| MARKERS | `MarkerSelectorWorkspace` | Cluster-first marker and split-GAL4 pair search |
| EXPRESSION | `LedgerChartsWorkspace` | Boxplots, developmental trajectories, ON/OFF matrices |
| MODULES | `CoexpWorkbenchWorkspace` | Scatter plots, aggregate correlation, module clustering |
| ANALYSIS | `EnrichmentLab` | GO/pathway enrichment via g:Profiler and Enrichr |
| NETWORK | `NetworkView` | STRING-DB PPI graphs, force-directed layout |

**Known upstream issue:** `api.flybase.org` is currently returning empty 2xx bodies for the gene, allele, GO, ortholog, and search paths this client uses, so FlyBase-backed data (including the reagent lookup) is degraded. Gene resolution still works via the Ensembl fallback. See MISTAKES.md.
