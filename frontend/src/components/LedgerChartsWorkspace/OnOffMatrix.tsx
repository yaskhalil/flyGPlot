// On/Off Expression Matrix — binarized view using mixture modeling probabilities
// Shows which genes are ON in which cell types at selected developmental stages.

import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Compass, Download, Loader } from 'lucide-react';
import { downloadCSV } from '../../utils/csv';

const STAGES = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult'];

// How a gene's per-stage ON calls collapse into a single call when several
// stages are selected. A driver line has to hold up at every stage you plan to
// dissect at, so "all" is the default — "any" is exploratory only.
type StageMode = 'all' | 'any';

const STAGE_MODE_LABEL: Record<StageMode, string> = {
  all: 'ON at ALL selected stages',
  any: 'ON at ANY selected stage',
};

export function OnOffMatrix() {
  const { selectedGenes, geneCache, stagesList, fetchGeneData } = useAppStore();
  const stages = stagesList.length > 0 ? stagesList : STAGES;

  const [probThreshold, setProbThreshold] = useState(0.5);
  const [selectedStages, setSelectedStages] = useState<string[]>([stages[0] || 'P15']);
  const [stageMode, setStageMode] = useState<StageMode>('all');
  const [cellFilter, setCellFilter] = useState('');

  // Pre-load gene data if not cached
  useEffect(() => {
    for (const gene of selectedGenes) {
      if (!geneCache[gene]) {
        fetchGeneData(gene);
      }
    }
  }, [selectedGenes.join(',')]);

  const toggleStage = (stage: string) => {
    setSelectedStages(prev =>
      prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage]
    );
  };

  // Build the ON/OFF matrix.
  //
  // Each (gene, cell) is scored per stage and only then collapsed, so a gene ON
  // at P15 but OFF by Adult never reads as a clean ON. Cells that switch during
  // the selected window are tracked separately as 'partial' — for marker
  // selection that is a distinct answer from ON, not a rounding case.
  const matrix = useMemo(() => {
    type Row = {
      gene: string;
      call: Map<string, 'on' | 'partial' | 'off'>;
      onCount: number;
      partialCount: number;
    };
    const rows: Row[] = [];

    for (const gene of selectedGenes) {
      const data = geneCache[gene];
      if (!data?.mixture_modeling) continue;

      // cell -> [stages scored, stages passing threshold]
      const tally = new Map<string, { scored: number; on: number }>();

      for (const stage of selectedStages) {
        const stageProbs = data.mixture_modeling[stage];
        if (!stageProbs) continue;
        for (const [cell, prob] of Object.entries(stageProbs)) {
          const t = tally.get(cell) || { scored: 0, on: 0 };
          t.scored += 1;
          if (prob >= probThreshold) t.on += 1;
          tally.set(cell, t);
        }
      }

      const call = new Map<string, 'on' | 'partial' | 'off'>();
      let onCount = 0;
      let partialCount = 0;

      for (const [cell, t] of tally) {
        // A cell only counts as ON under 'all' if every stage that actually has
        // data for it passed. Stages missing this cell are not silently treated
        // as passing.
        const isOn = stageMode === 'all' ? t.on === t.scored && t.scored > 0 : t.on > 0;
        if (isOn) {
          call.set(cell, 'on');
          onCount += 1;
        } else if (t.on > 0) {
          call.set(cell, 'partial');
          partialCount += 1;
        } else {
          call.set(cell, 'off');
        }
      }

      rows.push({ gene, call, onCount, partialCount });
    }

    return rows;
  }, [selectedGenes, geneCache, selectedStages, probThreshold, stageMode]);

  // Determine which cell types to show (filtered + from data)
  const displayCells = useMemo(() => {
    const allCells = new Set<string>();
    for (const row of matrix) {
      for (const c of row.call.keys()) allCells.add(c);
    }
    if (allCells.size === 0) return [];
    let filtered = Array.from(allCells);
    if (cellFilter) {
      filtered = filtered.filter(c => c.toLowerCase().includes(cellFilter.toLowerCase()));
    }
    return filtered.sort();
  }, [matrix, cellFilter]);

  const maxOnCount = Math.max(...matrix.map(r => r.onCount), 0);
  const loadedCount = selectedGenes.filter(g => geneCache[g]?.mixture_modeling).length;

  // 1 = ON, 0 = OFF, 0.5 = ON at some but not all selected stages. Encoding
  // partial as its own value keeps the CSV honest for downstream analysis.
  const handleExport = () => {
    if (matrix.length === 0 || displayCells.length === 0) return;
    const stagesLabel = selectedStages.join('+');
    let csv = `# stages=${selectedStages.join('|')} rule=${stageMode} threshold=${probThreshold}\n`;
    csv += `# 1=ON, 0=OFF, 0.5=partial (ON at some but not all selected stages)\n`;
    csv += `Gene,TotalON,TotalPartial,` + displayCells.join(',') + '\n';
    for (const row of matrix) {
      const vals = displayCells.map(c => {
        const v = row.call.get(c);
        return v === 'on' ? '1' : v === 'partial' ? '0.5' : '0';
      });
      csv += `${row.gene},${row.onCount},${row.partialCount},${vals.join(',')}\n`;
    }
    downloadCSV(`onoff_${stagesLabel}_${stageMode}_th${probThreshold}.csv`, csv);
  };

  if (selectedGenes.length === 0) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center', margin: 0 }}>
        <Compass size={32} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Add genes to the Specimen Bag to view the ON/OFF expression matrix.
        </p>
      </div>
    );
  }

  if (loadedCount === 0) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center', margin: 0 }}>
        <Loader className="animate-spin" size={24} color="var(--text-muted)" />
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
          Loading mixture modeling data... ({selectedGenes.length} genes)
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {/* ── Controls ── */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {/* Stage checkboxes */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Stages</label>
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {stages.map(s => (
              <span key={s}
                className={`stage-badge ${selectedStages.includes(s) ? 'selected' : ''}`}
                onClick={() => toggleStage(s)}
                style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem' }}>
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Multi-stage collapse rule */}
        <div className="form-group" style={{ marginBottom: 0, minWidth: '190px' }}>
          <label className="form-label">Multi-stage rule</label>
          <select
            className="form-input"
            value={stageMode}
            onChange={e => setStageMode(e.target.value as StageMode)}
            disabled={selectedStages.length < 2}
            title={selectedStages.length < 2
              ? 'Applies when two or more stages are selected'
              : STAGE_MODE_LABEL[stageMode]}
          >
            <option value="all">{STAGE_MODE_LABEL.all}</option>
            <option value="any">{STAGE_MODE_LABEL.any}</option>
          </select>
        </div>

        {/* Threshold slider */}
        <div className="form-group" style={{ marginBottom: 0, minWidth: '140px' }}>
          <label className="form-label">ON Threshold ({probThreshold.toFixed(1)})</label>
          <input type="range" min="0" max="1" step="0.05" value={probThreshold}
            onChange={e => setProbThreshold(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--primary)' }} />
        </div>

        {/* Cell search */}
        <div className="form-group" style={{ marginBottom: 0, minWidth: '140px' }}>
          <label className="form-label">Search Cell</label>
          <input type="text" className="form-input" placeholder="Filter cells..."
            value={cellFilter} onChange={e => setCellFilter(e.target.value)} />
        </div>

        {matrix.length > 0 && (
          <button className="btn btn-secondary" onClick={handleExport}
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.72rem', boxShadow: 'none', marginBottom: '0.15rem' }}>
            <Download size={12} /> CSV
          </button>
        )}
      </div>

      {/* ── Summary bar ── */}
      <div style={{ marginBottom: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
        {loadedCount} genes × {displayCells.length} cell types at {selectedStages.join(', ')} (threshold ≥ {probThreshold.toFixed(1)})
        {selectedStages.length > 1 && <> — counting ON only when {stageMode === 'all' ? 'every' : 'at least one'} selected stage passes</>}
        <span style={{ marginLeft: '0.75rem' }}>
          <span style={{
            display: 'inline-block', width: '9px', height: '9px', borderRadius: '2px',
            backgroundColor: 'var(--success)', verticalAlign: 'middle', marginRight: '0.25rem',
          }} />ON
          {/* Under the 'any' rule a cell ON at even one stage is ON, so the
              partial state cannot arise and its key would be noise. */}
          {stageMode === 'all' && selectedStages.length > 1 && (
            <>
              <span style={{
                display: 'inline-block', width: '9px', height: '9px', borderRadius: '2px',
                backgroundImage: 'repeating-linear-gradient(45deg, var(--warning, #b45309) 0 2px, transparent 2px 4px)',
                border: '1px solid var(--border-color)',
                verticalAlign: 'middle', marginLeft: '0.6rem', marginRight: '0.25rem',
              }} />partial
            </>
          )}
        </span>
      </div>

      {/* ── Matrix ── */}
      {displayCells.length > 0 ? (
        <div className="card" style={{ padding: 0, margin: 0, overflow: 'auto' }}>
          <table style={{
            borderCollapse: 'collapse', width: '100%', minWidth: displayCells.length * 60 + 120,
            fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
          }}>
            <thead>
              <tr>
                <th style={thStyle}>Gene</th>
                <th style={{ ...thStyle, textAlign: 'center', width: '3rem' }}>ON</th>
                {displayCells.map(c => (
                  <th key={c} style={{ ...thStyle, textAlign: 'center', writingMode: 'vertical-lr' as any, height: '80px', fontSize: '0.6rem', padding: '0.3rem 0.4rem' }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map(row => (
                <tr key={row.gene} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.3rem 0.5rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                    {row.gene}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: row.onCount === maxOnCount && maxOnCount > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                    {row.onCount}
                  </td>
                  {displayCells.map(c => {
                    const state = row.call.get(c) || 'off';
                    const isOn = state === 'on';
                    const isPartial = state === 'partial';
                    return (
                      <td key={c} style={{
                        padding: '0.2rem',
                        textAlign: 'center',
                        backgroundColor: isOn
                          ? 'rgba(15,118,110,0.12)'
                          : isPartial ? 'rgba(180,83,9,0.10)' : 'var(--bg-tertiary)',
                        borderLeft: '1px solid var(--border-color)',
                        minWidth: '30px',
                      }}
                        title={`${row.gene} × ${c}: ${isPartial ? 'ON at some but not all selected stages' : state.toUpperCase()}`}
                      >
                        <span style={{
                          display: 'inline-block', width: '12px', height: '12px', borderRadius: '2px',
                          backgroundColor: isOn ? 'var(--success)' : 'transparent',
                          // Hatched fill marks a developmentally dynamic call so it
                          // reads as distinct from a solid ON at a glance.
                          backgroundImage: isPartial
                            ? 'repeating-linear-gradient(45deg, var(--warning, #b45309) 0 2px, transparent 2px 4px)'
                            : undefined,
                          border: isOn ? 'none' : '1px solid var(--border-color)',
                        }} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', margin: 0 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {loadedCount > 0
              ? 'No cell types match the current filters. Adjust the probability threshold or select different stages.'
              : 'Loading gene expression data...'}
          </p>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '0.4rem 0.5rem',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 700,
  color: 'var(--text-primary)',
  backgroundColor: 'var(--bg-tertiary)',
  borderBottom: '2px solid var(--text-primary)',
  textAlign: 'left',
  position: 'sticky' as any,
  top: 0,
  zIndex: 2,
};

export default OnOffMatrix;
