// Enrichment Lab — Run GO/pathway enrichment on selected gene cohorts
// Backend: POST /api/enrichment → Enrichr API → cached results

import { useState, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { apiClient } from '../../services/apiClient';
import { Compass, Loader, AlertTriangle, Download, ChevronDown, ChevronRight } from 'lucide-react';

interface EnrichmentRow {
  rank: number;
  term: string;
  pValue: number;
  zScore: number;
  combinedScore: number;
  overlappingGenes: string[];
  termId?: string;
}

interface EnrichmentResults {
  [database: string]: EnrichmentRow[] | { error: string };
}

const DATABASES = [
  'GO_Biological_Process_2023',
  'GO_Molecular_Function_2023',
  'GO_Cellular_Component_2023',
  'KEGG_2021_Human',
  'WikiPathway_2023_Drosophila',
  'Reactome_2022',
];

export function EnrichmentLab() {
  const { selectedGenes, addGenesToSelection } = useAppStore();
  const [selectedDb, setSelectedDb] = useState(DATABASES[0]);
  const [results, setResults] = useState<EnrichmentResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDb, setExpandedDb] = useState<string | null>(null);

  const handleRun = useCallback(async () => {
    if (selectedGenes.length === 0) {
      setError('No genes in specimen bag. Add genes first.');
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const data = await apiClient.runEnrichment(selectedGenes, DATABASES);
      if (!data || data.error) {
        setError(data?.error || 'Enrichment service unavailable');
        return;
      }
      setResults(data.results);
      // Auto-expand first database with results
      const first = Object.entries(data.results || {}).find(
        ([, v]) => Array.isArray(v) && v.length > 0
      );
      if (first) setExpandedDb(first[0]);
    } catch (err: any) {
      setError(err.message || 'Failed to run enrichment');
    } finally {
      setLoading(false);
    }
  }, [selectedGenes]);

  const formatPValue = (p: number): string => {
    if (p < 0.0001) return p.toExponential(1);
    return p.toFixed(4);
  };

  const pValueColor = (p: number): string => {
    if (p < 0.001) return 'var(--success)';
    if (p < 0.01) return 'var(--secondary)';
    if (p < 0.05) return 'var(--warning)';
    return 'var(--text-muted)';
  };

  const exportCSV = () => {
    if (!results) return;
    let csv = 'Database,Rank,Term,P-value,Z-score,Combined Score,Overlapping Genes\n';
    for (const [db, rows] of Object.entries(results)) {
      if (!Array.isArray(rows)) continue;
      for (const r of rows) {
        csv += `${db},${r.rank},"${r.term}",${r.pValue},${r.zScore},${r.combinedScore},"${r.overlappingGenes.join('; ')}"\n`;
      }
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enrichment_${selectedGenes.length}genes.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem', alignItems: 'start', width: '100%' }}>
      {/* Left: Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
        <div className="card" style={{ margin: 0, padding: '1.25rem' }}>
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            <Compass size={14} style={{ color: 'var(--text-primary)' }} /> ENRICHMENT_CONSOLE
          </h3>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Loaded Cohort</label>
            <div style={{
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
              borderRadius: '3px', padding: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
              maxHeight: '120px', overflowY: 'auto',
            }}>
              {selectedGenes.length > 0
                ? selectedGenes.map(g => <span key={g} style={{ marginRight: '0.3rem' }}>{g}</span>)
                : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Bag empty</span>
              }
            </div>
            <div style={{ marginTop: '0.3rem', fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {selectedGenes.length} genes loaded
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Primary Database</label>
            <select
              className="form-select"
              value={selectedDb}
              onChange={e => setSelectedDb(e.target.value)}
            >
              {DATABASES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleRun}
            disabled={loading || selectedGenes.length === 0}
            style={{ width: '100%', textAlign: 'center', padding: '0.55rem' }}
          >
            {loading ? (
              <><Loader className="animate-spin" size={14} /> PROCESSING...</>
            ) : (
              <><Compass size={14} /> RUN_ENRICHMENT</>
            )}
          </button>

          {error && (
            <div className="alert alert-error" style={{ marginTop: '1rem', padding: '0.5rem' }}>
              <AlertTriangle className="alert-error-icon" size={14} />
              <div style={{ fontSize: '0.75rem' }}>{error}</div>
            </div>
          )}
        </div>

        {/* Active database summary */}
        {results && (
          <div className="card" style={{ margin: 0, padding: '1.25rem' }}>
            <h4 style={{ marginBottom: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
              DATABASE_SUMMARY
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.72rem' }}>
              {Object.entries(results).map(([db, rows]) => {
                const count = Array.isArray(rows) ? rows.length : 0;
                return (
                  <div
                    key={db}
                    style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: '0.3rem 0.4rem',
                      background: db === expandedDb ? 'var(--bg-card)' : 'transparent',
                      borderRadius: '3px', cursor: 'pointer',
                    }}
                    onClick={() => setExpandedDb(db === expandedDb ? null : db)}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>{db}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      {count > 0 ? `${count} terms` : '—'}
                      {db === expandedDb ? <ChevronDown size={10} style={{ marginLeft: '0.3rem' }} /> : <ChevronRight size={10} style={{ marginLeft: '0.3rem' }} />}
                    </span>
                  </div>
                );
              })}
            </div>
            {results && (
              <button
                className="btn btn-secondary"
                onClick={exportCSV}
                style={{ width: '100%', marginTop: '0.75rem', padding: '0.35rem', fontSize: '0.72rem', boxShadow: 'none' }}
              >
                <Download size={12} /> EXPORT_CSV
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right: Results */}
      <div style={{ minWidth: 0 }}>
        {loading && (
          <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
            <Loader className="animate-spin" size={24} color="var(--primary)" />
            <p style={{ marginTop: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
              Computing enrichment...
            </p>
          </div>
        )}

        {!loading && !results && !error && (
          <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
            <Compass size={32} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Select genes in the Specimen Bag, then run enrichment to see GO terms,
              pathways, and functional annotations.
            </p>
          </div>
        )}

        {results && Object.entries(results).map(([db, rows]) => {
          if (!Array.isArray(rows) || rows.length === 0) return null;
          if (db !== expandedDb) return null;

          return (
            <div key={db} className="card" style={{ padding: '1rem 1rem 1rem 1.5rem' }}>
              <h3 style={{ marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                {db}
                <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.5rem', fontSize: '0.7rem' }}>
                  ({rows.length} terms)
                </span>
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="mock-table" style={{ fontSize: '0.72rem', minWidth: '600px' }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Term</th>
                      <th style={{ textAlign: 'right' }}>P-value</th>
                      <th style={{ textAlign: 'right' }}>Z-score</th>
                      <th style={{ textAlign: 'right' }}>Combined</th>
                      <th>Genes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 20).map((r) => (
                      <tr key={r.rank} style={r.pValue < 0.001 ? { background: 'rgba(15,118,110,0.03)' } : {}}>
                        <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>{r.rank}</td>
                        <td style={{ fontWeight: 600, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.term}>
                          {r.term}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: pValueColor(r.pValue), fontWeight: 700 }}>
                          {formatPValue(r.pValue)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                          {r.zScore.toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                          {r.combinedScore.toFixed(1)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem' }}>
                            {(r.overlappingGenes || []).map(g => (
                              <span
                                key={g}
                                className="mock-chip"
                                style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem', cursor: 'pointer' }}
                                onClick={() => addGenesToSelection([g])}
                                title={`Add ${g} to specimen bag`}
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 20 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                  Showing 20 of {rows.length} terms
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default EnrichmentLab;
