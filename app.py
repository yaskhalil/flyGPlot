import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import os
import re
import requests
import numpy as np
from process_excel import process_files, parse_cluster_annotations

st.set_page_config(layout="wide", page_title="Fly Gene Expression Explorer")

# Inject premium typography and styling
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap');

/* Apply font families globally */
html, body, [class*="css"], .stApp {
    font-family: 'Inter', sans-serif !important;
}

h1, h2, h3, h4, h5, h6 {
    font-family: 'Outfit', sans-serif !important;
    font-weight: 600 !important;
    color: var(--text-color) !important;
    letter-spacing: -0.025em !important;
}

/* Premium gradient title */
h1 {
    font-weight: 800 !important;
    font-size: 2.75rem !important;
    background: linear-gradient(135deg, #6366f1 0%, #06b6d4 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 1.5rem !important;
    letter-spacing: -0.035em !important;
}

h2 {
    font-size: 1.85rem !important;
    font-weight: 700 !important;
    margin-top: 2.25rem !important;
    margin-bottom: 1.25rem !important;
    border-bottom: 1px solid rgba(128, 128, 128, 0.15);
    padding-bottom: 0.5rem;
    color: var(--text-color) !important;
}

h3 {
    font-size: 1.35rem !important;
    font-weight: 600 !important;
    margin-top: 1.75rem !important;
    color: var(--text-color) !important;
}

/* Adjust paragraph readability and support dark/light theme */
p, li {
    font-size: 1rem !important;
    line-height: 1.7 !important;
    color: var(--text-color) !important;
    opacity: 0.9;
}

/* Card-like expanders adapting to background theme */
div[data-testid="stExpander"] {
    background-color: var(--secondary-background-color) !important;
    border: 1px solid rgba(128, 128, 128, 0.15) !important;
    border-radius: 12px !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15), 0 2px 4px -2px rgba(0, 0, 0, 0.15) !important;
    margin-bottom: 1.25rem !important;
}

/* Styling Streamlit Tabs for premium feeling */
button[data-baseweb="tab"] {
    font-family: 'Outfit', sans-serif !important;
    font-size: 1.05rem !important;
    font-weight: 500 !important;
    color: var(--text-color) !important;
    opacity: 0.65;
    padding: 0.75rem 1rem !important;
    border-bottom: 2px solid transparent !important;
    transition: all 0.2s ease-in-out !important;
}

button[data-baseweb="tab"][aria-selected="true"] {
    color: var(--primary-color) !important;
    opacity: 1.0;
    font-weight: 600 !important;
    border-bottom: 2px solid var(--primary-color) !important;
}

button[data-baseweb="tab"]:hover {
    color: var(--primary-color) !important;
    opacity: 0.85;
}

/* Make primary buttons look stunning */
button[kind="primary"] {
    background-color: var(--primary-color) !important;
    color: white !important;
    border-radius: 8px !important;
    border: none !important;
    font-weight: 600 !important;
    padding: 0.5rem 1.25rem !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15) !important;
    transition: all 0.2s !important;
}

button[kind="primary"]:hover {
    filter: brightness(1.1);
    transform: translateY(-1px) !important;
}

/* Clean sidebar hierarchy using Streamlit variables */
section[data-testid="stSidebar"] {
    background-color: var(--secondary-background-color) !important;
    border-right: 1px solid rgba(128, 128, 128, 0.15) !important;
}

