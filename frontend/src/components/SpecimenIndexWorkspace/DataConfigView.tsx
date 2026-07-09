import { useAppStore } from '../../store/useAppStore';
import { CheckCircle } from 'lucide-react';

interface DataConfigViewProps {
  isEmbedded?: boolean;
}

export function DataConfigView({ isEmbedded = false }: DataConfigViewProps) {
  const { allGenesList, cellsList, stagesList } = useAppStore();
  return (
    <div style={{ maxWidth: isEmbedded ? 'none' : '850px', margin: isEmbedded ? '0' : '0 auto', width: '100%' }}>
      <div className="card">
        <h2>Static Database Dimensions</h2>
        <p style={{ marginBottom: '1.25rem' }}>
          Database matrices cached in-memory.
        </p>
        
        <div className="alert alert-success" style={{ padding: '0.75rem' }}>
          <CheckCircle className="alert-success-icon" size={16} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            STATUS: static indices loaded.
          </div>
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: isEmbedded ? '1fr' : '1fr 1fr 1fr' }}>
          <div className="stat-card">
            <span className="stat-value">{allGenesList.length}</span>
            <span className="stat-label">GENES_PARSED</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{cellsList.length}</span>
            <span className="stat-label">CELL_CLUSTERS</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stagesList.length}</span>
            <span className="stat-label">STAGES_BOUNDED</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DataConfigView;
