// Cell-type TF Expression Matrix — heatmap of gene expression across cell types
// Uses cached gene data to build a stage-filterable expression matrix.

import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Compass, Loader, Download } from 'lucide-react';
import Plotly from 'plotly.js-dist-min';
import _createPlotlyComponent from 'react-plotly.js/factory';
const createPlotlyComponent = (typeof _createPlotlyComponent === 'function'
  ? _createPlotlyComponent
  : (_createPlotlyComponent as any).default) as Function;
const Plot = createPlotlyComponent(Plotly);

const plotlyTheme = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: {
    family: "'Fira Mono', 'Courier New', monospace",
    color: '#4d5663',
    size: 8,
  },
  xaxis: { gridcolor: 'rgba(0,0,0,0.04)', linecolor: '#c5c3ba', zerolinecolor: '#c5c3ba', tickcolor: '#c5c3ba', side: 'bottom' as any },
  yaxis: { gridcolor: 'rgba(0,0,0,0.04)', linecolor: '#c5c3ba', zerolinecolor: '#c5c3ba', tickcolor: '#c5c3ba' },
};

const STAGES = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult'];

export function CellTypeHeatmap() {
  const { selectedGenes, geneCache, cellsList, stagesList } = useAppStore();
  const [selectedStage, setSelectedStage] = useState(STAGES[0]);
  const [minExpr, setMinExpr] = useState(0);
  const [cellFilter, setCellFilter] = useState('');

  // Build the expression matrix
  const { genes, cells, zValues, loadedCount } = useMemo(() => {
    const activeGenes = selectedGenes.filter(g => geneCache[g]?.expression?.[selectedStage]);
    const filteredCells = cellsList.filter(c => !cellFilter || c.toLowerCase().includes(cellFilter.toLowerCase()));
    
    if (activeGenes.length === 0 || filteredCells.length === 0) {
      return { genes: [], cells: [], zValues: [[]], loadedCount: 0 };
    }

    const z: number[][] = [];
    const includeGene: boolean[] = [];

    for (const gene of activeGenes) {
      const expr = geneCache[gene].expression[selectedStage] || {};
      const row = filteredCells.map(c => expr[c] ?? 0);
      const maxVal = Math.max(...row, 0);
      includeGene.push(maxVal >= minExpr);
      if (maxVal >= minExpr) {
        z.push(row);
      }
    }

    return {
      genes: activeGenes.filter((_, i) => includeGene[i]),
      cells: filteredCells,
      zValues: z,
      loadedCount: activeGenes.length,
    };
  }, [selectedGenes, geneCache, selectedStage, cellsList, cellFilter, minExpr]);

  const exportCSV = () => {
    if (genes.length === 0 || cells.length === 0) return;
    let csv = 'Gene,' + cells.join(',') + '\n';
    for (let i = 0; i < genes.length; i++) {
      csv += genes[i] + ',' + zValues[i].join(',') + '\n';
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tf_matrix_${selectedStage}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ marginBottom: 0, minWidth: '120px' }}>
          <label className="form-label">Stage</label>
          <select className="form-select" value={selectedStage} onChange={e => setSelectedStage(e.target.value)}>
            {(stagesList.length > 0 ? stagesList : STAGES).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0, minWidth: '120px' }}>
          <label className="form-label">Min Expression ({minExpr.toFixed(1)})</label>
          <input type="range" min="0" max="3" step="0.1" value={minExpr}
            onChange={e => setMinExpr(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--primary)' }} />
        </div>

        <div className="form-group" style={{ marginBottom: 0, minWidth: '160px' }}>
          <label className="form-label">Search Cell</label>
          <input type="text" className="form-input" placeholder="Filter cell types..."
            value={cellFilter} onChange={e => setCellFilter(e.target.value)} />
        </div>

        {genes.length > 0 && (
          <button className="btn btn-secondary" onClick={exportCSV}
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.72rem', boxShadow: 'none', marginBottom: '0.15rem' }}>
            <Download size={12} /> CSV
          </button>
        )}
      </div>

      {/* Heatmap */}
      {selectedGenes.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', margin: 0 }}>
          <Compass size={32} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Add genes to the Specimen Bag to view the expression matrix.
          </p>
        </div>
      ) : loadedCount === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', margin: 0 }}>
          <Loader className="animate-spin" size={24} color="var(--text-muted)" />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
            Loading gene expression data... ({selectedGenes.length} genes in cohort)
          </p>
        </div>
      ) : genes.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', margin: 0 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            No genes meet the minimum expression threshold ({minExpr.toFixed(1)}) at stage {selectedStage}.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: '0.75rem', margin: 0, overflow: 'hidden' }}>
          <div style={{ marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            {genes.length} genes × {cells.length} cell types at <strong>{selectedStage}</strong>
          </div>
          <div className="instrument-screen" style={{ margin: 0, overflow: 'auto' }}>
            <Plot
              data={[{
                z: zValues,
                x: cells,
                y: genes,
                type: 'heatmap' as any,
                colorscale: [
                  [0, '#f4f2eb'],
                  [0.25, '#dbeafe'],
                  [0.5, '#1d4ed8'],
                  [0.75, '#1e3a5f'],
                  [1, '#0f172a'],
                ],
                hoverongaps: false,
                hovertemplate: '%{y} @ %{x}<br>Expr: %{z:.3f}<extra></extra>',
              }]}
              layout={{
                ...plotlyTheme,
                height: Math.max(300, Math.min(800, genes.length * 24 + 80)),
                margin: { l: 80, r: 20, t: 30, b: 120 },
                xaxis: {
                  ...plotlyTheme.xaxis,
                  tickangle: -45,
                  automargin: true,
                  tickfont: { size: 7 },
                },
                yaxis: {
                  ...plotlyTheme.yaxis,
                  tickfont: { size: 7 },
                  automargin: true,
                },
                coloraxis: {
                  colorbar: {
                    title: { text: 'Expression', font: { size: 8 } },
                    thickness: 10,
                    len: 0.6,
                  },
                },
              }}
              config={{ responsive: true, displayModeBar: false }}
              useResizeHandler
              style={{ width: '100%' }}
            />
          </div>
        </div>
      )}

      {/* Legend description */}
      {genes.length > 0 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
          Color scale: beige (low) → blue → dark navy (high). Hover for expression values.
        </div>
      )}
    </div>
  );
}

export default CellTypeHeatmap;
