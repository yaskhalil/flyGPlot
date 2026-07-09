import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import re
import os

def render_readme_tab():
    st.markdown(r"""
    ## Fly Gene Expression Explorer

    Welcome to the Fly Gene Expression Explorer! This interactive portal allows you to analyze Drosophila gene expression patterns across developmental stages (`P15`, `P30`, `P40`, `P50`, `P70`, and `Adult`) and specific target cell types.

    ### Guide to the Tabs
    1. **Read Me**: This user guide and math explanation page.
    2. **Data Config**: Configure main data file paths, rebuild dataset from raw Excel, and monitor dataset loading statuses.
    3. **Gene Selection**: Selection center allowing manual choice, bulk pasting (with Ensembl synonym resolution), pre-curated gene sets, or dynamic cell-type derived genes.
    4. **Expression Analytics**: View expression profiles over time. It has a **Pivot View** toggle to swap axis focus:
       - *Normal View*: Plots expression by **Gene** (each point is a different Cell Type).
       - *Pivot View*: Plots expression by **Cell Type** (each point is a different Gene).
    5. **Cell-Centric Trend**: Plot developmental trajectory line charts for a single target cell annotation, with highlight controls to focus on specific genes.
    6. **Co-expression Grid**: Displays the binary `"On"` / `"Off"` activity states of your selected genes across target cells for a given developmental stage, using Mixture Modeling probabilities.
    7. **Co-expression Dashboard**: An interactive, split-screen control center. Search for co-expressed partners using Pearson, Spearman, or Jaccard similarity. Click on any row to view expression trends, dual-gene LOWESS plots, and live FlyBase metadata.
    8. **Gene Details**: Direct metadata lookup and external link buttons for any gene in the database.

    ---

    ### Co-expression Mathematics: Pearson, Spearman, and Jaccard Similarity

    To find groups of coregulated genes, the explorer supports three metrics:

    #### 1. Pearson Correlation Coefficient ($r$)
    Pearson Correlation measures the **linear relationship** between the expression profiles of two genes, $X$ and $Y$:

    $$r = \frac{\sum_{i=1}^N (x_i - \bar{x})(y_i - \bar{y})}{\sqrt{\sum_{i=1}^N (x_i - \bar{x})^2 \sum_{i=1}^N (y_i - \bar{y})^2}}$$

    - **Value Range:** $[-1.0, 1.0]$ ($1.0$ = perfect linear correlation, $-1.0$ = perfect negative correlation, $0.0$ = no linear correlation).
    - **Best Used For:** Rapidly scanning for genes that rise and fall in exact proportion to one another.
    - **Limitation:** Cannot detect non-linear dependencies.

    #### 2. Spearman Rank Correlation ($\rho$)
    Spearman Rank Correlation measures the **monotonic relationship** between the expression profiles by calculating the Pearson correlation on the *ranks* of the data:

    $$\rho = 1 - \frac{6 \sum d_i^2}{N(N^2 - 1)}$$

    - **Value Range:** $[-1.0, 1.0]$ ($1.0$ = perfect monotonic relationship, $-1.0$ = perfect negative monotonic relationship).
    - **Best Used For:** Finding genes that follow similar trajectories even if the scaling is non-linear (e.g. exponential activation). It is highly robust to outliers.

    #### 3. Jaccard Active-State Similarity ($J$)
    Jaccard Similarity measures the co-occurrence of active ("On") states. Mixture modeling probabilities are binarized (active if probability $\ge 0.5$, inactive if $< 0.5$):

    $$J(X, Y) = \frac{|X_{active} \cap Y_{active}|}{|X_{active} \cup Y_{active}|}$$

    - **Value Range:** $[0.0, 1.0]$ ($1.0$ = identical active cell-type domains, $0.0$ = no overlap in active domains).
    - **Best Used For:** Zero-inflated developmental single-cell data. It focuses exclusively on shared expression domains and ignores joint inactive states.
    """)

