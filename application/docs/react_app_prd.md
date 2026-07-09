# Product Requirement Document (PRD) — React Fly Gene Expression Explorer

## Problem Statement
The current Streamlit application has high latency and reloading spinners because every filter change (e.g., stage selection, expression thresholds) triggers a full Python script re-run. Additionally, the lack of robust universal filtering and complex, multi-tab state syncing makes it difficult for researchers to explore trends and co-expression correlations seamlessly.

## Solution
Transition the portal into a modern, fully client-side React + TypeScript + Tailwind CSS web application. By compiling the raw Drosophila datasets into optimized, compact static CSV/JSON files, the application will load entirely into the browser's memory. This enables **instant (0ms) universal filtering**, fluid dashboard switching, rich tooltips, and state-linked plots (windshield/steering wheel) with zero loading lag.

## User Stories
1. As a lab researcher, I want a persistent global sidebar with filters for developmental stages, expression thresholds, and low-expression exclusions, so that I can instantly slice the entire dataset across all active visualization panels.
2. As a lab researcher, I want a smart gene search bar with autocomplete and synonym auto-resolution, so that I can type in obsolete or alternative symbols and immediately get the correct canonical FlyBase symbol.
3. As a lab researcher, I want to paste a bulk list of gene symbols separated by commas or spaces, so that I can quickly load a specific gene set without picking them one-by-one.
4. As a lab researcher, I want to load curated predefined gene groups (like CAMs or Kai Zinn) or generate groups based on cell annotations, so that I can quickly load relevant biological cohorts.
5. As a lab researcher, I want a split-screen co-expression dashboard where clicking on a gene in the search results table instantly updates the scatter plots, strip plots, and FlyBase details on the right with zero refresh lag.
6. As a lab researcher, I want to download or print high-quality SVG/PNG versions of the generated charts, so that I can use them directly in scientific publications.
7. As a lab system administrator, I want the web app to be compile-able as a static site, so that we can host it for free on GitHub Pages without maintaining any running cloud servers.

## Implementation Decisions
- **Frontend Framework**: React + Vite + TypeScript for a light, high-performance execution container.
- **State Management**: Zustand for central, atomic store management (prevents unnecessary re-renders while updating universal filters instantly).
- **Data Ingestion**: A python pipeline script will run once to compile Excel files into clean, compressed JSON/CSV files in the React public directory, avoiding the need for an active web server or database.
- **Plotting Library**: Plotly.js or Recharts for interactive, client-side vector plots that zoom and hover smoothly.

## Testing Decisions
- **Unit & Component Testing**: Vitest and React Testing Library to test component interactions (filters updating the store, search field auto-resolving).
- **API Mocks**: Mock network requests to Ensembl/FlyBase synonym API endpoints using MSW (Mock Service Worker).

## Out of Scope
- Building a database server (PostgreSQL/MongoDB) or user login system; the site remains a fully static, client-side open scientific portal.
- Direct Excel uploading by end-users in the browser; data updates will happen through a local build pipeline.
