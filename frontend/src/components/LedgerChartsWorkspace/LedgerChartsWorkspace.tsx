import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import ExpressionTrendView from './ExpressionTrendView';
import CellCentricView from './CellCentricView';
import { Compass } from 'lucide-react';

export function LedgerChartsWorkspace() {
  const [activeSubTab, setActiveSubTab] = useState<'boxplot' | 'trajectory'>('boxplot');
  
  // Boxplot states
  const [pivotView, setPivotView] = useState(false);
  
  // Trajectory states
  const { cellsList, selectedGenes } = useAppStore();
  const [targetCell, setTargetCell] = useState('');
  const [highlightGenes, setHighlightGenes] = useState<string[]>([]);

  useEffect(() => {
    if (cellsList.length > 0 && !targetCell) {
      setTargetCell(cellsList[0]);
    }
  }, [cellsList, targetCell]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem', alignItems: 'start', width: '100%' }}>
      {/* Left Column: unified plotter controls */}
      <div className="card" style={{ margin: 0, padding: '1.25rem' }}>
        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
          <Compass size={14} style={{ color: 'var(--text-primary)' }} /> PLOTTER_CALIBRATION
        </h3>

        <div className="toggle-group" style={{ marginBottom: '1.25rem' }}>
          <button 
            className={`toggle-group-btn ${activeSubTab === 'boxplot' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('boxplot')}
          >
            Boxplot Ledger
          </button>
          <button 
            className={`toggle-group-btn ${activeSubTab === 'trajectory' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('trajectory')}
          >
            Trajectory Splines
          </button>
        </div>

        {activeSubTab === 'boxplot' ? (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-checkbox-label">
              <input type="checkbox" checked={pivotView} onChange={(e) => setPivotView(e.target.checked)} />
              <span>Pivot View: Group by Cell Type</span>
            </label>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Target Cell Register</label>
              <select 
                className="form-select" 
                value={targetCell}
                onChange={(e) => setTargetCell(e.target.value)}
              >
                {cellsList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Specimen Highlights</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '3px', padding: '0.5rem', backgroundColor: 'var(--bg-tertiary)' }}>
                {selectedGenes.map(gene => {
                  const active = highlightGenes.includes(gene);
                  return (
                    <span 
                      key={gene}
                      className={`stage-badge ${active ? 'selected' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        if (active) {
                          setHighlightGenes(highlightGenes.filter(g => g !== gene));
                        } else {
                          setHighlightGenes([...highlightGenes, gene]);
                        }
                      }}
                    >
                      {gene}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: main plotter card */}
      <div style={{ minWidth: 0 }}>
        {activeSubTab === 'boxplot' ? (
          <ExpressionTrendView isEmbedded={true} pivotView={pivotView} setPivotView={setPivotView} />
        ) : (
          <CellCentricView 
            isEmbedded={true}
            targetCell={targetCell} 
            setTargetCell={setTargetCell} 
            highlightGenes={highlightGenes} 
            setHighlightGenes={setHighlightGenes} 
          />
        )}
      </div>
    </div>
  );
}

export default LedgerChartsWorkspace;
