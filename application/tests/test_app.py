import os
import pandas as pd
import pytest
from unittest.mock import patch
from streamlit.testing.v1 import AppTest
from backend.dataset import process_files, parse_cluster_annotations

@pytest.fixture(autouse=True)
def dummy_cluster_annotations():
    filepath = "application/src/data/Cluster annotation.xlsx"
    existed = os.path.exists(filepath)
    if existed:
        os.rename(filepath, filepath + ".bak")
        
    df = pd.DataFrame({
        "Cluster number": ["9", "149", "217/216, 189 (adult)"],
        "Annotation": ["Dm4", "LC22", "PCG"]
    })
    df.to_excel(filepath, index=False)
    
    yield
    
    if os.path.exists(filepath):
        os.remove(filepath)
    if existed:
        os.rename(filepath + ".bak", filepath)

def test_process_files_logic(tmp_path):
    # Setup dummy excel
    file1 = tmp_path / "test_data.xlsx"
    out_csv = tmp_path / "test_out.csv"
    
    df = pd.DataFrame([
        [float('nan'), float('nan'), float('nan'), float('nan')],
        ['Log', 0, 101.0, 102.0],
        ['P15', 'ab', 0.5, 0.6],
        ['Adult', 'ab', 0.1, 0.2]
    ])
    
    with pd.ExcelWriter(file1) as writer:
        df.to_excel(writer, sheet_name='ab', header=False, index=False)
        
    process_files(str(file1), str(file1), str(out_csv))
    res = pd.read_csv(out_csv)
    
    assert 'gene' in res.columns
    assert 'Target 101' in res.columns
    assert 'Target 102' in res.columns
    assert 'stage' in res.columns
    assert len(res) == 4
    
    first_row = res.iloc[0]
    assert first_row['gene'] == 'ab'
    assert first_row['stage'] == 'P15'
    assert first_row['Target 101'] == 0.5

def test_parse_cluster_annotations():
    anno_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../src/data/Cluster annotation.xlsx'))
    mapping = parse_cluster_annotations(anno_path)
    assert mapping[9] == "Dm4"
    assert mapping[149] == "LC22"
    assert mapping[217] == "PCG"
    assert mapping[216] == "PCG"
    assert mapping[189] == "PCG"

class MockResponse:
    def __init__(self, json_data, status_code):
        self.json_data = json_data
        self.status_code = status_code
    def json(self):
        return self.json_data

def mock_requests_get(url, *args, **kwargs):
    from urllib.parse import urlparse
    parsed_url = urlparse(url)
    path_parts = parsed_url.path.strip('/').split('/')
    last_part = path_parts[-1] if path_parts else ''
    
    if "xrefs/symbol" in url:
        symbol = last_part
        if symbol == "obsolete_achi":
            return MockResponse([{"id": "FBgn0033749", "type": "gene"}], 200)
        elif symbol == "ambiguous_sym":
            return MockResponse([
                {"id": "FBgn0033749", "type": "gene"},
                {"id": "FBgn0000015", "type": "gene"}
            ], 200)
        else:
            return MockResponse([], 200)
    elif "lookup/id" in url:
        gid = last_part
        if gid == "FBgn0033749":
            return MockResponse({"display_name": "achi"}, 200)
        elif gid == "FBgn0000015":
            return MockResponse({"display_name": "Abd-B"}, 200)
        else:
            return MockResponse({}, 404)
    elif "lookup/symbol" in url:
        return MockResponse({"id": "FBgn0000015", "display_name": "Abd-B"}, 200)
    return MockResponse({}, 404)