def render_data_config_tab(df, mm_df, rebuild_dataset_fn):
    st.markdown("## Data Config & Management")
    st.write("Specify path configurations and manage database builds for the main gene expression datasets.")
    
    from backend import dataset
    
    root_file_default = os.path.join(dataset.DATA_DIR, 'log_normalized_average_expression_all_stages 1.xlsx')
    root_file = st.text_input("Root Excel File Path", root_file_default, key="data_root_file")
    
    if st.button("Rebuild Dataset", key="data_rebuild_btn"):
        with st.spinner("Processing root Excel..."):
            try:
                rebuild_dataset_fn(root_file)
                st.cache_data.clear()
                st.success("Dataset rebuilt successfully!")
                st.rerun()
            except Exception as e:
                st.error(f"Error processing root file: {e}")
                
    st.divider()
    st.markdown("### Dataset Loading Status")
    
    if df is not None:
        st.success("✅ **Main expression dataset is loaded!**")
        st.info(f"Total unique genes: `{len(df['gene'].dropna().unique())}`  \n"
                f"Total stages represented: `{list(df['stage'].unique())}`  \n"
                f"Total target cells / clusters: `{len([c for c in df.columns if ' (#' in c])}`")
                
        if mm_df is not None:
            st.success("✅ **Mixture modeling dataset is loaded!**")
            st.info(f"Total mixture-modeled genes: `{len(mm_df['gene'].dropna().unique())}`")
        else:
            st.warning("⚠️ **Mixture modeling dataset is missing or could not be loaded.** "
                       "Active-state co-expression features (Jaccard similarity and the binary On/Off grid) will not be functional.")
    else:
        st.warning("⚠️ **No dataset loaded.** Please verify the file path above and click 'Rebuild Dataset' to build the files.")

