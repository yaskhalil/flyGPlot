# Detailed Design Specification — Fly Expression Explorer Expansion

This document outlines the granular software architecture, code logic, UI layouts, visualization specs, and test cases for expanding the Drosophila Expression Portal.

---

## 1. Data Flow & Parsers

```mermaid
graph TD
    A[app.py startup] --> B{PYTEST_CURRENT_TEST?}
    B -- Yes --> C[Load combined_expression.csv]
    B -- No --> D[Load combined_expression_all.csv.gz]
    D --> E[Read Cluster annotation.xlsx]
    E --> F[Parse mappings: ID -> Annotation Name]
    F --> G[Rename target columns from 'Target X' to 'Name (#X)']
    G --> H[Render Sidebar & Tabs]
```

### 1.1 Cluster Annotation Parser
We will implement `parse_cluster_annotations(filepath: str) -> dict[int, str]` in `process_excel.py`:
- Use `pandas.read_excel` to read `Cluster annotation.xlsx`.
- Extract integer IDs from the `Cluster number` column. Because a row can contain multiple cluster IDs (e.g., `217/216, 189 (adult)`), we use:
  ```python
  import re
  cluster_str = str(row['Cluster number'])
  ids = [int(x) for x in re.findall(r'\d+', cluster_str)]
  ```
- Map each extracted integer to the corresponding non-null string in the `Annotation` column. If the annotation is empty or NaN, it defaults to `"Unknown"`.
- Return a dictionary mapping integer cluster ID to string name: `{9: 'Dm4', 149: 'LC22', ...}`.

### 1.2 Target Column Header Mapping & Type Coercion
Inside `load_data()` in `app.py`:
- Let `df` be the loaded expression DataFrame.
- Coerce all columns representing expression data (every column except `gene` and `stage`) to numeric types using `pd.to_numeric(..., errors='coerce')` to gracefully handle cell annotations or string anomalies inside the Excel sheets (e.g. converting cells with `'CG10132'` to `NaN`).
- Retrieve the annotation dictionary.
- Iterate over column names that match `Target \d+`. Extract the digit, look up its annotation, and rename the column:

  ```python
  new_columns = {}
  for col in df.columns:
      if col.startswith('Target '):
          try:
              cluster_id = int(col.replace('Target ', ''))
              anno = annotation_dict.get(cluster_id, 'Unknown')
              new_columns[col] = f"{anno} (#{cluster_id})"
          except ValueError:
              new_columns[col] = col
  df = df.rename(columns=new_columns)
  ```

---

## 2. Synonym Resolution Engine

### 2.1 API Endpoint Structure
We will encapsulate all network requests in a robust caching function:
```python
@st.cache_data(ttl=86400, show_spinner=False)
def resolve_synonym_via_ensembl(symbol: str) -> dict:
    """
    Resolves an input symbol to its canonical FlyBase gene symbol.
    Returns a dict: {
        'status': 'success' | 'ambiguous' | 'failed',
        'canonical': str or None,
        'all_matches': list[str],
        'stable_id': str or None
    }
    """
```

### 2.2 Resolution Pipeline Logic
For each input symbol pasted in the bulk text area:
1. **Direct Match (Case-Insensitive):**
   - Check if the lowercased symbol matches any lowercased approved symbols in the loaded dataset. If yes, resolve instantly (e.g. `lost` -> `lost`).
2. **First API Hop (Xrefs Lookup):**
   - Query `https://rest.ensembl.org/xrefs/symbol/drosophila_melanogaster/{symbol}?content-type=application/json`.
   - If empty list returned: Mark as `failed`.
   - Extract all unique IDs with `"type": "gene"` (e.g. `FBgn0033749`).
3. **Second API Hop (Canonical Symbol Lookup):**
   - For each resolved ID, query `https://rest.ensembl.org/lookup/id/{id}?content-type=application/json`.
   - Retrieve `display_name` (e.g. `achi`).
   - If multiple IDs are found:
     - Mark as `ambiguous`.
     - Select the `display_name` of the first ID as the resolved canonical symbol.
     - Store other display names for user warning.
   - If exactly one ID is found:
     - Mark as `success`.
     - Set canonical symbol to `display_name`.
4. **Error Handling & Rate Limiting:**
   - Catch `requests.RequestException`. If the API is offline or times out, display a clear warning banner in the Streamlit UI: *"The Ensembl Gene Synonym API is currently down or timed out. Synonym resolution is temporarily unavailable."* This prevents application crashes and keeps the user informed.


---

## 3. Streamlit Sidebar & Tab Layout

### 3.1 Sidebar Layout
* **Dataset Info**: Read-only metrics (number of genes, stages, and target cells loaded).
* **Gene Selection Mode (Radio button)**:
  - Select "Select Genes Manually" (multiselect with auto-complete).
  - Select "Paste Bulk Gene Set" (text area).
