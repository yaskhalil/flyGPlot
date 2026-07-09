import pandas as pd
import sys

def inspect_excel(filepath):
    print(f"Inspecting {filepath}")
    xl = pd.ExcelFile(filepath)
    print(f"Sheet names (first 10): {xl.sheet_names[:10]}\nTotal sheets: {len(xl.sheet_names)}")
    
    df = xl.parse(xl.sheet_names[0], header=None)
    print(f"\nFirst sheet shape: {df.shape}\nFirst 15 rows of first sheet:\n{df.head(15).to_string()}")

import os

if __name__ == "__main__":
    data_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../data/log_normalized_average_expression_all_stages 1.xlsx'))
    inspect_excel(data_path)