def render_gene_selection_tab(df, all_genes, all_genes_map_lower, resolve_genes_bulk_fn, load_mm_data_fn):
    st.markdown("## Gene Selection Center")
    st.write("Construct, paste, or dynamically generate the list of genes you want to analyze.")
    
    if df is None:
        st.warning("⚠️ No dataset loaded. Please go to the **Data Config** tab first to load the dataset.")
        return
        
    from backend import dataset
    
    # Initialize selection in session state if not present
    if "selected_genes" not in st.session_state:
        default_tfs = ['ab', 'abd-b', 'achi', 'acj6', 'Adf1', 'Aef1']
        st.session_state.selected_genes = [g for g in default_tfs if g in all_genes]
        
    selection_mode = st.radio(
        "Gene Selection Mode",
        ["Select Genes Manually", "Paste Bulk Gene Set", "Predefined Gene Groups", "Generate Group from Cell Type"],
        help="Choose how you want to input genes.",
        key="gene_sel_mode_radio"
    )
    
    # Clear group metadata if not in Predefined Gene Groups mode
    if selection_mode != "Predefined Gene Groups":
        if "group_name" in st.session_state:
            del st.session_state.group_name
        if "group_metadata" in st.session_state:
            del st.session_state.group_metadata
            
    if selection_mode == "Select Genes Manually":
        selected_genes_in_options = [g for g in st.session_state.selected_genes if g in all_genes]
        selected_genes = st.multiselect(
            "Which genes to consider?",
            all_genes,
            default=selected_genes_in_options,
            help="Select one or more genes.",
            key="gene_multiselect_manual"
        )
        st.session_state.selected_genes = selected_genes
        
    elif selection_mode == "Paste Bulk Gene Set":
        default_bulk = ", ".join(st.session_state.selected_genes)
        bulk_input = st.text_area(
            "Paste gene list:",
            value=default_bulk,
            help="Enter gene symbols or synonyms separated by spaces, commas, or newlines.",
            height=150,
            key="gene_textarea_bulk"
        )
        resolved, warnings, unresolved, api_down = resolve_genes_bulk_fn(bulk_input, all_genes_map_lower)
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
            
    elif selection_mode == "Predefined Gene Groups":
        group_choice = st.selectbox(
            "Select Predefined Group:",
            ["Select Group...", "Cell Adhesion Molecules (CAMs - Nikos)", "Cell Surface Secreted Proteins (Kai Zinn)"],
            help="Select a curated group of genes to load.",
            key="gene_selectbox_predef"
        )
        
        if group_choice == "Cell Adhesion Molecules (CAMs - Nikos)":
            cams_path = os.path.join(dataset.DATA_DIR, 'CAMs_FPKMs_Nikos.xlsx')
            if not os.path.exists(cams_path):
                st.warning("CAMs_FPKMs_Nikos.xlsx not found in workspace.")
            else:
                try:
                    df_cams = pd.read_excel(cams_path)
                    st.session_state.group_name = "Cell Adhesion Molecules (CAMs - Nikos)"
                    st.session_state.group_metadata = df_cams.set_index('gene_short_name')['gene_id'].to_dict()
                    
                    cams = [str(x).strip() for x in df_cams['gene_short_name'].dropna().unique()]
                    resolved = [all_genes_map_lower[c.lower()] for c in cams if c.lower() in all_genes_map_lower]
                    st.session_state.selected_genes = resolved
                    st.success(f"Loaded {len(resolved)} genes from Cell Adhesion Molecules.")
                    st.rerun()
                except Exception as e:
                    st.error(f"Error loading CAMs: {e}")
                    
        elif group_choice == "Cell Surface Secreted Proteins (Kai Zinn)":
            zinn_path = os.path.join(dataset.DATA_DIR, 'Cell surface secreted proteins_list Kai Zinn.xls')
            if not os.path.exists(zinn_path):
                st.warning("Cell surface secreted proteins_list Kai Zinn.xls not found in workspace.")
            else:
                try:
                    df_zinn = pd.read_excel(zinn_path, skiprows=2)
                    df_zinn.columns = ['CT_num', 'CG_num', 'gene_name', 'comments'] + list(df_zinn.columns[4:])
                    
                    meta = {}
                    for _, row in df_zinn.iterrows():
                        cg = str(row['CG_num']).strip()
                        name = str(row['gene_name']).strip()
                        comm = str(row['comments']).strip() if not pd.isna(row['comments']) else ""
                        if cg and cg != 'nan':
                            meta[cg.lower()] = comm
                        if name and name != 'nan':
                            meta[name.lower()] = comm
                    st.session_state.group_name = "Cell Surface Secreted Proteins (Kai Zinn)"
                    st.session_state.group_metadata = meta
                    
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
                    
    elif selection_mode == "Generate Group from Cell Type":
        target_columns = [col for col in df.columns if ' (#' in col]
        if not target_columns:
            target_columns = [col for col in df.columns if col.startswith('Target ') or col.startswith('Gene ')]
            
        def get_cluster_num(col_name):
            match = re.search(r'#(\d+)', col_name)
            return int(match.group(1)) if match else 9999
            
        target_columns_sorted = sorted(target_columns, key=get_cluster_num)
        
        selected_cell = st.selectbox(
            "Select Target Cell:",
            target_columns_sorted,
            help="Choose a target cell cluster to generate a gene list from.",
            key="gene_selectbox_cell_target"
        )
        
        group_method = st.radio("Criterion:", ["Expression Threshold", "Mixture Modeling (Active/On)"], key="gene_radio_cell_criterion")
        
        if group_method == "Expression Threshold":
            threshold = st.number_input("Expression Threshold:", min_value=0.0, value=1.0, step=0.1, key="gene_num_cell_thresh")
            
            if st.button("Generate and Apply", key="gene_btn_cell_apply_threshold"):
                cell_df = df[df[selected_cell] >= threshold]
                found_genes = sorted(cell_df['gene'].dropna().unique().tolist())
                
                if not found_genes:
                    st.warning(f"No genes match expression >= {threshold} in {selected_cell}.")
                else:
                    st.session_state.selected_genes = found_genes
                    st.success(f"Applied {len(found_genes)} matching genes to your selection!")
                    st.rerun()
        else:
            prob_threshold = st.number_input("Active Probability Threshold:", min_value=0.0, max_value=1.0, value=0.5, step=0.05, key="gene_num_cell_prob")
            
            if st.button("Generate and Apply", key="gene_btn_cell_apply_prob"):
                mm_df = load_mm_data_fn()
                if mm_df is None:
                    st.error("Mixture modeling dataset not loaded.")
                else:
                    cell_df = mm_df[mm_df[selected_cell] >= prob_threshold]
                    found_genes = sorted(cell_df['gene'].dropna().unique().tolist())
                    
                    if not found_genes:
                        st.warning(f"No active genes found in {selected_cell} with prob >= {prob_threshold}.")
                    else:
                        st.session_state.selected_genes = found_genes
                        st.success(f"Applied {len(found_genes)} active genes to your selection!")
                        st.rerun()
                        
    st.divider()
    st.markdown(f"### Current Active Selection (`{len(st.session_state.selected_genes)}` genes)")
    st.write(", ".join(st.session_state.selected_genes) if st.session_state.selected_genes else "None")

