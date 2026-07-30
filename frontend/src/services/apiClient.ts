// API client for Fly TF Expression Backend
// Handles enrichment, network, and gene queries to http://localhost:4000

const API_BASE = 'http://localhost:4000/api';

export class ApiClient {
  // ── Gene Services ──────────────────────────────────────────────────

  async resolveGene(symbol: string) {
    const res = await fetch(`${API_BASE}/genes/resolve?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    return res.json();
  }

  async getGeneMetadata(gene: string) {
    const res = await fetch(`${API_BASE}/genes/metadata?gene=${encodeURIComponent(gene)}`);
    if (!res.ok) return null;
    return res.json();
  }

  async resolveBatch(genes: string[]): Promise<{ resolved: any[]; unresolved: string[] }> {
    const res = await fetch(`${API_BASE}/genes/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genes }),
    });
    if (!res.ok) return { resolved: [], unresolved: genes };
    return res.json();
  }

  async getSynonyms(gene: string) {
    const res = await fetch(`${API_BASE}/genes/synonyms?gene=${encodeURIComponent(gene)}`);
    if (!res.ok) return null;
    return res.json();
  }

  // ── Reagents ──────────────────────────────────────────────────────

  async getReagents(gene: string) {
    const res = await fetch(`${API_BASE}/genes/reagents?gene=${encodeURIComponent(gene)}`);
    if (!res.ok) return null;
    return res.json();
  }

  // ── Enrichment ─────────────────────────────────────────────────────

  async runEnrichment(genes: string[], databases?: string[]) {
    const res = await fetch(`${API_BASE}/enrichment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        genes,
        databases: databases || ['GO_Biological_Process_2023'],
      }),
    });
    if (!res.ok) return null;
    return res.json();
  }

  // ── PPI Network ────────────────────────────────────────────────────

  async getPPINetwork(genes: string[], minScore = 400) {
    const res = await fetch(`${API_BASE}/network/ppi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genes, min_score: minScore, full_network: true }),
    });
    if (!res.ok) return null;
    return res.json();
  }

  // ─── Health ────────────────────────────────────────────────────────

  async health() {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) return null;
    return res.json();
  }
}

// Singleton
export const apiClient = new ApiClient();
