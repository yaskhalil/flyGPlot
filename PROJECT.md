# FlyGPlot — Fly TF Expression Explorer

**URL:** https://github.com/yaskhalil/flyGPlot  
**Stack:** React 19 + Vite + TypeScript (frontend) · Express 5 + SQLite (backend)  
**Ports:** Frontend 5173 · Backend 4000 · Public via Cloudflare tunnel  
**Theme:** Warm industrial lab notebook / ledger paper aesthetic

## What It Does

A computational workbench for *Drosophila melanogaster* transcription factor expression analysis. Supports:

- **Gene resolution** — FlyBase → Ensembl fallback for symbol lookup, synonyms, GO terms, alleles, orthologs
- **Expression visualization** — Boxplot profiles across 6 developmental stages (P15→Adult), cell-type trajectories with splines
- **Co-expression analysis** — Pearson, Spearman, Jaccard correlation engine (server-side, reads static JSON)
- **Functional enrichment** — g:Profiler (native Drosophila) + Enrichr (human ortholog fallback), cached 7 days
- **PPI networks** — STRING-DB force-directed graphs with SVG viewBox zoom/pan
- **GEO search** — NCBI GEO dataset browser
- **IGV genome browser** — Embedded IGV.js

## Architecture

```
flies/
├── frontend/               # React 19 + Vite + TypeScript
│   ├── src/
│   │   ├── components/     # Tab components per workspace
│   │   │   ├── shared/     # WorkspaceLayout, etc.
│   │   │   ├── HomeView/
│   │   │   ├── SpecimenIndexWorkspace/
│   │   │   ├── LedgerChartsWorkspace/
│   │   │   ├── CoexpWorkbenchWorkspace/
│   │   │   ├── EnrichmentLab/
│   │   │   └── NetworkView/
│   │   ├── store/          # Zustand global state
│   │   ├── services/       # API client + data client
│   │   └── utils/          # Gene resolver, CSV export
│   └── public/data/        # Static JSON (genes/, cells/, lists)
├── server/                 # Express 5 backend
│   ├── routes/             # genes, enrichment, network, geo, coexpression, cache, health
│   ├── services/           # flybase, ensembl, enrichr, gprofiler, stringdb, geo, coexpression
│   ├── cache/              # SQLite (better-sqlite3) with WAL mode
│   └── config/             # env.js, constants.js
```

## Data Flow

**Local static JSON** (fast) → gene expression + co-expression data  
**Backend API** (cached SQLite) → gene resolution, enrichment, PPI, GEO  
**External APIs** (with timeouts + caching) → FlyBase, Ensembl, Enrichr, g:Profiler, STRING-DB, NCBI

## Key Dependencies

- **Frontend:** react, plotly.js, zustand, lucide-react, igv.js
- **Backend:** express 5, better-sqlite3, cors, dotenv

## Running

```bash
cd server && /usr/local/bin/node index.js    # Backend :4000
cd frontend && npx vite --host               # Frontend :5173
```

## Status

Actively developed. 7 tabs: Home → SpecimenIndex → LedgerCharts → CoexpWorkbench → EnrichmentLab → NetworkView → (future)