def render_expression_trend_tab(df, selected_genes, selected_stages, min_exp, exclude_low_exp=True):
    if df is None:
        st.warning("⚠️ No dataset loaded. Please go to the **Data Config** tab to load the dataset.")
        return
    if not selected_genes:
        st.info("ℹ️ No genes selected. Please select or paste genes in the **Gene Selection** tab to begin.")
        return
        
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
    if exclude_low_exp:
        df_melted = df_melted[df_melted['expression'] >= 0.10]
    
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
                if df_melted_filtered.empty:
                    st.warning("No data matches the selected cell types and filters.")
                else:
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
            max_plots_per_page = 10
            num_selected = len(selected_genes)
            
            if num_selected > max_plots_per_page:
                num_pages = (num_selected - 1) // max_plots_per_page + 1
                col1, col2 = st.columns([1, 4])
                with col1:
                    page = st.number_input("Page", min_value=1, max_value=num_pages, value=1, step=1,
                                          help=f"Select page (shows up to {max_plots_per_page} plots at a time)",
                                          key="expr_trend_page_num")
                with col2:
                    st.markdown(f"<div style='padding-top: 25px;'>Showing genes <b>{(page-1)*max_plots_per_page+1} to {min(page*max_plots_per_page, num_selected)}</b> of <b>{num_selected}</b></div>", unsafe_allow_html=True)
                
                genes_to_show = selected_genes[(page-1)*max_plots_per_page : page*max_plots_per_page]
            else:
                genes_to_show = selected_genes
            
            for gene in genes_to_show:
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

def render_cell_centric_trend_tab(df, selected_genes, min_exp):
    st.markdown("## Cell-Centric Expression Trend")
    
    if df is None:
        st.warning("⚠️ No dataset loaded. Please go to the **Data Config** tab to load the dataset.")
        return
    if not selected_genes:
        st.info("ℹ️ No genes selected. Please select or paste genes in the **Gene Selection** tab to begin.")
        return
        
    target_columns = [col for col in df.columns if ' (#' in col]
    if not target_columns:
        target_columns = [col for col in df.columns if col.startswith('Target ') or col.startswith('Gene ')]
        
    def get_cluster_num(col_name):
        match = re.search(r'#(\d+)', col_name)
        return int(match.group(1)) if match else 9999
        
    target_columns_sorted = sorted(target_columns, key=get_cluster_num)
    
    selected_cell = st.selectbox(
        "Select Target Cell Annotation:",
        target_columns_sorted,
        help="Choose a target cell cluster to see expression trends across developmental stages.",
        key="cell_centric_target_cell"
    )
    
    highlighted_genes = st.multiselect(
        "Genes to highlight (colored):",
        selected_genes,
        default=[],
        help="Select which genes to highlight. Other selected genes will be shown as thin gray lines in the background.",
        key="cell_centric_highlight"
    )
    
    cell_df = df[df['gene'].isin(selected_genes)][['gene', 'stage', selected_cell]].dropna()
    cell_df = cell_df[cell_df[selected_cell] >= min_exp]
    
    if cell_df.empty:
        st.warning(f"No expression data available for the selected genes in cell {selected_cell} above threshold {min_exp}.")
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

