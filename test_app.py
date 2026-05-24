import os
import pandas as pd
import pytest
from streamlit.testing.v1 import AppTest
from process_excel import process_files

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
    
    # Assertions
    assert 'gene' in res.columns
    assert 'Target 101' in res.columns
    assert 'Target 102' in res.columns
    assert 'stage' in res.columns
    
    # 'ab' processed from 2 files, each has 2 stages -> 4 rows total
    assert len(res) == 4
    
    first_row = res.iloc[0]
    assert first_row['gene'] == 'ab'
    assert first_row['stage'] == 'P15'
    assert first_row['Target 101'] == 0.5

def test_streamlit_app(tmp_path):
    # Setup dummy excel
    file1 = tmp_path / "test_data.xlsx"
    df = pd.DataFrame([
        [float('nan'), float('nan'), float('nan'), float('nan')],
        ['Log', 0, 101.0, 102.0],
        ['P15', 'ab', 0.5, 0.6],
        ['Adult', 'ab', 0.1, 0.2]
    ])
    with pd.ExcelWriter(file1) as writer:
        df.to_excel(writer, sheet_name='ab', header=False, index=False)
        
    at = AppTest.from_file("app.py", default_timeout=30).run()
    
    # Assert UI loads
    assert not at.exception
    assert "Configuration" in at.sidebar.header[0].value
    
    # Test rebuilding dataset
    at.text_input[0].set_value(str(file1))
    at.text_input[1].set_value(str(file1))
    at.button[0].click().run()
    
    # Assert rebuild success
    assert any("Dataset rebuilt successfully!" in s.value for s in at.success)
    
    # The multiselect should now contain 'ab'
    assert 'ab' in at.multiselect[0].options
