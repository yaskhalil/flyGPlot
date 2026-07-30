// Co-expression Module Browser — hierarchical clustering + clustered heatmap
// Finds regulatory modules by clustering genes by co-expression similarity.

import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Compass, Loader } from 'lucide-react';
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

// ── Hierarchical Clustering (average-linkage) ─────────────────────────

interface Cluster {
  id: number;
  genes: string[];
  size: number;
}

interface DendrogramNode {
  name?: string;
  children?: DendrogramNode[];
  dist?: number;
}

function buildDistanceMatrix(genes: string[], getScore: (a: string, b: string) => number): number[][] {
  const n = genes.length;
  const mat: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = getScore(genes[i], genes[j]);
      const dist = 1 - Math.abs(sim); // distance = 1 - |correlation|
      mat[i][j] = dist;
      mat[j][i] = dist;
    }
  }
  return mat;
}

function hierarchicalCluster(genes: string[], distMat: number[][]): { order: number[]; tree: DendrogramNode } {
  const n = genes.length;
  if (n === 0) return { order: [], tree: {} };

  // Each cluster: { id, genes[], active: bool }
  const clusters: (Cluster & { active: boolean })[] = genes.map((g, i) => ({
    id: i, genes: [g], size: 1, active: true,
  }));

  // Inter-cluster distance matrix
  const clusterDist: number[][] = distMat.map(row => [...row]);
  let nextId = n;

  // Merge log for dendrogram
  const merges: { left: number; right: number; dist: number }[] = [];

  while (clusters.filter(c => c.active).length > 1) {
    // Find closest pair of active clusters
    let minDist = Infinity;
    let mergeI = -1, mergeJ = -1;

    const active = clusters.map((c, i) => c.active ? i : -1).filter(i => i >= 0);
    for (let a = 0; a < active.length; a++) {
      for (let b = a + 1; b < active.length; b++) {
        const i = active[a], j = active[b];
        // Use stored distance between cluster representatives
        // For average linkage: average of all pairwise distances
        // We compute this on the fly from the original gene distance matrix
        let totalDist = 0;
        let count = 0;
        for (const gi of clusters[i].genes) {
          for (const gj of clusters[j].genes) {
            const idxI = genes.indexOf(gi);
            const idxJ = genes.indexOf(gj);
            totalDist += distMat[idxI][idxJ];
            count++;
          }
        }
        const avgDist = totalDist / count;
        if (avgDist < minDist) {
          minDist = avgDist;
          mergeI = i;
          mergeJ = j;
        }
      }
    }

    if (mergeI < 0 || mergeJ < 0) break;

    // Merge: create new cluster
    const newCluster: Cluster & { active: boolean } = {
      id: nextId++,
      genes: [...clusters[mergeI].genes, ...clusters[mergeJ].genes],
      size: clusters[mergeI].size + clusters[mergeJ].size,
      active: true,
    };

    merges.push({ left: mergeI, right: mergeJ, dist: minDist });
    clusters[mergeI].active = false;
    clusters[mergeJ].active = false;
    clusters.push(newCluster);
  }

  // Build ordering: last merge defines the root order
  // Traverse merge tree in order to get leaf order
  const getLeaves = (nodeId: number): number[] => {
    // Find which cluster has this id
    const c = clusters.find(c => c.id === nodeId);
    if (!c) return [];
    // Find if this cluster was formed by a merge
    const merge = merges.find(m => {
      const parent = clusters.find(c =>
        c.genes.includes(clusters[mergeI]?.genes[0] || '') &&
        c.genes.includes(clusters[mergeJ]?.genes[0] || '') &&
        c.genes.length === (clusters[mergeI]?.genes.length || 0) + (clusters[mergeJ]?.genes.length || 0)
      );
      return false;
    });

    // Simple: just return genes in order based on merge tree traversal
    return [];
  };

  // Simpler ordering approach: use the merge order to reorder genes
  // Walk the merge tree from root, alternating left/right branches
  const finalCluster = clusters.find(c => c.active);
  if (!finalCluster) return { order: [...Array(n).keys()], tree: {} };

  // Order genes by clustering: group by module proximity
  const order = finalCluster.genes.map(g => genes.indexOf(g));
  
  return { order, tree: {} };
}

