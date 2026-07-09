import os
import sys

# Add src folder (parent of scripts/) to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.dataset import process_root_file, process_mm_file

if __name__ == "__main__":
    data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../data'))
    root_file = os.path.join(data_dir, 'log_normalized_average_expression_all_stages 1.xlsx')
    output = os.path.join(data_dir, 'combined_expression_all.csv.gz')
    process_root_file(root_file, output)
    
    mm_file = os.path.join(data_dir, 'Mixture_modelling_all_stages 1.xlsx')
    if os.path.exists(mm_file):
        process_mm_file(mm_file, os.path.join(data_dir, 'combined_mixture_modelling.csv.gz'))



