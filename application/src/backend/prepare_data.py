import os
import json
import gzip
import numpy as np
import pandas as pd
from scipy.stats import rankdata
from backend import dataset

DATA_DIR = dataset.DATA_DIR
PUBLIC_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../frontend/public/data'))

def main():
    print("Starting data compilation for React App...")
    
    # Create target directories
    genes_dir = os.path.join(PUBLIC_DATA_DIR, 'genes')
    cells_dir = os.path.join(PUBLIC_DATA_DIR, 'cells')
    os.makedirs(genes_dir, exist_ok=True)
    os.makedirs(cells_dir, exist_ok=True)
    
    print("Loading datasets...")
    df = dataset.load_expression_data(is_test=False)
    mm_df = dataset.load_mixture_modeling_data(is_test=False)
    
    if df is None:
        print("Error: Main expression dataset not found!")
        return
        
    print(f"Loaded expression data shape: {df.shape}")
    if mm_df is not None:
        print(f"Loaded mixture modeling shape: {mm_df.shape}")
    else:
        print("Warning: Mixture modeling data not loaded. Jaccard co-expression will be skipped.")
        
    # Get lists of unique genes, stages, and cell types
    all_genes = sorted([str(g) for g in df['gene'].dropna().unique() if str(g).strip() and str(g).lower() != 'nan'])
    stages = sorted(df['stage'].unique().tolist())
    cell_cols_expr = [c for c in df.columns if ' (#' in c]
    if not cell_cols_expr:
        cell_cols_expr = [c for c in df.columns if c.startswith('Target ') or c.startswith('Gene ')]
        
    if mm_df is not None:
        cell_cols_mm = [c for c in mm_df.columns if ' (#' in c]
        if not cell_cols_mm:
            cell_cols_mm = [c for c in mm_df.columns if c.startswith('Target ') or c.startswith('Gene ')]
        cell_cols = sorted(list(set(cell_cols_expr).intersection(set(cell_cols_mm))))
    else:
        cell_cols = sorted(cell_cols_expr)
    
    # Save index/meta files
    print("Saving index files...")
    with open(os.path.join(PUBLIC_DATA_DIR, 'gene_list.json'), 'w') as f:
        json.dump(all_genes, f)
        
    with open(os.path.join(PUBLIC_DATA_DIR, 'cell_list.json'), 'w') as f:
        json.dump({
            'stages': stages,
            'cells': cell_cols
        }, f)
        
    # 1. Melt and pivot main expression data to construct matrix (genes x (stage_cell))
    print("Building pivoted expression matrix...")
    melted = df.melt(id_vars=['gene', 'stage'], value_vars=cell_cols, var_name='cell', value_name='expr').dropna()
    melted['stage_cell'] = melted['stage'] + '||' + melted['cell']
    pivoted_expr = melted.pivot(index='gene', columns='stage_cell', values='expr').fillna(0.0)
    
    gene_index_expr = pivoted_expr.index.tolist()
    gene_map_expr = {g: i for i, g in enumerate(gene_index_expr)}
    expr_matrix = pivoted_expr.values
    stage_cell_cols = pivoted_expr.columns.tolist()
    
    # Compute Pearson Correlation
    print("Computing Pearson correlation matrix...")
    # Standardize rows
    expr_means = np.mean(expr_matrix, axis=1, keepdims=True)
    expr_stds = np.std(expr_matrix, axis=1, keepdims=True)
    expr_stds[expr_stds < 1e-9] = 1.0
    expr_matrix_std = (expr_matrix - expr_means) / expr_stds
    pearson_matrix = (expr_matrix_std @ expr_matrix_std.T) / expr_matrix.shape[1]
    
    # Compute Spearman Correlation
    print("Computing Spearman correlation matrix...")
    ranked_matrix = rankdata(expr_matrix, axis=1)
    ranked_means = np.mean(ranked_matrix, axis=1, keepdims=True)
    ranked_stds = np.std(ranked_matrix, axis=1, keepdims=True)
    ranked_stds[ranked_stds < 1e-9] = 1.0
    ranked_matrix_std = (ranked_matrix - ranked_means) / ranked_stds
    spearman_matrix = (ranked_matrix_std @ ranked_matrix_std.T) / expr_matrix.shape[1]
    
    # Compute Jaccard if MM is available
    jaccard_matrix = None
    gene_index_mm = []
    gene_map_mm = {}
    if mm_df is not None:
        print("Building pivoted mixture modeling matrix...")
        melted_mm = mm_df.melt(id_vars=['gene', 'stage'], value_vars=cell_cols, var_name='cell', value_name='prob').dropna()
        melted_mm['stage_cell'] = melted_mm['stage'] + '||' + melted_mm['cell']
        pivoted_mm = melted_mm.pivot(index='gene', columns='stage_cell', values='prob').fillna(0.0)
        
        gene_index_mm = pivoted_mm.index.tolist()
        gene_map_mm = {g: i for i, g in enumerate(gene_index_mm)}
        mm_matrix = pivoted_mm.values
        
        print("Computing Jaccard similarity matrix...")
        # Binarize: active if prob >= 0.5
        B = (mm_matrix >= 0.5).astype(float)
        intersection = B @ B.T
        row_sums = np.sum(B, axis=1, keepdims=True)
        union = row_sums + row_sums.T - intersection
        
        jaccard_matrix = np.zeros_like(intersection)
        valid = union > 0
        jaccard_matrix[valid] = intersection[valid] / union[valid]
        
    # Build a lookup for synonyms from resolver mappings or offline Ensembl
    # (For now, synonyms can be handled by client-side local mapping in search)
    
    print("Pre-computing and compiling individual gene profiles...")
    
    # To extract stage-by-cell matrices quickly
    # We group the main dataframe by gene
    grouped_df = df.groupby('gene')
    grouped_mm = mm_df.groupby('gene') if mm_df is not None else None
    
    for idx, gene in enumerate(all_genes):
        if idx % 1000 == 0:
            print(f"Processed {idx} / {len(all_genes)} genes...")
            
        # 1. Get expression matrix
        gene_expr_grid = {}
        if gene in grouped_df.groups:
            g_df = grouped_df.get_group(gene)
            for _, row in g_df.iterrows():
                stage = row['stage']
                gene_expr_grid[stage] = {c: float(row[c]) for c in cell_cols if not pd.isna(row[c])}
                
        # 2. Get mixture modeling matrix
        gene_mm_grid = {}
        if mm_df is not None and gene in grouped_mm.groups:
            g_mm = grouped_mm.get_group(gene)
            for _, row in g_mm.iterrows():
                stage = row['stage']
                gene_mm_grid[stage] = {c: float(row[c]) for c in cell_cols if not pd.isna(row[c])}
                
        # 3. Get co-expression partners
        coexp_data = {'pearson': [], 'spearman': [], 'jaccard': []}
        
        # Pearson
        if gene in gene_map_expr:
            g_idx = gene_map_expr[gene]
            # Get correlations and sort descending
            pearsons = pearson_matrix[g_idx]
            top_pearson_indices = np.argsort(np.abs(pearsons))[::-1][1:101] # Exclude self
            for p_idx in top_pearson_indices:
                partner_gene = gene_index_expr[p_idx]
                coexp_data['pearson'].append({
                    'gene': partner_gene,
                    'score': float(pearsons[p_idx])
                })
                
            # Spearman
            spearmans = spearman_matrix[g_idx]
            top_spearman_indices = np.argsort(np.abs(spearmans))[::-1][1:101]
            for s_idx in top_spearman_indices:
                partner_gene = gene_index_expr[s_idx]
                coexp_data['spearman'].append({
                    'gene': partner_gene,
                    'score': float(spearmans[s_idx])
                })
                
        # Jaccard
        if jaccard_matrix is not None and gene in gene_map_mm:
            g_idx = gene_map_mm[gene]
            jaccards = jaccard_matrix[g_idx]
            top_jaccard_indices = np.argsort(jaccards)[::-1][1:101]
            for j_idx in top_jaccard_indices:
                partner_gene = gene_index_mm[j_idx]
                # Only include partners with non-zero Jaccard
                if jaccards[j_idx] > 0:
                    coexp_data['jaccard'].append({
                        'gene': partner_gene,
                        'score': float(jaccards[j_idx])
                    })
                    
        # Write gene JSON file
        gene_payload = {
            'gene': gene,
            'expression': gene_expr_grid,
            'mixture_modeling': gene_mm_grid,
            'coexpression': coexp_data
        }
        with open(os.path.join(genes_dir, f"{gene}.json"), 'w') as gf:
            json.dump(gene_payload, gf)
            
    # 4. Compile cell type lists for fast cell-centric loading
    print("Compiling cell-centric dataset...")
    # For each cell cluster, build a map: stage -> list of genes with expression >= 0.10 or active MM >= 0.5
    for cell in cell_cols:
        cell_payload = {
            'cell': cell,
            'expression': {}
        }
        
        # Load from melted details to construct easily
        cell_melted = melted[melted['cell'] == cell]
        for stage in stages:
            stage_melted = cell_melted[cell_melted['stage'] == stage]
            # Keep genes with expression >= 0.10
            active_expr = stage_melted[stage_melted['expr'] >= 0.10]
            cell_payload['expression'][stage] = {
                row['gene']: float(row['expr']) for _, row in active_expr.iterrows()
            }
            
        with open(os.path.join(cells_dir, f"{cell.replace('/', '_').replace(' ', '_')}.json"), 'w') as cf:
            json.dump(cell_payload, cf)
            
    print("All static data compiled successfully and written to frontend public/data!")

if __name__ == '__main__':
    main()
