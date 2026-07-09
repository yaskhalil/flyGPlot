# Fly TF Expression Explorer — Integration Roadmap

> Plan date: 2026-07-09
> Source: Project analysis + bioinformatics tools research

---

## Current Architecture

```
Frontend (React 19 + Vite 8 + Plotly.js + Zustand)
├── StaticJsonDataClient ← reads from public/data/ (gene_list.json, cell_list.json, per-gene JSON)
├── Ensembl REST API    ← synonym resolver + gene metadata lookup
│
├── SpecimenIndex       ← gene search, bulk resolve, FlyBase links
├── LedgerCharts        ← boxplots, developmental trajectory splines
└── CoexpWorkbench      ← heatmap matrix + scatter dashboard (Pearson/Spearman/Jaccard)
```

The project already has a **swappable data client interface** (`DrosophilaDataClient` in `services/dataClient.ts`) — perfect for adding live API-backed data sources.

---

## Phase 1: Quick Wins (1–2 days each)

### P1.1 — FlyBase API Integration (enhances existing SpecimenIndex)

**What**: Replace/Supplement Ensembl-only lookups with the official FlyBase REST API

**Files to modify**:
- `src/utils/resolver.ts` — add a `flybaseResolve(symbol)` function

**API endpoint**:
```
GET https://api.flybase.org/api/v1.0/gene/{symbol}
Response: { id: "FBgn0000015", symbol: "Abd-B", name: "...", synonyms: [...], go_terms: [...] }
```

**Why it matters**: FlyBase is the canonical source. Current Ensembl path sometimes misses synonyms.

**UI change**: Add a "Source: FlyBase / Ensembl" toggle to the GeneDetailsView card. FlyBase provides richer annotations (GO terms, alleles, phenotypes).

**Implementation** (~40 lines):

```typescript
// src/utils/resolver.ts — add
export async function resolveViaFlyBase(symbol: string) {
  const res = await fetch(`https://api.flybase.org/api/v1.0/gene/${symbol}`);
  if (!res.ok) return null;
  const data = await res.json();
  return {
    fbgn: data.id,
    symbol: data.symbol,
    name: data.name,
    synonyms: data.synonyms || [],
    summary: data.description || null,
    goTerms: data.go_terms || [],
  };
}
```

---

### P1.2 — CSV Export Improvements

**What**: Already have `downloadCSV()` in scatter view. Add:
- Export entire co-expression table for reference gene
- Export filtered results as CSV

**Files to modify**:
- `src/utils/csv.ts` — verify it exists and enhance
- `src/components/CoexpWorkbenchWorkspace/CoexpDashboardView.tsx` — add "Export All" button

**Implementation**: Already partially done — the scatter view exports per-partner CSV. Just need a bulk export button.

---

## Phase 2: Co-expression & Network Layer (3–5 days)

### P2.1 — STRING-DB Protein Interaction Overlay

**What**: When viewing co-expression results, show which pairs have known PPIs from STRING-DB

**New files**:
- `src/services/stringClient.ts` — STRING-DB API wrapper

**API endpoint**:
```
POST https://string-db.org/api/json/interactionPartners
Body: identifiers=achI%0Dabd-b%0Dacj6 (newline-separated)
      species=7227 (Drosophila melanogaster)
      required_score=400

Response: Array of { stringId_A, stringId_B, score, nscore, ascore, escore, ... }
```

**UI change**: In CoexpWorkbench, add a new sub-tab "Network View" or overlay badges on the scatter dashboard showing "STRING: 0.87" next to the correlation score.

**Implementation sketch** (~60 lines):

```typescript
// src/services/stringClient.ts
const STRING_API = "https://string-db.org/api/json";
const DROSOPHILA_TAXON = 7227;

export async function queryStringDB(genes: string[], minScore = 400) {
  const res = await fetch(`${STRING_API}/interactionPartners`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      identifiers: genes.join("%0D"),
      species: String(DROSOPHILA_TAXON),
      required_score: String(minScore),
    }),
  });
  return res.json(); // Returns interaction network data
}
```

---

### P2.2 — Enrichr Enrichment Analysis Button

**What**: One-click "Run Enrichment" for the currently selected gene cohort

**New files**:
- `src/services/enrichrClient.ts`

**API endpoint**:
```
POST https://maayanlab.cloud/Enrichr/addList
Body: list=achI%0Aabd-b%0Aacj6 (newline-separated gene symbols)
      description="La Única selected cohort"

Response: { userListId: 12345, shortId: "abc123" }

Then:
GET https://maayanlab.cloud/Enrichr/enrich?userListId=12345&backgroundType=GO_Biological_Process_2023
Response: { "GO_Biological_Process_2023": [[rank, term, p-value, z-score, combined, overlapping_genes]] }
```

**UI change**: Add a "Run Enrichment" button to the GeneSelectionView sidebar ("Specimen Bag" area). Results panel appears showing enriched GO terms, pathways, etc. in a sortable table.

**Implementation** (~70 lines):

```typescript
// src/services/enrichrClient.ts
const ENRICHR_API = "https://maayanlab.cloud/Enrichr";

export async function submitGeneList(genes: string[], description: string) {
  const res = await fetch(`${ENRICHR_API}/addList`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      list: genes.join("\n"),
      description,
    }),
  });
  return res.json(); // { userListId, shortId }
}

