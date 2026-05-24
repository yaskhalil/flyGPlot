import pandas as pd

def process_files(file1, file2, output_csv):
    all_rows = []
    
    for filepath in [file1, file2]:
        print(f"Reading {filepath}...")
        xl = pd.ExcelFile(filepath)
        for sheet in xl.sheet_names:
            df = xl.parse(sheet, header=None)
            
            log_idx = df.index[df[0].astype(str).str.strip() == 'Log'].tolist()
            if not log_idx:
                continue
                
            # Extract target gene IDs from the Log row
            target_ids = df.iloc[log_idx[0], 2:].values
            target_names = [f"Target {str(val).replace('.0', '')}" for val in target_ids]
                
            for idx in range(log_idx[0] + 1, len(df)):
                stage = str(df.iloc[idx, 0]).strip()
                if pd.isna(df.iloc[idx, 0]) or stage == 'nan':
                    break
                
                row = {'gene': sheet, 'stage': stage}
                for i, val in enumerate(df.iloc[idx, 2:].values):
                    # In case data rows have more columns than Log row
                    col_name = target_names[i] if i < len(target_names) else f"Target_Unknown_{i}"
                    row[col_name] = val
                all_rows.append(row)

    df_out = pd.DataFrame(all_rows)
    target_cols = [c for c in df_out.columns if c.startswith('Target ')]
    df_out = df_out[['gene', 'stage'] + target_cols].set_index('gene')
    
    print(f"Final dataframe shape: {df_out.shape}")
    df_out.to_csv(output_csv)
    print(f"Saved to {output_csv}")

if __name__ == "__main__":
    file1 = 'data/flybase TF expression list_A-E.xlsx'
    file2 = 'data/flybase_TF_expression_list_F-Z.xlsx'
    output = 'combined_expression.csv'
    process_files(file1, file2, output)
