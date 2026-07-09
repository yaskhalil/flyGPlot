import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { GenePayload, CoexpressionResult } from '../../store/useAppStore';
import { fetchGeneMetadata } from '../../utils/resolver';
import { downloadCSV } from '../../utils/csv';
import { Compass, Download, Loader, ChevronRight, ExternalLink } from 'lucide-react';
import Plotly from 'plotly.js-dist-min';
import _createPlotlyComponent from 'react-plotly.js/factory';
const createPlotlyComponent = (typeof _createPlotlyComponent === 'function'
  ? _createPlotlyComponent
  : (_createPlotlyComponent as any).default) as Function;
const Plot = createPlotlyComponent(Plotly);

interface PlotlyTheme {
  paper_bgcolor: string;
  plot_bgcolor: string;
  font: {
    family: string;
    color: string;
    size: number;
  };
  xaxis: {
    gridcolor: string;
    linecolor: string;
    zerolinecolor: string;
    tickcolor: string;
  };
  yaxis: {
    gridcolor: string;
    linecolor: string;
    zerolinecolor: string;
    tickcolor: string;
  };
}

interface CoexpDashboardViewProps {
  isEmbedded?: boolean;
  minScore?: number;
  setMinScore?: (val: number) => void;
  results?: CoexpressionResult[];
}