section[data-testid="stSidebar"] h1, 
section[data-testid="stSidebar"] h2, 
section[data-testid="stSidebar"] h3 {
    color: var(--text-color) !important;
}
</style>
""", unsafe_allow_html=True)

st.title("Fly Gene Expression Explorer")

@st.cache_data
def load_data():
    # Detect if we are running in pytest
    is_test = "PYTEST_CURRENT_TEST" in os.environ
    filename = 'combined_expression.csv' if is_test else 'combined_expression_all.csv.gz'
    
    # Fallback if preferred file doesn't exist
    if not os.path.exists(filename):
        fallback = 'combined_expression_all.csv.gz' if is_test else 'combined_expression.csv'
        if os.path.exists(fallback):
            filename = fallback
        else:
            return None
            
    # Load dataset with str dtype for gene to avoid mixed types
    df = pd.read_csv(filename, dtype={'gene': str}, low_memory=False)
    df = df.drop_duplicates(subset=['gene', 'stage'])
    
    
    # Force expression columns to be numeric
    for col in df.columns:
        if col not in ['gene', 'stage']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
            
    # Load and map cluster annotations
    anno_map = parse_cluster_annotations('Cluster annotation.xlsx')
    
    # Rename target columns to formatted Cell Name (#ID)
    new_cols = {}
    for col in df.columns:
        if col.startswith('Target '):
            try:
                cluster_id = int(col.replace('Target ', ''))
                anno = anno_map.get(cluster_id, 'Unknown')
                new_cols[col] = f"{anno} (#{(cluster_id)})"
            except ValueError:
                pass
    return df.rename(columns=new_cols)

@st.cache_data
def load_mm_data():
    is_test = "PYTEST_CURRENT_TEST" in os.environ
    filename = 'combined_expression.csv' if is_test else 'combined_mixture_modelling.csv.gz'
    
    if not os.path.exists(filename):
        fallback = 'combined_mixture_modelling.csv.gz' if is_test else 'combined_expression.csv'
        if os.path.exists(fallback):
            filename = fallback
        else:
            return None
            
    df = pd.read_csv(filename, dtype={'gene': str}, low_memory=False)
    df = df.drop_duplicates(subset=['gene', 'stage'])
    
    # Force columns to be numeric
    for col in df.columns:
        if col not in ['gene', 'stage']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
            
    # Load and map cluster annotations
    anno_map = parse_cluster_annotations('Cluster annotation.xlsx')
    
    # Rename target columns
    new_cols = {}
    for col in df.columns:
        if col.startswith('Target '):
            try:
                cluster_id = int(col.replace('Target ', ''))
                anno = anno_map.get(cluster_id, 'Unknown')
                new_cols[col] = f"{anno} (#{(cluster_id)})"
            except ValueError:
                pass
    return df.rename(columns=new_cols)

@st.cache_data(ttl=86400, show_spinner=False)
def resolve_synonym_via_ensembl(symbol):
    """
    Query Ensembl REST API for gene symbol/synonym.
    Returns: (canonical_symbol, warning_msg) or (None, None)
    """
    symbol_clean = str(symbol).strip()
    if not symbol_clean:
        return None, None
        
    # Hop 1: xrefs search to map symbol/synonym to stable gene ID(s)
    xrefs_url = f"https://rest.ensembl.org/xrefs/symbol/drosophila_melanogaster/{symbol_clean}?content-type=application/json"
    r = requests.get(xrefs_url, timeout=3)
    if r.status_code != 200:
        return None, None
    data = r.json()
    if not data:
        return None, None
        
    gene_ids = [x['id'] for x in data if x.get('type') == 'gene']
    if not gene_ids:
        return None, None
        
    # Hop 2: Look up display name for each stable gene ID
    display_names = []
    for gid in gene_ids:
        lookup_url = f"https://rest.ensembl.org/lookup/id/{gid}?content-type=application/json"
        try:
            rl = requests.get(lookup_url, timeout=3)
            if rl.status_code == 200:
                dname = rl.json().get('display_name')
                if dname and dname not in display_names:
                    display_names.append(dname)
        except Exception:
            pass
            
    if not display_names:
        return None, None
        
    canonical = display_names[0]
    warning = None
    if len(display_names) > 1:
        warning = f"Synonym '{symbol_clean}' maps to multiple genes: {', '.join(display_names)}. Using '{canonical}'."
    return canonical, warning

def resolve_genes_bulk(bulk_input_str, all_genes_map_lower):
    """
    Splits bulk input, resolves direct matches and uses Ensembl API fallback.
    Returns: (resolved_symbols, warnings, unresolved, api_down)
    """
    # Split by spaces, commas, or newlines
    raw_symbols = [s.strip() for s in re.split(r'[\s,]+', bulk_input_str) if s.strip()]
    
    resolved = []
    warnings = []
    unresolved = []
    api_down = False
    
    for sym in raw_symbols:
        sym_lower = sym.lower()
        if sym_lower in all_genes_map_lower:
            resolved.append(all_genes_map_lower[sym_lower])
        else:
            try:
                canonical, warning = resolve_synonym_via_ensembl(sym)
                if canonical:
                    canonical_lower = canonical.lower()
                    if canonical_lower in all_genes_map_lower:
                        resolved.append(all_genes_map_lower[canonical_lower])
                        if warning:
                            warnings.append(warning)
                    else:
                        unresolved.append(f"{sym} (resolved to '{canonical}', but not present in dataset)")
                else:
                    unresolved.append(sym)
            except requests.RequestException:
                api_down = True
                unresolved.append(sym)
                
    # Deduplicate while preserving order
    seen = set()
    dedup_resolved = [x for x in resolved if not (x in seen or seen.add(x))]
    return dedup_resolved, warnings, unresolved, api_down

# KSG Mutual Information Implementation
def calculate_ksg_mi(x, y, k=3):
    from scipy.special import digamma
    from scipy.spatial import cKDTree
    
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    N = len(x)
    if N <= k:
        return 0.0
        
    x_std = np.std(x)
    y_std = np.std(y)
    if x_std < 1e-9 or y_std < 1e-9:
        return 0.0
        
    x = (x - np.mean(x)) / x_std
    y = (y - np.mean(y)) / y_std
    
    joint = np.column_stack((x, y))
    
    tree_joint = cKDTree(joint)
    tree_x = cKDTree(x[:, None])
    tree_y = cKDTree(y[:, None])
    
    dists, _ = tree_joint.query(joint, k=k+1, p=float('inf'))
    eps = dists[:, -1]
    
    nx = np.zeros(N)
    ny = np.zeros(N)
    for i in range(N):
        nx[i] = len(tree_x.query_ball_point(x[i:i+1], eps[i] - 1e-15)) - 1
        ny[i] = len(tree_y.query_ball_point(y[i:i+1], eps[i] - 1e-15)) - 1
        
    mi = digamma(k) - np.mean(digamma(nx + 1) + digamma(ny + 1)) + digamma(N)
    return max(0.0, mi)

def compute_coexpression_groups(ref_gene, df, metric="Pearson", ksg_space=100, progress_bar=None):
    """
    Computes co-expression scores against ref_gene.
    Pearson acts as a fast initial filter to identify candidate genes,
    on which the KSG MI is then computed if selected.
    """
    ref_df = df[df['gene'] == ref_gene]
    if ref_df.empty:
        return []
        
    target_columns = [col for col in df.columns if ' (#' in col]
    if not target_columns:
        target_columns = [col for col in df.columns if col.startswith('Target ') or col.startswith('Gene ')]
        
    ref_melted = ref_df.melt(id_vars=['gene', 'stage'], value_vars=target_columns, var_name='variable', value_name='expression').dropna()
    ref_melted = ref_melted.sort_values(['stage', 'variable'])
    ref_vector = ref_melted['expression'].values
    ref_keys = ref_melted['stage'].astype(str) + "_" + ref_melted['variable'].astype(str)
    ref_dict = dict(zip(ref_keys, ref_vector))
    
    other_genes_df = df[df['gene'] != ref_gene]
    all_other_melted = other_genes_df.melt(id_vars=['gene', 'stage'], value_vars=target_columns, var_name='variable', value_name='expression').dropna()
    all_other_melted['key'] = all_other_melted['stage'].astype(str) + "_" + all_other_melted['variable'].astype(str)
    all_other_melted = all_other_melted[all_other_melted['key'].isin(ref_dict)]
    
    pivoted = all_other_melted.pivot(index='gene', columns='key', values='expression')
    ref_keys_list = [k for k in ref_keys if k in pivoted.columns]
    if len(ref_keys_list) < 5:
        return []
        
    ref_sub_vector = np.array([ref_dict[k] for k in ref_keys_list])
    pivoted = pivoted[ref_keys_list].dropna()
    
    gene_names = pivoted.index.values
    data_matrix = pivoted.values
    
    means = np.mean(data_matrix, axis=1, keepdims=True)
    stds = np.std(data_matrix, axis=1, keepdims=True)
    stds[stds < 1e-9] = 1.0
    centered = (data_matrix - means) / stds
    
    ref_mean = np.mean(ref_sub_vector)
    ref_std = np.std(ref_sub_vector)
    if ref_std < 1e-9:
        ref_std = 1.0
    ref_centered = (ref_sub_vector - ref_mean) / ref_std
    
    pearsons = (centered @ ref_centered) / (len(ref_sub_vector))
    
    results = []
    for g, r_val in zip(gene_names, pearsons):
        results.append({
            'gene': g,
            'pearson': float(r_val),
            'abs_pearson': abs(float(r_val))
        })
    results.sort(key=lambda x: x['abs_pearson'], reverse=True)
    
    if metric == "KSG Mutual Information":
        if ksg_space == "All":
            top_candidates = results
        else:
            top_candidates = results[:int(ksg_space)]
            
        ksg_results = []
        total_candidates = len(top_candidates)
        
        for idx, item in enumerate(top_candidates):
            g = item['gene']
            y_vector = pivoted.loc[g].values
            mi_score = calculate_ksg_mi(ref_sub_vector, y_vector)
            ksg_results.append({
                'gene': g,
                'pearson': item['pearson'],
                'abs_pearson': item['abs_pearson'],
                'ksg_mi': mi_score
            })
            if progress_bar is not None and idx % max(1, total_candidates // 20) == 0:
                progress_bar.progress(min(1.0, (idx + 1) / total_candidates), text=f"Calculating KSG MI for {g} ({idx}/{total_candidates})...")
                
        ksg_results.sort(key=lambda x: x['ksg_mi'], reverse=True)
        return ksg_results
    else:
        return results

# Sidebar UI
with st.sidebar:
    st.header("Configuration")
    
    st.markdown("### Data Management")
    with st.expander("Update Dataset", expanded=False):
        default_rebuild_index = 1 if "PYTEST_CURRENT_TEST" in os.environ else 0
        rebuild_type = st.radio(
            "Rebuild Type",
            ["Genome-Wide (11,299 genes)", "Transcription Factors Only (483 genes)"],
            index=default_rebuild_index
        )
        
        if rebuild_type == "Genome-Wide (11,299 genes)":
            root_file = st.text_input("Root Excel File", 'log_normalized_average_expression_all_stages 1.xlsx')
            if st.button("Rebuild Genome-Wide"):
                with st.spinner("Processing root Excel..."):
                    try:
                        from process_excel import process_root_file, process_mm_file
                        process_root_file(root_file, 'combined_expression_all.csv.gz')
                        if os.path.exists('Mixture_modelling_all_stages 1.xlsx'):
                            process_mm_file('Mixture_modelling_all_stages 1.xlsx', 'combined_mixture_modelling.csv.gz')
                        st.cache_data.clear()
                        st.success("Dataset rebuilt successfully!")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error processing root file: {e}")
        else:
            file1 = st.text_input("Excel Part 1", 'data/flybase TF expression list_A-E.xlsx')
            file2 = st.text_input("Excel Part 2", 'data/flybase_TF_expression_list_F-Z.xlsx')
            if st.button("Rebuild TF Dataset"):
                with st.spinner("Parsing Excel files..."):
                    try:
                        process_files(file1, file2, 'combined_expression.csv')
                        st.cache_data.clear()
                        st.success("Dataset rebuilt successfully!")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error processing files: {e}")
                        
    st.divider()

    df = load_data()
    
    if df is not None:
        st.markdown("### Visualization")
        
        # Clean and sort gene list
        all_genes = sorted([str(g) for g in df['gene'].dropna().unique() if str(g).strip() and str(g).lower() != 'nan'])
        all_genes_map_lower = {g.lower(): g for g in all_genes}
        
        # Setup selection mode
        selection_mode = st.radio(
            "Gene Selection Mode",
            ["Select Genes Manually", "Paste Bulk Gene Set", "Predefined Gene Groups", "Generate Group from Cell Type"],
            help="Choose how you want to input genes."
        )
        
        # Default starting selection
        default_tfs = ['ab', 'abd-b', 'achi', 'acj6', 'Adf1', 'Aef1']
        if "selected_genes" not in st.session_state:
            st.session_state.selected_genes = [g for g in default_tfs if g in all_genes]
            
        if selection_mode == "Select Genes Manually":
            selected_genes_in_options = [g for g in st.session_state.selected_genes if g in all_genes]
            selected_genes = st.multiselect(
                "Which genes to consider?",
                all_genes,
                default=selected_genes_in_options,
                help="Select one or more genes."
            )
            st.session_state.selected_genes = selected_genes
        elif selection_mode == "Paste Bulk Gene Set":
            default_bulk = ", ".join(st.session_state.selected_genes)
            bulk_input = st.text_area(
                "Paste gene list:",
                value=default_bulk,
                help="Enter gene symbols or synonyms separated by spaces, commas, or newlines.",
                height=150
            )
            resolved, warnings, unresolved, api_down = resolve_genes_bulk(bulk_input, all_genes_map_lower)
            st.session_state.selected_genes = resolved
            
            if api_down:
                st.warning("The Ensembl Gene Synonym API is currently down or timed out. Synonym resolution is temporarily unavailable.")
                
            if resolved:
                st.caption(f"Resolved {len(resolved)} valid gene(s) in dataset.")
            else:
                st.caption("No valid genes resolved.")
                
            if warnings:
                with st.expander("API Ambiguities", expanded=False):
                    for w in warnings:
                        st.write(f"- {w}")
            if unresolved:
                st.error(f"Unresolved symbols: {', '.join(unresolved)}")
                
            selected_genes = resolved
        elif selection_mode == "Predefined Gene Groups":
            group_choice = st.selectbox(
                "Select Predefined Group:",
                ["Select Group...", "Cell Adhesion Molecules (CAMs - Nikos)", "Cell Surface Secreted Proteins (Kai Zinn)"],
                help="Select a curated group of genes to load."
            )
            
            if group_choice == "Cell Adhesion Molecules (CAMs - Nikos)":
                if not os.path.exists('CAMs_FPKMs_Nikos.xlsx'):
                    st.warning("CAMs_FPKMs_Nikos.xlsx not found in workspace.")
                else:
                    try:
                        df_cams = pd.read_excel('CAMs_FPKMs_Nikos.xlsx')
                        cams = [str(x).strip() for x in df_cams['gene_short_name'].dropna().unique()]
                        resolved = [all_genes_map_lower[c.lower()] for c in cams if c.lower() in all_genes_map_lower]
                        st.session_state.selected_genes = resolved
                        st.success(f"Loaded {len(resolved)} genes from Cell Adhesion Molecules.")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error loading CAMs: {e}")
            elif group_choice == "Cell Surface Secreted Proteins (Kai Zinn)":
                if not os.path.exists('Cell surface secreted proteins_list Kai Zinn.xls'):
                    st.warning("Cell surface secreted proteins_list Kai Zinn.xls not found in workspace.")
                else:
                    try:
                        df_zinn = pd.read_excel('Cell surface secreted proteins_list Kai Zinn.xls', skiprows=2)
                        df_zinn.columns = ['CT_num', 'CG_num', 'gene_name', 'comments'] + list(df_zinn.columns[4:])
                        zinn_cgs = [str(x).strip() for x in df_zinn['CG_num'].dropna().unique() if str(x).strip().startswith('CG')]
                        zinn_names = [str(x).strip() for x in df_zinn['gene_name'].dropna().unique() if len(str(x).strip()) > 1]
                        
                        resolved = []
                        for cg in zinn_cgs:
                            if cg.lower() in all_genes_map_lower:
                                resolved.append(all_genes_map_lower[cg.lower()])
                        for name in zinn_names:
                            if name.lower() in all_genes_map_lower:
                                resolved.append(all_genes_map_lower[name.lower()])
                                
                        seen = set()
                        dedup_resolved = [x for x in resolved if not (x in seen or seen.add(x))]
                        st.session_state.selected_genes = dedup_resolved
                        st.success(f"Loaded {len(dedup_resolved)} genes from Cell Surface Secreted Proteins.")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error loading Kai Zinn list: {e}")
            selected_genes = st.session_state.selected_genes
        elif selection_mode == "Generate Group from Cell Type":
            target_columns = [col for col in df.columns if ' (#' in col]
            def get_cluster_num(col_name):
                match = re.search(r'#(\d+)', col_name)
                return int(match.group(1)) if match else 9999
            target_columns_sorted = sorted(target_columns, key=get_cluster_num)
            
            if not target_columns_sorted:
                st.warning("No cell types available in dataset.")
            else:
                cell_for_group = st.selectbox("Select Target Cell:", target_columns_sorted, key="cfg_cell")
                all_stages = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult']
                stage_for_group = st.selectbox("Select Stage:", all_stages, key="cfg_stage")
                group_method = st.radio("Criterion:", ["Expression Threshold", "Mixture Modeling (Active/On)"], key="cfg_method")
                
                if group_method == "Expression Threshold":
                    exp_threshold = st.number_input("Expression threshold >=:", min_value=0.0, value=2.0, step=0.1, key="cfg_exp")
                else:
                    mm_prob_threshold = st.slider("Mixture Modeling probability >=:", min_value=0.0, max_value=1.0, value=0.5, step=0.05, key="cfg_mm")
                
                if st.button("Generate and Apply"):
                    if group_method == "Expression Threshold":
                        filtered_df = df[(df['stage'] == stage_for_group) & (df[cell_for_group] >= exp_threshold)]
                        resolved_genes = filtered_df['gene'].dropna().unique().tolist()
                    else:
                        mm_df = load_mm_data()
                        if mm_df is not None:
                            filtered_mm = mm_df[(mm_df['stage'] == stage_for_group) & (mm_df[cell_for_group] >= mm_prob_threshold)]
                            resolved_genes = filtered_mm['gene'].dropna().unique().tolist()
                        else:
                            st.error("Mixture modeling data not available.")
                            resolved_genes = []
                            
                    valid_genes = [g for g in resolved_genes if g in all_genes]
                    if valid_genes:
                        st.session_state.selected_genes = valid_genes
                        st.success(f"Successfully loaded {len(valid_genes)} genes that match the criteria!")
                        st.rerun()
                    else:
                        st.warning("No genes match the criteria.")
            selected_genes = st.session_state.selected_genes
            
        st.markdown("### Filters")
        all_stages = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult']
        selected_stages = st.multiselect("Select Stages", all_stages, default=all_stages, help="Filter which stages to display.")
        min_exp = st.number_input("Minimum Expression", min_value=0.0, value=0.0, step=0.05, help="Hide points with expression below this value.")
    else:
        st.warning("No dataset found. Please use Data Management to build it.")
        selected_genes = []
        selected_stages = []
        min_exp = 0.0

@st.cache_data(ttl=3600)
def fetch_gene_metadata(gene_symbol):
    meta = {}
    ens_url = f"https://rest.ensembl.org/lookup/symbol/drosophila_melanogaster/{gene_symbol}"
    try:
        r1 = requests.get(ens_url, headers={"Content-Type": "application/json"}, timeout=5)
        if r1.status_code == 200:
            d1 = r1.json()
            meta['flybase'] = d1.get('id', 'N/A')
            desc = d1.get('description', '')
            meta['name'] = desc.split(' [')[0] if desc else 'Unknown'
            meta['symbol'] = d1.get('display_name', gene_symbol)
    except Exception:
        pass
        
    if meta.get('flybase') and meta['flybase'] != 'N/A':
        fb_url = f"https://api.flybase.org/api/v1.0/gene/summaries/auto/{meta['flybase']}"
        try:
            r2 = requests.get(fb_url, timeout=5)
            if r2.status_code == 200:
                d2 = r2.json()
                resultset = d2.get('resultset', {})
                results = resultset.get('result', [])
                if results and len(results) > 0:
                    meta['summary'] = results[0].get('summary', '')
        except Exception:
            pass
            
    if not meta:
        return None
    return {
        'name': meta.get('name', 'Unknown'),
        'symbol': meta.get('symbol', gene_symbol),
        'flybase': meta.get('flybase', 'N/A'),
        'summary': meta.get('summary', 'No detailed biological summary available.')
    }

# App Tabs
tab1, tab2, tab3, tab4, tab5, tab6 = st.tabs([
    "Read Me", "Expression Trend", "Cell-Centric Trend", 
    "Co-expression Table", "Gene Group Finder", "Gene Details"
])

with tab1:
    st.markdown(r"""
    ## Fly Gene Expression Explorer

    Welcome to the Fly Gene Expression Explorer! This interactive portal allows you to analyze Drosophila gene expression patterns across developmental stages (`P15`, `P30`, `P40`, `P50`, `P70`, and `Adult`) and specific target cell types.

    ### Guide to the Tabs
    1. **Read Me**: This user guide and math explanation page.
    2. **Expression Trend**: View expression profiles over time. It has a **Pivot View** toggle to swap axis focus:
       - *Normal View*: Plots expression by **Gene** (each point is a different Cell Type).
       - *Pivot View*: Plots expression by **Cell Type** (each point is a different Gene).
    3. **Cell-Centric Trend**: Plot developmental trajectory line charts for a single target cell annotation, with highlight controls to focus on specific genes.
    4. **Co-expression Table**: Displays the binary `"On"` / `"Off"` activity states of your selected genes across target cells for a given developmental stage, using Mixture Modeling probabilities.
    5. **Gene Group Finder**: Find genes functionally related to a reference gene of your choice based on expression similarity. It computes similarity across all stages and cell types.
    6. **Gene Details**: Fetches live summary statistics and external links directly from FlyBase and Ensembl.

    ---

    ### Co-expression Mathematics: Pearson vs. KSG KNN Mutual Information

    To find groups of coregulated genes, the **Gene Group Finder** supports two distinct metrics: **Pearson Correlation** and **KSG Mutual Information**.

    #### 1. Pearson Correlation Coefficient ($r$)
    Pearson Correlation measures the **linear relationship** between the expression profiles of two genes, $X$ and $Y$:

    $$r = \frac{\sum_{i=1}^N (x_i - \bar{x})(y_i - \bar{y})}{\sqrt{\sum_{i=1}^N (x_i - \bar{x})^2 \sum_{i=1}^N (y_i - \bar{y})^2}}$$

    - **Value Range:** $[-1.0, 1.0]$, where $1.0$ is perfect positive linear correlation, $-1.0$ is perfect negative linear correlation, and $0.0$ indicates no linear correlation.
    - **Best Used For:** Rapidly scanning for genes that rise and fall in exact proportion to one another.
    - **Limitation:** Pearson correlation **cannot detect non-linear dependencies**. If two genes are related by a curved or thresholded relationship, the Pearson coefficient will be close to $0.0$.

    #### 2. KSG KNN Mutual Information (MI)
    Mutual Information $I(X; Y)$ quantifies the information shared between two genes, defined as:

    $$I(X; Y) = \iint p(x,y) \log \frac{p(x,y)}{p(x)p(y)} dx dy$$

    Because estimating probabilities $p(x, y)$ on limited data points is difficult, we use the **Kraskov-Stögbauer-Grassberger (KSG)** estimator based on $k$-nearest neighbors (using $k=3$):

    $$I^{(1)}(X;Y) = \psi(k) - \frac{1}{N}\sum_{i=1}^N \left[ \psi(n_x(i) + 1) + \psi(n_y(i) + 1) \right] + \psi(N)$$

    where:
    - $\psi$ is the digamma function.
    - $N$ is the sample size (number of stage-cell combinations).
    - $n_x(i)$ and $n_y(i)$ are the counts of points inside marginal distances determined by the joint space neighbor distances.

    - **Value Range:** $[0.0, \infty)$. A higher value indicates higher shared information.
    - **Best Used For:** Identifying complex, non-linear regulatory associations.

    #### Why KSG KNN Mutual Information is More Useful in Biology
    In biological networks, gene regulation is rarely linear. Genes are controlled by:
    - **Activation Thresholds:** A transcription factor might only trigger a gene after its concentration crosses a specific threshold.
    - **Saturation Dynamics:** A promoter can become fully saturated, keeping a gene's expression flat after a certain level.
    - **Feedback Loops / Toggles:** Cooperative binding and feedback interactions (e.g., Hill dynamics) create non-linear shapes.

    **Pearson Correlation will completely miss these non-linear connections**, whereas **KSG KNN Mutual Information detects them easily**.
    """)

with tab2:
    if df is None:
        st.info("Please build the dataset in the sidebar first.")
    elif not selected_genes:
        st.info("Please select or paste at least one gene to begin.")
    else:
        val_vars = [c for c in df.columns if ' (#' in c]
        if not val_vars:
            val_vars = [c for c in df.columns if c.startswith('Target ') or c.startswith('Gene ')]
            
        df_melted = df[df['gene'].isin(selected_genes)].melt(
            id_vars=['gene', 'stage'], 
            value_vars=val_vars, 
            var_name='Target',
            value_name='expression'
        ).dropna(subset=['expression'])
        
        # Extract cluster ID for sorting/filtering
        def extract_id(val):
            match = re.search(r'#(\d+)', str(val))
            return match.group(1) if match else str(val)
        df_melted['Target_ID'] = df_melted['Target'].apply(extract_id)
        
        # Apply filters
        df_melted = df_melted[df_melted['stage'].isin(selected_stages)]
        df_melted = df_melted[df_melted['expression'] >= min_exp]
        
        stage_order = [s for s in ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult'] if s in selected_stages]
        
        if df_melted.empty:
            st.warning("No data matches the current filters.")
        else:
            y_min, y_max = df_melted['expression'].min(), df_melted['expression'].max()
            padding = (y_max - y_min) * 0.05 if y_max > y_min else 0.1
            global_y_range = [y_min - padding, y_max + padding]
            
            # Toggle Pivot View
            pivot_view = st.checkbox("Pivot View: Group by Cell Type", value=False,
                                     help="Toggle this to group expression plots by Cell Type instead of by Gene.")
            
            if pivot_view:
                selected_cells_plot = st.multiselect(
                    "Select Cell Types to Plot:",
                    val_vars,
                    default=[v for v in val_vars if 'Dm4' in v or 'PCG' in v][:2] or val_vars[:1],
                    help="Choose which cell types to draw charts for."
                )
                
                if not selected_cells_plot:
                    st.info("Please select at least one Cell Type to plot.")
                else:
                    df_melted_filtered = df_melted[df_melted['Target'].isin(selected_cells_plot)]
                    y_min, y_max = df_melted_filtered['expression'].min(), df_melted_filtered['expression'].max()
                    padding = (y_max - y_min) * 0.05 if y_max > y_min else 0.1
                    global_y_range = [y_min - padding, y_max + padding]
                    
                    for cell in selected_cells_plot:
                        cell_df = df_melted_filtered[df_melted_filtered['Target'] == cell]
                        if cell_df.empty:
                            continue
                            
                        fig = px.strip(
                            cell_df,
                            x='stage',
                            y='expression',
                            title=f"Expression Profile in {cell}",
                            category_orders={'stage': stage_order},
                            hover_data={
                                'expression': ':.4f',
                                'stage': True,
                                'gene': True,
                                'Target': False
                            },
                            labels={'gene': 'Gene'},
                            height=350,
                            template="plotly_white"
                        )
                        fig.update_traces(jitter=1.0, marker=dict(size=6, color='#0277bd'))
                        fig.update_layout(
                            showlegend=False,
                            yaxis=dict(range=global_y_range, title="Expression"),
                            xaxis=dict(title="Stage"),
                            hoverlabel=dict(font_size=14)
                        )
                        st.plotly_chart(fig, use_container_width=True)
            else:
                for gene in selected_genes:
                    gene_df = df_melted[df_melted['gene'] == gene]
                    if gene_df.empty:
                        st.warning(f"No data for {gene} after filtering.")
                        continue
                        
                    fig = px.strip(
                        gene_df,
                        x='stage',
                        y='expression',
                        title=f"Expression Trend for {gene}",
                        category_orders={'stage': stage_order},
                        hover_data={
                            'expression': ':.4f', 
                            'stage': True, 
                            'Target': True,
                            'Target_ID': False
                        },
                        labels={'Target': 'Cell'},
                        height=350,
                        template="plotly_white"
                    )
                    
                    fig.update_traces(jitter=1.0, marker=dict(size=6, color='#57068c'))
                    fig.update_layout(
                        showlegend=False, 
                        yaxis=dict(range=global_y_range, title="Expression"),
                        xaxis=dict(title="Stage"),
                        hoverlabel=dict(font_size=14)
                    )
                    st.plotly_chart(fig, use_container_width=True)

with tab3:
    st.markdown("## Cell-Centric Expression Trend")
    if df is None:
        st.info("Please build the dataset in the sidebar first.")
    elif not selected_genes:
        st.info("Please select or paste at least one gene to begin.")
    else:
        target_columns = [col for col in df.columns if ' (#' in col]
        def get_cluster_num(col_name):
            match = re.search(r'#(\d+)', col_name)
            return int(match.group(1)) if match else 9999
            
        target_columns_sorted = sorted(target_columns, key=get_cluster_num)
        
        selected_cell = st.selectbox(
            "Select Target Cell Annotation:",
            target_columns_sorted,
            help="Choose a target cell cluster to see expression trends across developmental stages."
        )
        
        highlighted_genes = st.multiselect(
            "Genes to highlight (colored):",
            selected_genes,
            default=[],
            help="Select which genes to highlight. Other selected genes will be shown as thin gray lines in the background."
        )
        
        cell_df = df[df['gene'].isin(selected_genes)][['gene', 'stage', selected_cell]].dropna()
        
        if cell_df.empty:
            st.warning(f"No expression data available for the selected genes in cell {selected_cell}.")
        else:
            stage_order = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult']
            cell_df['stage'] = pd.Categorical(cell_df['stage'], categories=stage_order, ordered=True)
            cell_df = cell_df.sort_values(['gene', 'stage'])
            cell_df['stage'] = cell_df['stage'].astype(str)
            
            fig = go.Figure()
            
            use_highlights = len(highlighted_genes) > 0
            genes_to_plot = list(selected_genes)
            if use_highlights:
                genes_to_plot = [g for g in genes_to_plot if g not in highlighted_genes] + highlighted_genes
                
            palette = px.colors.qualitative.Plotly
            color_idx = 0
            
            for gene in genes_to_plot:
                gene_data = cell_df[cell_df['gene'] == gene]
                if gene_data.empty:
                    continue
                    
                is_colored = not use_highlights or gene in highlighted_genes
                
                if is_colored:
                    color = palette[color_idx % len(palette)]
                    color_idx += 1
                    opacity = 1.0
                    line_width = 3.5
                    marker_size = 8
                    show_legend = True
                else:
                    color = '#A0A0A0'
                    opacity = 0.15
                    line_width = 1.5
                    marker_size = 3
                    show_legend = False
                    
                fig.add_trace(go.Scatter(
                    x=gene_data['stage'],
                    y=gene_data[selected_cell],
                    name=gene,
                    mode='lines+markers',
                    line=dict(color=color, width=line_width),
                    marker=dict(size=marker_size, opacity=opacity),
                    opacity=opacity,
                    showlegend=show_legend,
                    hoverinfo='text',
                    text=[
                        f"Gene: {gene}<br>Stage: {row['stage']}<br>Expression: {row[selected_cell]:.4f}<br>Cell: {selected_cell}"
                        for _, row in gene_data.iterrows()
                    ]
                ))
                
            fig.update_layout(
                title=f"Developmental Expression Trend in {selected_cell}",
                xaxis_title="Developmental Stage",
                yaxis_title="Expression Level",
                template="plotly_white",
                height=500,
                hovermode="closest",
                legend=dict(title="Genes"),
                xaxis=dict(categoryorder='array', categoryarray=stage_order)
            )
            st.plotly_chart(fig, use_container_width=True)

with tab4:
    st.markdown("## Co-expression Table (Mixture Modeling)")
    st.write("This tab shows the On/Off state of your selected genes across target cell types at a selected developmental stage.")
    
    mm_df = load_mm_data()
    if mm_df is None:
        st.info("No mixture modeling dataset found. Please rebuild the dataset in the sidebar first.")
    elif not selected_genes:
        st.info("Please select or paste at least one gene to begin.")
    else:
        mm_stages = sorted(mm_df['stage'].unique())
        
        col1, col2 = st.columns(2)
        with col1:
            selected_mm_stage = st.selectbox("Select Developmental Stage for Grid:", mm_stages)
        with col2:
            mm_threshold = st.slider("Probability Threshold for 'On':", 0.0, 1.0, 0.5, step=0.05,
                                     help="If the mixture modeling probability is greater than or equal to this threshold, the gene is considered active ('On') in that cell.")
                                     
        stage_mm = mm_df[(mm_df['gene'].isin(selected_genes)) & (mm_df['stage'] == selected_mm_stage)]
        
        if stage_mm.empty:
            st.warning(f"No mixture modeling data available for the selected genes at stage {selected_mm_stage}.")
        else:
            cell_columns = [col for col in mm_df.columns if ' (#' in col]
            def get_cluster_num(col_name):
                match = re.search(r'#(\d+)', col_name)
                return int(match.group(1)) if match else 9999
            cell_columns_sorted = sorted(cell_columns, key=get_cluster_num)
            
            grid_data = stage_mm.set_index('gene')[cell_columns_sorted]
            binary_grid = grid_data.apply(lambda x: x.map(lambda val: "On" if not pd.isna(val) and val >= mm_threshold else "Off"))
            
            cell_search = st.text_input("Filter cells by name (e.g. Dm, PCG):", "")
            if cell_search:
                filtered_columns = [c for c in cell_columns_sorted if cell_search.lower() in c.lower()]
                if not filtered_columns:
                    st.warning(f"No cell names match '{cell_search}'")
                    binary_grid_disp = pd.DataFrame()
                else:
                    binary_grid_disp = binary_grid[filtered_columns]
            else:
                show_all = st.checkbox("Show all available cell types (may cause horizontal scrolling)", value=False)
                if show_all:
                    binary_grid_disp = binary_grid
                else:
                    binary_grid_disp = binary_grid.iloc[:, :40]
                    st.caption(f"Displaying first 40 cells. Check the box above to see all {len(cell_columns_sorted)} cells.")
            
            if not binary_grid_disp.empty:
                def style_cells(val):
                    if val == "On":
                        return 'background-color: #d4edda; color: #155724; font-weight: bold; text-align: center;'
                    else:
                        return 'background-color: #f8d7da; color: #721c24; text-align: center; opacity: 0.7;'
                        
                styled_df = binary_grid_disp.style.apply(lambda x: x.map(style_cells))
                st.dataframe(styled_df, use_container_width=True, height=min(400, 100 + len(selected_genes)*35))

with tab5:
    st.markdown("## Co-expression Gene Group Finder")
    st.write("Find groups of genes that share similar expression patterns with a target gene across stages and cells.")
    
    if df is None:
        st.info("Please build the dataset in the sidebar first.")
    else:
        all_genes_list = sorted([str(g) for g in df['gene'].dropna().unique() if str(g).strip() and str(g).lower() != 'nan'])
        
        col1, col2 = st.columns(2)
        with col1:
            ref_gene = st.selectbox(
                "Select Reference Gene:",
                all_genes_list,
                index=all_genes_list.index("achi") if "achi" in all_genes_list else 0,
                help="Select the gene you want to find co-expression partners for."
            )
            
            # Show metric selector
            coexp_metric = st.selectbox(
                "Co-expression Metric:",
                ["Pearson Correlation", "KSG Mutual Information"],
                help="Pearson measures linear correlation. KSG Mutual Information estimates non-linear dependencies using K-Nearest Neighbors."
            )
        with col2:
            if coexp_metric == "Pearson Correlation":
                min_score = st.slider("Minimum Absolute Pearson Correlation (|r|):", 0.0, 1.0, 0.5, step=0.05,
                                      help="Filter results to show only genes with an absolute Pearson correlation coefficient greater than or equal to this threshold.")
            else:
                ksg_space = st.selectbox(
                    "KSG Search Space:",
                    ["100 (Fast)", "500 (Recommended)", "1000", "All (Thorough, ~30-45s)"],
                    index=1,
                    help="Limit the candidate genes for the computationally-heavy KSG calculation. All checks every single gene in the genome."
                )
                min_score = st.slider("Minimum KSG Mutual Information (MI):", 0.0, 2.0, 0.1, step=0.05,
                                      help="Filter results to show only genes with a KSG Mutual Information score greater than or equal to this threshold.")
            
        if st.button("Search Co-expressed Genes"):
            # Set up session states to store the results
            st.session_state.current_ref_gene = ref_gene
            st.session_state.current_metric = coexp_metric
            
            with st.spinner("Preparing calculations..."):
                progress_holder = st.empty()
                progress_bar = progress_holder.progress(0.0, text="Initializing...")
                
                metric_name = "KSG Mutual Information" if coexp_metric == "KSG Mutual Information" else "Pearson"
                ksg_val = ksg_space.split(" ")[0] if coexp_metric == "KSG Mutual Information" else 100
                
                coexp_results = compute_coexpression_groups(ref_gene, df, metric=metric_name, ksg_space=ksg_val, progress_bar=progress_bar)
                progress_holder.empty()
                
                if not coexp_results:
                    st.error("Could not compute co-expression profile. Ensure the reference gene has valid expression data.")
                    if "current_coexp_results" in st.session_state:
                        del st.session_state.current_coexp_results
                else:
                    st.session_state.current_coexp_results = coexp_results
                    
        # If we have stored results, display them dynamically and allow interactive plotting
        if ("current_coexp_results" in st.session_state and 
            st.session_state.get("current_ref_gene") == ref_gene and 
            st.session_state.get("current_metric") == coexp_metric):
            
            res_df = pd.DataFrame(st.session_state.current_coexp_results)
            
            # Filter based on current slider threshold (so user can adjust threshold in real time without recalculating!)
            if coexp_metric == "KSG Mutual Information":
                res_df_filtered = res_df[res_df['ksg_mi'] >= min_score]
            else:
                res_df_filtered = res_df[res_df['abs_pearson'] >= min_score]
                
            if res_df_filtered.empty:
                st.warning(f"No genes match the current threshold of {min_score}.")
            else:
                st.success(f"Successfully loaded co-expression results for {ref_gene} (showing {len(res_df_filtered)} matching genes)!")
                
                # Format for display
                if coexp_metric == "KSG Mutual Information":
                    res_df_disp = res_df_filtered.rename(columns={
                        'gene': 'Co-expressed Gene',
                        'pearson': 'Pearson r',
                        'ksg_mi': 'KSG Mutual Information (MI)'
                    })[['Co-expressed Gene', 'Pearson r', 'KSG Mutual Information (MI)']]
                else:
                    res_df_disp = res_df_filtered.rename(columns={
                        'gene': 'Co-expressed Gene',
                        'pearson': 'Pearson r'
                    })[['Co-expressed Gene', 'Pearson r']]
                    
                st.dataframe(res_df_disp.head(20), use_container_width=True)
                
                # Store top 20 genes for selection button
                top_20_genes = res_df_filtered['gene'].head(20).tolist()
                st.session_state.top_20_coexp = top_20_genes
                
                if st.button("Add Top 20 Co-expressed Genes to Selection"):
                    combined_selection = list(st.session_state.selected_genes) + top_20_genes
                    seen = set()
                    dedup = [x for x in combined_selection if not (x in seen or seen.add(x))]
                    st.session_state.selected_genes = dedup
                    st.success(f"Added top co-expressed genes to selection! Active selection now has {len(dedup)} genes.")
                    del st.session_state.top_20_coexp
                    st.rerun()
                
                # Add relationship visual explorer
                st.markdown("### Visual Relationship Explorer")
                st.write("Select a co-expressed gene from the results below to plot its expression levels directly against the reference gene across all cells and stages.")
                
                top_candidates = res_df_filtered['gene'].head(50).tolist()
                explore_gene = st.selectbox("Select Candidate Gene to Plot:", top_candidates)
                
                # Merge expression vectors for plotting
                target_columns = [col for col in df.columns if ' (#' in col]
                ref_melted = df[df['gene'] == ref_gene].melt(id_vars=['gene', 'stage'], value_vars=target_columns, var_name='cell', value_name='ref_expr')
                cand_melted = df[df['gene'] == explore_gene].melt(id_vars=['gene', 'stage'], value_vars=target_columns, var_name='cell', value_name='cand_expr')
                
                merged_plot_df = pd.merge(ref_melted, cand_melted, on=['stage', 'cell']).dropna()
                
                if merged_plot_df.empty:
                    st.warning("No overlapping stage/cell expression data to plot.")
                else:
                    show_trend = st.checkbox("Show LOWESS trendline (local regression)", value=True)
                    trend_type = "lowess" if show_trend else None
                    
                    try:
                        fig = px.scatter(
                            merged_plot_df,
                            x='ref_expr',
                            y='cand_expr',
                            color='stage',
                            trendline=trend_type,
                            title=f"Expression Correlation: {ref_gene} vs {explore_gene}",
                            labels={'ref_expr': f"{ref_gene} Expression", 'cand_expr': f"{explore_gene} Expression", 'stage': 'Stage'},
                            hover_data={'cell': True, 'stage': True},
                            template="plotly_white"
                        )
                        st.plotly_chart(fig, use_container_width=True)
                    except Exception as e:
                        # Fallback if statsmodels fails or is not available
                        fig = px.scatter(
                            merged_plot_df,
                            x='ref_expr',
                            y='cand_expr',
                            color='stage',
                            title=f"Expression Correlation: {ref_gene} vs {explore_gene}",
                            labels={'ref_expr': f"{ref_gene} Expression", 'cand_expr': f"{explore_gene} Expression", 'stage': 'Stage'},
                            hover_data={'cell': True, 'stage': True},
                            template="plotly_white"
                        )
                        st.plotly_chart(fig, use_container_width=True)

with tab6:
    st.markdown("## FlyBase Gene Details")
    st.write("Select a gene to fetch live metadata and external links to FlyBase.")
    
    if df is not None:
        all_genes = sorted([str(g) for g in df['gene'].dropna().unique() if str(g).strip() and str(g).lower() != 'nan'])
        target_gene = st.selectbox("Select a gene to lookup:", all_genes)
        
        st.link_button(f"View {target_gene} on FlyBase ↗", f"https://flybase.org/search/gene/{target_gene}")
        
        with st.spinner(f"Fetching live data for {target_gene}..."):
            metadata = fetch_gene_metadata(target_gene)
            
            if metadata:
                st.success("Metadata loaded successfully.")
                col1, col2 = st.columns(2)
                with col1:
                    st.markdown(f"**Full Name:** {metadata.get('name', 'Unknown')}")
                    st.markdown(f"**Official Symbol:** {metadata.get('symbol', target_gene)}")
                with col2:
                    st.markdown(f"**FlyBase ID:** `{metadata.get('flybase', 'N/A')}`")
                
                st.markdown("### Summary")
                summary = metadata.get('summary', 'No summary available for this gene.')
                st.info(summary)
            else:
                st.warning(f"Could not automatically fetch detailed metadata for `{target_gene}`. Click the FlyBase link above to view it directly.")
    else:
        st.info("Please build the dataset in the sidebar first.")
