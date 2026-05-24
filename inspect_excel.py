import pandas as pd
import sys

def inspect_excel(filepath):
    print(f"Inspecting {filepath}")
    xl = pd.ExcelFile(filepath)
    print(f"Sheet names (first 10): {xl.sheet_names[:10]}\nTotal sheets: {len(xl.sheet_names)}")
    
    df = xl.parse(xl.sheet_names[0], header=None)
    print(f"\nFirst sheet shape: {df.shape}\nFirst 15 rows of first sheet:\n{df.head(15).to_string()}")

if __name__ == "__main__":
    inspect_excel('data/flybase TF expression list_A-E.xlsx')
