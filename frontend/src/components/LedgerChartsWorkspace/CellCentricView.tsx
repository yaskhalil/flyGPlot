// Cell-Centric Trajectory View — spline expression profiles across developmental stages
// Shows how selected genes express in a chosen cell type over time.

import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { CellPayload } from '../../store/useAppStore';
import { downloadCSV } from '../../utils/csv';
import { Info, Download, Loader, Eye, EyeOff } from 'lucide-react';
import Plotly from 'plotly.js-dist-min';
import _createPlotlyComponent from 'react-plotly.js/factory';
const createPlotlyComponent = (typeof _createPlotlyComponent === 'function'
  ? _createPlotlyComponent
  : (_createPlotlyComponent as any).default) as Function;
const Plot = createPlotlyComponent(Plotly);

const LINE_COLORS = ['#1d4ed8', '#0f766e', '#991b1b', '#b45309', '#6d28d9', '#475569', '#0891b2', '#65a30d'];

const plotlyTheme = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: {
    family: "'Fira Mono', 'Courier New', monospace",
    color: '#4d5663',
    size: 9,
  },
  xaxis: {
    gridcolor: 'rgba(0, 0, 0, 0.04)',
    linecolor: '#c5c3ba',
    zerolinecolor: '#c5c3ba',
    tickcolor: '#c5c3ba',
  },
  yaxis: {
    gridcolor: 'rgba(0, 0, 0, 0.04)',
    linecolor: '#c5c3ba',
    zerolinecolor: '#c5c3ba',
    tickcolor: '#c5c3ba',
  },
};

const DEFAULT_STAGES = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult'];

