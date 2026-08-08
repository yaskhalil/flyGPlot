import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { apiClient } from '../../services/apiClient';
import { ExternalLink, Loader, Info, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

interface GeneDetailsViewProps {
  isEmbedded?: boolean;
}

interface FullMetadata {
  gene: string;
  fbgn: string;
  name: string;
  chromosome: string | null;
  geneType: string | null;
  summary: string | null;
  goTerms: { goId: string; term: string; evidence: string; aspect: string | null }[];
  alleles: { allele: string; phenotype: string | null; type: string | null }[];
  orthologs: { species: string; symbol: string; identity: number | null }[];
  source: string;
  /** True when an annotation list is empty because the lookup failed. */
  degraded?: boolean;
  /** Names the annotation lists that failed or were never attempted. */
  unavailable?: string[];
}

export function GeneDetailsView({ isEmbedded = false }: GeneDetailsViewProps) {
  const { allGenesList } = useAppStore();
  const [lookupGene, setLookupGene] = useState('');
  const [metadata, setMetadata] = useState<FullMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    goTerms: true,
    alleles: false,
    orthologs: false,
    reagents: true,
  });
  const [reagents, setReagents] = useState<any | null>(null);
  const [reagentsLoading, setReagentsLoading] = useState(false);

  useEffect(() => {
    if (allGenesList.length > 0 && !lookupGene) {
      setLookupGene(allGenesList[0]);
    }
  }, [allGenesList, lookupGene]);

  useEffect(() => {
    if (lookupGene) {
      setLoading(true);
      setError(null);
      setMetadata(null);
      setReagents(null);
      apiClient.getGeneMetadata(lookupGene)
        .then(data => {
          if (data) {
            setMetadata(data as FullMetadata);
          } else {
            setError('Gene not found');
          }
          setLoading(false);
        })
        .catch(err => {
          setError(err.message || 'Failed to fetch metadata');
          setLoading(false);
        });
      
      // Fetch reagent info
      setReagentsLoading(true);
      apiClient.getReagents(lookupGene)
        .then(r => { setReagents(r); setReagentsLoading(false); })
        .catch(() => setReagentsLoading(false));
    }
  }, [lookupGene]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div style={{ maxWidth: isEmbedded ? 'none' : '800px', margin: isEmbedded ? '0' : '0 auto', width: '100%' }}>
      <div className="card">
        <h2>FlyBase Registry Record Sheet</h2>
        
        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
          <label className="form-label">Inspect Specimen</label>
          <select className="form-select" value={lookupGene} onChange={(e) => setLookupGene(e.target.value)}>
            {allGenesList.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {lookupGene && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px dashed var(--border-color)', paddingTop: '1.25rem' }}>
            
            {/* External Link */}
            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '0.5rem' }}>
              <a 
                href={`https://flybase.org/search/gene/${lookupGene}`} 
                target="_blank" rel="noreferrer"
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                Open {lookupGene} on FlyBase <ExternalLink size={14} style={{ marginLeft: '0.25rem' }} />
              </a>
              <a 
                href={`https://rest.ensembl.org/documentation/`} 
                target="_blank" rel="noreferrer"
                className="btn btn-secondary"
                style={{ textDecoration: 'none', boxShadow: 'none' }}
              >
                Ensembl <ExternalLink size={14} style={{ marginLeft: '0.25rem' }} />
              </a>
            </div>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <Loader className="animate-spin" size={24} color="var(--text-primary)" />
              </div>
            ) : error ? (
              <div className="alert alert-error">
                <Info className="alert-error-icon" size={16} />
                <div>{error}</div>
              </div>
            ) : metadata ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
                {/* Core Info */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <strong>Approved Symbol:</strong>
                    <code style={{ display: 'block', color: 'var(--text-primary)', fontWeight: 'bold', marginTop: '0.2rem' }}>
                      {metadata.gene}
                    </code>
                  </div>
                  <div>
                    <strong>Source:</strong>
                    <span className="mock-badge" style={{
                      display: 'inline-block', marginTop: '0.2rem',
                      background: metadata.source === 'flybase' ? 'rgba(29,78,216,0.1)' : 'rgba(15,118,110,0.1)',
                      color: metadata.source === 'flybase' ? 'var(--secondary)' : 'var(--success)',
                    }}>
                      {metadata.source}
                    </span>
                  </div>
                </div>

                <div><strong>Described Name:</strong> <span style={{ color: 'var(--text-primary)' }}>{metadata.name}</span></div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  <div><strong>FlyBase ID:</strong> <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{metadata.fbgn}</code></div>
                  {metadata.chromosome && <div><strong>Chromosome:</strong> <span style={{ color: 'var(--text-primary)' }}>{metadata.chromosome}</span></div>}
                  {metadata.geneType && <div><strong>Type:</strong> <span style={{ color: 'var(--text-primary)' }}>{metadata.geneType}</span></div>}
                </div>

                {metadata.summary && (
                  <div style={{
                    background: 'var(--bg-tertiary)', border: '1px dashed var(--border-color)',
                    padding: '0.75rem', borderRadius: '3px', fontSize: '0.8rem',
                    color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
                  }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.3rem' }}>
                      Summary:
                    </strong>
                    {metadata.summary}
                  </div>
                )}

                {/* ─── GO Terms ─── */}
                {(metadata.goTerms?.length || 0) > 0 && (
                  <div style={{
                    border: '1px solid var(--border-color)', borderRadius: '4px',
                    background: 'var(--bg-card)', overflow: 'hidden',
                  }}>
                    <div
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.6rem 0.75rem', background: 'var(--bg-tertiary)',
                        borderBottom: '1px solid var(--border-color)', cursor: 'pointer',
                        fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700,
                      }}
                      onClick={() => toggleSection('goTerms')}
                    >
                      <span>GO_TERMS ({metadata.goTerms.length})</span>
                      {expandedSections.goTerms ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </div>
                    {expandedSections.goTerms && (
                      <div style={{ padding: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {metadata.goTerms.map((go) => (
                          <a
                            key={go.goId}
                            href={`https://amigo.geneontology.org/amigo/term/${go.goId}`}
                            target="_blank" rel="noreferrer"
                            style={{ textDecoration: 'none' }}
                          >
                            <span className="mock-badge mock-badge-blue" style={{ cursor: 'pointer' }}>
                              {go.goId}
                              <span style={{ fontWeight: 400, marginLeft: '0.2rem' }}>{go.term}</span>
                              <span style={{ opacity: 0.6, marginLeft: '0.2rem', fontSize: '0.55rem' }}>({go.evidence})</span>
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Alleles & Phenotypes ─── */}
                {(metadata.alleles?.length || 0) > 0 && (
                  <div style={{
                    border: '1px solid var(--border-color)', borderRadius: '4px',
                    background: 'var(--bg-card)', overflow: 'hidden',
                  }}>
                    <div
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.6rem 0.75rem', background: 'var(--bg-tertiary)',
                        borderBottom: '1px solid var(--border-color)', cursor: 'pointer',
                        fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700,
                      }}
                      onClick={() => toggleSection('alleles')}
                    >
                      <span>ALLELES &amp; PHENOTYPES ({metadata.alleles.length})</span>
                      {expandedSections.alleles ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </div>
                    {expandedSections.alleles && (
                      <div style={{ padding: '0.5rem' }}>
                        <table className="mock-table" style={{ fontSize: '0.7rem' }}>
                          <thead>
                            <tr><th>Allele</th><th>Phenotype</th><th>Type</th></tr>
                          </thead>
                          <tbody>
                            {metadata.alleles.slice(0, 15).map((a, i) => (
                              <tr key={i}>
                                <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{a.allele}</td>
                                <td>{a.phenotype || '—'}</td>
                                <td style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{a.type || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {metadata.alleles.length > 15 && (
                          <div style={{ marginTop: '0.3rem', fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                            Showing 15 of {metadata.alleles.length}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Orthologs ─── */}
                {(metadata.orthologs?.length || 0) > 0 && (
                  <div style={{
                    border: '1px solid var(--border-color)', borderRadius: '4px',
                    background: 'var(--bg-card)', overflow: 'hidden',
                  }}>
                    <div
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.6rem 0.75rem', background: 'var(--bg-tertiary)',
                        borderBottom: '1px solid var(--border-color)', cursor: 'pointer',
                        fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700,
                      }}
                      onClick={() => toggleSection('orthologs')}
                    >
                      <span>ORTHOLOGS ({metadata.orthologs.length})</span>
                      {expandedSections.orthologs ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </div>
                    {expandedSections.orthologs && (
                      <div style={{ padding: '0.5rem' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                          {metadata.orthologs.map((o, i) => (
                            <span key={i} className="mock-badge" style={{
                              background: 'rgba(15,118,110,0.08)', color: 'var(--success)',
                              border: '1px solid rgba(15,118,110,0.2)',
                            }}>
                              {o.species}: {o.symbol}
                              {o.identity && <span style={{ opacity: 0.6, marginLeft: '0.2rem' }}>({Math.round(o.identity * 100)}%)</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Reagents ─── */}
                <div style={{
                  border: '1px solid var(--border-color)', borderRadius: '4px',
                  background: 'var(--bg-card)', overflow: 'hidden',
                }}>
                  <div
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.6rem 0.75rem', background: 'var(--bg-tertiary)',
                      borderBottom: '1px solid var(--border-color)', cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700,
                    }}
                    onClick={() => toggleSection('reagents')}
                  >
                    <span>AVAILABLE_REAGENTS
                      {reagentsLoading && <Loader className="animate-spin" size={10} style={{ marginLeft: '0.4rem' }} />}
                    </span>
                    {expandedSections.reagents ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </div>
                  {expandedSections.reagents && (
                    <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {reagentsLoading ? (
                        <div style={{ textAlign: 'center', padding: '1rem' }}>
                          <Loader className="animate-spin" size={20} color="var(--text-muted)" />
                        </div>
                      ) : reagents ? (
                        <>
                          {reagents.degraded && (
                            <div className="alert alert-warning" style={{ fontSize: '0.72rem' }}>
                              <AlertTriangle className="alert-info-icon" size={14} />
                              <div>
                                FlyBase did not return reagent data. Any counts below reflect a
                                failed lookup, not an absence of lines — use the links to check.
                              </div>
                            </div>
                          )}
                          {/* Direct links to FlyBase reagent pages */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <a href={reagents.reagentsUrl} target="_blank" rel="noreferrer"
                              className="btn btn-primary"
                              style={{ textDecoration: 'none', fontSize: '0.72rem', padding: '0.35rem 0.65rem' }}>
                              Reagents on FlyBase <ExternalLink size={12} />
                            </a>
                            <a href={reagents.insertionsUrl} target="_blank" rel="noreferrer"
                              className="btn btn-secondary"
                              style={{ textDecoration: 'none', fontSize: '0.72rem', padding: '0.35rem 0.65rem', boxShadow: 'none' }}>
                              Insertion Lines <ExternalLink size={12} />
                            </a>
                            <a href={reagents.flybaseUrl} target="_blank" rel="noreferrer"
                              className="btn btn-secondary"
                              style={{ textDecoration: 'none', fontSize: '0.72rem', padding: '0.35rem 0.65rem', boxShadow: 'none' }}>
                              Full Gene Report <ExternalLink size={12} />
                            </a>
                          </div>

                          {/* Line type reference guide */}
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            <div style={{ fontWeight: 700, marginBottom: '0.35rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-primary)' }}>
                              LINE_TYPE_REFERENCE
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                              {(reagents.lineTypes || []).map((lt: any, i: number) => (
                                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                                  <span style={{
                                    fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)',
                                    background: 'var(--bg-tertiary)', padding: '0.1rem 0.35rem', borderRadius: '2px',
                                    fontSize: '0.65rem', whiteSpace: 'nowrap', border: '1px solid var(--border-color)',
                                  }}>
                                    {lt.type}
                                  </span>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>{lt.description}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Allele count */}
                          {reagents.alleles && reagents.alleles.length > 0 && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                              {reagents.alleles.length} allele records found via FlyBase
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Reagent info unavailable. Use the FlyBase links above.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Empty state — separates "no annotations" from "could not ask",
                    which the backend now distinguishes via `unavailable`. */}
                {(!metadata.goTerms?.length && !metadata.alleles?.length && !metadata.orthologs?.length) && (
                  metadata.degraded ? (
                    <div className="alert alert-warning">
                      <AlertTriangle className="alert-info-icon" size={16} />
                      <div>
                        Could not retrieve {(metadata.unavailable || []).join(' and ') || 'annotations'} from
                        FlyBase — this is an upstream failure, not an empty record.
                        Check the FlyBase links above before concluding this gene has none.
                      </div>
                    </div>
                  ) : (
                    <div className="alert alert-info">
                      <Info className="alert-info-icon" size={16} />
                      <div>FlyBase annotations not available for this gene. Use external links above.</div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="alert alert-info">
                <Info className="alert-info-icon" size={16} />
                <div>Loading gene metadata from backend...</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default GeneDetailsView;
