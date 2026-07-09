import type { GenePayload, CellPayload } from '../store/useAppStore';

export interface DrosophilaDataClient {
  loadIndex(): Promise<{ genes: string[]; stages: string[]; cells: string[] }>;
  fetchGeneData(gene: string): Promise<GenePayload | null>;
  fetchCellData(cell: string): Promise<CellPayload | null>;
}

export class StaticJsonDataClient implements DrosophilaDataClient {
  async loadIndex(): Promise<{ genes: string[]; stages: string[]; cells: string[] }> {
    const genesRes = await fetch('/data/gene_list.json');
    if (!genesRes.ok) throw new Error('Failed to load gene_list.json');
    const genes = await genesRes.json();

    const cellsRes = await fetch('/data/cell_list.json');
    if (!cellsRes.ok) throw new Error('Failed to load cell_list.json');
    const cellMeta = await cellsRes.json();

    return {
      genes,
      stages: cellMeta.stages || ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult'],
      cells: cellMeta.cells || []
    };
  }

  async fetchGeneData(gene: string): Promise<GenePayload | null> {
    if (!gene || typeof gene !== 'string') return null;
    const res = await fetch(`/data/genes/${gene}.json`);
    if (!res.ok) throw new Error(`Failed to load data for gene ${gene}`);
    return res.json();
  }

  async fetchCellData(cell: string): Promise<CellPayload | null> {
    if (!cell || typeof cell !== 'string') return null;
    const safeCellName = cell.replace(/\//g, '_').replace(/ /g, '_');
    const res = await fetch(`/data/cells/${encodeURIComponent(safeCellName)}.json`);
    if (!res.ok) throw new Error(`Failed to load data for cell ${cell}`);
    return res.json();
  }
}

// Default swappable instance
let activeClient: DrosophilaDataClient = new StaticJsonDataClient();

export const getDataClient = () => activeClient;

export const setDataClient = (client: DrosophilaDataClient) => {
  activeClient = client;
};
