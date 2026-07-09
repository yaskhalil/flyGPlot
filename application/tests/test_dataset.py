import os
import pytest
import pandas as pd
from backend.dataset import parse_cluster_annotations, load_expression_data, load_mixture_modeling_data

def test_parse_cluster_annotations_invalid_path():
    assert parse_cluster_annotations("non_existent_file.xlsx") == {}

def test_load_expression_data_non_existent():
    from unittest.mock import patch
    with patch("os.path.exists", return_value=False):
        assert load_expression_data(is_test=True) is None

def test_load_expression_data_success():
    # Setup dummy data in data/combined_expression.csv
    dummy_csv = "application/src/data/combined_expression.csv"
    dummy_xlsx = "application/src/data/Cluster annotation.xlsx"
    
    existed_csv = os.path.exists(dummy_csv)
    if existed_csv:
        os.rename(dummy_csv, dummy_csv + ".bak")
        
    existed_xlsx = os.path.exists(dummy_xlsx)
    if existed_xlsx:
        os.rename(dummy_xlsx, dummy_xlsx + ".bak")
        
    try:
        # Create dummy expression csv
        df_expr = pd.DataFrame([
            ['gene', 'stage', 'Target 9', 'Target 149'],
            ['ab', 'P15', 0.5, 0.6],
            ['achi', 'P15', 0.3, 0.4]
        ])
        df_expr.to_csv(dummy_csv, header=False, index=False)
        
        # Create dummy cluster annotations
        df_anno = pd.DataFrame({
            "Cluster number": ["9", "149"],
            "Annotation": ["Dm4", "LC22"]
        })
        df_anno.to_excel(dummy_xlsx, index=False)
        
        # Test loading
        df = load_expression_data(is_test=True)
        assert df is not None
        assert 'gene' in df.columns
        assert 'stage' in df.columns
        assert 'Dm4 (#9)' in df.columns
        assert 'LC22 (#149)' in df.columns
        assert df.loc[0, 'Dm4 (#9)'] == 0.5
        
        # Test mixture modeling loading
        df_mm = load_mixture_modeling_data(is_test=True)
        assert df_mm is not None
        assert 'Dm4 (#9)' in df_mm.columns
        
    finally:
        if os.path.exists(dummy_csv):
            os.remove(dummy_csv)
        if existed_csv:
            os.rename(dummy_csv + ".bak", dummy_csv)
            
        if os.path.exists(dummy_xlsx):
            os.remove(dummy_xlsx)
        if existed_xlsx:
            os.rename(dummy_xlsx + ".bak", dummy_xlsx)
