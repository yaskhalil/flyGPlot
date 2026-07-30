import { create } from 'zustand';
import { getDataClient } from '../services/dataClient';

export interface CoexpressionResult {
  gene: string;
  score: number;
}

export interface GenePayload {
  gene: string;
  expression: Record<string, Record<string, number>>; // stage -> cell -> value
  mixture_modeling: Record<string, Record<string, number>>; // stage -> cell -> prob
  coexpression: {
    pearson: CoexpressionResult[];
    spearman: CoexpressionResult[];
    jaccard: CoexpressionResult[];
  };
}

export interface CellPayload {
  cell: string;
  expression: Record<string, Record<string, number>>; // stage -> gene -> value
}

interface AppState {
  // --- Data Loading State ---
  allGenesList: string[];
  allGenesMapLower: Record<string, string>;
  stagesList: string[];
  cellsList: string[];
  geneCache: Record<string, GenePayload>;
  cellCache: Record<string, CellPayload>;
  isIndexLoading: boolean;
  indexError: string | null;

  // --- Universal Sidebar Filters ---
  selectedStages: string[];
  minExpression: number;
  excludeLowExpression: boolean;

  // --- Active Gene Cohort ---
  selectedGenes: string[];

  // --- Custom Gene Groups ---
  customGroups: Record<string, string[]>;

  // --- Dashboard & Selector States ---
  activeTab: string;
  dashRefGene: string;
  dashMetric: 'pearson' | 'spearman' | 'jaccard';
  selectedPartnerGene: string | null;
  cellCentricTargetCell: string;
  cellCentricHighlight: string[];

  // --- Actions ---
  loadIndex: () => Promise<void>;
  fetchGeneData: (gene: string) => Promise<GenePayload | null>;
  fetchCellData: (cell: string) => Promise<CellPayload | null>;
  setSelectedStages: (stages: string[]) => void;
  setMinExpression: (val: number) => void;
  setExcludeLowExpression: (val: boolean) => void;
  setSelectedGenes: (genes: string[]) => void;
  saveCustomGroup: (name: string, genes: string[]) => void;
  deleteCustomGroup: (name: string) => void;
  setActiveTab: (tab: string) => void;
  setDashRefGene: (gene: string) => void;
  setDashMetric: (metric: 'pearson' | 'spearman' | 'jaccard') => void;
  setSelectedPartnerGene: (partner: string | null) => void;
  setCellCentricTargetCell: (cell: string) => void;
  setCellCentricHighlight: (genes: string[]) => void;
  addGenesToSelection: (genes: string[]) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // --- Initial State ---
  allGenesList: [],
  allGenesMapLower: {},
  stagesList: ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult'],
  cellsList: [],
  geneCache: {},
  cellCache: {},
  isIndexLoading: false,
  indexError: null,

  selectedStages: ['P15', 'P30', 'P40', 'P50', 'P70', 'Adult'],
  minExpression: 0.0,
  excludeLowExpression: true,

  selectedGenes: ['ab', 'abd-b', 'achi', 'acj6', 'Adf1', 'Aef1'],

  customGroups: (() => {
    try {
      const saved = localStorage.getItem('fly_explorer_custom_groups');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  })(),

  activeTab: 'Home',
  dashRefGene: 'achi',
  dashMetric: 'pearson',
  selectedPartnerGene: null,
  cellCentricTargetCell: '',
  cellCentricHighlight: [],

  // --- Actions ---
  loadIndex: async () => {
    set({ isIndexLoading: true, indexError: null });
    try {
      const client = getDataClient();
      const { genes, stages, cells } = await client.loadIndex();
      
      const allGenesMapLower: Record<string, string> = {};
      for (const gene of genes) {
        allGenesMapLower[gene.toLowerCase()] = gene;
      }

      const { selectedGenes } = get();
      const resolvedSelected = selectedGenes.map(gene => {
        const lower = gene.toLowerCase();
        return allGenesMapLower[lower] || gene;
      });

      set({
        allGenesList: genes,
        allGenesMapLower,
        stagesList: stages,
        cellsList: cells,
        selectedGenes: resolvedSelected,
        isIndexLoading: false,
        cellCentricTargetCell: cells[0] || '',
        dashRefGene: genes.includes('achi') ? 'achi' : genes[0] || ''
      });
    } catch (err: any) {
      set({ indexError: err.message || 'Error loading index files', isIndexLoading: false });
    }
  },

  fetchGeneData: async (gene: string) => {
    if (!gene || typeof gene !== 'string') return null;
    const { geneCache } = get();
    if (geneCache[gene]) {
      return geneCache[gene];
    }
    try {
      const client = getDataClient();
      const data = await client.fetchGeneData(gene);
      if (data) {
        set((state) => ({
          geneCache: { ...state.geneCache, [gene]: data }
        }));
      }
      return data;
    } catch (err) {
      console.error(err);
      return null;
    }
  },

  fetchCellData: async (cell: string) => {
    if (!cell || typeof cell !== 'string') return null;
    const { cellCache } = get();
    if (cellCache[cell]) {
      return cellCache[cell];
    }
    try {
      const client = getDataClient();
      const data = await client.fetchCellData(cell);
      if (data) {
        set((state) => ({
          cellCache: { ...state.cellCache, [cell]: data }
        }));
      }
      return data;
    } catch (err) {
      console.error(err);
      return null;
    }
  },

  setSelectedStages: (selectedStages) => set({ selectedStages }),
  setMinExpression: (minExpression) => set({ minExpression }),
  setExcludeLowExpression: (excludeLowExpression) => set({ excludeLowExpression }),
  setSelectedGenes: (selectedGenes) => {
    const { allGenesMapLower } = get();
    const resolved = selectedGenes.map(g => {
      const lower = g.toLowerCase();
      return allGenesMapLower[lower] || g;
    });
    set({ selectedGenes: resolved });
  },

  saveCustomGroup: (name, genes) => {
    const { customGroups } = get();
    const updated = { ...customGroups, [name]: genes };
    try {
      localStorage.setItem('fly_explorer_custom_groups', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
    set({ customGroups: updated });
  },

  deleteCustomGroup: (name) => {
    const { customGroups } = get();
    const updated = { ...customGroups };
    delete updated[name];
    try {
      localStorage.setItem('fly_explorer_custom_groups', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to delete from localStorage', e);
    }
    set({ customGroups: updated });
  },

  setActiveTab: (activeTab) => set({ activeTab }),
  
  setDashRefGene: (dashRefGene) => set({ 
    dashRefGene,
    selectedPartnerGene: null // Reset partner when reference changes
  }),
  
  setDashMetric: (dashMetric) => set({ 
    dashMetric,
    selectedPartnerGene: null // Reset partner when metric changes
  }),
  
  setSelectedPartnerGene: (selectedPartnerGene) => set({ selectedPartnerGene }),
  setCellCentricTargetCell: (cellCentricTargetCell) => set({ cellCentricTargetCell }),
  setCellCentricHighlight: (cellCentricHighlight) => set({ cellCentricHighlight }),

  addGenesToSelection: (genes) => {
    const { selectedGenes, allGenesMapLower } = get();
    const resolved = genes.map(g => {
      const lower = g.toLowerCase();
      return allGenesMapLower[lower] || g;
    });
    const combined = [...selectedGenes, ...resolved];
    const unique = Array.from(new Set(combined));
    set({ selectedGenes: unique });
  }
}));