export function CellCentricView() {
  const { cellsList, selectedGenes, stagesList, minExpression, excludeLowExpression, fetchCellData, geneCache } = useAppStore();
  const stages = stagesList.length > 0 ? stagesList : DEFAULT_STAGES;

  const [targetCell, setTargetCell] = useState('');
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [highlightMode, setHighlightMode] = useState<'all' | 'selected'>('all');

  // Pre-load gene data if not already cached
  useEffect(() => {
    for (const gene of selectedGenes) {
      if (!geneCache[gene]) {
        useAppStore.getState().fetchGeneData(gene);
      }
    }
  }, [selectedGenes.join(',')]);
  // Determine which cell types have expression data meeting the current filter thresholds
  const availableCells = useMemo(() => {
    const cellSet = new Set<string>();
    const stages = stagesList.length > 0 ? stagesList : DEFAULT_STAGES;
    for (const gene of selectedGenes) {
      const data = geneCache[gene];
      if (!data?.expression) continue;
      for (const stage of stages) {
        const stageExpr = data.expression[stage];
        if (!stageExpr) continue;
        for (const [cell, val] of Object.entries(stageExpr)) {
          if (val >= minExpression && (!excludeLowExpression || val >= 0.10)) {
            cellSet.add(cell);
          }
        }
      }
    }
    return cellSet;
  }, [selectedGenes, geneCache, stagesList, minExpression, excludeLowExpression]);

  // Filter cells list to only those with data
  const filteredCells = useMemo(() => {
    if (availableCells.size === 0) return cellsList;
    return cellsList.filter(c => availableCells.has(c));
  }, [cellsList, availableCells]);

  const [cellData, setCellData] = useState<CellPayload | null>(null);
  const [loading, setLoading] = useState(false);

  // Set default cell (pick first available one)
  // Also auto-switch if current target becomes unavailable
  useEffect(() => {
    if (filteredCells.length > 0) {
      if (!targetCell || !filteredCells.includes(targetCell)) {
        setTargetCell(filteredCells[0]);
      }
    }
  }, [filteredCells, targetCell]);

  // Fetch data on cell change
  useEffect(() => {
    if (targetCell) {
      setLoading(true);
      fetchCellData(targetCell).then(data => {
        setCellData(data);
        setLoading(false);
      });
    }
  }, [targetCell, fetchCellData]);

  // Toggle highlight for a gene
  const toggleHighlight = (gene: string) => {
    setHighlighted(prev =>
      prev.includes(gene) ? prev.filter(g => g !== gene) : [...prev, gene]
    );
  };

  // Build Plotly traces
  const traces = useMemo(() => {
    if (!cellData) return [];

    const useHighlights = highlightMode === 'selected' && highlighted.length > 0;
    let colorIdx = 0;

    return selectedGenes.map(gene => {
      const xVals: any[] = [];
      const yVals: any[] = [];

      stages.forEach(stage => {
        const val = cellData.expression[stage]?.[gene];
        if (val !== undefined && val >= minExpression && (!excludeLowExpression || val >= 0.10)) {
          xVals.push(stage);
          yVals.push(val);
        }
      });

      if (xVals.length === 0) return null;

      const isHighlighted = !useHighlights || highlighted.includes(gene);
      const color = useHighlights && isHighlighted
        ? LINE_COLORS[colorIdx++ % LINE_COLORS.length]
        : '#d8d6d0';

      return {
        x: xVals,
        y: yVals,
        name: gene,
        mode: 'lines+markers',
        line: {
          color,
          width: isHighlighted ? 3.5 : 1.5,
          shape: 'spline' as any,
        },
        marker: { size: isHighlighted ? 8 : 4 },
        opacity: 1.0,
        showlegend: isHighlighted || !useHighlights,
      };
    }).filter(Boolean);
  }, [cellData, selectedGenes, stages, minExpression, excludeLowExpression, highlightMode, highlighted]);

  const handleExportCSV = () => {
    if (!cellData) return;
    let csv = 'Gene,Stage,Cell,Expression\n';
    selectedGenes.forEach(gene => {
      stages.forEach(stage => {
        const val = cellData.expression[stage]?.[gene];
        if (val !== undefined && val >= minExpression && (!excludeLowExpression || val >= 0.10)) {
          csv += `${gene},${stage},"${targetCell.replace(/"/g, '""')}",${val}\n`;
        }
      });
    });
    downloadCSV(`trajectory_${targetCell.replace(/\s+/g, '_')}.csv`, csv);
  };

  if (selectedGenes.length === 0) {
    return (
      <div className="card" style={{ padding: '1.5rem', margin: 0 }}>
        <div className="alert alert-info" style={{ margin: 0 }}>
          <Info className="alert-info-icon" size={16} />
          <div>Add genes to the Specimen Bag to view developmental trajectories.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {/* ── Inline Controls ── */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ marginBottom: 0, minWidth: '200px', flexGrow: 1 }}>
          <label className="form-label">Target Cell Type</label>
          <select className="form-select" value={targetCell}
            onChange={e => setTargetCell(e.target.value)}>
            {filteredCells.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {filteredCells.length === 0 && cellsList.length > 0 && (
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '0.25rem' }}>
              No cell types with expression data at current thresholds
            </div>
          )}
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">View Mode</label>
          <div className="toggle-group" style={{ margin: 0 }}>
            <button className={`toggle-group-btn ${highlightMode === 'all' ? 'active' : ''}`}
              onClick={() => setHighlightMode('all')}>
              <Eye size={12} /> All
            </button>
            <button className={`toggle-group-btn ${highlightMode === 'selected' ? 'active' : ''}`}
              onClick={() => setHighlightMode('selected')}>
              <EyeOff size={12} /> Highlight
            </button>
          </div>
        </div>

        {cellData && (
          <button className="btn btn-secondary" onClick={handleExportCSV}
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.72rem', boxShadow: 'none', marginBottom: '0.15rem' }}>
            <Download size={12} /> CSV
          </button>
        )}
      </div>

      {/* ── Highlight Toggles (visible when highlighting is active) ── */}
      {highlightMode === 'selected' && (
        <div style={{
          marginBottom: '1rem', padding: '0.5rem 0.75rem',
          border: '1px solid var(--border-color)', borderRadius: '4px',
          backgroundColor: 'var(--bg-card)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Highlighted Genes ({highlighted.length}/{selectedGenes.length})
            </span>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              <button className="btn btn-secondary"
                onClick={() => setHighlighted([...selectedGenes])}
                style={{ padding: '0.15rem 0.4rem', fontSize: '0.6rem', boxShadow: 'none' }}>
                Select All
              </button>
              <button className="btn btn-secondary"
                onClick={() => setHighlighted([])}
                style={{ padding: '0.15rem 0.4rem', fontSize: '0.6rem', boxShadow: 'none' }}>
                Clear
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            {selectedGenes.map((gene, i) => {
              const active = highlighted.includes(gene);
              return (
                <span key={gene}
                  style={{
                    padding: '0.15rem 0.4rem', borderRadius: '3px', cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                    backgroundColor: active ? LINE_COLORS[i % LINE_COLORS.length] + '20' : 'var(--bg-tertiary)',
                    border: `1px solid ${active ? LINE_COLORS[i % LINE_COLORS.length] : 'var(--border-color)'}`,
                    color: active ? LINE_COLORS[i % LINE_COLORS.length] : 'var(--text-muted)',
                    fontWeight: active ? 700 : 400,
                    transition: 'all 0.1s',
                  }}
                  onClick={() => toggleHighlight(gene)}>
                  {gene}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Plot ── */}
      <div className="card" style={{ margin: 0 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <Loader className="animate-spin" size={32} color="var(--text-primary)" />
          </div>
        ) : traces.length > 0 ? (
          <div className="instrument-screen" style={{ margin: 0 }}>
            <Plot
              data={traces}
              layout={{
                ...plotlyTheme,
                title: {
                  text: `Developmental Trajectory — ${targetCell}`,
                  font: { family: "'Fira Mono', 'Courier New', monospace", color: '#1e2229', size: 13 },
                },
                xaxis: {
                  ...plotlyTheme.xaxis,
                  categoryorder: 'array',
                  categoryarray: stages,
                  title: { text: 'Developmental Stage', font: { size: 9 } },
                },
                yaxis: {
                  ...plotlyTheme.yaxis,
                  title: { text: 'Log Expression', font: { size: 9 } },
                },
                height: 480,
                hovermode: 'closest',
                margin: { l: 50, r: 20, t: 50, b: 50 },
                legend: {
                  font: { size: 8 },
                  traceorder: 'normal',
                  itemsizing: 'constant',
                },
              }}
              useResizeHandler
              style={{ width: '100%' }}
            />
          </div>
        ) : null /* traces should never be empty — dropdown only lists cells with data */
        }
      </div>
    </div>
  );
}

export default CellCentricView;