def render_coexpression_table_tab(mm_df, selected_genes):
    st.markdown("## Co-expression Table (Mixture Modeling)")
    st.write("This tab shows the On/Off state of your selected genes across target cell types at a selected developmental stage.")
    
    if mm_df is None:
        st.warning("⚠️ No mixture modeling dataset loaded. Rebuild/load the dataset in the **Data Config** tab.")
        return
    if not selected_genes:
        st.info("ℹ️ No genes selected. Please select or paste genes in the **Gene Selection** tab to begin.")
        return
        
    mm_stages = sorted(mm_df['stage'].unique())
    
    col1, col2 = st.columns(2)
    with col1:
        selected_mm_stage = st.selectbox("Select Developmental Stage for Grid:", mm_stages, key="coexp_grid_stage")
    with col2:
        mm_threshold = st.slider("Probability Threshold for 'On':", 0.0, 1.0, 0.5, step=0.05,
                                 help="If the mixture modeling probability is greater than or equal to this threshold, the gene is considered active ('On') in that cell.",
                                 key="coexp_grid_thresh")
                                 
    stage_mm = mm_df[(mm_df['gene'].isin(selected_genes)) & (mm_df['stage'] == selected_mm_stage)]
    
    if stage_mm.empty:
        st.warning(f"No mixture modeling data available for the selected genes at stage {selected_mm_stage}.")
    else:
        cell_columns = [col for col in mm_df.columns if ' (#' in col]
        if not cell_columns:
            cell_columns = [col for col in mm_df.columns if col.startswith('Target ') or col.startswith('Gene ')]
            
        def get_cluster_num(col_name):
            match = re.search(r'#(\d+)', col_name)
            return int(match.group(1)) if match else 9999
        cell_columns_sorted = sorted(cell_columns, key=get_cluster_num)
        
        grid_data = stage_mm.set_index('gene')[cell_columns_sorted]
        binary_grid = grid_data.apply(lambda x: x.map(lambda val: "On" if not pd.isna(val) and val >= mm_threshold else "Off"))
        
        cell_search = st.text_input("Filter cells by name (e.g. Dm, PCG):", "", key="coexp_grid_search_cell")
        if cell_search:
            filtered_columns = [c for c in cell_columns_sorted if cell_search.lower() in c.lower()]
            if not filtered_columns:
                st.warning(f"No cell names match '{cell_search}'")
                binary_grid_disp = pd.DataFrame()
            else:
                binary_grid_disp = binary_grid[filtered_columns]
        else:
            show_all = st.checkbox("Show all available cell types (may cause horizontal scrolling)", value=False, key="coexp_grid_show_all")
            if show_all:
                binary_grid_disp = binary_grid
            else:
                binary_grid_disp = binary_grid.iloc[:, :40]
                st.caption(f"Displaying first 40 cells. Check the box above to see all {len(cell_columns_sorted)} cells.")
        
        if not binary_grid_disp.empty:
            def style_cells(val):
                if val == "On":
                    return 'background-color: #d4edda; color: #155724; font-weight: bold; text-align: center;'
                return 'background-color: #f8d7da; color: #721c24; text-align: center;'
            
            try:
                styled_df = binary_grid_disp.style.map(style_cells)
            except AttributeError:
                styled_df = binary_grid_disp.style.applymap(style_cells)
            st.dataframe(styled_df, use_container_width=True)

