import numpy as np
import pandas as pd
from scipy.special import digamma
from scipy.spatial import cKDTree
from scipy.stats import rankdata
from typing import List, Dict, Callable, Optional, Union

def calculate_ksg_mi(x: np.ndarray, y: np.ndarray, k: int = 3) -> float:
    """
    KSG Mutual Information estimation.
    """
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

def compute_coexpression_groups(
    ref_gene: str,
    df: pd.DataFrame,
    metric: str = "Pearson",
    progress_callback: Optional[Callable[[float, str], None]] = None
) -> List[Dict]:
    """
    Computes co-expression scores against ref_gene.
    Supports metrics: "Pearson", "Spearman", "Jaccard".
    If metric is "Jaccard", df is expected to be the mixture modeling dataframe.
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
    
    if metric == "Jaccard":
        # Binarize mixture modeling probabilities (values >= 0.5 are active / On)
        M = (data_matrix >= 0.5).astype(float)
        v = (ref_sub_vector >= 0.5).astype(float)
        
        intersection = M @ v
        sum_M = np.sum(M, axis=1)
        sum_v = np.sum(v)
        union = sum_M + sum_v - intersection
        
        jaccards = np.zeros(len(union))
        valid = union > 0
        jaccards[valid] = intersection[valid] / union[valid]
        
        results = []
        for g, score in zip(gene_names, jaccards):
            results.append({
                'gene': g,
                'jaccard': float(score)
            })
        results.sort(key=lambda x: x['jaccard'], reverse=True)
        return results
        
    elif metric == "Spearman":
        ranked_matrix = rankdata(data_matrix, axis=1)
        ranked_ref = rankdata(ref_sub_vector)
        
        means = np.mean(ranked_matrix, axis=1, keepdims=True)
        stds = np.std(ranked_matrix, axis=1, keepdims=True)
        stds[stds < 1e-9] = 1.0
        centered = (ranked_matrix - means) / stds
        
        ref_mean = np.mean(ranked_ref)
        ref_std = np.std(ranked_ref)
        if ref_std < 1e-9:
            ref_std = 1.0
        ref_centered = (ranked_ref - ref_mean) / ref_std
        
        spearmans = (centered @ ref_centered) / len(ref_sub_vector)
        
        results = []
        for g, r_val in zip(gene_names, spearmans):
            results.append({
                'gene': g,
                'spearman': float(r_val),
                'abs_spearman': abs(float(r_val))
            })
        results.sort(key=lambda x: x['abs_spearman'], reverse=True)
        return results
        
    else:  # Pearson
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
        return results

def build_network(genes: List[str], df: pd.DataFrame, threshold: float = 0.5) -> List[Dict]:
    """
    Computes pairwise Pearson correlations between the list of genes.
    Returns edges: [{'source': gene_a, 'target': gene_b, 'weight': correlation}, ...]
    """
    if len(genes) < 2:
        return []
        
    target_columns = [col for col in df.columns if ' (#' in col]
    if not target_columns:
        target_columns = [col for col in df.columns if col.startswith('Target ') or col.startswith('Gene ')]
        
    # Filter dataset for only specified genes
    df_subset = df[df['gene'].isin(genes)]
    if df_subset.empty:
        return []
        
    # Melt and pivot to construct a profile matrix (genes x (stage_celltype))
    df_melted = df_subset.melt(id_vars=['gene', 'stage'], value_vars=target_columns, var_name='variable', value_name='expression').dropna()
    df_melted['key'] = df_melted['stage'].astype(str) + "_" + df_melted['variable'].astype(str)
    
    pivoted = df_melted.pivot_table(index='gene', columns='key', values='expression', aggfunc='mean')
    if pivoted.shape[1] < 3:
        return []
        
    # Compute correlation matrix
    corr_matrix = pivoted.T.corr(method='pearson')
    
    edges = []
    nodes = list(corr_matrix.index)
    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            g1 = nodes[i]
            g2 = nodes[j]
            weight = corr_matrix.loc[g1, g2]
            if not np.isnan(weight) and abs(weight) >= threshold:
                edges.append({
                    'source': g1,
                    'target': g2,
                    'weight': float(weight)
                })
    return edges
