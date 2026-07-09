# Flybase TF Expression Analysis

This project contains scripts to process and visualize Transcription Factor (TF) expression data from Flybase Excel lists across various developmental stages of *Drosophila*.

## Overview

This application provides an interactive web interface to process, visualize, and explore Transcription Factor (TF) expression data from FlyBase Excel lists across various developmental stages of *Drosophila*.

## Features

- **Interactive UI (Streamlit):** Upload, process, and plot Excel data directly from the browser.
- **Dynamic Expression Filtering:** Use the sidebar to set Minimum Expression thresholds or select specific developmental stages (P15 to Adult).
- **FlyBase API Integration:** A dedicated "Gene Details" tab fetches live metadata (FlyBase ID, Full Name, and biological summary) directly from Ensembl and the FlyBase REST API.
- **Co-expression Analysis (Pearson & KSG Mutual Information):**
  - **Pearson Correlation ($r$):** Measures the linear association between expression profiles of genes $X$ and $Y$:
    $$r = \frac{\sum (x_i - \bar{x})(y_i - \bar{y})}{\sqrt{\sum (x_i - \bar{x})^2 \sum (y_i - \bar{y})^2}}$$
  - **KSG KNN Mutual Information (MI):** Estimates the shared information $I(X; Y) = \iint p(x,y) \log \frac{p(x,y)}{p(x)p(y)} dx dy$ via Kraskov-Stögbauer-Grassberger (KSG) estimator using 3-nearest neighbors:
    $$I^{(1)}(X;Y) = \psi(k) - \frac{1}{N}\sum_{i=1}^N \left[ \psi(n_x(i) + 1) + \psi(n_y(i) + 1) \right] + \psi(N)$$
  - **Why KSG KNN is More Useful in Biology:** Biological systems exhibit highly non-linear dynamics such as thresholded activation, saturation plateaus, feedback loops, and multi-stable toggles. Pearson correlation ($r$) can easily fail to detect these relationships (returning values close to $0$), whereas KSG Mutual Information successfully captures them by analyzing shared information without assuming a linear form.


## Directory Structure

*   **`application/src/app.py`**: The main Streamlit application containing the UI, data caching, interactive Plotly visualizations, and FlyBase API fetches.
*   **`application/src/frontend/`**: Streamlit tabs layout (`tabs.py`) and UI styles (`styles.py`).
*   **`application/src/backend/`**: Modular logic modules including the `CoexpressionEngine` (`coexpression.py`), `DrosophilaDatasetManager` (`dataset.py`), and `GeneSynonymResolver` (`resolver.py`).
*   **`application/src/data/`**: Directory containing raw and compiled datasets.
*   **`application/tests/`**: Pytest test suite for automated testing of data processing, resolving logic, coexpression engine, and Streamlit UI components.
*   **`application/docs/`**: Design documents and project documentation.
*   **`process_excel.py`**: Helper script in the root directory to rebuild datasets.
*   **`plot_expression.py`**: Helper script to generate quick matplotlib/seaborn plots from the data.
*   **`inspect_excel.py`**: Helper script to inspect Excel file shapes and headers.
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
   streamlit run application/src/app.py
   ```
2. **Process the Data:** Open the **Configuration** sidebar, expand **Update Dataset**, and click **Rebuild Dataset** to process the Excel files located in the `application/src/data/` folder.
3. **Explore Data:** Select genes from the sidebar, adjust filters, and view the jittered scatter plots under the **Expression Trend** tab.
4. **Fetch Metadata:** Switch to the **Gene Details** tab to pull live FlyBase IDs and summaries for any selected gene.
