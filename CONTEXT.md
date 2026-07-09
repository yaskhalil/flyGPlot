# Fly TF Expression Explorer

A portal for exploring transcription factor (TF) and genome-wide expression across developmental stages in Drosophila melanogaster.

## Language

**Gene**:
The canonical unit of heredity in Drosophila. In our system, genes are indexed by their approved symbol (e.g., "Abd-B" or a CG number like "CG45784").
_Avoid_: Feature, locus

**FlyBase ID**:
The unique alphanumeric identifier starting with "FBgn" assigned to a gene by FlyBase (e.g., "FBgn0000015").
_Avoid_: Ensembl ID, gene number

**Synonym**:
An obsolete or alternative symbol or name used to refer to a Gene.
_Avoid_: Obsolete name, secondary symbol

**Synonym Resolution**:
The process of mapping a user-provided input symbol or Synonym to a canonical Gene using Ensembl REST API endpoints (`xrefs/symbol` and `lookup/id`). If a synonym maps to multiple genes, it is resolved to the first active gene symbol, with a warning showing all potential matches. Unresolved synonyms are reported in a warning list.

**Gene Synonym Resolver**:
The module responsible for executing Synonym Resolution. It abstracts the Ensembl REST API via a clean seam (`EnsemblClient`) and returns a detailed `ResolutionResult` for callers.

**Gene Selection Mode**:
The UI setting in the sidebar that toggles between "Select Genes Manually" (using a multiselect dropdown) and "Paste Bulk Gene Set" (using a free-text area). Switching to bulk mode replaces the active selection with the resolved genes.
_Avoid_: Selection style



**Stage**:
A specific developmental stage of Drosophila (one of: P15, P30, P40, P50, P70, Adult) at which expression was measured.
_Avoid_: Timepoint, age

**Target Cell**:
A cluster of cells under study, identified by a numeric ID and mapped to a cell type annotation from Cluster annotation.xlsx. It is formatted in the UI as "{Annotation} (#{ID})" (e.g., "Dm4 (#9)"), or "Unknown (#{ID})" if no annotation is available.
_Avoid_: Cluster, cell type, target ID


**Expression Value**:
The log-normalized average expression level of a Gene in a Target Cell at a specific Stage.
_Avoid_: FPKM, count, intensity

**Co-expression Engine**:
The module responsible for computing co-expression profiles and building gene correlation networks. It hides SciPy/cKDTree calculations and Pearson matrix operations behind a simple interface, decoupled from UI concerns using functional progress callbacks.

**Drosophila Dataset Manager**:
The module responsible for encapsulating dataset operations. It manages file system locations, reads raw and processed Excel/CSV files, performs duplicate cleaning and type coercion, resolves cluster cell annotations, and handles dataset rebuilds. It exposes a simple data-loading interface to callers, completely decoupled from the UI framework.
