// Network View — STRING-DB PPI force-directed graph
// Backend: POST /api/network/ppi → cached interaction network

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { apiClient } from '../../services/apiClient';
import { Compass, Loader, AlertTriangle, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface NetworkNode {
  id: string;
  preferredName: string;
  isSeed: boolean;
  annotation?: string | null;
}

interface NetworkEdge {
  source: string;
  target: string;
  score: number;
}

interface NetworkData {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  metrics: {
    nodeCount: number;
    edgeCount: number;
    seedCount: number;
    avgClustering: number;
  };
}

export function NetworkView() {
  const { selectedGenes } = useAppStore();
  const [network, setNetwork] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minScore, setMinScore] = useState(400);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Force-directed layout state
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const animRef = useRef<number>(0);

  const handleQuery = useCallback(async () => {
    if (selectedGenes.length === 0) {
      setError('No genes in specimen bag');
      return;
    }
    setLoading(true);
    setError(null);
    setNetwork(null);

    try {
      const data = await apiClient.getPPINetwork(selectedGenes, minScore);
      if (!data) {
        setError('Network service unavailable');
        return;
      }
      setNetwork(data as NetworkData);
      // Initialize positions with a circle layout
      const pos: Record<string, { x: number; y: number }> = {};
      const allNodes = (data as NetworkData).nodes || [];
      const cx = 300, cy = 250, r = 180;
      allNodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / allNodes.length;
        pos[node.id] = {
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
        };
      });
      setPositions(pos);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } catch (err: any) {
      setError(err.message || 'Failed to query network');
    } finally {
      setLoading(false);
    }
  }, [selectedGenes, minScore]);

  // Simple force-directed simulation
  useEffect(() => {
    if (!network || network.nodes.length === 0) return;

    let running = true;
    const nodeIds = network.nodes.map(n => n.id);
    const edgeMap = new Map<string, number>();
    for (const e of network.edges) {
      const k = [e.source, e.target].sort().join('|');
      edgeMap.set(k, e.score);
    }

    const repulsion = 80000;
    const attraction = 0.005;
    const centerForce = 0.01;
    const damping = 0.85;
    const iterations = 100;

    let currentPos = { ...positions };
    const velocities: Record<string, { vx: number; vy: number }> = {};
    for (const id of nodeIds) {
      velocities[id] = { vx: 0, vy: 0 };
      if (!currentPos[id]) {
        currentPos[id] = {
          x: 300 + (Math.random() - 0.5) * 200,
          y: 250 + (Math.random() - 0.5) * 200,
        };
      }
    }

    let step = 0;
    const simulate = () => {
      if (!running || step >= iterations) return;
      step++;

      const newVel: Record<string, { vx: number; vy: number }> = {};
      const newPos = { ...currentPos };

      for (const id of nodeIds) {
        let fx = 0, fy = 0;

        // Repulsion from all other nodes
        for (const other of nodeIds) {
          if (other === id) continue;
          const dx = currentPos[id].x - currentPos[other].x;
          const dy = currentPos[id].y - currentPos[other].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 10);
          fx += (repulsion * dx) / (dist * dist * dist);
          fy += (repulsion * dy) / (dist * dist * dist);
        }

        // Attraction along edges
        for (const e of network.edges) {
          let otherId: string | null = null;
          if (e.source === id) otherId = e.target;
          else if (e.target === id) otherId = e.source;
          if (!otherId) continue;

          const dx = currentPos[otherId].x - currentPos[id].x;
          const dy = currentPos[otherId].y - currentPos[id].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const idealDist = 80;
          const force = attraction * (dist - idealDist) * (e.score || 0.5);
          fx += force * (dx / dist);
          fy += force * (dy / dist);
        }

        // Center gravity
        fx += centerForce * (300 - currentPos[id].x);
        fy += centerForce * (250 - currentPos[id].y);

        const vx = (velocities[id]?.vx || 0) * damping + fx * 0.001;
        const vy = (velocities[id]?.vy || 0) * damping + fy * 0.001;
        newVel[id] = { vx, vy };
        newPos[id] = {
          x: currentPos[id].x + vx,
          y: currentPos[id].y + vy,
        };
      }

      velocities.vx = undefined as any; // ignore
      for (const id of nodeIds) {
        velocities[id] = newVel[id];
      }
      currentPos = newPos;
      setPositions({ ...newPos });

      if (step < iterations) {
        animRef.current = requestAnimationFrame(simulate);
      }
    };

    animRef.current = requestAnimationFrame(simulate);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [network]);

  const getScoreColor = (score: number): string => {
    if (score >= 0.9) return 'var(--success)';
    if (score >= 0.7) return 'var(--secondary)';
    if (score >= 0.4) return 'var(--warning)';
    return 'var(--text-muted)';
  };

  const getEdgeWidth = (score: number): number => {
    return 0.5 + score * 2;
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem', alignItems: 'start', width: '100%' }}>
      {/* Left Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
        <div className="card" style={{ margin: 0, padding: '1.25rem' }}>
          <h3 style={{ marginBottom: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Compass size={14} /> NETWORK_CONSOLE
          </h3>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Seed Cohort</label>
            <div style={{
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
              borderRadius: '3px', padding: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
              maxHeight: '100px', overflowY: 'auto',
            }}>
              {selectedGenes.length > 0
                ? selectedGenes.slice(0, 10).map(g => <span key={g} style={{ marginRight: '0.3rem' }}>{g}</span>)
                : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Bag empty</span>
              }
              {selectedGenes.length > 10 && <span style={{ color: 'var(--text-muted)' }}>+{selectedGenes.length - 10}</span>}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Min Interaction Score ({minScore})</label>
            <input
              type="range" min="0" max="1000" step="50"
              value={minScore}
              onChange={e => setMinScore(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--primary)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              <span>Low (0)</span><span>High (1000)</span>
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleQuery}
            disabled={loading || selectedGenes.length === 0}
            style={{ width: '100%', textAlign: 'center', padding: '0.55rem' }}
          >
            {loading ? <><Loader className="animate-spin" size={14} /> QUERYING...</>
              : <><Compass size={14} /> QUERY_NETWORK</>}
          </button>

          {error && (
            <div className="alert alert-error" style={{ marginTop: '1rem', padding: '0.5rem' }}>
              <AlertTriangle className="alert-error-icon" size={14} />
              <div style={{ fontSize: '0.75rem' }}>{error}</div>
            </div>
          )}
        </div>

        {network && (
          <div className="card" style={{ margin: 0, padding: '1.25rem' }}>
            <div className="mock-stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="mock-stat"><div className="mock-stat-val">{network.metrics.nodeCount}</div><div className="mock-stat-label">NODES</div></div>
              <div className="mock-stat"><div className="mock-stat-val">{network.metrics.edgeCount}</div><div className="mock-stat-label">EDGES</div></div>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              Seeds: {network.metrics.seedCount} &bull; Clustering: {network.metrics.avgClustering.toFixed(3)}
            </div>
            {/* Legend */}
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.65rem', fontFamily: 'var(--font-mono)' }}>
              <div><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: 'var(--primary)', marginRight: '0.4rem', verticalAlign: 'middle' }}></span> Seed gene</div>
              <div><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'var(--success)', marginRight: '0.4rem', verticalAlign: 'middle' }}></span> Strong (≥0.9)</div>
              <div><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'var(--secondary)', marginRight: '0.4rem', verticalAlign: 'middle' }}></span> Medium (≥0.7)</div>
              <div><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'var(--warning)', marginRight: '0.4rem', verticalAlign: 'middle' }}></span> Weak (&lt;0.7)</div>
            </div>

            {/* Zoom controls */}
            <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.75rem' }}>
              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', boxShadow: 'none' }}
                onClick={() => setZoom(z => Math.min(z + 0.2, 3))}><ZoomIn size={12} /></button>
              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', boxShadow: 'none' }}
                onClick={() => setZoom(z => Math.max(z - 0.2, 0.3))}><ZoomOut size={12} /></button>
              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', boxShadow: 'none' }}
                onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Maximize size={12} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Right: Graph */}
      <div style={{ minWidth: 0 }}>
        {loading && (
          <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
            <Loader className="animate-spin" size={24} color="var(--primary)" />
            <p style={{ marginTop: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>Computing network layout...</p>
          </div>
        )}

        {!loading && !network && !error && (
          <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
            <Compass size={32} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Select genes in the Specimen Bag, then query STRING-DB to visualize protein-protein interaction networks.
            </p>
          </div>
        )}

        {network && network.nodes.length > 0 && (
          <div className="card" style={{ padding: '1rem', overflow: 'hidden' }}>
            <div className="instrument-screen" style={{
              minHeight: '500px', position: 'relative', overflow: 'hidden',
              backgroundSize: '20px 20px',
              backgroundImage: `
                linear-gradient(to right, rgba(0,0,0,0.02) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(0,0,0,0.02) 1px, transparent 1px)`
            }}>
              <svg
                ref={svgRef}
                width="100%"
                height="500"
                viewBox="0 0 600 500"
                style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`, transformOrigin: 'center center' }}
              >
                {/* Edges */}
                {network.edges.map((e, i) => {
                  const src = positions[e.source];
                  const tgt = positions[e.target];
                  if (!src || !tgt) return null;
                  return (
                    <line
                      key={`e-${i}`}
                      x1={src.x} y1={src.y}
                      x2={tgt.x} y2={tgt.y}
                      stroke={getScoreColor(e.score)}
                      strokeWidth={getEdgeWidth(e.score)}
                      strokeOpacity={0.5}
                    />
                  );
                })}

                {/* Nodes */}
                {network.nodes.map((node) => {
                  const pos = positions[node.id];
                  if (!pos) return null;
                  const isHovered = hoveredNode === node.id;
                  const r = node.isSeed ? 18 : 12;
                  const fill = node.isSeed
                    ? 'rgba(46,52,64,0.15)'
                    : getScoreColor(
                        Math.max(...network.edges.filter(e => e.source === node.id || e.target === node.id).map(e => e.score), 0)
                      ).replace(')', ',0.12)').replace('var(', '').replace(')', '');
                  const stroke = node.isSeed ? 'var(--primary)' : getScoreColor(
                    Math.max(...network.edges.filter(e => e.source === node.id || e.target === node.id).map(e => e.score), 0)
                  );

                  return (
                    <g key={node.id}>
                      {isHovered && (
                        <circle cx={pos.x} cy={pos.y} r={r + 6} fill="none" stroke="var(--secondary)" strokeWidth={2} strokeOpacity={0.4} />
                      )}
                      <circle
                        cx={pos.x} cy={pos.y} r={r}
                        fill={node.isSeed ? 'rgba(46,52,64,0.15)' : `${getScoreColor(Math.max(...network.edges.filter(e => e.source === node.id || e.target === node.id).map(e => e.score), 0))}22`}
                        stroke={stroke}
                        strokeWidth={node.isSeed ? 2.5 : 1.5}
                        style={{ cursor: 'pointer', transition: 'r 0.1s' }}
                        onMouseEnter={() => setHoveredNode(node.id)}
                        onMouseLeave={() => setHoveredNode(null)}
                      />
                      <text
                        x={pos.x} y={pos.y + 3.5}
                        textAnchor="middle"
                        fontSize={node.isSeed ? 8 : 7}
                        fontWeight={node.isSeed ? 700 : 500}
                        fill="var(--text-primary)"
                        fontFamily="'Fira Mono', monospace"
                        style={{ pointerEvents: 'none' }}
                      >
                        {node.preferredName?.length > 10 ? node.preferredName.slice(0, 9) + '…' : node.preferredName}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Tooltip */}
              {hoveredNode && positions[hoveredNode] && (
                <div style={{
                  position: 'absolute',
                  top: `${(positions[hoveredNode].y / 500) * 100}%`,
                  left: `${(positions[hoveredNode].x / 600) * 100}%`,
                  transform: 'translate(-50%, -120%)',
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: '3px', padding: '0.4rem 0.6rem',
                  fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                  boxShadow: 'var(--shadow-page)', pointerEvents: 'none', zIndex: 10,
                  whiteSpace: 'nowrap',
                }}>
                  <strong>{hoveredNode}</strong>
                  {network.nodes.find(n => n.id === hoveredNode)?.isSeed && <span style={{ color: 'var(--text-muted)', marginLeft: '0.3rem' }}>(seed)</span>}
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }}>
                    {network.edges.filter(e => e.source === hoveredNode || e.target === hoveredNode).length} connections
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
              <span className="mock-badge mock-badge-amber">STRING-DB</span> Interaction network &bull; Drag to pan &bull; Scroll to zoom
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default NetworkView;
