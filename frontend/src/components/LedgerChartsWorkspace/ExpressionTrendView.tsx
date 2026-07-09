import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
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

interface ExpressionTrendViewProps {
  isEmbedded?: boolean;
  pivotView?: boolean;
  setPivotView?: (val: boolean) => void;
}

export function ExpressionTrendView({ isEmbedded = false, pivotView, setPivotView }: ExpressionTrendViewProps) {
  const { selectedGenes, selectedStages, minExpression, excludeLowExpression, geneCache, fetchGeneData } = useAppStore();
  const [localPivot, setLocalPivot] = useState(false);
  const activePivotView = pivotView !== undefined ? pivotView : localPivot;
  const activeSetPivotView = setPivotView !== undefined ? setPivotView : setLocalPivot;
  const [loading, setLoading] = useState(false);

  // Trigger loading details of all selected genes
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all(selectedGenes.map(g => fetchGeneData(g)));
      setLoading(false);
    };
    loadAll();
  }, [selectedGenes, fetchGeneData]);

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

  const handleExportCSV = () => {
    let csv = 'Gene,Stage,Cell,LogExpression\n';
    selectedGenes.forEach(gene => {
      const data = geneCache[gene];
      if (!data) return;
      Object.entries(data.expression).forEach(([stage, cells]) => {
        if (!selectedStages.includes(stage)) return;
        Object.entries(cells).forEach(([cell, expr]) => {
          const numExpr = expr as number;
          if (numExpr < minExpression) return;
          if (excludeLowExpression && numExpr < 0.10) return;
          csv += `${gene},${stage},"${cell.replace(/"/g, '""')}",${numExpr}\n`;
        });
      });
    });
    downloadCSV(`expression_trends_${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', width: '100%' }}><Loader className="animate-spin" size={32} color="var(--text-primary)" /></div>;
  }

  if (selectedGenes.length === 0) {
    return (
      <div className="alert alert-info">
        <Info className="alert-info-icon" size={16} />
        <div>Please select or paste genes in the <strong>Gene Cohorts</strong> tab first.</div>
      </div>
    );
  }

  // Melt/format the data for Plotly
  const plotData: any[] = [];
  selectedGenes.forEach(gene => {
    const data = geneCache[gene];
    if (!data) return;

    Object.entries(data.expression).forEach(([stage, cells]) => {
      if (!selectedStages.includes(stage)) return;
      Object.entries(cells).forEach(([cell, expr]) => {
        const numExpr = expr as number;
        if (numExpr < minExpression) return;
        if (excludeLowExpression && numExpr < 0.10) return;

        plotData.push({
          gene,
          stage,
          cell,
          expression: numExpr
        });
      });
    });
  });

  if (plotData.length === 0) {
    return (
      <div className="alert alert-warning">
        <AlertTriangle className="alert-warning-icon" size={16} />
        <div>No data matches the current stage/expression filters. Adjust settings in the diagnostic panel.</div>
      </div>
    );
  }

  // Define layout
  const stageOrder = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult'].filter(s => selectedStages.includes(s));

  if (activePivotView) {
    // Group by cell type
    const cellGroups = Array.from(new Set(plotData.map((d: any) => d.cell))).slice(0, 10); // Display first 10 cells
    return (
      <div style={{ width: '100%' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h3 style={{ margin: 0 }}>Expression Profiles (Grouped by Cell Type)</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              {!isEmbedded && (
                <label className="form-checkbox-label">
                  <input type="checkbox" checked={activePivotView} onChange={(e) => activeSetPivotView(e.target.checked)} />
                  <span>Pivot View: Group by Cell Type</span>
                </label>
              )}
              <button className="btn btn-secondary" onClick={handleExportCSV}>
                <Download size={12} /> EXPORT_CSV
              </button>
            </div>
          </div>
          
          {cellGroups.map(cell => {
            const cellData = plotData.filter((d: any) => d.cell === cell);
            return (
              <div key={cell as string} style={{ marginBottom: '2.5rem' }}>
                <div className="instrument-screen">
                  <Plot
                    data={[{
                      x: cellData.map((d: any) => d.stage),
                      y: cellData.map((d: any) => d.expression),
                      text: cellData.map((d: any) => `Gene: ${d.gene}<br>Cell: ${d.cell}`),
                      type: 'box' as any,
                      boxpoints: 'all' as any,
                      jitter: 0.7,
                      pointpos: 0,
                      marker: { color: '#1d4ed8', size: 5 }
                    }]}
                    layout={{
                      ...plotlyTheme,
                      title: { 
                        text: `Expression Profiles in ${cell}`,
                        font: { family: "'Fira Mono', 'Courier New', monospace", color: '#1e2229', size: 13 }
                      },
                      xaxis: { ...plotlyTheme.xaxis, categoryorder: 'array', categoryarray: stageOrder, title: { text: 'Developmental Stage', font: { size: 9 } } },
                      yaxis: { ...plotlyTheme.yaxis, title: { text: 'Log Expression', font: { size: 9 } } },
                      height: 330,
                      margin: { l: 50, r: 20, t: 50, b: 50 }
                    }}
                    useResizeHandler
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Normal View: Group by Gene
  return (
    <div style={{ width: '100%' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 style={{ margin: 0 }}>Expression Profiles (Grouped by Gene)</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            {!isEmbedded && (
              <label className="form-checkbox-label">
                <input type="checkbox" checked={activePivotView} onChange={(e) => activeSetPivotView(e.target.checked)} />
                <span>Pivot View: Group by Cell Type</span>
              </label>
            )}
            <button className="btn btn-secondary" onClick={handleExportCSV}>
              <Download size={12} /> EXPORT_CSV
            </button>
          </div>
        </div>

        {selectedGenes.map(gene => {
          const geneData = plotData.filter((d: any) => d.gene === gene);
          if (geneData.length === 0) return null;

          return (
            <div key={gene} style={{ marginBottom: '2.5rem', borderBottom: '1px dashed var(--border-color)', paddingBottom: '1.5rem' }}>
              <div className="instrument-screen">
                <Plot
                  data={[{
                    x: geneData.map((d: any) => d.stage),
                    y: geneData.map((d: any) => d.expression),
                    text: geneData.map((d: any) => `Cell: ${d.cell}`),
                    type: 'box' as any,
                    boxpoints: 'all' as any,
                    jitter: 0.7,
                    pointpos: 0,
                    marker: { color: '#2e3440', size: 5 }
                  }]}
                  layout={{
                    ...plotlyTheme,
                    title: { 
                      text: `Developmental Expression Trend for "${gene}"`,
                      font: { family: "'Fira Mono', 'Courier New', monospace", color: '#1e2229', size: 13 }
                    },
                    xaxis: { ...plotlyTheme.xaxis, categoryorder: 'array', categoryarray: stageOrder, title: { text: 'Developmental Stage', font: { size: 9 } } },
                    yaxis: { ...plotlyTheme.yaxis, title: { text: 'Log Expression', font: { size: 9 } } },
                    height: 330,
                    margin: { l: 50, r: 20, t: 50, b: 50 }
                  }}
                  useResizeHandler
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ExpressionTrendView;