def test_streamlit_app_and_resolution(tmp_path):
    # Setup dummy excel representing expression data (has ab, achi, abd-b)
    dummy_csv = "application/src/data/combined_expression.csv"
    existed_csv = os.path.exists(dummy_csv)
    if existed_csv:
        os.rename(dummy_csv, dummy_csv + ".bak")
        
    df = pd.DataFrame([
        ['gene', 'stage', 'Target 9', 'Target 149'],
        ['ab', 'P15', 0.5, 0.6],
        ['achi', 'P15', 0.3, 0.4],
        ['abd-b', 'P15', 0.1, 0.2]
    ])
    df.to_csv(dummy_csv, header=False, index=False)
    
    import requests
    original_get = requests.get
    requests.get = mock_requests_get
    
    try:
        import streamlit as st
        st.cache_data.clear()

        
        # Run AppTest
        at = AppTest.from_file("application/src/app.py", default_timeout=30).run()
        
        # Verify UI loads and maps columns using cluster annotation mapping
        assert not at.exception
        # Mapped column header should be "Dm4 (#9)" instead of "Target 9"
        # and "LC22 (#149)" instead of "Target 149"
        assert 'ab' in at.multiselect[0].options
        assert 'achi' in at.multiselect[0].options
        
        # Test manual selection update
        at.multiselect[0].select('ab').run()
        
        # Toggle selection mode to "Paste Bulk Gene Set"
        # Element 0 in radio is Gene Selection Mode now
        at.radio[0].set_value("Paste Bulk Gene Set").run()
        assert not at.exception
        
        # Paste symbols: ab, obsolete_achi (resolves to achi), unknown_sym (unresolved)
        # Element 0 in text_area is the bulk paste area
        at.text_area[0].set_value("ab, obsolete_achi, unknown_sym").run()
        assert not at.exception
        
        # Check resolved status caption / text
        # The text area should resolve "ab" (direct) and "obsolete_achi" (mocked xref resolution to "achi")
        # and warn on "unknown_sym"

        assert any("Resolved 2 valid gene(s) in dataset." in c.value for c in at.caption)
        assert any("unknown_sym" in s.value for s in at.error)
        
        # Test Predefined Gene Groups rendering
        at.radio[0].set_value("Predefined Gene Groups").run()
        assert not at.exception
        assert any("Select Predefined Group:" in label.label for label in at.selectbox)
        
        # Test Generate Group from Cell Type rendering and execution
        at.radio[0].set_value("Generate Group from Cell Type").run()
        assert not at.exception
        assert any("Select Target Cell:" in label.label for label in at.selectbox)
        
        # Select "Expression Threshold" criterion and set threshold
        # st.radio("Criterion:", ...) is now the 2nd radio (index 1)
        assert len(at.radio) > 1
        at.radio[1].set_value("Expression Threshold").run()
        at.number_input[1].set_value(0.4).run()
        
        # Click button
        generate_btn = [b for b in at.button if b.label == "Generate and Apply"][0]
        generate_btn.click().run()
        assert not at.exception
        
        
    finally:
        requests.get = original_get
        if os.path.exists(dummy_csv):
            os.remove(dummy_csv)
        if existed_csv:
            os.rename(dummy_csv + ".bak", dummy_csv)


def test_coexpression_logic():
    from backend.coexpression import calculate_ksg_mi, compute_coexpression_groups
    import numpy as np
    
    # Test KSG Mutual Information with linear dependent vectors
    x = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0])
    y = np.array([2.0, 4.0, 6.0, 8.0, 10.0, 12.0])
    mi = calculate_ksg_mi(x, y)
    assert mi >= 0.0
    
    # Test compute_coexpression_groups logic
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
    df = df.rename(columns={'Target 9': 'Dm4 (#9)', 'Target 149': 'LC22 (#149)'})
    
    results = compute_coexpression_groups('ab', df, metric="Pearson")
    assert len(results) > 0
    achi_res = [r for r in results if r['gene'] == 'achi'][0]
    assert abs(achi_res['pearson'] - 1.0) < 1e-5
    
    # Test Spearman co-expression
    results_spearman = compute_coexpression_groups('ab', df, metric="Spearman")
    assert len(results_spearman) > 0
    achi_spearman = [r for r in results_spearman if r['gene'] == 'achi'][0]
    assert abs(achi_spearman['spearman'] - 1.0) < 1e-5
    
    # Test Jaccard active-state similarity
    results_jaccard = compute_coexpression_groups('ab', df, metric="Jaccard")
    assert len(results_jaccard) > 0
    assert 'jaccard' in results_jaccard[0]


