# Implementation Plan — Enhanced Fly TF Expression Explorer

This document outlines the design and implementation details to address the user's feature requests.

## 1. Data Processing Updates (`process_excel.py`)
We will add a new function `process_root_file` that parses all 11,299 genes from the 155 MB root Excel file `log_normalized_average_expression_all_stages 1.xlsx` and outputs a gzipped CSV (`combined_expression_all.csv.gz`). This file loads in **under 1 second** in Pandas.

We will keep the old `process_files` function intact for backward compatibility.

## 2. Target ID to Cell Name Mapping
We will parse `Cluster annotation.xlsx` to build an ID-to-annotation mapping.
- **Cluster number** column can have entries like `217/216, 189 (adult)` or `9`.
- **Annotation** column maps to the cell name (e.g. `Dm4` or `PCG`).
- Format: `"name" (#id)` (e.g. `"Dm4" (#9)`).
- If the ID does not have a mapped name or is NaN in the file, format it as `"Unknown" (#id)`.

## 3. Bulk Gene Sets Input & Synonym Resolution
In the sidebar, we will add an option to paste a list of gene symbols (separated by commas, whitespace, or newlines) rather than selecting them 1-by-1.
- Direct case-insensitive matching against the list of official symbols in the dataset.
- For unresolved inputs, query the Ensembl REST API:
  1. Lookup the symbol to see if Ensembl returns a match.
  2. If not, lookup the symbol via the xrefs API, retrieve the corresponding Ensembl/FlyBase ID, and then retrieve its official symbol.
- Cached results using `st.cache_data` for quick responsiveness and rate-limiting safety.
- Clear user feedback detailing resolved official symbols and warnings for any symbols that could not be found.

## 4. Cell-Centric Trend Line View (New Tab)
We will add a new tab: **Cell-Centric Trend**.
- **Select Cell:** A dropdown list showing all available cell target IDs, formatted with their real names using the `"name" (#id)` mapping.
- **Select Highlighted Genes:** A multiselect field to select which genes to color on the chart.
- **Plot Details:**
  - x-axis: developmental stages (`P15`, `P30`, `P40`, `P50`, `P70`, `Adult`).
  - y-axis: expression value.
  - Plotted as **trend lines** (lines connecting stages) instead of scattered dots.
  - Highlighted genes are plotted with bright distinct colors and labeled in the legend.
  - Background (non-highlighted) genes are plotted as thin, semi-transparent gray lines to show the overall trend of all selected genes in that cell without cluttering the legend.

## 5. UI Polishing & Hover Annotations
- In the **Expression Trend** tab (original view), we will update the plotly strip chart hover data to display the real cell name (e.g., `"Dm4" (#9)`) instead of raw IDs.
- Update the sidebar's data management options so that users can select to rebuild either the full all-genes dataset or the TF-only dataset.
