import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { CellPayload } from '../../store/useAppStore';
import { downloadCSV } from '../../utils/csv';
import { Info, AlertTriangle, Download, Loader } from 'lucide-react';
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

interface CellCentricViewProps {
  isEmbedded?: boolean;
  targetCell?: string;
  setTargetCell?: (val: string) => void;
  highlightGenes?: string[];
  setHighlightGenes?: (genes: string[]) => void;
}

export function CellCentricView({
  isEmbedded = false,
  targetCell,
  setTargetCell,
  highlightGenes,
  setHighlightGenes
}: CellCentricViewProps) {
  const { cellsList, selectedGenes, minExpression, excludeLowExpression, fetchCellData } = useAppStore();
  const [localCell, setLocalCell] = useState('');
  const [localHighlight, setLocalHighlight] = useState<string[]>([]);
  const activeTargetCell = targetCell !== undefined ? targetCell : localCell;
  const activeSetTargetCell = setTargetCell !== undefined ? setTargetCell : setLocalCell;
  const activeHighlight = highlightGenes !== undefined ? highlightGenes : localHighlight;
  const activeSetHighlight = setHighlightGenes !== undefined ? setHighlightGenes : setLocalHighlight;

  const [cellData, setCellData] = useState<CellPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cellsList.length > 0 && !activeTargetCell) {
      activeSetTargetCell(cellsList[0]);
    }
  }, [cellsList, activeTargetCell]);

  useEffect(() => {
    if (activeTargetCell) {
      setLoading(true);
      fetchCellData(activeTargetCell).then(data => {
        setCellData(data);
        setLoading(false);
      });
    }
  }, [activeTargetCell, fetchCellData]);

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

  if (selectedGenes.length === 0) {
    return (
      <div className="alert alert-info">
        <Info className="alert-info-icon" size={16} />
        <div>Please select or paste genes in the <strong>Gene Cohorts</strong> tab first.</div>
      </div>
    );
  }

  // Build the Plotly line trace data
  const traces: any[] = [];
  const stages = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult'];

  if (cellData) {
    const isHighlightActive = activeHighlight.length > 0;
    const colors = ['#1d4ed8', '#0f766e', '#991b1b', '#b45309', '#6d28d9', '#475569'];
    let colorIdx = 0;

    selectedGenes.forEach(gene => {
      const xVals: any[] = [];
      const yVals: any[] = [];
      
      stages.forEach(stage => {
        const val = cellData.expression[stage]?.[gene];
        if (val !== undefined && val >= minExpression && (!excludeLowExpression || val >= 0.10)) {
          xVals.push(stage);
          yVals.push(val);
        }
      });

      if (xVals.length === 0) return;

      const isHighlighted = !isHighlightActive || activeHighlight.includes(gene);
      const color = isHighlighted ? colors[colorIdx++ % colors.length] : '#d8d6d0';
      const opacity = isHighlighted ? 1.0 : 0.25;
      const width = isHighlighted ? 3.5 : 1.5;
      const size = isHighlighted ? 8 : 4;

      traces.push({
        x: xVals,
        y: yVals,
        name: gene,
        mode: 'lines+markers',
        line: { color, width, shape: 'spline' },
        marker: { size },
        opacity,
        showlegend: isHighlighted
      });
    });
  }

  const handleExportCSV = () => {
    if (!cellData) return;
    let csv = 'Gene,Stage,Cell,Expression\n';
    selectedGenes.forEach(gene => {
      stages.forEach(stage => {
        const val = cellData.expression[stage]?.[gene];
        if (val !== undefined && val >= minExpression && (!excludeLowExpression || val >= 0.10)) {
          csv += `${gene},${stage},"${activeTargetCell.replace(/"/g, '""')}",${val}\n`;
        }
      });
    });
    downloadCSV(`cell_centric_trend_${activeTargetCell.replace(/\s+/g, '_')}.csv`, csv);
  };

  return (
    <div style={{ width: '100%' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 style={{ margin: 0 }}>Cell Developmental Trajectory</h3>
          {cellData && (
            <button className="btn btn-secondary" onClick={handleExportCSV}>
              <Download size={12} /> EXPORT_CSV
            </button>
          )}
        </div>

        {!isEmbedded && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label">Target Cell Register</label>
              <select 
                className="form-select" 
                value={activeTargetCell}
                onChange={(e) => activeSetTargetCell(e.target.value)}
              >
                {cellsList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Select Genes to Highlight</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', maxHeight: '110px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '3px', padding: '0.5rem', backgroundColor: 'var(--bg-tertiary)' }}>
                {selectedGenes.map(gene => {
                  const active = activeHighlight.includes(gene);
                  return (
                    <span 
                      key={gene}
                      className={`stage-badge ${active ? 'selected' : ''}`}
                      onClick={() => {
                        if (active) {
                          activeSetHighlight(activeHighlight.filter(g => g !== gene));
                        } else {
                          activeSetHighlight([...activeHighlight, gene]);
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

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Loader className="animate-spin" size={32} color="var(--text-primary)" /></div>
        ) : traces.length > 0 ? (
          <div className="instrument-screen">
            <Plot
              data={traces}
              layout={{
                ...plotlyTheme,
                title: { 
                  text: `Developmental Expression Trajectories in "${activeTargetCell}"`,
                  font: { family: "'Fira Mono', 'Courier New', monospace", color: '#1e2229', size: 13 }
                },
                xaxis: { ...plotlyTheme.xaxis, categoryorder: 'array', categoryarray: stages, title: { text: 'Developmental Stage', font: { size: 9 } } },
                yaxis: { ...plotlyTheme.yaxis, title: { text: 'Log Expression', font: { size: 9 } } },
                height: 480,
                hovermode: 'closest',
                margin: { l: 50, r: 20, t: 50, b: 50 }
              }}
              useResizeHandler
              style={{ width: '100%' }}
            />
          </div>
        ) : (
          <div className="alert alert-warning">
            <AlertTriangle className="alert-warning-icon" size={16} />
            <div>No matching expression values for the selected genes. Adjust global settings or active stages.</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CellCentricView;
