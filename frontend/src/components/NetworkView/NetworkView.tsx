// Network View — STRING-DB PPI force-directed graph
// Backend: POST /api/network/ppi → cached interaction network

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { apiClient } from '../../services/apiClient';
import { Compass, Loader, AlertTriangle, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { WorkspaceLayout } from '../shared/WorkspaceLayout';

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

// Color helpers matching CSS variables but as fixed rgb for SVG use
const SCORE_COLORS: Record<string, [number, number, number]> = {
  high: [15, 118, 110],    // --success
  medium: [29, 78, 216],   // --secondary
  low: [180, 83, 9],       // --warning
  none: [133, 142, 153],   // --text-muted
};

function scoreColor(score: number): [number, number, number] {
  if (score >= 0.9) return SCORE_COLORS.high;
  if (score >= 0.7) return SCORE_COLORS.medium;
  if (score >= 0.4) return SCORE_COLORS.low;
  return SCORE_COLORS.none;
}

function scoreColorCSS(score: number): string {
  const [r, g, b] = scoreColor(score);
  return `rgb(${r},${g},${b})`;
}

function scoreColorWithAlpha(score: number, alpha: number): string {
  const [r, g, b] = scoreColor(score);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getEdgeWidth(score: number): number {
  return 0.5 + score * 2;
}

const VIEWBOX_W = 600;
const VIEWBOX_H = 500;

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
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0 });

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

      // Runtime shape validation
      if (!data.nodes || !Array.isArray(data.nodes) || !data.edges || !Array.isArray(data.edges)) {
        setError('Unexpected network data format from server');
        return;
      }

      setNetwork(data as NetworkData);
      // Initialize positions with a circle layout
      const pos: Record<string, { x: number; y: number }> = {};
      const allNodes = (data as NetworkData).nodes || [];
      const cx = VIEWBOX_W / 2, cy = VIEWBOX_H / 2, r = Math.min(VIEWBOX_W, VIEWBOX_H) * 0.35;
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
          x: VIEWBOX_W / 2 + (Math.random() - 0.5) * (VIEWBOX_W * 0.3),
          y: VIEWBOX_H / 2 + (Math.random() - 0.5) * (VIEWBOX_H * 0.3),
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
        const cx = VIEWBOX_W / 2, cy = VIEWBOX_H / 2;

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
        fx += centerForce * (cx - currentPos[id].x);
        fy += centerForce * (cy - currentPos[id].y);

        const vx = (velocities[id]?.vx || 0) * damping + fx * 0.001;
        const vy = (velocities[id]?.vy || 0) * damping + fy * 0.001;
        newVel[id] = { vx, vy };
        newPos[id] = {
          x: currentPos[id].x + vx,
          y: currentPos[id].y + vy,
        };
      }

      // Copy new velocities into the closure variable
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

  // ── Zoom / Pan via viewBox ──────────────────────────────────────────

  const updateZoom = useCallback((newZoom: number, mouseX?: number, mouseY?: number) => {
    setPan(prev => {
      const oldW = VIEWBOX_W / zoom;
      const oldH = VIEWBOX_H / zoom;
      const newW = VIEWBOX_W / newZoom;
      const newH = VIEWBOX_H / newZoom;

      let cx: number, cy: number;
      if (mouseX !== undefined && mouseY !== undefined) {
        // Zoom toward mouse position
        cx = prev.x + (mouseX / VIEWBOX_W) * oldW;
        cy = prev.y + (mouseY / VIEWBOX_H) * oldH;
      } else {
        // Zoom toward center
        cx = prev.x + oldW / 2;
        cy = prev.y + oldH / 2;
      }

      return {
        x: cx - (mouseX !== undefined ? (mouseX / VIEWBOX_W) * newW : newW / 2),
        y: cy - (mouseY !== undefined ? (mouseY / VIEWBOX_H) * newH : newH / 2),
      };
    });
    setZoom(newZoom);
  }, [zoom]);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const newZoom = Math.max(0.3, Math.min(3, zoom + delta));
    if (newZoom === zoom) return;

    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * VIEWBOX_W;
    const mouseY = ((e.clientY - rect.top) / rect.height) * VIEWBOX_H;

    updateZoom(newZoom, mouseX, mouseY);
  }, [zoom, updateZoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((e.clientX - dragRef.current.startX) / rect.width) * (VIEWBOX_W / zoom);
    const dy = ((e.clientY - dragRef.current.startY) / rect.height) * (VIEWBOX_H / zoom);
    setPan({ x: dragRef.current.panX - dx, y: dragRef.current.panY - dy });
  }, [isDragging, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Track mouse up/down on window so drag doesn't get stuck
  useEffect(() => {
    if (!isDragging) return;
    const onUp = () => setIsDragging(false);
    const onMove = (e: MouseEvent) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const dx = ((e.clientX - dragRef.current.startX) / rect.width) * (VIEWBOX_W / zoom);
      const dy = ((e.clientY - dragRef.current.startY) / rect.height) * (VIEWBOX_H / zoom);
      setPan({ x: dragRef.current.panX - dx, y: dragRef.current.panY - dy });
    };
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
    };
  }, [isDragging, zoom]);

  // ── Max score for a node (for coloring) ────────────────────────────

  const maxNodeScore = useCallback((nodeId: string): number => {
    if (!network) return 0;
    return Math.max(
      ...network.edges
        .filter(e => e.source === nodeId || e.target === nodeId)
        .map(e => e.score),
      0
    );
  }, [network]);

  // ── Render ──────────────────────────────────────────────────────────

  const nodeCount = network?.nodes.length ?? 0;
  const showEmpty = !loading && !error && !network;
  const showNetwork = network && nodeCount > 0;
  const showEmptyResult = network && nodeCount === 0;

  return (
    <WorkspaceLayout
      title="NETWORK_CONSOLE"
      controls={
        <>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Active Cohort</label>
            <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', padding: '0.3rem 0' }}>
              {selectedGenes.length} genes in specimen bag
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
        </>
      }
      extraControls={showNetwork && (
        <div className="card" style={{ margin: 0, padding: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {network!.metrics.nodeCount}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
                NODES
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {network!.metrics.edgeCount}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
                EDGES
              </div>
            </div>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            Seeds: {network!.metrics.seedCount} &bull; Clustering: {network!.metrics.avgClustering.toFixed(3)}
          </div>
          {/* Legend */}
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.65rem', fontFamily: 'var(--font-mono)' }}>
            <div><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: 'var(--primary)', marginRight: '0.4rem', verticalAlign: 'middle' }}></span> Seed gene</div>
            <div><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: scoreColorCSS(0.9), marginRight: '0.4rem', verticalAlign: 'middle' }}></span> Strong (≥0.9)</div>
            <div><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: scoreColorCSS(0.7), marginRight: '0.4rem', verticalAlign: 'middle' }}></span> Medium (≥0.7)</div>
            <div><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: scoreColorCSS(0.4), marginRight: '0.4rem', verticalAlign: 'middle' }}></span> Weak (&lt;0.7)</div>
          </div>

          {/* Zoom controls */}
          <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.75rem' }}>
            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', boxShadow: 'none' }}
              onClick={() => updateZoom(Math.min(zoom + 0.2, 3))}><ZoomIn size={12} /></button>
            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', boxShadow: 'none' }}
              onClick={() => updateZoom(Math.max(zoom - 0.2, 0.3))}><ZoomOut size={12} /></button>
            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', boxShadow: 'none' }}
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Maximize size={12} /></button>
          </div>
        </div>
      )}
    >
      {loading && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Loader className="animate-spin" size={24} color="var(--primary)" />
          <p style={{ marginTop: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>Computing network layout...</p>
        </div>
      )}

      {showEmpty && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Compass size={32} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Select genes in the Specimen Bag, then query STRING-DB to visualize protein-protein interaction networks.
          </p>
        </div>
      )}

      {showEmptyResult && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            No interactions found for the selected genes at the current score threshold.
          </p>
        </div>
      )}

      {showNetwork && (
        <div className="card" style={{ padding: '1rem', overflow: 'hidden' }}>
          <div className="instrument-screen" style={{
            minHeight: '500px', position: 'relative', overflow: 'hidden',
            cursor: isDragging ? 'grabbing' : 'grab',
            backgroundSize: '20px 20px',
            backgroundImage: `
              linear-gradient(to right, rgba(0,0,0,0.02) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(0,0,0,0.02) 1px, transparent 1px)`
          }}>
            <svg
              ref={svgRef}
              width="100%"
              height="500"
              viewBox={`${pan.x} ${pan.y} ${VIEWBOX_W / zoom} ${VIEWBOX_H / zoom}`}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              style={{ display: 'block' }}
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
                    stroke={scoreColorCSS(e.score)}
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
                const maxScore = maxNodeScore(node.id);
                const fillColor = scoreColorWithAlpha(maxScore, node.isSeed ? 0.15 : 0.12);
                const strokeColor = node.isSeed ? 'var(--primary)' : scoreColorCSS(maxScore);

                return (
                  <g key={node.id}>
                    {isHovered && (
                      <circle cx={pos.x} cy={pos.y} r={r + 6} fill="none" stroke="var(--secondary)" strokeWidth={2} strokeOpacity={0.4} />
                    )}
                    <circle
                      cx={pos.x} cy={pos.y} r={r}
                      fill={fillColor}
                      stroke={strokeColor}
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
            {hoveredNode && positions[hoveredNode] && network && (
              <div style={{
                position: 'absolute',
                left: '50%', top: '50%',
                transform: `translate(
                  ${((positions[hoveredNode].x - pan.x) / (VIEWBOX_W / zoom) - 0.5) * 100}%,
                  ${((positions[hoveredNode].y - pan.y) / (VIEWBOX_H / zoom) - 1.2) * 100}%
                )`,
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: '3px', padding: '0.4rem 0.6rem',
                fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                boxShadow: '2px 2px 5px rgba(0,0,0,0.1)', pointerEvents: 'none', zIndex: 10,
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
            <span style={{ backgroundColor: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)', borderRadius: '2px', padding: '0.1rem 0.35rem', fontWeight: 700, fontSize: '0.6rem' }}>STRING-DB</span>
            {' '}Interaction network &bull; Drag to pan &bull; Scroll to zoom
          </div>
        </div>
      )}
    </WorkspaceLayout>
  );
}

export default NetworkView;
