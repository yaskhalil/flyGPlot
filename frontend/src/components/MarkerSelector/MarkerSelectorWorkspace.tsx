// Marker Selector — cluster-first entry point.
//
// Every other tab starts from a gene. This one starts from a cell type and asks
// the question the lab actually builds reagents around: which gene, or which
// pair of genes, is ON here and OFF everywhere else across development?
//
// Pairs are ranked as split-GAL4 intersections, so a pair is scored on the
// clusters where BOTH genes are ON.

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { findMarkers, type MarkerResult, type StageMode } from '../../services/onoffMatrix';
import { downloadCSV } from '../../utils/csv';
import { WorkspaceLayout } from '../shared/WorkspaceLayout';
import { Compass, Loader, AlertTriangle, Download, Plus } from 'lucide-react';

const STAGE_MODE_LABEL: Record<StageMode, string> = {
  all: 'ON at ALL selected stages',
  any: 'ON at ANY selected stage',
};

// cell_list.json lists Adult first; markers are read developmentally, so the
// badges are ordered by actual time rather than by the index's order.
const STAGE_ORDER = ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult'];
const byStage = (a: string, b: string) =>
  STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b);

export function MarkerSelectorWorkspace() {
  const { cellsList, stagesList, addGenesToSelection } = useAppStore();

  const [target, setTarget] = useState('');
  const [stages, setStages] = useState<string[]>(stagesList);
  const [threshold, setThreshold] = useState(0.5);
  const [mode, setMode] = useState<StageMode>('all');
  const [minCoverage, setMinCoverage] = useState(6);
  const [result, setResult] = useState<MarkerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target && cellsList.length > 0) setTarget(cellsList[0]);
  }, [cellsList, target]);

  useEffect(() => {
    if (stages.length === 0 && stagesList.length > 0) setStages(stagesList);
  }, [stagesList]);

  const run = useCallback(async () => {
    if (!target || stages.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const r = await findMarkers({
        targetCell: target, stages, threshold, mode,
        minStagesMeasured: Math.min(minCoverage, stages.length),
      });
      setResult(r);
    } catch (e: any) {
      setError(e?.message || 'Marker search failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [target, stages, threshold, mode, minCoverage]);

  const toggleStage = (s: string) =>
    setStages(prev => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]));

  // Reads result.query, never the live form: the controls can be changed after
  // a search without re-running it, and a CSV headed with parameters that did
  // not produce its rows is the artifact that reaches the bench.
  const exportCSV = () => {
    if (!result) return;
    const q = result.query;
    let csv = `# target=${q.targetCell} stages=${q.stages.join('|')} rule=${q.mode} threshold=${q.threshold}\n`;
    csv += `# minimum stages measured in target: ${q.minStagesMeasured}\n`;
    csv += `# off-target clusters considered: ${result.offTargetTotal}\n`;
    csv += 'Type,GeneA,GeneB,OffTargetON,Specificity,StagesMeasured,MinPosteriorInTarget,Gain\n';
    for (const s of result.singles) {
      csv += `single,${s.gene},,${s.offTargetOn},${s.specificity.toFixed(4)},${s.stagesMeasured},${s.targetMargin.toFixed(3)},\n`;
    }
    for (const p of result.pairs) {
      csv += `pair,${p.genes[0]},${p.genes[1]},${p.offTargetOn},${p.specificity.toFixed(4)},,,${p.gain}\n`;
    }
    downloadCSV(`markers_${q.targetCell.replace(/[^\w]+/g, '_')}_${q.mode}.csv`, csv);
  };

  const controls = (
    <>
      <div className="form-group">
        <label className="form-label">Target cluster</label>
        <select className="form-input" value={target} onChange={e => setTarget(e.target.value)}>
          {cellsList.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Stages</label>
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          {[...stagesList].sort(byStage).map(s => (
            <span key={s}
              className={`stage-badge ${stages.includes(s) ? 'selected' : ''}`}
              onClick={() => toggleStage(s)}
              style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem', cursor: 'pointer' }}>
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Multi-stage rule</label>
        <select className="form-input" value={mode}
          onChange={e => setMode(e.target.value as StageMode)}
          disabled={stages.length < 2}>
          <option value="all">{STAGE_MODE_LABEL.all}</option>
          <option value="any">{STAGE_MODE_LABEL.any}</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">ON threshold ({threshold.toFixed(2)})</label>
        <input type="range" min="0" max="1" step="0.05" value={threshold}
          onChange={e => setThreshold(parseFloat(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--primary)' }} />
      </div>

      <div className="form-group">
        <label className="form-label">
          Min stages measured in target ({minCoverage} of {stages.length})
        </label>
        <input type="range" min="1" max={Math.max(stages.length, 1)} step="1"
          value={Math.min(minCoverage, stages.length)}
          onChange={e => setMinCoverage(parseInt(e.target.value, 10))}
          style={{ width: '100%', accentColor: 'var(--primary)' }} />
        <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
          Lowering this admits genes backed by fewer timepoints.
        </div>
      </div>

      <button className="btn" onClick={run} disabled={loading || !target || stages.length === 0}
        style={{ width: '100%' }}>
        {loading ? <><Loader size={12} className="animate-spin" /> Scanning…</> : 'Find markers'}
      </button>

      {result && (
        <button className="btn btn-secondary" onClick={exportCSV}
          style={{ width: '100%', marginTop: '0.5rem' }}>
          <Download size={12} /> Export CSV
        </button>
      )}
    </>
  );

  return (
    <WorkspaceLayout title="MARKER SEARCH" controls={controls}>
      {error && (
        <div className="card" style={{ padding: '1rem', display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
          <AlertTriangle size={16} color="var(--error)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{error}</div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Compass size={30} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Pick a target cluster and press <strong>Find markers</strong> to scan
            every gene for one that is ON there and OFF elsewhere.
          </p>
        </div>
      )}

      {result && (
        <>
          <div style={{ marginBottom: '0.85rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            Scanned {result.genesScanned.toLocaleString()} genes against{' '}
            {result.offTargetTotal} off-target clusters ·{' '}
            {result.singlesTotal.toLocaleString()} candidates ON in {result.query.targetCell}
            {result.singlesTotal > result.singles.length &&
              <> (showing top {result.singles.length})</>}
            <br />
            {result.query.stages.join(', ')} · {STAGE_MODE_LABEL[result.query.mode].toLowerCase()} ·
            threshold ≥ {result.query.threshold.toFixed(2)} ·
            requiring {result.query.minStagesMeasured} of the{' '}
            {result.query.stagesAvailable} stage{result.query.stagesAvailable !== 1 ? 's' : ''} this cluster appears in
            {result.droppedLowCoverage > 0 && (
              <> · {result.droppedLowCoverage.toLocaleString()} genes hidden for
                fewer than {result.query.minStagesMeasured} measured stages</>
            )}
          </div>

          {/* ── Single genes ── */}
          <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.6rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
              Single genes
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
                <thead>
                  <tr>
                    <th style={th}>Gene</th>
                    <th style={{ ...th, textAlign: 'right' }} title="Other clusters where this gene is also ON">Off-target ON</th>
                    <th style={{ ...th, textAlign: 'right' }}>Specificity</th>
                    <th style={{ ...th, textAlign: 'right' }} title="Selected stages that actually measured this gene in the target">Stages</th>
                    <th style={{ ...th, textAlign: 'right' }} title="Lowest posterior for this gene in the target across the measured stages">Min posterior</th>
                    <th style={th} />
                  </tr>
                </thead>
                <tbody>
                  {result.singles.slice(0, 25).map(s => (
                    <tr key={s.gene} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ ...td, fontWeight: 700 }}>{s.gene}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{s.offTargetOn}</td>
                      <td style={{ ...td, textAlign: 'right', color: s.specificity >= 0.99 ? 'var(--success)' : 'inherit', fontWeight: s.specificity >= 0.99 ? 700 : 400 }}>
                        {s.specificity.toFixed(3)}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: s.stagesMeasured < result.query.stagesAvailable ? 'var(--warning, #b45309)' : 'var(--text-muted)' }}>
                        {s.stagesMeasured}/{result.query.stagesAvailable}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>{s.targetMargin.toFixed(2)}</td>
                      <td style={td}>
                        <button className="btn btn-secondary"
                          style={{ padding: '0.1rem 0.35rem', fontSize: '0.62rem', boxShadow: 'none' }}
                          onClick={() => addGenesToSelection([s.gene])}
                          title="Add to gene cohort">
                          <Plus size={9} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Pairs ── */}
          <div className="card" style={{ padding: '1rem' }}>
            <h3 style={{ marginBottom: '0.3rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
              Two-gene combinations
            </h3>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
              Scored on clusters where <strong>both</strong> genes are ON — the intersection a
              split-GAL4 would label. <em>Gain</em> is how many off-target clusters the pair removes
              versus the better gene alone; a gain of 0 means the single gene already suffices.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
                <thead>
                  <tr>
                    <th style={th}>Gene A ∩ Gene B</th>
                    <th style={{ ...th, textAlign: 'right' }}>Both ON off-target</th>
                    <th style={{ ...th, textAlign: 'right' }}>Best single</th>
                    <th style={{ ...th, textAlign: 'right' }}>Gain</th>
                    <th style={th}>Remaining off-target</th>
                    <th style={th} />
                  </tr>
                </thead>
                <tbody>
                  {result.pairs.slice(0, 25).map(p => (
                    <tr key={p.genes.join('|')} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ ...td, fontWeight: 700 }}>{p.genes[0]} ∩ {p.genes[1]}</td>
                      <td style={{ ...td, textAlign: 'right', color: p.offTargetOn === 0 ? 'var(--success)' : 'inherit', fontWeight: p.offTargetOn === 0 ? 700 : 400 }}>
                        {p.offTargetOn}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>{p.bestSingle}</td>
                      <td style={{ ...td, textAlign: 'right', color: p.gain > 0 ? 'var(--secondary)' : 'var(--text-muted)' }}>
                        {p.gain > 0 ? `−${p.gain}` : '0'}
                      </td>
                      <td style={{ ...td, color: 'var(--text-muted)', fontSize: '0.65rem', maxWidth: 260 }}>
                        {p.offTargetNames.length > 0 ? p.offTargetNames.join(', ') : p.offTargetOn === 0 ? '—' : `${p.offTargetOn} clusters`}
                      </td>
                      <td style={td}>
                        <button className="btn btn-secondary"
                          style={{ padding: '0.1rem 0.35rem', fontSize: '0.62rem', boxShadow: 'none' }}
                          onClick={() => addGenesToSelection(p.genes)}
                          title="Add both to gene cohort">
                          <Plus size={9} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </WorkspaceLayout>
  );
}

const th: React.CSSProperties = {
  padding: '0.35rem 0.5rem',
  fontSize: '0.63rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 700,
  color: 'var(--text-primary)',
  backgroundColor: 'var(--bg-tertiary)',
  borderBottom: '2px solid var(--text-primary)',
  textAlign: 'left',
};

const td: React.CSSProperties = {
  padding: '0.35rem 0.5rem',
};

export default MarkerSelectorWorkspace;
