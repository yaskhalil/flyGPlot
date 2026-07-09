interface ReadmeViewProps {
  isEmbedded?: boolean;
}

export function ReadmeView({ isEmbedded = false }: ReadmeViewProps) {
  return (
    <div style={{ maxWidth: isEmbedded ? 'none' : '850px', margin: isEmbedded ? '0' : '0 auto', width: '100%' }}>
      <div className="card" style={{ padding: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>Fly Gene Explorer</h1>
        <p style={{ marginTop: '0.75rem', fontSize: '1rem', color: 'var(--text-primary)', fontStyle: 'italic' }}>
          Drosophila melanogaster transcriptomics database.
        </p>
      </div>

      <div className="card">
        <h2>Mathematical Formulations</h2>
        <p style={{ marginBottom: '1.25rem' }}>
          Calculations are computed statically across cell populations:
        </p>
        
        <div className="method-grid" style={{ gridTemplateColumns: isEmbedded ? '1fr' : '1fr 1fr 1fr' }}>
          <div className="method-card">
            <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, margin: 0 }}>Pearson (r)</h3>
            <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Linear association strength.
            </p>
          </div>
          
          <div className="method-card">
            <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, margin: 0 }}>Spearman (ρ)</h3>
            <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Rank orders correlation.
            </p>
          </div>
          
          <div className="method-card">
            <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, margin: 0 }}>Jaccard (J)</h3>
            <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Active-state overlap.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
export default ReadmeView;
