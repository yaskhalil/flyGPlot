import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

def create_plot(csv_file, output_image):
    print(f"Loading {csv_file}...")
    df = pd.read_csv(csv_file)
    
    target_genes = ['ab', 'abd-b', 'achi', 'acj6', 'Adf1', 'Aef1']
    plot_genes = [g for g in target_genes if g in df['gene'].unique()]
    print(f"Plotting genes: {plot_genes}")
    
    df_melted = df[df['gene'].isin(plot_genes)].melt(
        id_vars=['gene', 'stage'], 
        value_vars=[c for c in df.columns if c.startswith('Gene ')], 
        value_name='expression'
    ).dropna(subset=['expression'])
    
    stage_order = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult']
    
    fig, axes = plt.subplots(2, 3, figsize=(15, 10))
    for ax, gene in zip(axes.flatten(), plot_genes):
        sns.stripplot(
            data=df_melted[df_melted['gene'] == gene],
            x='stage', y='expression', order=stage_order,
            color='black', alpha=0.5, jitter=True, size=3, ax=ax
        )
        ax.set_title(gene, fontsize=14, fontweight='bold')
        ax.set(xlabel='', ylabel='')
        sns.despine(ax=ax)
        
    plt.tight_layout()
    plt.savefig(output_image, dpi=300)
    print(f"Saved plot to {output_image}")

if __name__ == "__main__":
    create_plot('combined_expression.csv', 'test_plot.png')