def render_coexpression_dashboard_tab(
    df, 
    mm_df, 
    compute_coexpression_groups_fn, 
    fetch_gene_metadata_fn,
    selected_stages,
    min_exp,
    exclude_low_exp
):
    st.markdown("## Co-expression Dashboard")
    st.write("Explore transcriptional correlation profiles and co-occurrence patterns across all cell types and developmental stages.")
    
    if df is None:
        st.warning("⚠️ No dataset loaded. Please configure and load your dataset in the **Data Config** tab.")
        return
        
    all_genes_list = sorted([str(g) for g in df['gene'].dropna().unique() if str(g).strip() and str(g).lower() != 'nan'])
    
    # Initialize session state keys for the dashboard
    if "dash_ref_gene" not in st.session_state:
        st.session_state.dash_ref_gene = "achi" if "achi" in all_genes_list else all_genes_list[0]
    if "dash_metric" not in st.session_state:
        st.session_state.dash_metric = "Pearson Correlation"
    if "selected_partner_gene" not in st.session_state:
        st.session_state.selected_partner_gene = None
        
    col_left, col_right = st.columns([2, 3])
    
    with col_left:
        st.markdown("### 🛞 Steering Wheel (Control)")
        
        ref_gene = st.selectbox(
            "Select Reference Gene:",
            all_genes_list,
            index=all_genes_list.index(st.session_state.dash_ref_gene) if st.session_state.dash_ref_gene in all_genes_list else 0,
            help="Select the reference gene to find co-expression partners for.",
            key="dash_ref_gene_selectbox"
        )
        
        coexp_metric = st.selectbox(
            "Co-expression Metric:",
            ["Pearson Correlation", "Spearman Rank Correlation", "Jaccard Active-State Similarity"],
            index=["Pearson Correlation", "Spearman Rank Correlation", "Jaccard Active-State Similarity"].index(st.session_state.dash_metric),
            help="Pearson measures linear correlation. Spearman measures monotonic rank correlation. Jaccard measures co-occurrence of active states.",
            key="dash_metric_selectbox"
        )
        
        # Reset partner selection if reference gene or metric changes
        if ref_gene != st.session_state.dash_ref_gene or coexp_metric != st.session_state.dash_metric:
            st.session_state.dash_ref_gene = ref_gene
            st.session_state.dash_metric = coexp_metric
            st.session_state.selected_partner_gene = None
            if "dash_results" in st.session_state:
                del st.session_state.dash_results
            st.rerun()
            
        if coexp_metric == "Jaccard Active-State Similarity":
            min_score = st.slider(
                "Minimum Jaccard Similarity (Intersection / Union):", 
                0.0, 1.0, 0.3, step=0.05,
                help="Filter results to show only genes with Jaccard similarity greater than or equal to this threshold.",
                key="dash_jaccard_slider"
            )
        else:
            min_score = st.slider(
                "Minimum Absolute Correlation (|r| / |rho|):", 
                0.0, 1.0, 0.5, step=0.05,
                help="Filter results to show only genes with correlation greater than or equal to this threshold.",
                key="dash_corr_slider"
            )
            
        search_clicked = st.button("Search Co-expressed Genes", key="dash_search_btn")
        
        if search_clicked:
            with st.spinner("Calculating co-expression profiles..."):
                if coexp_metric == "Jaccard Active-State Similarity":
                    if mm_df is None:
                        st.error("Mixture modeling dataset is not loaded. Cannot run Jaccard calculations.")
                        coexp_results = []
                    else:
                        coexp_results = compute_coexpression_groups_fn(ref_gene, mm_df, metric="Jaccard")
                else:
                    metric_name = "Spearman" if coexp_metric == "Spearman Rank Correlation" else "Pearson"
                    coexp_results = compute_coexpression_groups_fn(ref_gene, df, metric=metric_name)
                
                if not coexp_results:
                    st.error("Could not compute co-expression profile. Ensure the reference gene has valid expression data.")
                    st.session_state.dash_results = None
                else:
                    st.session_state.dash_results = coexp_results
                    st.session_state.selected_partner_gene = None
                    st.success("Analysis complete!")
                    st.rerun()
                    
        # Render the results dataframe if search results exist
        if st.session_state.get("dash_results"):
            res_df = pd.DataFrame(st.session_state.dash_results)
            
            if coexp_metric == "Jaccard Active-State Similarity":
                res_df_filtered = res_df[res_df['jaccard'] >= min_score]
                rename_dict = {'gene': 'Co-expressed Gene', 'jaccard': 'Jaccard Similarity'}
                disp_cols = ['Co-expressed Gene', 'Jaccard Similarity']
            elif coexp_metric == "Spearman Rank Correlation":
                res_df_filtered = res_df[res_df['abs_spearman'] >= min_score]
                rename_dict = {'gene': 'Co-expressed Gene', 'spearman': 'Spearman rho'}
                disp_cols = ['Co-expressed Gene', 'Spearman rho']
            else:
                res_df_filtered = res_df[res_df['abs_pearson'] >= min_score]
                rename_dict = {'gene': 'Co-expressed Gene', 'pearson': 'Pearson r'}
                disp_cols = ['Co-expressed Gene', 'Pearson r']
                
            if res_df_filtered.empty:
                st.warning(f"No genes match the current threshold of {min_score}.")
            else:
                st.write(f"Found **{len(res_df_filtered)}** genes above threshold.")
                res_df_disp = res_df_filtered.rename(columns=rename_dict)[disp_cols].reset_index(drop=True)
                
                # Render using st.dataframe and support row selection
                event = st.dataframe(
                    res_df_disp.head(50), 
                    use_container_width=True,
                    selection_mode="single-row",
                    on_select="rerun",
                    key="dash_table_selection"
                )
                
                # Check if a row was selected
                selected_row = None
                if event and hasattr(event, "selection") and "rows" in event.selection:
                    selected_rows = event.selection["rows"]
                    if selected_rows:
                        selected_row = selected_rows[0]
                elif isinstance(event, dict) and "selection" in event and "rows" in event["selection"]:
                    selected_rows = event["selection"]["rows"]
                    if selected_rows:
                        selected_row = selected_rows[0]
                        
                if selected_row is not None:
                    partner = res_df_disp.iloc[selected_row]['Co-expressed Gene']
                    if st.session_state.selected_partner_gene != partner:
                        st.session_state.selected_partner_gene = partner
                        st.rerun()
                
                st.markdown("---")
                # Add Top 20 button
                top_20_genes = res_df_filtered['gene'].head(20).tolist()
                if st.button("Add Top 20 Co-expressed Genes to Selection", key="dash_add_top_20_btn"):
                    active_selection = list(st.session_state.get("selected_genes", []))
                    combined = active_selection + top_20_genes
                    seen = set()
                    dedup = [x for x in combined if not (x in seen or seen.add(x))]
                    st.session_state.selected_genes = dedup
                    st.success(f"Added top {len(top_20_genes)} co-expressed genes to active selection!")
                    st.rerun()
        else:
            st.info("Please click **Search Co-expressed Genes** above to compute similarity profiles.")
            
    with col_right:
        st.markdown("### 🚘 Windshield (Visualization & Details)")
        
        partner_gene = st.session_state.get("selected_partner_gene")
        
        if not st.session_state.get("dash_results"):
            st.info("👈 Please search for co-expressed genes in the left panel to populate the dashboard.")
        elif partner_gene is None:
            st.info("👈 Click on a gene row in the results table to view expression trends, dual-gene verification, and FlyBase details here.")
        else:
            st.markdown(f"Selected Partner Gene: **{partner_gene}** (relative to reference **{ref_gene}**)")
            
            sub_tab1, sub_tab2, sub_tab3 = st.tabs(["Expression Trends", "Dual-Gene Verification", "FlyBase Details"])
            
            with sub_tab1:
                target_columns = [col for col in df.columns if ' (#' in col]
                if not target_columns:
                    target_columns = [col for col in df.columns if col.startswith('Target ') or col.startswith('Gene ')]
                    
                plot_df = df[df['gene'].isin([ref_gene, partner_gene])].melt(
                    id_vars=['gene', 'stage'],
                    value_vars=target_columns,
                    var_name='Cell',
                    value_name='expression'
                ).dropna()
                
                # Apply filters
                plot_df = plot_df[plot_df['stage'].isin(selected_stages)]
                plot_df = plot_df[plot_df['expression'] >= min_exp]
                if exclude_low_exp:
                    plot_df = plot_df[plot_df['expression'] >= 0.10]
                    
                if plot_df.empty:
                    st.warning("No data matches the current stage/expression filters.")
                else:
                    fig = px.strip(
                        plot_df,
                        x='stage',
                        y='expression',
                        color='gene',
                        title=f"Expression Profile Comparison: {ref_gene} vs {partner_gene}",
                        category_orders={'stage': ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult']},
                        hover_data={'Cell': True, 'stage': True, 'expression': ':.4f'},
                        height=400,
                        template="plotly_white"
                    )
                    fig.update_traces(jitter=1.0, marker=dict(size=6))
                    st.plotly_chart(fig, use_container_width=True)
                    
            with sub_tab2:
                # Merge expression vectors for plotting
                target_columns = [col for col in df.columns if ' (#' in col]
                if not target_columns:
                    target_columns = [col for col in df.columns if col.startswith('Target ') or col.startswith('Gene ')]
                    
                ref_melted = df[df['gene'] == ref_gene].melt(id_vars=['gene', 'stage'], value_vars=target_columns, var_name='cell', value_name='ref_expr')
                cand_melted = df[df['gene'] == partner_gene].melt(id_vars=['gene', 'stage'], value_vars=target_columns, var_name='cell', value_name='cand_expr')
                
                merged_plot_df = pd.merge(ref_melted, cand_melted, on=['stage', 'cell']).dropna()
                
                if merged_plot_df.empty:
                    st.warning("No overlapping stage/cell expression data to plot.")
                else:
                    show_trend = st.checkbox("Show LOWESS trendline (local regression)", value=True, key="dash_lowess_toggle")
                    trend_type = "lowess" if show_trend else None
                    
                    try:
                        fig = px.scatter(
                            merged_plot_df,
                            x='ref_expr',
                            y='cand_expr',
                            color='stage',
                            trendline=trend_type,
                            title=f"Co-expression Scatter: {ref_gene} vs {partner_gene}",
                            labels={'ref_expr': f"{ref_gene} Expression", 'cand_expr': f"{partner_gene} Expression", 'stage': 'Stage'},
                            hover_data={'cell': True, 'stage': True},
                            template="plotly_white",
                            height=400
                        )
                        st.plotly_chart(fig, use_container_width=True)
                    except Exception as e:
                        st.error(f"Error plotting relationship: {e}")
                        
            with sub_tab3:
                st.subheader(f"Gene Info: {partner_gene}")
                st.link_button(f"View {partner_gene} on FlyBase ↗", f"https://flybase.org/search/gene/{partner_gene}")
                
                with st.spinner(f"Fetching live metadata for {partner_gene}..."):
                    metadata = fetch_gene_metadata_fn(partner_gene)
                    if metadata:
                        col1, col2 = st.columns(2)
                        with col1:
                            st.markdown(f"**Full Name:** {metadata.get('name', 'Unknown')}")
                            st.markdown(f"**Official Symbol:** {metadata.get('symbol', partner_gene)}")
                        with col2:
                            st.markdown(f"**FlyBase ID:** `{metadata.get('flybase', 'N/A')}`")
                        
                        st.markdown("#### Summary")
                        st.info(metadata.get('summary', 'No summary available for this gene.'))
                    else:
                        st.warning(f"Could not automatically fetch detailed metadata for `{partner_gene}`.")

def render_gene_details_tab(df, fetch_gene_metadata_fn):
    st.markdown("## FlyBase Gene Details")
    st.write("Select a gene to fetch live metadata and external links to FlyBase.")
    
    if df is None:
        st.warning("⚠️ No dataset loaded. Please go to the **Data Config** tab to load the dataset.")
        return
        
    all_genes = sorted([str(g) for g in df['gene'].dropna().unique() if str(g).strip() and str(g).lower() != 'nan'])
    
    target_gene = st.selectbox("Select a gene to lookup:", all_genes, key="details_target_gene")
    
    st.link_button(f"View {target_gene} on FlyBase ↗", f"https://flybase.org/search/gene/{target_gene}")
    
    # Check if the gene is part of the active predefined group
    if "group_name" in st.session_state and "group_metadata" in st.session_state:
        group_name = st.session_state.group_name
        group_meta = st.session_state.group_metadata
        meta_val = None
        if isinstance(group_meta, dict):
            meta_val = group_meta.get(target_gene.lower()) or group_meta.get(target_gene)
        if meta_val:
            st.info(f"🧬 **Predefined Group Association:** Part of **{group_name}**  \n**Group Comments/Metadata:** {meta_val}")
            
    with st.spinner(f"Fetching live data for {target_gene}..."):
        metadata = fetch_gene_metadata_fn(target_gene)
        
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
