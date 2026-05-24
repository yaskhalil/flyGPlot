# Flybase TF Expression Analysis

This project contains scripts to process and visualize Transcription Factor (TF) expression data from Flybase Excel lists across various developmental stages of *Drosophila*.

## Overview

The workflow involves inspecting raw Excel data, processing it into a unified CSV format, and generating scatter plots to visualize the expression of specific transcription factors over time (e.g., stages P15, P30, P40, P50, P70, and Adult).

## Files and Scripts

*   **`inspect_excel.py`**: A utility script to inspect the structure of the raw Excel files. It prints out the sheet names (which represent genes), the total number of sheets, and a preview of the first few rows.
*   **`process_excel.py`**: The main data processing script. It takes the raw Excel files (e.g., `flybase TF expression list_A-E.xlsx` and `flybase_TF_expression_list_F-Z.xlsx`) as inputs. It extracts the developmental stage expression values starting from the 'Log' row in each sheet and consolidates this data across all genes into a single structured CSV file (`combined_expression.csv`).
*   **`plot_expression.py`**: A visualization script that reads `combined_expression.csv` and generates a panel of jittered scatter plots (strip plots) for a targeted subset of genes (e.g., *ab*, *abd-b*, *achi*, *acj6*, *Adf1*, *Aef1*). The resulting plot is saved as an image (`test_plot.png`).
*   **`requirements.txt`**: A list of Python dependencies required to run the project.

## Installation

1.  It is recommended to run the code within a virtual environment.
2.  Install the required dependencies using `pip`:
    ```bash
    pip install -r requirements.txt
    ```

## Usage

1.  **Prepare the Data:** By default, `process_excel.py` looks for specific excel files in your `~/Downloads` folder. Ensure the raw Excel files are located there or modify the file paths inside `process_excel.py` to point to the correct locations.
2.  **Process the Data:** Run the processing script to compile all the sheets into the combined CSV file.
    ```bash
    python process_excel.py
    ```
    *Output:* `combined_expression.csv`
3.  **Generate the Plot:** Run the plotting script to visualize the expression data for your target genes.
    ```bash
    python plot_expression.py
    ```
    *Output:* `test_plot.png`
