import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import CoexpDashboardView from './CoexpDashboardView';
import CoexpAggregateView from './CoexpAggregateView';
import CoexpModuleBrowser from './CoexpModuleBrowser';
import { Compass } from 'lucide-react';
import { WorkspaceLayout } from '../shared/WorkspaceLayout';

export function CoexpWorkbenchWorkspace() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'aggregate' | 'modules'>('dashboard');

  const { 
    allGenesList, 
    dashRefGene, 
    setDashRefGene, 
    dashMetric, 
    setDashMetric, 
    geneCache,
    addGenesToSelection,
    selectedGenes,
  } = useAppStore();
  
  const [minScore, setMinScore] = useState(0.5);

  useEffect(() => {
    setMinScore(dashMetric === 'jaccard' ? 0.3 : 0.5);
  }, [dashMetric]);

  const refData = geneCache[dashRefGene];
  const results = useMemo(() => {
    if (!refData) return [];
    const rawList = refData.coexpression[dashMetric] || [];
    return rawList.filter(r => Math.abs(r.score) >= minScore);
  }, [refData, dashMetric, minScore]);

  return (
    <WorkspaceLayout
      title="MODULE_CONSOLE"
      icon={<Compass size={14} />}
      controls={
        <>
          <div className="toggle-group" style={{ marginBottom: '1.25rem' }}>
            <button 
              className={`toggle-group-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >Pairwise Scatter</button>
            <button 
              className={`toggle-group-btn ${activeTab === 'aggregate' ? 'active' : ''}`}
              onClick={() => setActiveTab('aggregate')}
            >Cohort Aggregate</button>
            <button 
              className={`toggle-group-btn ${activeTab === 'modules' ? 'active' : ''}`}
              onClick={() => setActiveTab('modules')}
            >Module Browser</button>
          </div>

          {activeTab === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Reference Gene</label>
                <select className="form-select" value={dashRefGene} onChange={(e) => setDashRefGene(e.target.value)}>
                  {allGenesList.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Metric</label>
                <select className="form-select" value={dashMetric} onChange={(e) => setDashMetric(e.target.value as any)}>
                  <option value="pearson">Pearson</option>
                  <option value="spearman">Spearman</option>
                  <option value="jaccard">Jaccard</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Min Score ({minScore.toFixed(2)})</label>
                <input type="range" min="0" max="1" step="0.05" value={minScore}
                  onChange={e => setMinScore(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--primary)' }} />
              </div>
              {results.length > 0 && (
                <button className="btn btn-secondary" style={{ width: '100%', padding: '0.45rem', fontSize: '0.75rem', boxShadow: 'none' }}
                  onClick={() => { addGenesToSelection(results.slice(0, 20).map(r => r.gene)); }}>
                  Add Top 20 to Cohort
                </button>
              )}
            </div>
          )}

          {activeTab === 'aggregate' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Metric</label>
                <select className="form-select" value={dashMetric} onChange={(e) => setDashMetric(e.target.value as any)}>
                  <option value="pearson">Pearson</option>
                  <option value="spearman">Spearman</option>
                  <option value="jaccard">Jaccard</option>
                </select>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', padding: '0.3rem 0' }}>
                Averaging across {selectedGenes.length} cohort genes
              </div>
            </div>
          )}
        </>
      }
    >
      {activeTab === 'dashboard' ? (
        <CoexpDashboardView isEmbedded={true} minScore={minScore} setMinScore={setMinScore} results={results} />
      ) : activeTab === 'aggregate' ? (
        <CoexpAggregateView />
      ) : (
        <CoexpModuleBrowser />
      )}
    </WorkspaceLayout>
  );
}

export default CoexpWorkbenchWorkspace;
