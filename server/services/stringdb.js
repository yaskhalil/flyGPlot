// STRING-DB API client — protein-protein interaction network queries
// Docs: https://string-db.org/cgi/help.pl?subpage=api
// Free, no API key required.

import { DROSOPHILA, HTTP_TIMEOUT } from '../config/constants.js';

const BASE = 'https://string-db.org/api/json';

/**
 * Build a request to STRING-DB with proper error handling and timeout.
 */
async function stringRequest(endpoint, params) {
  const url = `${BASE}/${encodeURIComponent(endpoint)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
  try {
    const body = new URLSearchParams({
      species: String(DROSOPHILA.taxonId),
      ...params,
    });
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`STRING-DB HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Query interaction partners for a set of seed genes.
 *
 * @param {string[]} genes - Gene symbols to use as seeds.
 * @param {object} [options]
 * @param {number} [options.minScore=400] - Minimum interaction score (0-1000).
 * @param {number} [options.limit=50] - Max partners per gene.
 * @returns {Promise<object>} { nodes, edges, metrics }
 */
export async function getInteractions(genes, { minScore = 400, limit = 50 } = {}) {
  if (!genes || genes.length === 0) {
    return { nodes: [], edges: [], metrics: { nodeCount: 0, edgeCount: 0 } };
  }

  const params = {
    identifiers: genes.join('%0D'),
    required_score: String(Math.min(Math.max(minScore, 0), 1000)),
    limit: String(limit),
  };

  const data = await stringRequest('interaction_partners', params);

  if (!Array.isArray(data) || data.length === 0) {
    return { nodes: [], edges: [], metrics: { nodeCount: 0, edgeCount: 0 } };
  }

  // Build node and edge sets
  const nodeMap = new Map();
  const edges = [];
  const edgeSet = new Set();

  // Add seed genes as nodes
  for (const g of genes) {
    const key = g.toLowerCase();
    if (!nodeMap.has(key)) {
      nodeMap.set(key, {
        id: key,
        preferredName: g,
        isSeed: true,
        annotation: null,
        dbId: null,
      });
    }
  }

  for (const row of data) {
    const srcKey = (row.preferredName_A || row.stringId_A).toLowerCase().split('.')[1] || row.preferredName_A?.toLowerCase();
    const tgtKey = (row.preferredName_B || row.stringId_B).toLowerCase().split('.')[1] || row.preferredName_B?.toLowerCase();

    // Add nodes
    for (const [key, name, id] of [[srcKey, row.preferredName_A, row.stringId_A], [tgtKey, row.preferredName_B, row.stringId_B]]) {
      if (key && !nodeMap.has(key)) {
        nodeMap.set(key, {
          id: key,
          preferredName: name || key,
          isSeed: false,
          annotation: row.annotation?.slice(0, 200) || null,
          dbId: id || null,
        });
      }
    }

    // Add edge (deduplicate)
    const edgeKey = [srcKey, tgtKey].sort().join('|');
    if (!edgeSet.has(edgeKey) && srcKey && tgtKey) {
      edgeSet.add(edgeKey);
      edges.push({
        source: srcKey,
        target: tgtKey,
        score: row.score || 0,
        nscore: row.nscore || 0,
        ascore: row.ascore || 0,
        escore: row.escore || 0,
        dscore: row.dscore || 0,
        tscore: row.tscore || 0,
      });
    }
  }

  const nodes = Array.from(nodeMap.values());

  // Compute network metrics
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const avgClustering = edgeCount > 0 && nodeCount > 1
    ? (2 * edgeCount) / (nodeCount * (nodeCount - 1))
    : 0;

  return {
    nodes,
    edges,
    metrics: {
      nodeCount,
      edgeCount,
      seedCount: genes.length,
      avgClustering: +avgClustering.toFixed(4),
    },
  };
}

/**
 * Get full network (including interactions among all returned genes, not just
 * partners of seeds). Useful for rendering a complete graph.
 */
export async function getFullNetwork(genes, options = {}) {
  const { nodes, edges, metrics } = await getInteractions(genes, options);

  if (nodes.length === 0) return { nodes: [], edges: [], metrics };

  // Get interactions among the full node set
  const allSymbols = nodes.map(n => n.preferredName).filter(Boolean);
  const params = {
    identifiers: allSymbols.join('%0D'),
    required_score: String(Math.min(Math.max(options.minScore || 400, 0), 1000)),
  };

  try {
    const fullData = await stringRequest('network', params);
    if (Array.isArray(fullData) && fullData.length > 0) {
      const fullEdgeSet = new Set();
      const fullEdges = [];
      for (const row of fullData) {
        const src = (row.preferredName_A || '').toLowerCase();
        const tgt = (row.preferredName_B || '').toLowerCase();
        const ek = [src, tgt].sort().join('|');
        if (!fullEdgeSet.has(ek) && src && tgt) {
          fullEdgeSet.add(ek);
          fullEdges.push({ source: src, target: tgt, score: row.score || 0 });
        }
      }
      return {
        nodes,
        edges: fullEdges,
        metrics: {
          ...metrics,
          edgeCount: fullEdges.length,
          fullGraph: true,
        },
      };
    }
  } catch (e) {
    // Fall back to partial network
    console.warn('[STRING-DB] Full network failed, using partial:', e.message);
  }

  return { nodes, edges, metrics };
}
