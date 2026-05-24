import streamlit as st
import pandas as pd
import plotly.express as px
import os
from process_excel import process_files

st.set_page_config(layout="wide", page_title="Fly TF Expression", page_icon="🪰")

st.title("Fly TF Expression Explorer")

@st.cache_data
def load_data():
    if not os.path.exists('combined_expression.csv'):
        return None
    return pd.read_csv('combined_expression.csv')

# Sidebar - enhanced usability
with st.sidebar:
    st.header("Configuration")
    
    st.markdown("### Data Management")
    with st.expander("Update Dataset", expanded=False):
        file1 = st.text_input("Excel Part 1", 'data/flybase TF expression list_A-E.xlsx')
        file2 = st.text_input("Excel Part 2", 'data/flybase_TF_expression_list_F-Z.xlsx')
        if st.button("Rebuild Dataset"):
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
        all_genes = df['gene'].unique()
        target_genes = ['ab', 'abd-b', 'achi', 'acj6', 'Adf1', 'Aef1']
        plot_genes = [g for g in target_genes if g in all_genes]
        
        selected_genes = st.multiselect("Which genes to consider?", all_genes, default=plot_genes, help="Select one or more genes.")
        
        st.markdown("### Filters")
        all_stages = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult']
        selected_stages = st.multiselect("Select Stages", all_stages, default=all_stages, help="Filter which stages to display.")
        min_exp = st.number_input("Minimum Expression", min_value=0.0, value=0.0, step=0.05, help="Hide points with expression below this value.")
    else:
        st.warning("No dataset found. Please use Data Management to build it.")
        selected_genes = []
        selected_stages = []
        min_exp = 0.0

import requests

@st.cache_data(ttl=3600)
def fetch_gene_metadata(gene_symbol):
    """Fetch gene metadata using Ensembl (for precise IDs) and FlyBase (for summaries)."""
    meta = {}
    
    # 1. Ensembl API for authoritative FlyBase ID and Full Name
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
        
    # 2. FlyBase API for the official auto-generated summary
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

# Tabs
tab1, tab2, tab3 = st.tabs(["Read Me", "Expression Trend", "Gene Details"])

with tab1:
    st.markdown("""
    ## How to use this tool?
    This tool allows you to explore the expression of transcription factors (TFs) across different developmental stages.
    
    ### Getting Started
    1. Open the **Configuration** sidebar.
    2. Expand **Update Dataset** and click **Rebuild Dataset** if you have new Excel data.
    3. Select genes to visualize.
    4. Switch to the **Expression Trend** tab.
    5. Visit the **Gene Details** tab for live FlyBase metadata.
    
    ### 🚧 Coming Soon: KSG KNN Co-Regulation Analysis
    We will soon be integrating a Kraskov-Stögbauer-Grassberger (KSG) K-Nearest Neighbors algorithm to automatically detect complex, non-linear co-expression and regulation patterns across all targets. This will help uncover hidden regulatory networks and guide future wet-lab investigations!
    """)

with tab3:
    st.markdown("## FlyBase Gene Details")
    st.write("Select a gene to fetch live metadata and external links to FlyBase.")
    
    if df is not None:
        all_genes = df['gene'].unique()
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
        st.info("👈 Please build the dataset in the sidebar first.")

with tab2:
    if df is None:
        st.info("👈 Please build the dataset in the sidebar first.")
    elif not selected_genes:
        st.info("👈 Please select at least one gene from the sidebar to begin.")
    else:
        val_vars = [c for c in df.columns if c.startswith('Target ')]
        if not val_vars:
            val_vars = [c for c in df.columns if c.startswith('Gene ')]
            
        df_melted = df[df['gene'].isin(selected_genes)].melt(
            id_vars=['gene', 'stage'], 
            value_vars=val_vars, 
            var_name='Target',
            value_name='expression'
        ).dropna(subset=['expression'])
        
        df_melted['Target_ID'] = df_melted['Target'].str.replace('Target ', '').str.replace('Gene ', '')
        
        # Apply filters
        df_melted = df_melted[df_melted['stage'].isin(selected_stages)]
        df_melted = df_melted[df_melted['expression'] >= min_exp]
        
        stage_order = [s for s in ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult'] if s in selected_stages]
        
        if df_melted.empty:
            st.warning("No data matches the current filters.")
        else:
            # Calculate global y-axis range to ensure all plots share the same scale
            y_min, y_max = df_melted['expression'].min(), df_melted['expression'].max()
            padding = (y_max - y_min) * 0.05 if y_max > y_min else 0.1
            global_y_range = [y_min - padding, y_max + padding]
            
            # Adding new graphs instead of growing vertically
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
                        'Target_ID': True,
                        'Target': False
                    },
                    height=350,
                    template="plotly_white"
                )
                
                fig.update_traces(jitter=1.0, marker=dict(size=6, color='#57068c'))
                fig.update_layout(
                    showlegend=False, 
                    yaxis=dict(range=global_y_range, title="Expression"),
                    xaxis=dict(title="Stage"),
                    hoverlabel=dict(font_size=18)
                )
                
                st.plotly_chart(fig, use_container_width=True)
