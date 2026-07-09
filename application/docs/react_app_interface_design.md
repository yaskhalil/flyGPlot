# Interface & State Design — React Fly Gene Expression Explorer

## 1. Data Models (TypeScript)

### 1.1 Gene Expression Row
Represents a single gene's expression profile at a given developmental stage across all cell clusters.
```typescript
export interface ExpressionRow {
  gene: string;
  stage: string;
  [cellCluster: string]: number | string; // Value per cell annotation (e.g. "Dm4 (#9)": 1.45)
}
```

### 1.2 Co-expression Calculation Output
```typescript
export interface CoexpressionResult {
  gene: string;
  score: number; // Pearson r, Spearman rho, or Jaccard index
}
```

---

## 2. Global State Store (Zustand)

The Zustand store (`useAppStore`) acts as the single source of truth. Any filter adjustment in the sidebar updates this store and instantly propagates to charts and dashboards.

```typescript
export interface AppState {
  // --- Data Loading State ---
  expressionData: ExpressionRow[] | null;
  mixtureModelingData: ExpressionRow[] | null;
  allGenesList: string[];
  allGenesMapLower: Record<string, string>;
  isLoading: boolean;
  loadError: string | null;

  // --- Universal Sidebar Filters ---
  selectedStages: string[];
  minExpression: number;
  excludeLowExpression: boolean;

  // --- Active Gene Cohort ---
  selectedGenes: string[];

  // --- Co-expression State ---
  dashRefGene: string;
  dashMetric: 'Pearson' | 'Spearman' | 'Jaccard';
  dashResults: CoexpressionResult[] | null;
  selectedPartnerGene: string | null;

  // --- Actions ---
  fetchDatasets: () => Promise<void>;
  setSelectedStages: (stages: string[]) => void;
  setMinExpression: (val: number) => void;
  setExcludeLowExpression: (val: boolean) => void;
  setSelectedGenes: (genes: string[]) => void;
  setDashRefGene: (gene: string) => void;
  setDashMetric: (metric: 'Pearson' | 'Spearman' | 'Jaccard') => void;
  runCoexpressionSearch: () => void;
  setSelectedPartnerGene: (partner: string | null) => void;
  addTopCoexpressedGenes: (genes: string[]) => void;
}
```

---

## 3. Client-Side Co-expression Computation

Because calculations run in the browser, we use optimized loops on flat array vectors. Since the dataset is fully loaded, calculations take **$<10\text{ms}$** in modern JavaScript engines (V8).

### Jaccard Active-State Similarity
For two vectors $X$ and $Y$ of binarized active states (active if mixture modeling prob $\ge 0.5$):
```typescript
export function computeJaccard(refVector: number[], targetMatrix: number[][]): number[] {
  const N = refVector.length;
  const numTargets = targetMatrix.length;
  const results = new Float32Array(numTargets);
  
  // Binarize reference vector
  const refB = refVector.map(v => v >= 0.5 ? 1 : 0);
  const refSum = refB.reduce((a, b) => a + b, 0);

  for (let i = 0; i < numTargets; i++) {
    const row = targetMatrix[i];
    let intersection = 0;
    let union = 0;
    let targetSum = 0;

    for (let j = 0; j < N; j++) {
      const targetB = row[j] >= 0.5 ? 1 : 0;
      if (refB[j] === 1 && targetB === 1) intersection++;
      if (targetB === 1) targetSum++;
    }
    
    union = refSum + targetSum - intersection;
    results[i] = union > 0 ? intersection / union : 0;
  }
  return Array.from(results);
}
```

---

## 4. Synonym Resolver API Contract

For resolving bulk gene text area input against Ensembl REST:
```typescript
export interface ResolutionResult {
  resolved: string[];       // Valid approved symbols in our dataset
  warnings: string[];       // Warning messages for ambiguous inputs
  unresolved: string[];     // Unknown symbols
  apiStatus: 'online' | 'offline';
}

export interface ResolverService {
  resolveBulk(input: string, allGenesMapLower: Record<string, string>): Promise<ResolutionResult>;
}
```
If the Ensembl API fails, the service returns `apiStatus: 'offline'` and direct matching fallback completes.
