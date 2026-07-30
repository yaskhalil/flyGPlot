# Roadmap — Feature Plan

Based on analysis of the Yu-Chieh David Chen Lab @ Temple (Drosophila neural development, scRNA-seq, split-GAL4 tools). Their workflow: scRNA-seq → identify cell-type-specific genes → find transcription factors → build split-GAL4 reagents → study circuit wiring.

## Quick Wins (Low Effort, High Value)

### 1. Gene Set → TF Enrichment
**What:** Given any gene list (e.g., cluster markers from scRNA-seq), find which transcription factors are most co-expressed with those genes.  
**How:** Use the existing co-expression engine. For each input gene, compute average co-expression with all TFs. Rank TFs by aggregate score.  
**Where:** New tab or button in CoexpWorkbench / EnrichmentLab.  
**Why:** Every scRNA-seq paper does TF enrichment as standard downstream analysis. Directly useful for identifying regulators of neuron types.

### 2. Split-GAL4 Reagent Lookup
**What:** Given a gene symbol, show available split-GAL4, MiMIC, and CRIMIC lines from FlyBase.  
**How:** Query FlyBase's reagent endpoint or maintain a local index of known lines.  
**Where:** New panel in SpecimenIndex GeneDetailsView.  
**Why:** Their lab builds split-GAL4 tools (Star Protocols 2023). A lookup would be daily-use for choosing which lines to order.

### 3. TF Co-expression Module Browser
**What:** Cluster co-expressed TFs into regulatory modules with a network visualization.  
**How:** Compute pairwise co-expression among all TFs, threshold by score, render modules.  
**Where:** Extension of CoexpWorkbench.  
**Why:** They study molecular networks involving TFs in the TmY14 project — module detection finds functional groups.

### 4. Cell-Type TF Expression Matrix
**What:** Heatmap of which TFs express in which cell types, filterable by stage and expression threshold.  
**How:** Use existing cell-centric expression data (`fetchCellData`). Build a pivot table of TF expression across cell types.  
**Where:** New tab or LedgerCharts extension.  
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

| External Resource | Purpose | Priority |
|---|---|---|
| FlyBase split-GAL4/MiMIC/CRIMIC | Reagent lookup | P0 |
| BDGP in situ expression patterns | Validate TF expression | P1 |
| FlyFactorSurvey TF binding motifs | Target prediction | P2 |
| FlyBase expression data | Broader stage coverage | P2 |
| modENCODE ChIP-seq | TF binding validation | P2 |

## Implementation Order

1. ✅ g:Profiler enrichment (native Drosophila)
2. 🔲 Gene set → TF enrichment
3. 🔲 Split-GAL4 reagent lookup
4. 🔲 TF co-expression module browser
5. 🔲 Cell-type TF expression matrix
6. (future) Cross-species, pseudotime, target prediction
