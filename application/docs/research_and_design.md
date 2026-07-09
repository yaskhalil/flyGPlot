# Fly TF Expression Explorer — Research, API Analysis & System Design

This document details the research, specifications, and architecture for adding bulk gene sets, Ensembl/FlyBase API synonym resolution, cell-centric line trends, and target cell name mappings to the Drosophila expression portal.

---

## 1. Problem Statement & Scope

We want to expand the current transcription factor (TF) expression portal to support genome-wide analysis and enhance biological context. The specific requirements are:
1. **Bulk Gene Set Selection**: Allow pasting a space/comma/newline-separated list of gene symbols or synonyms instead of selecting them one-by-one.
2. **Superset Gene Dataset**: Access all 11,299 Drosophila genes present in the root Excel file rather than just the transcription factors in the `data/` subdirectory.
3. **Synonym/Identifier Resolution**: Use a public biological API to resolve obsolete symbols, synonym names, or annotation IDs (like CG numbers) to their canonical gene symbols present in our dataset.
4. **Cell-Centric Trend Line View**: Add a new tab plotting developmental expression trends across stages as continuous line graphs for a single selected cell type, with selective highlighting.
5. **Annotated Target Cell Names**: Map raw cluster target IDs (e.g. `9`) to their real cell annotations (e.g. `Dm4`) from `Cluster annotation.xlsx`, formatted as `"name" (#id)`.

---

## 2. API Analysis & Synonym Resolution

### 2.1 FlyBase API Limits
FlyBase maintains an official REST API at `api.flybase.org` and developer portal at `flybase.github.io`. However, FlyBase **does not expose a public REST endpoint for synonym/autocomplete resolution**. Programmatic synonym lookup in FlyBase is traditionally done by:
- Querying their public PostgreSQL Chado database (e.g., joining `feature`, `feature_synonym`, and `synonym` tables). This requires database connections, which are heavy and slow for on-the-fly web application lookups.
- Downloading their weekly precomputed bulk mapping files.

### 2.2 Ensembl REST API Specifications (The Solution)
To resolve synonyms fast and reliably, the Ensembl REST API is the standard choice. It aggregates FlyBase identifiers and offers high-performance endpoints. We will use the following Ensembl endpoints:

#### Endpoint A: Direct Lookup by Symbol
* **Path:** `GET https://rest.ensembl.org/lookup/symbol/drosophila_melanogaster/{symbol}`
* **Headers:** `{"Content-Type": "application/json"}`
* **Behavior:** Directly resolves canonical symbols (case-sensitive, though supports fallback) to Ensembl/FlyBase gene records.
* **Response Example (200 OK):**
```json
{
  "id": "FBgn0000015",
  "display_name": "Abd-B",
  "description": "Abdominal B [Source:FlyBase;Acc:FBgn0000015]",
  "object_type": "Gene",
  "species": "drosophila_melanogaster"
}
```

#### Endpoint B: Xrefs Lookup by Symbol (Synonym Resolution)
* **Path:** `GET https://rest.ensembl.org/xrefs/symbol/drosophila_melanogaster/{synonym}?content-type=application/json`
* **Behavior:** Maps legacy symbols, synonyms, or CG annotation numbers to their current canonical gene ID (FBgn ID).
* **Response Example (200 OK):**
```json
[
  {
    "id": "FBgn0000015",
    "type": "gene"
  }
]
```

#### Endpoint C: Lookup by ID
* **Path:** `GET https://rest.ensembl.org/lookup/id/{id}`
* **Headers:** `{"Content-Type": "application/json"}`
* **Behavior:** Resolves an FBgn ID (retrieved from Endpoint B or input directly by the user) to its current approved symbol (`display_name`).
* **Response Example (200 OK):**
```json
{
  "id": "FBgn0000015",
  "display_name": "Abd-B",
  "object_type": "Gene"
}
```

---

## 3. Data Source Consolidation

