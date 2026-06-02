import pandas as pd
import os

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

def process_root_file(root_filepath, output_csv):
    print(f"Reading {root_filepath}...")
    xl = pd.ExcelFile(root_filepath)
    
    stages = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult']
    sheet_suffix = "_average_expression"
    
    all_dfs = []
    
    for stage in stages:
        sheet_name = f"{stage}{sheet_suffix}"
        print(f"Processing sheet {sheet_name}...")
        df = xl.parse(sheet_name)
        
        # The first column contains gene names
        df = df.rename(columns={df.columns[0]: 'gene'})
        # Assign stage column (avoids DataFrame fragmentation warning)
        df = df.assign(stage=stage)
        all_dfs.append(df)
        
    print("Concatenating dataframes...")
    combined_df = pd.concat(all_dfs, ignore_index=True)
    
    # We want columns to be: gene, stage, Target 1, Target 3, etc.
    cols = list(combined_df.columns)
    cols.remove('gene')
    cols.remove('stage')
    
    target_rename = {}
    target_cols_sorted = []
    for c in cols:
        try:
            val_str = str(c).replace('.0', '').strip()
            new_name = f"Target {val_str}"
            target_rename[c] = new_name
            target_cols_sorted.append((int(val_str) if val_str.isdigit() else 9999, new_name))
        except Exception:
            new_name = f"Target {c}"
            target_rename[c] = new_name
            target_cols_sorted.append((9999, new_name))
            
    combined_df = combined_df.rename(columns=target_rename)
    
    # Sort the target columns by their numeric ID
    target_cols_sorted.sort()
    final_target_cols = [name for _, name in target_cols_sorted]
    
    final_cols = ['gene', 'stage'] + final_target_cols
    combined_df = combined_df.reindex(columns=final_cols)
    
    # Save with gzip compression if specified in output filename
    compression = 'gzip' if output_csv.endswith('.gz') else None
    combined_df.to_csv(output_csv, index=False, compression=compression)
    print(f"Saved to {output_csv}")

def parse_cluster_annotations(filepath):
    import re
    if not os.path.exists(filepath):
        return {}
    df = pd.read_excel(filepath)
    mapping = {}
    for _, row in df.iterrows():
        cluster_val = row.get('Cluster number')
        anno_val = row.get('Annotation')
        if pd.isna(cluster_val):
            continue
        anno_str = str(anno_val).strip() if not pd.isna(anno_val) and str(anno_val).strip() != '' else 'Unknown'
        # Extract all integer IDs
        ids = [int(x) for x in re.findall(r'\d+', str(cluster_val))]
        for cid in ids:
            if cid not in mapping or (mapping[cid] == 'Unknown' and anno_str != 'Unknown'):
                mapping[cid] = anno_str
    return mapping


def process_mm_file(mm_filepath, output_csv):
    print(f"Reading MM file {mm_filepath}...")
    xl = pd.ExcelFile(mm_filepath)
    stages = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult']
    
    all_dfs = []
    for stage in stages:
        sheet_name = f"{stage}_MM_final"
        print(f"Processing sheet {sheet_name}...")
        df = xl.parse(sheet_name)
        df = df.rename(columns={df.columns[0]: 'gene'})
        df = df.assign(stage=stage)
        all_dfs.append(df)
        
    print("Concatenating MM dataframes...")
    combined_df = pd.concat(all_dfs, ignore_index=True)
    
    # Rename Target columns
    cols = list(combined_df.columns)
    cols.remove('gene')
    cols.remove('stage')
    
    target_rename = {}
    target_cols_sorted = []
    for c in cols:
        try:
            val_str = str(c).replace('.0', '').strip()
            new_name = f"Target {val_str}"
            target_rename[c] = new_name
            target_cols_sorted.append((int(val_str) if val_str.isdigit() else 9999, new_name))
        except Exception:
            new_name = f"Target {c}"
            target_rename[c] = new_name
            target_cols_sorted.append((9999, new_name))
            
    combined_df = combined_df.rename(columns=target_rename)
    target_cols_sorted.sort()
    final_target_cols = [name for _, name in target_cols_sorted]
    
    final_cols = ['gene', 'stage'] + final_target_cols
    combined_df = combined_df.reindex(columns=final_cols)
    
    compression = 'gzip' if output_csv.endswith('.gz') else None
    combined_df.to_csv(output_csv, index=False, compression=compression)
    print(f"Saved MM to {output_csv}")

if __name__ == "__main__":
    file1 = 'data/flybase TF expression list_A-E.xlsx'
    file2 = 'data/flybase_TF_expression_list_F-Z.xlsx'
    output = 'combined_expression.csv'
    process_files(file1, file2, output)