* **Selection Controls**:
  - In manual mode: Show standard multiselect.
  - In bulk mode: Show `st.text_area` with placeholder: `"Enter genes separated by spaces, commas, or newlines (e.g., ab, achi, CG45784)"`.
* **Stage & Expression Filters**: Keep existing filters (multiselect for stages, number input for minimum expression threshold).

### 3.2 Main Panel Tabs
1. **Read Me**: Brief instructions and release notes.
2. **Expression Trend**: Original strip plots (with Pivot View toggle).
3. **Cell-Centric Trend**: Plotting continuous line trends.
4. **Co-expression Table** (New): On/Off status of selected genes in cells using Mixture Modeling data.
5. **Gene Group Finder** (New): Find co-expressed genes using Pearson Correlation and KSG KNN Mutual Information.
6. **Gene Details**: Live metadata and external FlyBase links.

---

## 4. Visualizations & Plotly Layouts

### 4.1 Tab 2: Expression Trend (Strip Plots)
- Include a **"Pivot View: Group by Cell Type"** checkbox.
  - **Normal View:** Plots one strip chart per selected **Gene** (x-axis: Stage, y-axis: Expression, each dot: different Cell Type).
  - **Pivot View:** Plots one strip chart per **Cell Type** (x-axis: Stage, y-axis: Expression, each dot: different Gene).
- Update the hover template to include:
  - Gene: `%{x}` (or `%{customdata[0]}`)
  - Stage: `%{y}`
  - Expression: `%{customdata[0]}` (formatted to 4 decimals)
  - Cell: `%{customdata[1]}` (real annotated cell name, e.g., `Dm4 (#9)`)

### 4.2 Tab 3: Cell-Centric Trend (Line Chart)
* **Dropdown Selection**: Choose a single Target Cell from the renamed columns list.
* **Highlight Multiselect**: Choose which of the active genes to highlight in color.
* **Plot Structure (`px.line`)**:
  - Filter dataset for the selected cell column.
  - Pivot data so the DataFrame contains columns: `['gene', 'stage', 'expression']`.
  - Ensure the stage order is correctly sorted as: `['P15', 'P30', 'P40', 'P50', 'P70', 'Adult']`.
* **Line Rendering Rules**:
  - **Case 1: No Highlight Selected**:
    - Assign each gene a distinct line color using a premium palette.
    - Set line width to `2.5` and marker size to `6`.
  - **Case 2: Highlight Selected**:
    - For highlighted genes: Render line with high opacity (`1.0`), line width `3.5`, marker size `8`, and distinct colors.
    - For background (non-highlighted) genes: Render line with low opacity (`0.15`), line color `#A0A0A0` (muted gray), line width `1.5`, marker size `3`, and exclude from the interactive legend (`showlegend=False`).

### 4.3 Tab 4: Co-expression Table (On/Off Grid)
- Load `combined_mixture_modelling.csv.gz` which stores the mixture modeling probabilities (0.0 to 1.0) indicating gene activity.
- Add controls:
  - **Select Stage:** Selectbox for developmental stage.
  - **Probability Threshold:** Slider (0.0 to 1.0, defaulting to 0.5) defining the "On" boundary.
- Display a grid:
  - Rows: Selected genes.
  - Columns: Target Cell names (formatted as `Annotation (#ID)`).
  - Value: `On` (if MM probability $\ge$ threshold) or `Off`.
- Color code the table cells (green for `On`, red for `Off`) using pandas Styler.

### 4.4 Tab 5: Gene Group Finder (Co-expression Engine)
- Input: Select a reference gene (from all 11,299 genes).
- Metric Selection: Choose between **Pearson Correlation** and **KSG KNN Mutual Information**.
- Engine Logic:
  - Retrieve the reference gene's expression vector across all 6 stages and ~225 cells ($N \approx 1350$ points).
  - **Step 1 (Fast Filter):** Calculate Pearson correlation between the reference gene and all 11,299 genes.
  - **Step 2 (Top Candidates):** Sort and select the top 100 genes with the highest absolute Pearson correlation.
  - **Step 3 (KSG KNN MI, if selected):** For these 100 candidates, compute the Kraskov-Stögbauer-Grassberger (KSG) Mutual Information using $k=3$ nearest neighbors:
    - Standardize candidate and reference vectors.
    - Build joint and marginal `cKDTree` models.
    - Apply L-infinity distance nearest neighbor counts.
    - Calculate MI value via the digamma equation.
  - Display the Top 20 results in a table with a button to instantly add them to the sidebar gene selection.

---

## 5. Testing & Verification

### 5.1 Pytest Strategy
- Mock `requests.get` to return simulated JSON payloads.
- Test cases to cover:
  - Direct matching and Ensembl API resolution.
  - Cell-centric line trends rendering data.
  - Pearson and KSG KNN co-expression calculations.
  - Co-expression On/Off grid binarization.

  - Streamlit AppTest interface validation (ensuring bulk input translates to the correct multiselect output state).
