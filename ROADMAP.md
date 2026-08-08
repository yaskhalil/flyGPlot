# Roadmap — Feature Plan

Based on analysis of the Yu-Chieh David Chen Lab @ Temple (Drosophila neural development, scRNA-seq, split-GAL4 tools). Their workflow: scRNA-seq → identify cell-type-specific genes → find transcription factors → build split-GAL4 reagents → study circuit wiring.

## Shipped

### ✅ Cluster-First Marker Selector (MARKERS tab)
**What:** Start from a cell type, not a gene: scan all 13,260 genes for the ones ON in a chosen cluster and OFF everywhere else, and rank two-gene combinations as split-GAL4 intersections.  
**How:** `scripts/build-onoff-matrix.mjs` packs every (gene, cluster, stage) posterior into a 4-bit matrix (8 MB); `frontend/src/services/onoffMatrix.ts` loads it once and answers queries in-browser with cluster bitsets (~85 ms), no server round-trip.  
**Where:** `frontend/src/components/MarkerSelector/MarkerSelectorWorkspace.tsx`.  
**Why:** This is the scMarco use case plus the developmental axis — a marker is only usable as a driver if it holds at the stages you care about, so the multi-stage rule (ALL vs ANY) is explicit rather than collapsed.

**Next on this:** annotate hits with whether reagents actually exist for the genes (blocked on the same FlyBase issue as below), and let a user pin a hemidriver they already own and search only for its partner.

## Quick Wins (Low Effort, High Value)

### 1. Gene Set → TF Enrichment
**What:** Given any gene list (e.g., cluster markers from scRNA-seq, or the MARKERS tab's output), find which transcription factors are most co-expressed with those genes.  
**How:** Reuse the co-expression scores already precomputed in the per-gene JSON (the same source `CoexpAggregateView` ranks on). For each input gene, average co-expression with all TFs and rank TFs by aggregate score.  
**Blocker:** the repo has no TF annotation list. `frontend/public/data/` carries `gene_list.json` and `cell_list.json`, and nothing anywhere in the codebase distinguishes a TF from any other gene. Sourcing and checking in a curated Drosophila TF list (e.g. FlyTF, or FlyBase GO `DNA-binding transcription factor activity`) is the actual first step, not the ranking code.  
**Why:** Every scRNA-seq paper does TF enrichment as standard downstream analysis. Directly useful for identifying regulators of neuron types.

### 2. Split-GAL4 Reagent Lookup — implemented, blocked upstream
**Status:** The plumbing is done and shipped: `getReagents` in `server/services/flybase.js`, `GET /api/genes/reagents`, and a reagent panel in `SpecimenIndexWorkspace/GeneDetailsView.tsx`. It reliably serves the FlyBase reagent/insertion/allele page links and the MiMIC/CRIMIC/split-GAL4 line-type reference.

**What does not work:** the actual line list. `api.flybase.org` returns an empty 2xx body for every gene, allele, GO, ortholog, and search path this client uses, so no allele or insertion records come back. The client now raises `FlyBaseUnavailableError` on an empty 2xx and the endpoint reports `degraded: true` with a note, rather than reporting `alleleCount: 0` as if the gene had no lines — see MISTAKES.md.

**Remaining work is not implementation, it is sourcing:**
1. Confirm which FlyBase API v1.0 paths actually serve allele/insertion data. Note that unknown routes return the same empty 200 as throttled ones, so a path that returns bytes is the only proof it exists.
2. If no such endpoint exists, fall back to a checked-in index built from a FlyBase bulk download (precomputed files / FTP) rather than a live API.
3. Surface the `degraded` flag in the GeneDetailsView panel so the UI never shows an empty line list as a confident answer.

**Why:** Their lab builds split-GAL4 tools (Star Protocols 2023). A working lookup is daily-use for choosing which lines to order — which is exactly why it must not silently report "no lines".

### 3. TF Co-expression Module Browser — partially there
**Already built:** `CoexpWorkbenchWorkspace/CoexpModuleBrowser.tsx` does hierarchical clustering over the user's gene cohort using `1 - |correlation|` as distance. What is missing is the *TF* part: it clusters whatever genes you loaded, not TFs specifically, and it is cohort-scoped rather than genome-wide.  
**Remaining:** the curated TF list blocking item 1, then a genome-wide TF × TF pass and a network rendering of the resulting modules.  
**Why:** They study molecular networks involving TFs in the TmY14 project — module detection finds functional groups.

### 4. Cell-Type TF Expression Matrix
**What:** Heatmap of which TFs express in which cell types, filterable by stage and expression threshold.  
**Note:** the generic version of this exists — `LedgerChartsWorkspace/OnOffMatrix.tsx` renders a gene × cell-type ON/OFF matrix, and the packed matrix behind MARKERS already holds every (gene, cluster, stage) posterior. The unbuilt part is again the TF restriction and the filtering UI, not the data.  
**Why:** The core need for anyone doing scRNA-seq — "which TFs mark which cell types?"

## Longer Term

### 5. Cross-Species Comparison Mode
**What:** Compare expression of orthologous TFs across Drosophila species.  
**How:** Requires expression data from other species (not currently in the dataset).  
**Why:** Maps to their dsx⁺ neuron evolution work (PNAS 2025).

### 6. Developmental Pseudotime Trajectories
**What:** Continuous expression trajectories across development (not just discrete stages).  
**How:** Requires pseudotime ordering or finer timepoints.  
**Why:** They track neuron development from early to adult — smoother trajectories show regulatory timing.

### 7. TF → Target Gene Prediction
**What:** Based on co-expression and motif data, predict which genes a given TF regulates.  
**How:** Cross-reference co-expression with known TF binding motifs (e.g., from FlyFactorSurvey).  
**Why:** Connects TF expression to downstream target identification — the full regulatory logic.

## Integration Targets

| External Resource | Purpose | Priority | Status |
|---|---|---|---|
| FlyBase split-GAL4/MiMIC/CRIMIC | Reagent lookup | P0 | Integrated, but the API returns empty 2xx for every path we use — needs a confirmed endpoint or a bulk-download index |
| Curated Drosophila TF list | Prerequisite for TF enrichment / module browser | P0 | Not in repo |
| BDGP in situ expression patterns | Validate TF expression | P1 | Not started |
| FlyFactorSurvey TF binding motifs | Target prediction | P2 | Not started |
| FlyBase expression data | Broader stage coverage | P2 | Not started |
| modENCODE ChIP-seq | TF binding validation | P2 | Not started |

## Implementation Order

1. ✅ g:Profiler enrichment (native Drosophila)
2. ✅ Cluster-first marker selector + split-GAL4 pair search (MARKERS tab)
3. ⚠️ Split-GAL4 reagent lookup — built end to end; line data blocked on FlyBase upstream, not on code
4. 🔲 Curated TF list (unblocks 5 and 6)
5. 🔲 Gene set → TF enrichment
6. 🔲 TF co-expression module browser
7. 🔲 Cell-type TF expression matrix
8. (future) Cross-species, pseudotime, target prediction
