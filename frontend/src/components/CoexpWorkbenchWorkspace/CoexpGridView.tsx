import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { downloadCSV } from '../../utils/csv';
import { Info, Download, Loader } from 'lucide-react';

interface CoexpGridViewProps {
  isEmbedded?: boolean;
  selectedStage?: string;
  setSelectedStage?: (val: string) => void;
  mmThreshold?: number;
  setMmThreshold?: (val: number) => void;
  cellSearch?: string;
  setCellSearch?: (val: string) => void;
}

export function CoexpGridView({
  isEmbedded = false,
  selectedStage,
  setSelectedStage,
  mmThreshold,
  setMmThreshold,
  cellSearch,
  setCellSearch
}: CoexpGridViewProps) {
  const { selectedGenes, cellsList, stagesList, fetchGeneData, geneCache } = useAppStore();
  const [localStage, setLocalStage] = useState('P15');
  const [localThreshold, setLocalThreshold] = useState(0.5);
  const [localSearch, setLocalSearch] = useState('');
  
  const activeStage = selectedStage !== undefined ? selectedStage : localStage;
  const activeSetStage = setSelectedStage !== undefined ? setSelectedStage : setLocalStage;
  const activeThreshold = mmThreshold !== undefined ? mmThreshold : localThreshold;
  const activeSetThreshold = setMmThreshold !== undefined ? setMmThreshold : setLocalThreshold;
  const activeSearch = cellSearch !== undefined ? cellSearch : localSearch;
  const activeSetSearch = setCellSearch !== undefined ? setCellSearch : setLocalSearch;

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all(selectedGenes.map(g => fetchGeneData(g)));
      setLoading(false);
    };
    loadAll();
  }, [selectedGenes, fetchGeneData]);

  if (selectedGenes.length === 0) {
    return (
      <div className="alert alert-info">
        <Info className="alert-info-icon" size={16} />
        <div>Please select or paste genes in the <strong>Gene Cohorts</strong> tab first.</div>
      </div>
    );
  }

  const filteredCells = cellsList.filter(c => c.toLowerCase().includes(activeSearch.toLowerCase()));
  const displayedCells = filteredCells.slice(0, 40); // Limit horizontal width for performance

  const handleExportCSV = () => {
    const headers = ['Gene', ...filteredCells];
    let csv = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';
    
    selectedGenes.forEach(gene => {
      const data = geneCache[gene];
      const mmVals = data?.mixture_modeling?.[activeStage] || {};
      const row = [gene];
      filteredCells.forEach(cell => {
        const prob = mmVals[cell];
        const isOn = prob !== undefined && prob >= activeThreshold;
        row.push(isOn ? 'Active' : 'Inactive');
      });
      csv += row.join(',') + '\n';
    });
    downloadCSV(`coexpression_grid_${activeStage}_threshold_${activeThreshold}.csv`, csv);
  };

  return (
    <div style={{ width: '100%' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 style={{ margin: 0 }}>Co-expression Matrix (Mixture Modeling)</h3>
          <button className="btn btn-secondary" onClick={handleExportCSV}>
            <Download size={12} /> EXPORT_CSV
          </button>
        </div>

        {!isEmbedded && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label">Development Stage</label>
              <select className="form-select" value={activeStage} onChange={(e) => activeSetStage(e.target.value)}>
                {stagesList.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Active Threshold ({activeThreshold.toFixed(2)})</label>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05" 
                value={activeThreshold}
                onChange={(e) => activeSetThreshold(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--primary)' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Filter Cells by Name</label>
              <input 
                type="text" 
                className="form-input" 
                value={activeSearch} 
                onChange={(e) => activeSetSearch(e.target.value)}
                placeholder="Search cell name (e.g. Dm4)..."
              />
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Loader className="animate-spin" size={32} color="var(--text-primary)" /></div>
        ) : (
          <div>
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Gene</th>
                    {displayedCells.map(c => <th key={c} style={{ fontSize: '0.72rem' }}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {selectedGenes.map(gene => {
                    const data = geneCache[gene];
                    const mmVals = data?.mixture_modeling?.[activeStage] || {};
                    
                    return (
                      <tr key={gene}>
                        <td style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{gene}</td>
                        {displayedCells.map(cell => {
                          const prob = mmVals[cell];
                          const isOn = prob !== undefined && prob >= activeThreshold;
                          return (
                            <td 
                              key={cell} 
                              className={`matrix-cell ${isOn ? 'on' : 'off'}`}
                            >
                              {isOn ? 'Active' : 'Off'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredCells.length > 40 && (
              <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Showing first 40 of {filteredCells.length} cells. Use the filter search box above to narrow down results.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CoexpGridView;
