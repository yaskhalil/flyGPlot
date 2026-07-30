// Enrichment Lab — Run GO/pathway enrichment on selected gene cohorts
// Backend: POST /api/enrichment → Enrichr API → cached results

import { useState, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { apiClient } from '../../services/apiClient';
import { Compass, Loader, AlertTriangle, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { WorkspaceLayout } from '../shared/WorkspaceLayout';

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

const PAGE_SIZE = 20;

export function EnrichmentLab() {
  const { selectedGenes, addGenesToSelection } = useAppStore();
  const [selectedDb, setSelectedDb] = useState(DATABASES[0]);
  const [results, setResults] = useState<EnrichmentResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDbs, setExpandedDbs] = useState<string[]>([]);
  const [resultPages, setResultPages] = useState<Record<string, number>>({});

  const toggleDb = (db: string) => {
    setExpandedDbs(prev =>
      prev.includes(db) ? prev.filter(d => d !== db) : [...prev, db]
    );
  };

  const showMore = (db: string) => {
    setResultPages(prev => ({
      ...prev,
      [db]: (prev[db] || 1) + 1,
    }));
  };

  const handleRun = useCallback(async () => {
    if (selectedGenes.length === 0) {
      setError('No genes in specimen bag. Add genes first.');
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);
    setExpandedDbs([]);
    setResultPages({});

    try {
      const data = await apiClient.runEnrichment(selectedGenes, DATABASES);
      if (!data || data.error) {
        setError(data?.error || 'Enrichment service unavailable');
        return;
      }
      setResults(data.results);
      // Auto-expand the selected DB on first run
      setExpandedDbs([selectedDb]);
      setResultPages({ [selectedDb]: 1 });
    } catch (err: any) {
      setError(err.message || 'Failed to run enrichment');
    } finally {
      setLoading(false);
    }
  }, [selectedGenes, selectedDb]);

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

  // Style constants for the results table
  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.72rem',
    minWidth: '600px',
  };

  const thStyle: React.CSSProperties = {
    padding: '0.5rem 0.65rem',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.68rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontWeight: 700,
    color: 'var(--text-primary)',
    backgroundColor: 'var(--bg-tertiary)',
    borderBottom: '2px solid var(--text-primary)',
    textAlign: 'left',
  };

  const chipStyle: React.CSSProperties = {
    fontSize: '0.6rem',
    padding: '0.1rem 0.3rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: '3px',
    color: 'var(--text-secondary)',
    display: 'inline-block',
  };

  return (
    <WorkspaceLayout
      title="ENRICHMENT_CONSOLE"
      icon={<Compass size={14} />}
      controls={
        <>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Active Cohort</label>
            <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', padding: '0.3rem 0' }}>
              {selectedGenes.length} genes in specimen bag
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
        </>
      }
      extraControls={
        results && (
          <div className="card" style={{ margin: 0, padding: '1.25rem' }}>
            <h4 style={{ marginBottom: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
              DATABASE_SUMMARY
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.72rem' }}>
              {Object.entries(results).map(([db, rows]) => {
                const count = Array.isArray(rows) ? rows.length : 0;
                const isExpanded = expandedDbs.includes(db);
                return (
                  <div
                    key={db}
                    style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: '0.3rem 0.4rem',
                      background: db === selectedDb ? 'var(--secondary-bg)' : isExpanded ? 'var(--bg-card)' : 'transparent',
                      borderRadius: '3px', cursor: 'pointer',
                      borderLeft: db === selectedDb ? '3px solid var(--secondary)' : '3px solid transparent',
                    }}
                    onClick={() => toggleDb(db)}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: db === selectedDb ? 700 : 400 }}>
                      {db}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      {count > 0 ? `${count} terms` : Array.isArray(rows) ? '—' : 'error'}
                      {isExpanded ? <ChevronDown size={10} style={{ marginLeft: '0.3rem' }} /> : <ChevronRight size={10} style={{ marginLeft: '0.3rem' }} />}
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
        )
      }
    >
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
          if (!expandedDbs.includes(db)) return null;

          const page = resultPages[db] || 1;
          const visibleRows = rows.slice(0, page * PAGE_SIZE);
          const hasMore = rows.length > visibleRows.length;

          return (
            <div key={db} className="card" style={{ padding: '1rem 1rem 1rem 1.5rem' }}>
              <h3 style={{ marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                {db}
                <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.5rem', fontSize: '0.7rem' }}>
                  ({rows.length} terms)
                </span>
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, width: '2rem' }}>#</th>
                      <th style={thStyle}>Term</th>
                      <th style={{ ...thStyle, textAlign: 'right', width: '5rem' }}>P-value</th>
                      <th style={{ ...thStyle, textAlign: 'right', width: '4rem' }}>Z-score</th>
                      <th style={{ ...thStyle, textAlign: 'right', width: '5rem' }}>Combined</th>
                      <th style={thStyle}>Genes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r) => (
                      <tr key={r.rank} style={r.pValue < 0.001 ? { background: 'rgba(15,118,110,0.03)' } : {}}>
                        <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--border-color)' }}>{r.rank}</td>
                        <td style={{ fontWeight: 600, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--border-color)' }} title={r.term}>
                          {r.term}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: pValueColor(r.pValue), fontWeight: 700, padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--border-color)' }}>
                          {formatPValue(r.pValue)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--border-color)' }}>
                          {r.zScore.toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--border-color)' }}>
                          {r.combinedScore.toFixed(1)}
                        </td>
                        <td style={{ padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem' }}>
                            {(r.overlappingGenes || []).map(g => (
                              <span
                                key={g}
                                style={chipStyle}
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
              {hasMore && (
                <div
                  onClick={() => showMore(db)}
                  style={{ marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--secondary)', textAlign: 'center', fontFamily: 'var(--font-mono)', cursor: 'pointer', fontWeight: 700, padding: '0.35rem', border: '1px solid var(--secondary-border)', borderRadius: '3px' }}
                >
                  Show {Math.min(PAGE_SIZE, rows.length - visibleRows.length)} more ({rows.length - visibleRows.length} remaining)
                </div>
              )}
            </div>
          );
        })}
    </WorkspaceLayout>
  );
}

export default EnrichmentLab;
