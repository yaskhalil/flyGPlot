import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { resolveBulk } from '../../utils/resolver';
import { 
  Dna, 
  Plus, 
  ChevronRight, 
  Save, 
  FolderOpen, 
  Trash2, 
  CheckCircle, 
  AlertTriangle, 
  Loader 
} from 'lucide-react';

interface GeneSelectionViewProps {
  isEmbedded?: boolean;
}

function SearchIcon(props: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 14} height={props.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  );
}

export function GeneSelectionView({ isEmbedded = false }: GeneSelectionViewProps) {
  const { 
    allGenesList, 
    allGenesMapLower, 
    selectedGenes, 
    setSelectedGenes, 
    customGroups, 
    saveCustomGroup, 
    deleteCustomGroup 
  } = useAppStore();
  
  const [manualInput, setManualInput] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [resolutionResult, setResolutionResult] = useState<{ resolved: string[], unresolved: string[], warnings: string[] } | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'manual' | 'bulk'>('manual');
  const [newGroupName, setNewGroupName] = useState('');

  // Autocomplete matching
  const suggestions = useMemo(() => {
    if (!manualInput.trim()) return [];
    const query = manualInput.toLowerCase();
    return allGenesList
      .filter(g => g.toLowerCase().startsWith(query))
      .slice(0, 10);
  }, [manualInput, allGenesList]);

  // Bulk Resolve using Ensembl REST API synonym lookup
  const handleBulkResolve = async () => {
    if (!bulkInput.trim()) return;
    setIsResolving(true);
    setResolutionResult(null);

    try {
      const result = await resolveBulk(bulkInput, allGenesMapLower);
      setSelectedGenes(result.resolved);
      setResolutionResult(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div style={{ maxWidth: isEmbedded ? 'none' : '1100px', margin: isEmbedded ? '0' : '0 auto', width: '100%' }}>
      <div style={{ display: isEmbedded ? 'flex' : 'grid', flexDirection: isEmbedded ? 'column' : undefined, gridTemplateColumns: isEmbedded ? undefined : '1.2fr 0.8fr', gap: '1.5rem', alignItems: 'start' }}>
        <div className="card" style={{ margin: 0 }}>
          <h2>Gene Specimen Bag</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '1.25rem', fontStyle: 'italic' }}>
            Insert identifiers into manual lookup log sheets or drop batch lists to automatically cross-reference synonyms.
          </p>

          <div className="toggle-group">
            <button 
              className={`toggle-group-btn ${selectionMode === 'manual' ? 'active' : ''}`}
              onClick={() => setSelectionMode('manual')}
            >
              <SearchIcon size={12} /> MANUAL_LOG
            </button>
            <button 
              className={`toggle-group-btn ${selectionMode === 'bulk' ? 'active' : ''}`}
              onClick={() => setSelectionMode('bulk')}
            >
              <Dna size={12} /> BATCH_INPUT
            </button>
          </div>

          {selectionMode === 'manual' ? (
            <div>
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">Search index</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder="Enter gene symbol (e.g. acj6)..."
                  />
                </div>

                {suggestions.length > 0 && (
                  <div className="autocomplete-suggestions">
                    {suggestions.map(s => (
                      <div 
                        key={s} 
                        className="autocomplete-item"
                        onClick={() => {
                          if (!selectedGenes.includes(s)) {
                            setSelectedGenes([...selectedGenes, s]);
                          }
                          setManualInput('');
                        }}
                      >
                        <ChevronRight size={10} style={{ color: 'var(--text-primary)' }} />
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="form-group">
                <label className="form-label">Raw Specimen Text</label>
                <textarea 
                  className="form-textarea" 
                  rows={5}
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder="Paste gene names separated by spaces, commas or newlines (e.g., ab, achi, CG4578)..."
                ></textarea>
              </div>
              <button 
                className="btn btn-primary" 
                onClick={handleBulkResolve}
                disabled={isResolving || !bulkInput.trim()}
              >
                {isResolving ? <Loader className="animate-spin" size={13} /> : <Plus size={13} />}
                RUN_SYNONYM_RESOLVER
              </button>

              {resolutionResult && (
                <div style={{ marginTop: '1.25rem' }}>
                  {resolutionResult.resolved.length > 0 && (
                    <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>
                      <CheckCircle className="alert-success-icon" size={16} />
                      <div>RESOLVED: {resolutionResult.resolved.length} targets active in workspace.</div>
                    </div>
                  )}
                  {resolutionResult.unresolved.length > 0 && (
                    <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>
                      <AlertTriangle className="alert-error-icon" size={16} />
                      <div>UNRESOLVED: {resolutionResult.unresolved.join(', ')}</div>
                    </div>
                  )}
                  {resolutionResult.warnings.map((w, idx) => (
                    <div key={idx} style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>
                      [!] {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2>Cohort Registers</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0, fontStyle: 'italic' }}>
            Store specimen lists under custom logs to reload them in later sessions.
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label className="form-label">Save Active Specimen Bag ({selectedGenes.length})</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Log file name..." 
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  if (newGroupName.trim() && selectedGenes.length > 0) {
                    saveCustomGroup(newGroupName.trim(), selectedGenes);
                    setNewGroupName('');
                  }
                }}
                disabled={!newGroupName.trim() || selectedGenes.length === 0}
                title="Save current log sheet"
                style={{ padding: '0.5rem 0.75rem' }}
              >
                <Save size={14} />
              </button>
            </div>
          </div>

          <div className="divider" style={{ margin: '0.25rem 0' }}></div>

          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <h4 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
              <FolderOpen size={14} /> SAVED_REGISTERS
            </h4>
            {Object.keys(customGroups).length === 0 ? (
              <p style={{ fontStyle: 'italic', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>No logged cohorts saved.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '280px', overflowY: 'auto' }}>
                {Object.entries(customGroups).map(([name, genes]) => (
                  <div 
                    key={name} 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '0.5rem 0.6rem', 
                      backgroundColor: 'var(--bg-tertiary)', 
                      borderRadius: '3px',
                      border: '1px solid var(--border-color)',
                      gap: '0.5rem'
                    }}
                  >
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 }}>
                      <strong style={{ fontSize: '0.8rem', color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-mono)' }}>{name}</strong>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                        N={genes.length}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', boxShadow: 'none' }}
                        onClick={() => setSelectedGenes(genes)}
                        title="Load records"
                      >
                        Load
                      </button>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', boxShadow: 'none' }}
                        onClick={() => {
                          const merged = Array.from(new Set([...selectedGenes, ...genes]));
                          setSelectedGenes(merged);
                        }}
                        title="Merge records"
                      >
                        + Add
                      </button>
                      <button 
                        className="btn btn-danger-ghost" 
                        style={{ padding: '0.2rem' }}
                        onClick={() => {
                          if (confirm(`Delete cohort "${name}"?`)) {
                            deleteCustomGroup(name);
                          }
                        }}
                        title="Delete cohort"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default GeneSelectionView;
