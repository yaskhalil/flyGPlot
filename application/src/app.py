import streamlit as st
import pandas as pd
import os
import re
import numpy as np
from backend import dataset
from frontend import styles
from frontend import tabs
from backend.resolver import GeneSynonymResolver, HttpEnsemblAdapter
from backend import coexpression

st.set_page_config(layout="wide", page_title="Fly Gene Expression Explorer")

# Inject premium typography and styling
st.markdown(styles.STYLE_CSS, unsafe_allow_html=True)

st.title("Fly Gene Expression Explorer")

@st.cache_data
def load_data():
    is_test = "PYTEST_CURRENT_TEST" in os.environ
    return dataset.load_expression_data(is_test)

@st.cache_data
def load_mm_data():
    is_test = "PYTEST_CURRENT_TEST" in os.environ
    return dataset.load_mixture_modeling_data(is_test)

# Initialize synonym resolver
resolver = GeneSynonymResolver(HttpEnsemblAdapter())

@st.cache_data(ttl=86400, show_spinner=False)
def resolve_synonym_via_ensembl(symbol):
    """
    Query Ensembl REST API for gene symbol/synonym.
    Returns: (canonical_symbol, warning_msg) or (None, None)
    """
    return resolver.resolve(symbol)

def resolve_genes_bulk(bulk_input_str, all_genes_map_lower):
    """
    Splits bulk input, resolves direct matches and uses Ensembl API fallback.
    Returns: (resolved_symbols, warnings, unresolved, api_down)
    """
    return resolver.resolve_bulk(bulk_input_str, all_genes_map_lower)

@st.cache_data(ttl=3600)
def fetch_gene_metadata(gene_symbol):
    """
    Fetches gene metadata from Ensembl and FlyBase via resolver.
    """
    return resolver.get_gene_metadata(gene_symbol)

def calculate_ksg_mi(x, y, k=3):
    return coexpression.calculate_ksg_mi(x, y, k)

def compute_coexpression_groups(ref_gene, df, metric="Pearson"):
    return coexpression.compute_coexpression_groups(
        ref_gene, df, metric=metric
    )

# Load data early to set up variables
df = load_data()
mm_df = load_mm_data()

if df is not None:
    all_genes = sorted([str(g) for g in df['gene'].dropna().unique() if str(g).strip() and str(g).lower() != 'nan'])
    all_genes_map_lower = {g.lower(): g for g in all_genes}
    if "selected_genes" not in st.session_state:
        default_tfs = ['ab', 'abd-b', 'achi', 'acj6', 'Adf1', 'Aef1']
        st.session_state.selected_genes = [g for g in default_tfs if g in all_genes]
else:
    all_genes = []
    all_genes_map_lower = {}
    if "selected_genes" not in st.session_state:
        st.session_state.selected_genes = []

# Sidebar UI
with st.sidebar:
    st.header("Configuration")
    
    if df is not None:
        st.markdown("### Global Filters")
        all_stages = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult']
        selected_stages = st.multiselect("Select Stages", all_stages, default=all_stages, help="Filter which stages to display.")
        min_exp = st.number_input("Minimum Expression", min_value=0.0, value=0.0, step=0.05, help="Hide points with expression below this value.")
        exclude_low_exp = st.checkbox("Exclude zero & low expressions (< 0.10)", value=True, help="Exclude points with expression less than 0.10 to reduce clutter and improve rendering speed.")
        
        st.divider()
        st.markdown(f"**Active Selection:** `{len(st.session_state.selected_genes)}` genes")
        with st.expander("Show Active Gene List", expanded=False):
            st.write(", ".join(st.session_state.selected_genes) if st.session_state.selected_genes else "None")
    else:
        st.warning("No dataset found. Please go to the **Data Config** tab to build it.")
        selected_stages = []
        min_exp = 0.0
        exclude_low_exp = True

# App Tabs
tab1, tab2, tab3, tab4, tab5, tab6, tab7, tab8 = st.tabs([
    "Read Me", "Data Config", "Gene Selection", "Expression Analytics", 
    "Cell-Centric Trend", "Co-expression Grid", "Co-expression Dashboard", "Gene Details"
])

with tab1:
    tabs.render_readme_tab()

with tab2:
    tabs.render_data_config_tab(df, mm_df, dataset.rebuild_dataset)

with tab3:
    tabs.render_gene_selection_tab(df, all_genes, all_genes_map_lower, resolve_genes_bulk, load_mm_data)

with tab4:
    tabs.render_expression_trend_tab(df, st.session_state.selected_genes, selected_stages, min_exp, exclude_low_exp)

with tab5:
    tabs.render_cell_centric_trend_tab(df, st.session_state.selected_genes, min_exp)

with tab6:
    tabs.render_coexpression_table_tab(mm_df, st.session_state.selected_genes)

with tab7:
    tabs.render_coexpression_dashboard_tab(
        df, 
        mm_df, 
        compute_coexpression_groups, 
        fetch_gene_metadata, 
        selected_stages, 
        min_exp, 
        exclude_low_exp
    )

with tab8:
    tabs.render_gene_details_tab(df, fetch_gene_metadata)
