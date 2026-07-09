import pytest
import numpy as np
import pandas as pd
from backend.coexpression import calculate_ksg_mi, compute_coexpression_groups, build_network

def test_calculate_ksg_mi():
    x = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0])
    y = np.array([2.0, 4.0, 6.0, 8.0, 10.0, 12.0])
    mi = calculate_ksg_mi(x, y)
    assert mi >= 0.0

def test_compute_coexpression_groups_pearson():
    df = pd.DataFrame([
        ['gene', 'stage', 'Target 9', 'Target 149'],
        ['ab', 'P15', 1.0, 2.0],
        ['ab', 'P30', 3.0, 4.0],
        ['ab', 'P40', 5.0, 6.0],
        ['achi', 'P15', 2.0, 4.0],
        ['achi', 'P30', 6.0, 8.0],
        ['achi', 'P40', 10.0, 12.0],
        ['abd-b', 'P15', 1.0, 0.0],
        ['abd-b', 'P30', 0.0, 1.0],
        ['abd-b', 'P40', 0.5, 0.5]
    ])
    df.columns = df.iloc[0]
    df = df[1:].copy()
    for col in ['Target 9', 'Target 149']:
        df[col] = pd.to_numeric(df[col])
    
    results = compute_coexpression_groups('ab', df, metric="Pearson")
    assert len(results) > 0
    achi_res = [r for r in results if r['gene'] == 'achi'][0]
    assert abs(achi_res['pearson'] - 1.0) < 1e-5
    
    results_spearman = compute_coexpression_groups('ab', df, metric="Spearman")
    assert len(results_spearman) > 0
    achi_spearman = [r for r in results_spearman if r['gene'] == 'achi'][0]
    assert abs(achi_spearman['spearman'] - 1.0) < 1e-5

    results_jaccard = compute_coexpression_groups('ab', df, metric="Jaccard")
    assert len(results_jaccard) > 0
    assert 'jaccard' in results_jaccard[0]

def test_build_network():
    df = pd.DataFrame([
        ['gene', 'stage', 'Target 9', 'Target 149'],
        ['ab', 'P15', 1.0, 2.0],
        ['ab', 'P30', 3.0, 4.0],
        ['ab', 'P40', 5.0, 6.0],
        ['achi', 'P15', 2.0, 4.0],
        ['achi', 'P30', 6.0, 8.0],
        ['achi', 'P40', 10.0, 12.0],
        ['abd-b', 'P15', 1.0, 0.0],
        ['abd-b', 'P30', 0.0, 1.0],
        ['abd-b', 'P40', 0.5, 0.5]
    ])
    df.columns = df.iloc[0]
    df = df[1:].copy()
    for col in ['Target 9', 'Target 149']:
        df[col] = pd.to_numeric(df[col])

    # build network with threshold 0.9 for 'ab', 'achi', and 'abd-b'
    edges = build_network(['ab', 'achi', 'abd-b'], df, threshold=0.9)
    
    # 'ab' and 'achi' should be connected because they correlate perfectly (1.0)
    # 'abd-b' should not be connected to them under 0.9 threshold
    assert len(edges) == 1
    edge = edges[0]
    assert set([edge['source'], edge['target']]) == {'ab', 'achi'}
    assert abs(edge['weight'] - 1.0) < 1e-5