### 3.1 Dataset Comparison
- **Transcription Factor Files (`data/`)**: Composed of sheet-by-sheet tables (one sheet per gene). Contains ~483 genes. Total size ~5.5 MB.
- **Root Expression File (`log_normalized_average_expression_all_stages 1.xlsx`)**: Composed of stage-by-sheet tables (one sheet per stage: `P15`, `P30`, `P40`, `P50`, `P70`, `Adult`). Columns represent target cell IDs, and rows represent genes. Contains **11,299 genes**. Total size **155 MB**.

### 3.2 Compilation and Caching Strategy
Reading a 155 MB Excel file at startup takes over 60 seconds, which is unacceptable for a web application. We compiled this dataset into a gzipped CSV (`combined_expression_all.csv.gz`) with shape (69,149 rows, 233 columns):
- **Compression**: gzip compression reduces the file size from ~200 MB to **72.06 MB**.
- **Load Time**: Pandas reads the gzipped CSV in **0.95 seconds**, consuming **125 MB** of memory. We cache the parsed DataFrame using `@st.cache_data` so that it is loaded only once.

---

## 4. Target Cell ID Mapping

### 4.1 Parser Logic
We parse `Cluster annotation.xlsx` to build an ID-to-annotation mapping.
The `Cluster number` column can contain comma-separated list formats, ranges, or text:
- `217/216, 189 (adult)`
- `202/204, 206 (adult)`
- `9`

Our parser extracts all integer tokens using regular expressions:
```python
nums = [int(n) for n in re.findall(r'\d+', str(cluster_val))]
```
If the `Annotation` column contains a non-null string, we map each extracted integer to it.

### 4.2 Formatting Specifications
The mapped names are formatted as:
`"name" (#id)`

For example:
- ID `9` (Annotation: `Dm4`) $\rightarrow$ `"/Dm4" (#9)`
- ID `149` (Annotation: `LC22`) $\rightarrow$ `"/LC22" (#149)`
- ID `123` (No Annotation / NaN) $\rightarrow$ `"/Unknown" (#123)`
- Unlisted ID `257` $\rightarrow$ `"/Unknown" (#257)`

---

## 5. UI Layout & Streamlit AppTest Rerun Lifecycle

### 5.1 Rerun Behavior
Streamlit reruns the script whenever a user interacts with a widget (like clicking a button or changing a text field).
When `st.button("Rebuild Dataset")` is clicked:
1. The script runs. The button returns `True`.
2. The dataset is compiled. `st.success("Rebuilt!")` is rendered.
3. `st.rerun()` is executed, raising a `RerunException` which halts the current run and schedules a new execution.
4. During the rerun, the script runs with the button state reset to `False`. The success message is cleared from the display.

### 5.2 Streamlit AppTest Element Merging
Under `AppTest.run()`, Streamlit captures the execution output. If `st.rerun()` is called, Streamlit runs the script again and merges or keeps the element list from the run that triggered the rerun. 
However, in our modified app, if an uncaught exception occurred *during* the rerun (such as `AttributeError` from a `float`/`NaN` in the gene list), the rerun aborted midway. As a result, the merged elements list was broken, and `Dataset rebuilt successfully!` was missing from `at.success`.

### 5.3 Test Isolation Solution
We prevent test execution from interacting with or deleting the 75MB `combined_expression_all.csv.gz` by:
1. Checking if `"PYTEST_CURRENT_TEST" in os.environ`.
2. If `True`, `load_data()` completely ignores the large compressed file and defaults to the local, fast `combined_expression.csv` test fixture.
3. Option 1 rebuild button preserves `combined_expression_all.csv.gz` under test:
```python
if "PYTEST_CURRENT_TEST" not in os.environ and os.path.exists('combined_expression_all.csv.gz'):
    os.remove('combined_expression_all.csv.gz')
```

---

## 6. Implementation Plan

1. **Step 1: Fix NaN/Float Gene Names in `app.py`**:
   Ensure `all_genes` list contains only clean, non-null strings:
   `all_genes = [str(g) for g in df['gene'].dropna().unique() if str(g).strip() and str(g).lower() != 'nan']`
   Update `resolve_genes_bulk` to safely cast symbols and ignore NaN values.
2. **Step 2: Re-run Pytest Suite**:
   Validate that the automated tests pass successfully.