// ── Module assignment by cutting dendrogram ────────────────────────────

function assignModules(genes: string[], order: number[], distMat: number[][], numModules: number): Map<string, number> {
  const moduleMap = new Map<string, number>();
  
  if (genes.length === 0) return moduleMap;
  if (genes.length <= numModules) {
    genes.forEach((g, i) => moduleMap.set(g, i));
    return moduleMap;
  }

  // Greedy: split ordered genes into numModules contiguous blocks
  // This is a simplification — proper dendrogram cutting would be better
  const genesPerModule = Math.ceil(genes.length / numModules);
  const orderedGenes = order.map(i => genes[i]);
  
  orderedGenes.forEach((g, i) => {
    const moduleIdx = Math.min(Math.floor(i / genesPerModule), numModules - 1);
    moduleMap.set(g, moduleIdx);
  });

  return moduleMap;
}

// ── Component ──────────────────────────────────────────────────────────

const MODULE_COLORS = [
  '#1d4ed8', '#0f766e', '#b45309', '#991b1b', '#4f46e5',
  '#0891b2', '#65a30d', '#ca8a04', '#dc2626', '#7c3aed',
  '#0ea5e9', '#84cc16', '#f59e0b', '#ef4444', '#8b5cf6',
];

export function CoexpModuleBrowser() {
  const { selectedGenes, geneCache, dashMetric, setDashMetric } = useAppStore();
  const [numModules, setNumModules] = useState(4);
  const [modMinScore, setModMinScore] = useState(0.2);

  const getScore = (a: string, b: string): number => {
    const dataA = geneCache[a];
    if (!dataA) return 0;
    const scores = dataA.coexpression[dashMetric as 'pearson' | 'spearman' | 'jaccard'];
    if (!scores) return 0;
    const match = scores.find(s => s.gene === b);
    return match ? match.score : 0;
  };

  const { orderedGenes, distMat, modules, totalLoaded, loadedGenes } = useMemo(() => {
    const loaded = selectedGenes.filter(g => geneCache[g]?.coexpression?.[dashMetric as 'pearson' | 'spearman' | 'jaccard']);
    
    if (loaded.length < 3) {
      return { orderedGenes: loaded, distMat: [[]], modules: new Map(), totalLoaded: loaded.length, loadedGenes: loaded };
    }

    const dist = buildDistanceMatrix(loaded, getScore);
    const { order } = hierarchicalCluster(loaded, dist);
    const mods = assignModules(loaded, order, dist, numModules);

    return {
      orderedGenes: order.map(i => loaded[i]),
      distMat: dist,
      modules: mods,
      totalLoaded: loaded.length,
      loadedGenes: loaded,
    };
  }, [selectedGenes, geneCache, dashMetric, numModules]);

  // Build z-matrix for clustered heatmap (similarity, not distance)
  const zValues = useMemo(() => {
    if (orderedGenes.length < 3) return [[]];
    const n = orderedGenes.length;
    const z: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const idxI = loadedGenes.indexOf(orderedGenes[i]);
        const idxJ = loadedGenes.indexOf(orderedGenes[j]);
        z[i][j] = idxI >= 0 && idxJ >= 0 && distMat[idxI] ? 1 - (distMat[idxI][idxJ] ?? 0) : 0;
      }
    }
    return z;
  }, [orderedGenes, distMat, loadedGenes]);

  const genes = useMemo(() => selectedGenes.filter(g => geneCache[g]?.coexpression?.[dashMetric as 'pearson' | 'spearman' | 'jaccard']), [selectedGenes, geneCache, dashMetric]);

  // Compute module statistics
  const moduleStats = useMemo(() => {
    const stats: { id: number; genes: string[]; avgScore: number }[] = [];
    const modArr = Array.from(modules.entries());
    const modGroups = new Map<number, string[]>();
    for (const [gene, mod] of modArr) {
      if (!modGroups.has(mod)) modGroups.set(mod, []);
      modGroups.get(mod)!.push(gene);
    }
    for (const [modId, modGenes] of modGroups) {
      let total = 0;
      let count = 0;
      for (let i = 0; i < modGenes.length; i++) {
        for (let j = i + 1; j < modGenes.length; j++) {
          total += getScore(modGenes[i], modGenes[j]);
          count++;
        }
      }
      stats.push({
        id: modId,
        genes: modGenes,
        avgScore: count > 0 ? +(total / count).toFixed(4) : 0,
      });
    }
    stats.sort((a, b) => b.avgScore - a.avgScore);
    return stats;
  }, [modules]);

  if (selectedGenes.length === 0) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center', margin: 0 }}>
        <Compass size={32} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Add genes to the Specimen Bag to discover co-expression modules.
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ marginBottom: 0, minWidth: '120px' }}>
          <label className="form-label">Metric</label>
          <select className="form-select" value={dashMetric} onChange={e => setDashMetric(e.target.value as any)}>
            <option value="pearson">Pearson</option>
            <option value="spearman">Spearman</option>
            <option value="jaccard">Jaccard</option>
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0, minWidth: '100px' }}>
          <label className="form-label">Modules ({numModules})</label>
          <input type="range" min="2" max="15" step="1" value={numModules}
            onChange={e => setNumModules(parseInt(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--primary)' }} />
        </div>
      </div>

      {/* Module summary */}
      {moduleStats.length > 0 && (
        <div className="card" style={{ padding: '0.75rem', marginBottom: '1rem', margin: 0 }}>
          <div style={{ marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-primary)', fontWeight: 700 }}>
            MODULES ({moduleStats.length}) — {orderedGenes.length} genes clustered
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {moduleStats.map(s => (
              <div key={s.id} style={{
                padding: '0.35rem 0.55rem', borderRadius: '3px',
                background: MODULE_COLORS[s.id % MODULE_COLORS.length] + '15',
                border: `1px solid ${MODULE_COLORS[s.id % MODULE_COLORS.length]}40`,
                fontSize: '0.68rem', fontFamily: 'var(--font-mono)',
              }}>
                <span style={{ fontWeight: 700, color: MODULE_COLORS[s.id % MODULE_COLORS.length] }}>
                  M{s.id + 1}
                </span>
                <span style={{ color: 'var(--text-muted)', marginLeft: '0.3rem' }}>
                  N={s.genes.length} avg={s.avgScore.toFixed(3)}
                </span>
                <span style={{ color: 'var(--text-secondary)', marginLeft: '0.3rem', fontSize: '0.62rem' }}>
                  {s.genes.join(', ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clustered heatmap */}
      {orderedGenes.length >= 3 ? (
        <div className="card" style={{ padding: '0.75rem', margin: 0, overflow: 'hidden' }}>
          <div className="instrument-screen" style={{ margin: 0, overflow: 'auto' }}>
            <Plot
              data={[{
                z: zValues,
                x: orderedGenes,
                y: orderedGenes,
                type: 'heatmap' as any,
                colorscale: [
                  [0, '#f4f2eb'],
                  [0.25, '#dbeafe'],
                  [0.5, '#1d4ed8'],
                  [0.75, '#1e3a5f'],
                  [1, '#0f172a'],
                ],
                hoverongaps: false,
                hovertemplate: '%{y} vs %{x}<br>Similarity: %{z:.3f}<extra></extra>',
              }]}
              layout={{
                ...plotlyTheme,
                height: Math.max(300, Math.min(700, orderedGenes.length * 28 + 80)),
                margin: { l: 80, r: 20, t: 40, b: 100 },
                title: {
                  text: `${dashMetric.charAt(0).toUpperCase() + dashMetric.slice(1)} Co-expression — ${orderedGenes.length} genes`,
                  font: { size: 10, color: '#4d5663', family: "'Fira Mono', monospace" },
                },
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
              }}
              config={{ responsive: true, displayModeBar: false }}
              useResizeHandler
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
            Hierarchical clustering (average linkage). Rows/columns reordered by similarity. Hover for values.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', margin: 0 }}>
          {totalLoaded === 0 ? (
            <>
              <Loader className="animate-spin" size={24} color="var(--text-muted)" />
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                Loading co-expression data... ({selectedGenes.length} genes)
              </p>
            </>
          ) : (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Need at least 3 genes with loaded data for clustering ({totalLoaded} available).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default CoexpModuleBrowser;