export function CoexpDashboardView({
  isEmbedded = false,
  minScore,
  setMinScore,
  results
}: CoexpDashboardViewProps) {
  const { 
    allGenesList, 
    dashRefGene, 
    setDashRefGene, 
    dashMetric, 
    setDashMetric, 
    selectedPartnerGene, 
    setSelectedPartnerGene,
    fetchGeneData,
    geneCache,
    addGenesToSelection,
    selectedStages,
    minExpression,
    excludeLowExpression
  } = useAppStore();

  const [localMinScore, setLocalMinScore] = useState(0.5);
  const activeMinScore = minScore !== undefined ? minScore : localMinScore;
  const activeSetMinScore = setMinScore !== undefined ? setMinScore : setLocalMinScore;

  const [partnerDetails, setPartnerDetails] = useState<GenePayload | null>(null);
  const [metadata, setMetadata] = useState<any | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);

  // Re-adjust score slider defaults when Jaccard is chosen
  useEffect(() => {
    if (dashMetric === 'jaccard') {
      activeSetMinScore(0.3);
    } else {
      activeSetMinScore(0.5);
    }
  }, [dashMetric]);

  // Fetch reference gene co-expression on change
  useEffect(() => {
    fetchGeneData(dashRefGene);
  }, [dashRefGene, fetchGeneData]);

  // Fetch partner details and Ensembl metadata when partner selection changes
  useEffect(() => {
    if (selectedPartnerGene) {
      fetchGeneData(selectedPartnerGene).then(data => setPartnerDetails(data));
      
      setMetadataLoading(true);
      fetchGeneMetadata(selectedPartnerGene)
        .then(meta => {
          setMetadata(meta);
          setMetadataLoading(false);
        })
        .catch(() => {
          setMetadata(null);
          setMetadataLoading(false);
        });
    } else {
      setPartnerDetails(null);
      setMetadata(null);
    }
  }, [selectedPartnerGene, fetchGeneData]);

  // Clean printed grid paper theme for Plotly charts
  const plotlyTheme = useMemo<PlotlyTheme>(() => {
    return {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: {
        family: "'Fira Mono', 'Courier New', monospace",
        color: '#4d5663',
        size: 9
      },
      xaxis: {
        gridcolor: 'rgba(0, 0, 0, 0.04)',
        linecolor: '#c5c3ba',
        zerolinecolor: '#c5c3ba',
        tickcolor: '#c5c3ba'
      },
      yaxis: {
        gridcolor: 'rgba(0, 0, 0, 0.04)',
        linecolor: '#c5c3ba',
        zerolinecolor: '#c5c3ba',
        tickcolor: '#c5c3ba'
      }
    };
  }, []);

  const refData = geneCache[dashRefGene];
  
  // Filter search results
  const localResults = useMemo(() => {
    if (!refData) return [];
    const rawList = refData.coexpression[dashMetric] || [];
    return rawList.filter(r => Math.abs(r.score) >= activeMinScore);
  }, [refData, dashMetric, activeMinScore]);

  const activeResults = results !== undefined ? results : localResults;

  // Dual-Gene Scatter Plot Calculations (with linear regression fit)
  const { scatterTraces, regressionStats } = useMemo(() => {
    if (!refData || !partnerDetails) return { scatterTraces: [], regressionStats: null };
    const stages = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult'];
    const plotPoints: Record<string, { x: number[], y: number[] }> = {};
    
    let globalX: number[] = [];
    let globalY: number[] = [];

    stages.forEach(stage => {
      plotPoints[stage] = { x: [], y: [] };
      const refCells = refData.expression[stage] || {};
      const partnerCells = partnerDetails.expression[stage] || {};

      Object.keys(refCells).forEach(cell => {
        const xVal = refCells[cell];
        const yVal = partnerCells[cell];
        if (xVal !== undefined && yVal !== undefined) {
          plotPoints[stage].x.push(xVal);
          plotPoints[stage].y.push(yVal);
          globalX.push(xVal);
          globalY.push(yVal);
        }
      });
    });

    const traces: any[] = [];
    Object.entries(plotPoints).forEach(([stage, pts]) => {
      if (pts.x.length === 0) return;
      traces.push({
        x: pts.x,
        y: pts.y,
        name: stage,
        mode: 'markers',
        type: 'scatter' as any,
        marker: { size: 6 }
      });
    });

    // Calculate Linear Regression if we have at least 2 points
    let stats: { slope: number, intercept: number, r2: number, n: number } | null = null;
    if (globalX.length >= 2) {
      const n = globalX.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
      for (let i = 0; i < n; i++) {
        const x = globalX[i];
        const y = globalY[i];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
        sumYY += y * y;
      }
      
      const numSlope = n * sumXY - sumX * sumY;
      const denSlope = n * sumXX - sumX * sumX;
      
      if (denSlope !== 0) {
        const slope = numSlope / denSlope;
        const intercept = (sumY - slope * sumX) / n;
        
        // Calculate R2
        const numR = n * sumXY - sumX * sumY;
        const denR = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
        const r = denR !== 0 ? numR / denR : 0;
        const r2 = r * r;
        
        stats = { slope, intercept, r2, n };

        // Generate line points
        const minX = Math.min(...globalX);
        const maxX = Math.max(...globalX);
        traces.push({
          x: [minX, maxX],
          y: [slope * minX + intercept, slope * maxX + intercept],
          name: 'Linear Fit',
          mode: 'lines',
          line: { color: '#991b1b', width: 2, dash: 'dash' },
          type: 'scatter' as any
        });
      }
    }

    return { scatterTraces: traces, regressionStats: stats };
  }, [refData, partnerDetails]);

  // Strip comparison plot
  const stripTraces = useMemo(() => {
    if (!refData || !partnerDetails) return [];
    
    const xRef: any[] = [];
    const yRef: any[] = [];
    const xPartner: any[] = [];
    const yPartner: any[] = [];

    const stages = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult'].filter(s => selectedStages.includes(s));

    stages.forEach(stage => {
      const refCells = refData.expression[stage] || {};
      const partnerCells = partnerDetails.expression[stage] || {};

      Object.entries(refCells).forEach(([_, val]) => {
        const numVal = val as number;
        if (numVal >= minExpression && (!excludeLowExpression || numVal >= 0.10)) {
          xRef.push(stage);
          yRef.push(numVal);
        }
      });

      Object.entries(partnerCells).forEach(([_, val]) => {
        const numVal = val as number;
        if (numVal >= minExpression && (!excludeLowExpression || numVal >= 0.10)) {
          xPartner.push(stage);
          yPartner.push(numVal);
        }
      });
    });

    return [
      {
        x: xRef,
        y: yRef,
        name: dashRefGene,
        type: 'box' as any,
        boxpoints: 'all' as any,
        jitter: 0.7,
        pointpos: 0,
        marker: { color: '#1d4ed8' }
      },
      {
        x: xPartner,
        y: yPartner,
        name: selectedPartnerGene || undefined,
        type: 'box' as any,
        boxpoints: 'all' as any,
        jitter: 0.7,
        pointpos: 0,
        marker: { color: '#0f766e' }
      }
    ];
  }, [refData, partnerDetails, dashRefGene, selectedPartnerGene, selectedStages, minExpression, excludeLowExpression]);

  const rightPaneContent = (
    <>
      {!refData ? (
        <div className="alert alert-info">
          <Loader className="animate-spin alert-info-icon" size={16} />
          <div>Reading reference data...</div>
        </div>
      ) : !selectedPartnerGene ? (
        <div className="alert alert-info" style={{ marginTop: '0.5rem' }}>
          <Compass className="alert-info-icon" size={16} />
          <div>
            👈 Select a target partner gene from search logs to display CRT readouts and diagnostic values.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
          <div className="card" style={{ padding: '0.85rem 1.25rem', marginBottom: 0 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontFamily: 'var(--font-mono)' }}>
              REF: <span style={{ color: 'var(--text-primary)' }}>{dashRefGene}</span>
              <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
              PARTNER: <span style={{ color: 'var(--text-primary)' }}>{selectedPartnerGene}</span>
            </h3>
          </div>

          <div className="card" style={{ marginBottom: 0 }}>
            <h4 style={{ marginBottom: '0.75rem' }}>Developmental Stage Profiles (Drafting Boxplot)</h4>
            {stripTraces.length > 0 ? (
              <div className="instrument-screen">
                <Plot
                  data={stripTraces}
                  layout={{
                    ...plotlyTheme,
                    height: 280,
                    margin: { l: 50, r: 20, t: 15, b: 50 },
                    yaxis: { ...plotlyTheme.yaxis, title: { text: 'Log Expression', font: { size: 9 } } }
                  }}
                  useResizeHandler
                  style={{ width: '100%' }}
                />
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Loader className="animate-spin" size={24} /></div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h4 style={{ margin: 0 }}>Co-expression Scatter Relationship</h4>
              {scatterTraces.length > 0 && (
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', boxShadow: 'none' }}
                  onClick={() => {
                    if (!refData || !partnerDetails) return;
                    let csv = 'Stage,Cell,RefGeneExpression,PartnerGeneExpression\n';
                    const stages = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult'];
                    stages.forEach(stage => {
                      const refCells = refData.expression[stage] || {};
                      const partnerCells = partnerDetails.expression[stage] || {};
                      Object.keys(refCells).forEach(cell => {
                        const xVal = refCells[cell];
                        const yVal = partnerCells[cell];
                        if (xVal !== undefined && yVal !== undefined) {
                          csv += `${stage},"${cell.replace(/"/g, '""')}",${xVal},${yVal}\n`;
                        }
                      });
                    });
                    downloadCSV(`scatter_${dashRefGene}_vs_${selectedPartnerGene}.csv`, csv);
                  }}
                >
                  <Download size={12} /> EXPORT_CSV
                </button>
              )}
            </div>
            
            {regressionStats && (
              <div className="regression-panel">
                <div className="regression-stat">
                  <span className="regression-label">N_SAMPLES</span>
                  <span className="regression-value">{regressionStats.n}</span>
                </div>
                <div className="regression-stat">
                  <span className="regression-label">SLOPE (M)</span>
                  <span className="regression-value highlight-secondary">{regressionStats.slope.toFixed(4)}</span>
                </div>
                <div className="regression-stat">
                  <span className="regression-label">INTERCEPT (C)</span>
                  <span className="regression-value">{regressionStats.intercept.toFixed(4)}</span>
                </div>
                <div className="regression-stat">
                  <span className="regression-label">R2_DETERMINATION</span>
                  <span className="regression-value highlight-success">{regressionStats.r2.toFixed(4)}</span>
                </div>
              </div>
            )}

            {scatterTraces.length > 0 ? (
              <div className="instrument-screen">
                <Plot
                  data={scatterTraces}
                  layout={{
                    ...plotlyTheme,
                    height: 300,
                    margin: { l: 50, r: 20, t: 15, b: 50 },
                    xaxis: { ...plotlyTheme.xaxis, title: { text: `"${dashRefGene}" Expression`, font: { size: 9 } } },
                    yaxis: { ...plotlyTheme.yaxis, title: { text: `"${selectedPartnerGene}" Expression`, font: { size: 9 } } }
                  }}
                  useResizeHandler
                  style={{ width: '100%' }}
                />
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No overlapping cell expression data available.</div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 style={{ margin: 0 }}>External Database Links</h4>
              <a 
                href={`https://flybase.org/search/gene/${selectedPartnerGene}`} 
                target="_blank" 
                rel="noreferrer"
                className="btn btn-secondary"
                style={{ textDecoration: 'none', fontSize: '0.75rem', padding: '0.3rem 0.6rem', boxShadow: 'none' }}
              >
                View on FlyBase <ExternalLink size={12} style={{ marginLeft: '0.25rem' }} />
              </a>
            </div>
            {metadataLoading ? (
              <div style={{ display: 'flex', padding: '1rem' }}><Loader className="animate-spin" size={20} /></div>
            ) : metadata ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                <div><strong>Full Name:</strong> <span style={{ color: 'var(--text-primary)' }}>{metadata.name}</span></div>
                <div><strong>FlyBase Accession:</strong> <code style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{metadata.flybase}</code></div>
                <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: '0.75rem', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>
                  {metadata.summary}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>No summary descriptions resolved. Use external links above.</p>
            )}
          </div>
        </div>
      )}
    </>
  );

  if (isEmbedded) {
    return (
      <div style={{ width: '100%' }}>
        {rightPaneContent}
      </div>
    );
  }

  return (
    <div className="dashboard-grid">
      {/* LEFT COLUMN: Controls & Search Table */}
      <div className="dashboard-panel">
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            <Compass size={14} style={{ color: 'var(--text-primary)' }} /> CALIBRATION_PANEL
          </h3>
          
          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
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

          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
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

          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label className="form-label">
              {dashMetric === 'jaccard' ? 'Min Jaccard' : 'Min Abs. Score'} ({activeMinScore.toFixed(2)})
            </label>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.05" 
              value={activeMinScore}
              onChange={(e) => activeSetMinScore(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--primary)' }}
            />
          </div>

          {activeResults.length > 0 && (
            <button 
              className="btn btn-secondary" 
              style={{ width: '100%', padding: '0.45rem', fontSize: '0.75rem', boxShadow: 'none' }}
              onClick={() => {
                const top20 = activeResults.slice(0, 20).map(r => r.gene);
                addGenesToSelection(top20);
              }}
            >
              Add Top 20 to Active Cohort
            </button>
          )}
        </div>

        <div className="card" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.25rem', fontFamily: 'var(--font-mono)' }}>SEARCH_RESULTS ({activeResults.length})</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontStyle: 'italic' }}>
            Select a row to mount visual comparison.
          </p>
          <div className="data-table-container" style={{ flexGrow: 1, overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Gene</th>
                  <th>{dashMetric === 'jaccard' ? 'Jaccard' : 'Score'}</th>
                </tr>
              </thead>
              <tbody>
                {activeResults.map(r => (
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
      </div>

      {/* RIGHT COLUMN: Windscreens / Charts */}
      <div className="dashboard-panel" style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '1rem' }}>
        {rightPaneContent}
      </div>
    </div>
  );
}

export default CoexpDashboardView;
