# Flybase TF Expression Analysis

This project contains scripts to process and visualize Transcription Factor (TF) expression data from Flybase Excel lists across various developmental stages of *Drosophila*.

## Overview

This application provides an interactive web interface to process, visualize, and explore Transcription Factor (TF) expression data from FlyBase Excel lists across various developmental stages of *Drosophila*.

## Features

- **Interactive UI (Streamlit):** Upload, process, and plot Excel data directly from the browser.
- **Dynamic Expression Filtering:** Use the sidebar to set Minimum Expression thresholds or select specific developmental stages (P15 to Adult).
- **FlyBase API Integration:** A dedicated "Gene Details" tab fetches live metadata (FlyBase ID, Full Name, and biological summary) directly from Ensembl and the FlyBase REST API.
- **KSG KNN Co-Regulation Analysis (🚧 Coming Soon):** We will be integrating a Kraskov-Stögbauer-Grassberger (KSG) K-Nearest Neighbors algorithm. This will allow us to mathematically detect complex, non-linear co-expression and regulation patterns across all target genes, directly pointing us to novel regulatory networks for wet-lab validation.

## Files and Scripts

*   **`app.py`**: The main Streamlit application containing the UI, data caching, interactive Plotly visualizations, and FlyBase API fetches.
*   **`process_excel.py`**: The data processing engine that converts raw Excel sheets into a consolidated `combined_expression.csv`. This is now triggered automatically from the Streamlit sidebar.
*   **`test_app.py`**: The pytest suite for automated testing of data processing and Streamlit UI components.
*   **`requirements.txt`**: Python dependencies required to run the project.

## Installation

1. Clone this repository.
2. It is highly recommended to run the code within a Python virtual environment.
3. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

1. Launch the interactive web app:
   ```bash
   streamlit run app.py
   ```
2. **Process the Data:** Open the **Configuration** sidebar, expand **Update Dataset**, and click **Rebuild Dataset** to process the Excel files located in the `data/` folder.
3. **Explore Data:** Select genes from the sidebar, adjust filters, and view the jittered scatter plots under the **Expression Trend** tab.
4. **Fetch Metadata:** Switch to the **Gene Details** tab to pull live FlyBase IDs and summaries for any selected gene.