export async function getEnrichment(userListId: number, geneSetLib = "GO_Biological_Process_2023") {
  const res = await fetch(`${ENRICHR_API}/enrich?userListId=${userListId}&backgroundType=${geneSetLib}`);
  return res.json();
}
```

---

## Phase 3: External Data Pipeline (5–7 days)

### P3.1 — GEO Dataset Importer

**What**: Let users search and import public expression datasets from NCBI GEO

**New files**:
- `src/services/geoClient.ts`

**API endpoint**:
```
esearch.fcgi?db=gds&term=Drosophila+melanogaster+expression&retmax=10
→ XML with dataset IDs

esummary.fcgi?db=gds&id=GSE12345
→ Summary of dataset (title, organism, platform, samples)
```

**UI change**: New "GEO Import" section in SpecimenIndex or a modal. Search GEO datasets, preview, and import expression data into the current workspace.

**Architecture note**: GEO returns XML — parse with `DOMParser` on the frontend, or proxy through a lightweight backend.

---

### P3.2 — Data Client Swapper (Backend)

**What**: Stand up a lightweight Node.js (or Python FastAPI) backend that:
- Caches GEO queries
- Precomputes co-expression matrices on demand
- Proxies external APIs (avoids CORS issues)

**New files**:
- `server/` directory with Express/FastAPI
- `src/services/apiClient.ts` — new backend client

**Data flow**:
```
Frontend → your server → GEO / STRING / Enrichr / FlyBase
                ↕
         SQLite cache (prevents redundant API calls)
```

**Why**: Current browser-side only architecture can't do heavy computation or cache. A thin server unlocks GEO dataset import, server-side enrichment, and rate-limit management.

---

## Phase 4: Visualization Enhancement (4–6 days)

### P4.1 — IGV.js Genome Browser Embed

**What**: Embed a genome browser in GeneDetailsView to show gene structure, isoforms, and regulatory regions

**Install**:
```bash
npm install @igvteam/igv
```

**UI change**: Add a "Genome Browser" tab to the GeneDetailsView card showing IGV tracks for the selected gene.

**Implementation** (~30 lines):

```typescript
import igv from "@igvteam/igv";

const browser = igv.createBrowser(container, {
  genome: "dm6",
  locus: geneSymbol,
  tracks: [
    { name: "RefSeq Genes", url: "https://hgdownload.soe.ucsc.edu/goldenPath/dm6/bigZips/genes/dm6.refGene.gtf", type: "annotation" },
  ],
});
```

---

## Full Integration Map

```
Current client-side state (StaticJsonDataClient)
│
├─► FlyBase API        ─── enrich GeneDetailsView (GO terms, phenotypes, synonyms)
├─► MyGene.info        ─── fallback annotation source (faster than Ensembl)
├─► STRING-DB API      ─── PPI overlay on co-expression (new NetworkView tab)
├─► Enrichr API        ─── "Run Enrichment" button on selected cohort
├─► NCBI GEO API       ─── import external expression datasets
├─► IGV.js             ─── genome browser embed in GeneDetailsView
│
└─► Backend server     ─── cache, proxy, precompute (Express/FastAPI)
    ├─ Route: /api/geo/search
    ├─ Route: /api/geo/import
    ├─ Route: /api/enrichment/run
    └─ Route: /api/coexpression/precompute
```

---

## File Change Summary

| Phase | File(s) | Action |
|---|---|---|
| P1.1 | `src/utils/resolver.ts` | Add `resolveViaFlyBase()` |
| P1.1 | `src/components/SpecimenIndexWorkspace/GeneDetailsView.tsx` | Add FlyBase data provider toggle + GO terms display |
| P1.2 | `src/components/CoexpWorkbenchWorkspace/CoexpDashboardView.tsx` | Add bulk CSV export button |
| P2.1 | `src/services/stringClient.ts` | **New** — STRING-DB API client |
| P2.1 | New tab in CoexpWorkbench | "Network View" with PPI overlay |
| P2.2 | `src/services/enrichrClient.ts` | **New** — Enrichr API client |
| P2.2 | `src/components/SpecimenIndexWorkspace/GeneSelectionView.tsx` | Add enrichment button + results panel |
| P3.1 | `src/services/geoClient.ts` | **New** — GEO E-utilities wrapper |
| P3.1 | New "GEO Import" panel | Search/import public datasets |
| P3.2 | `server/` | **New** — backend server |
| P3.2 | `src/services/apiClient.ts` | **New** — API client for backend |
| P4.1 | `src/utils/igvClient.ts` | IGV.js browser wrapper |
| P4.1 | GeneDetailsView | Embed genome browser track |

---

## Recommendation: Start with P2.2 (Enrichr)

**Why**: Enrichr requires zero setup, has a dead-simple REST API, and provides immediate user-facing value ("what do my selected genes DO?"). The API is CORS-friendly so you don't even need a backend for the initial integration.

Quick code sketch for the button in GeneSelectionView:

```tsx
// In the "Specimen Bag" sidebar section — add:
{selectedGenes.length > 0 && (
  <button className="btn btn-primary" onClick={async () => {
    const { userListId } = await submitGeneList(selectedGenes, "Fly Explorer");
    const results = await getEnrichment(userListId);
    setEnrichmentResults(results);
  }}>
    <Compass size={13} /> RUN_ENRICHMENT
  </button>
)}
// Then render results in a collapsible panel below
```

Want me to start implementing any of these? P1.1 (FlyBase API) or P2.2 (Enrichr) would be the most impactful for the least effort.
