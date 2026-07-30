// Aggregate Co-expression View — find genes most co-expressed with the entire selected cohort
// Uses cached per-gene co-expression data to compute average correlation scores.

import { useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Compass, Plus } from 'lucide-react';

export function CoexpAggregateView() {
  const { selectedGenes, geneCache, addGenesToSelection, dashMetric } = useAppStore();

  const aggregateResults = useMemo(() => {
    const metric = dashMetric as 'pearson' | 'spearman' | 'jaccard';
    const scoreMap = new Map<string, { total: number; count: number }>();

    for (const gene of selectedGenes) {
      const data = geneCache[gene];
      if (!data) continue;
      const scores = data.coexpression[metric];
      if (!scores) continue;
      for (const entry of scores) {
        const existing = scoreMap.get(entry.gene);
        if (existing) {
          existing.total += Math.abs(entry.score);
          existing.count += 1;
        } else {
          scoreMap.set(entry.gene, { total: Math.abs(entry.score), count: 1 });
        }
      }
    }

    // Convert to array, compute average, filter, sort
    const entries = Array.from(scoreMap.entries())
      .map(([gene, { total, count }]) => ({
        gene,
        avgScore: +(total / count).toFixed(4),
        matchCount: count,
      }))
      .filter(e => e.avgScore >= 0.1)
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 50);

    return entries;
  }, [selectedGenes, geneCache, dashMetric]);

  const loadedCount = selectedGenes.filter(g => geneCache[g]).length;

  if (selectedGenes.length === 0) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
        <Compass size={32} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Add genes to the Specimen Bag to see aggregate co-expression results.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '1.25rem', margin: 0 }}>
      <h3 style={{ marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Compass size={14} />
        AGGREGATE_COEXPRESSION
        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.5rem', fontSize: '0.7rem' }}>
          ({loadedCount}/{selectedGenes.length} genes loaded, {aggregateResults.length} results)
        </span>
      </h3>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontStyle: 'italic' }}>
        Top genes ranked by average {dashMetric} correlation across all {loadedCount} loaded cohort genes.
      </p>

      <div className="data-table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '2rem' }}>#</th>
              <th>Gene</th>
              <th style={{ textAlign: 'right' }}>Avg. Score</th>
              <th style={{ textAlign: 'right' }}>Matches</th>
              <th style={{ width: '4rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {aggregateResults.map((r, i) => (
              <tr key={r.gene} style={{ cursor: 'default' }}>
                <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{r.gene}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: r.avgScore > 0.7 ? 'var(--success)' : r.avgScore > 0.5 ? 'var(--secondary)' : 'var(--text-secondary)' }}>
                  {r.avgScore.toFixed(4)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {r.matchCount}/{loadedCount}
                </td>
                <td>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.15rem 0.35rem', fontSize: '0.6rem', boxShadow: 'none' }}
                    onClick={() => addGenesToSelection([r.gene])}
                    title={`Add ${r.gene} to specimen bag`}
                  >
                    <Plus size={10} /> Add
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CoexpAggregateView;
