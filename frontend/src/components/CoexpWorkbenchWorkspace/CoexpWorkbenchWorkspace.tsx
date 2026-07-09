import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import CoexpGridView from './CoexpGridView';
import CoexpDashboardView from './CoexpDashboardView';
import { Compass } from 'lucide-react';

export function CoexpWorkbenchWorkspace() {
  const [activeCoexpTab, setActiveCoexpTab] = useState<'matrix' | 'dashboard'>('matrix');

  // Matrix states
  const { stagesList } = useAppStore();
  const [selectedStage, setSelectedStage] = useState('P15');
  const [mmThreshold, setMmThreshold] = useState(0.5);
  const [cellSearch, setCellSearch] = useState('');

  // Dashboard states
  const { 
    allGenesList, 
    dashRefGene, 
    setDashRefGene, 
    dashMetric, 
    setDashMetric, 
    selectedPartnerGene, 
    setSelectedPartnerGene,
    geneCache,
    addGenesToSelection
  } = useAppStore();
  
  const [minScore, setMinScore] = useState(0.5);

  useEffect(() => {
    if (dashMetric === 'jaccard') {
      setMinScore(0.3);
    } else {
      setMinScore(0.5);
    }
  }, [dashMetric]);

  const refData = geneCache[dashRefGene];
  const results = useMemo(() => {
    if (!refData) return [];
    const rawList = refData.coexpression[dashMetric] || [];
    return rawList.filter(r => Math.abs(r.score) >= minScore);
  }, [refData, dashMetric, minScore]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem', alignItems: 'start', width: '100%' }}>
      {/* Left Column: unified co-expression controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
        <div className="card" style={{ margin: 0, padding: '1.25rem' }}>
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            <Compass size={14} style={{ color: 'var(--text-primary)' }} /> CORRELATION_CONSOLE
          </h3>

          <div className="toggle-group" style={{ marginBottom: '1.25rem' }}>
            <button 
              className={`toggle-group-btn ${activeCoexpTab === 'matrix' ? 'active' : ''}`}
              onClick={() => setActiveCoexpTab('matrix')}
            >
              Heatmap Matrix
            </button>
            <button 
              className={`toggle-group-btn ${activeCoexpTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveCoexpTab('dashboard')}
            >
              Scatter Dashboard
            </button>
          </div>

          {activeCoexpTab === 'matrix' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">specimen_stage</label>
                <select className="form-select" value={selectedStage} onChange={(e) => setSelectedStage(e.target.value)}>
                  {stagesList.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Mixture Prob Cutoff ({mmThreshold.toFixed(2)})</label>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.05" 
                  value={mmThreshold}
                  onChange={(e) => setMmThreshold(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--primary)' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Search Cell Type</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Filter cell names..." 
                  value={cellSearch}
                  onChange={(e) => setCellSearch(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Reference Gene</label>
                <select 
                  className="form-select" 
                  value={dashRefGene} 
                  onChange={(e) => setDashRefGene(e.target.value)}
                  style={{ padding: '0.45rem 0.65rem' }}
                >
                  {allGenesList.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Co-expression Metric</label>
                <select 
                  className="form-select" 
                  value={dashMetric} 
                  onChange={(e) => setDashMetric(e.target.value as any)}
                  style={{ padding: '0.45rem 0.65rem' }}
                >
                  <option value="pearson">Pearson Coefficient</option>
                  <option value="spearman">Spearman Rank</option>
                  <option value="jaccard">Jaccard Similarity</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  {dashMetric === 'jaccard' ? 'Min Jaccard' : 'Min Abs. Score'} ({minScore.toFixed(2)})
                </label>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.05" 
                  value={minScore}
                  onChange={(e) => setMinScore(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--primary)' }}
                />
              </div>

              {results.length > 0 && (
                <button 
                  className="btn btn-secondary" 
                  style={{ width: '100%', padding: '0.45rem', fontSize: '0.75rem', boxShadow: 'none' }}
                  onClick={() => {
                    const top20 = results.slice(0, 20).map(r => r.gene);
                    addGenesToSelection(top20);
                  }}
                >
                  Add Top 20 to Active Cohort
                </button>
              )}
            </div>
          )}
        </div>

        {activeCoexpTab === 'dashboard' && (
          <div className="card" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '1.25rem', margin: 0 }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.25rem', fontFamily: 'var(--font-mono)' }}>SEARCH_RESULTS ({results.length})</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontStyle: 'italic' }}>
              Select a row to mount visual comparison.
            </p>
            <div className="data-table-container" style={{ flexGrow: 1, overflowY: 'auto', maxHeight: '300px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Gene</th>
                    <th>{dashMetric === 'jaccard' ? 'Jaccard' : 'Score'}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(r => (
                    <tr 
                      key={r.gene} 
                      className={selectedPartnerGene === r.gene ? 'selected' : ''}
                      onClick={() => setSelectedPartnerGene(r.gene)}
                    >
                      <td style={{ fontWeight: '600' }}>{r.gene}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{r.score.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: main correlation plotter card */}
      <div style={{ minWidth: 0 }}>
        {activeCoexpTab === 'matrix' ? (
          <CoexpGridView 
            isEmbedded={true}
            selectedStage={selectedStage}
            setSelectedStage={setSelectedStage}
            mmThreshold={mmThreshold}
            setMmThreshold={setMmThreshold}
            cellSearch={cellSearch}
            setCellSearch={setCellSearch}
          />
        ) : (
          <CoexpDashboardView 
            isEmbedded={true}
            minScore={minScore}
            setMinScore={setMinScore}
            results={results}
          />
        )}
      </div>
    </div>
  );
}

export default CoexpWorkbenchWorkspace;
