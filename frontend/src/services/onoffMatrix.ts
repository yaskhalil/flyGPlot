// Loader and query engine for the packed ON/OFF posterior matrix.
//
// The per-gene JSON files are far too large to scan for a cluster-first query
// ("which genes mark Dm8?"). `scripts/build-onoff-matrix.mjs` collapses them
// into ~8 MB of 4-bit posteriors; this module loads that once and answers
// marker queries in-process.
//
// Clusters are represented as bitsets so a candidate pair's shared ON set is a
// handful of AND operations rather than a set intersection per pair.

export interface OnOffIndex {
  genes: string[];
  cells: string[];
  stages: string[];
  levels: number;
  notMeasured: number;
}

export interface MarkerHit {
  gene: string;
  /** Clusters other than the target where this gene is also ON. */
  offTargetOn: number;
  /** Off-target clusters that were measured and called OFF. */
  offTargetOff: number;
  /** offTargetOff / measured off-target clusters. 1.0 = perfectly specific. */
  specificity: number;
  /** Lowest posterior for this gene in the target across the selected stages. */
  targetMargin: number;
  /**
   * How many of the selected stages actually measured this gene in the target.
   * A gene seen at one timepoint trivially satisfies the 'all' rule and would
   * otherwise outrank one verified across every stage, so callers must be able
   * to see and filter on the evidence behind a specificity score.
   */
  stagesMeasured: number;
}

export interface PairHit {
  genes: [string, string];
  /** Clusters where BOTH genes are ON — the split-GAL4 intersection. */
  offTargetOn: number;
  specificity: number;
  offTargetNames: string[];
  /** Off-target clusters of the better single gene, for comparison. */
  bestSingle: number;
  /**
   * How many off-target clusters the intersection removes relative to the
   * better of the two genes alone. A pair whose gain is 0 is not earning its
   * second hemidriver — the single gene already does the same job.
   */
  gain: number;
}

export type StageMode = 'all' | 'any';

let cache: { index: OnOffIndex; data: Uint8Array } | null = null;
let inflight: Promise<{ index: OnOffIndex; data: Uint8Array }> | null = null;

const BASE = `${import.meta.env.BASE_URL || '/'}data`.replace(/\/{2,}/g, '/');

export async function loadMatrix(): Promise<{ index: OnOffIndex; data: Uint8Array }> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const [idxRes, binRes] = await Promise.all([
      fetch(`${BASE}/onoff_index.json`),
      fetch(`${BASE}/onoff_matrix.bin`),
    ]);
    if (!idxRes.ok || !binRes.ok) {
      throw new Error(
        'ON/OFF matrix not found. Run `node scripts/build-onoff-matrix.mjs` to generate it.'
      );
    }
    const index: OnOffIndex = await idxRes.json();
    const data = new Uint8Array(await binRes.arrayBuffer());

    // A dev server answers a missing path under /data/ with a 200 and an HTML
    // page. Reading past the end of that buffer yields `undefined`, and
    // `undefined & 0x0f` is 0 — the not-measured sentinel — so every cluster
    // would silently read as unmeasured and the search would return zero
    // markers as if the cluster simply had none.
    const expected = Math.ceil(
      (index.genes.length * index.cells.length * index.stages.length) / 2
    );
    if (data.length !== expected) {
      throw new Error(
        `ON/OFF matrix is ${data.length} bytes, expected ${expected}. ` +
        'Regenerate it with `npm run build:matrix`.'
      );
    }

    cache = { index, data };
    return cache;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Raw posterior for one cell of the matrix, or null when not measured. */
function posterior(
  data: Uint8Array,
  index: OnOffIndex,
  geneIdx: number,
  cellIdx: number,
  stageIdx: number
): number | null {
  const flat = (geneIdx * index.cells.length + cellIdx) * index.stages.length + stageIdx;
  const byte = data[flat >> 1];
  const q = flat & 1 ? byte >> 4 : byte & 0x0f;
  return q === index.notMeasured ? null : (q - 1) / index.levels;
}

const WORDS = (n: number) => (n + 31) >> 5;

/**
 * Collapse a gene's per-stage posteriors into one ON bitset over clusters,
 * applying the same rule the ON/OFF matrix uses: under 'all', every stage that
 * actually measured the cluster must pass. A cluster never measured in the
 * selected window is neither ON nor OFF and is excluded from both bitsets.
 */
function geneBitsets(
  data: Uint8Array,
  index: OnOffIndex,
  geneIdx: number,
  stageIdxs: number[],
  threshold: number,
  mode: StageMode,
  targetIdx: number
): {
  on: Uint32Array;
  measured: Uint32Array;
  targetMin: number;
  targetScored: number;
} {
  const nCells = index.cells.length;
  const on = new Uint32Array(WORDS(nCells));
  const measured = new Uint32Array(WORDS(nCells));
  let targetMin = 1;
  let targetScored = 0;

  for (let c = 0; c < nCells; c++) {
    let scored = 0;
    let passed = 0;
    let lo = 1;
    for (const s of stageIdxs) {
      const p = posterior(data, index, geneIdx, c, s);
      if (p === null) continue;
      scored++;
      if (p >= threshold) passed++;
      if (p < lo) lo = p;
    }
    // The reported margin describes the target specifically. Reducing it across
    // every ON cluster would report some unrelated cluster's weakest posterior
    // under a label that promises the target's.
    if (c === targetIdx) {
      targetScored = scored;
      targetMin = scored > 0 ? lo : 0;
    }
    if (scored === 0) continue;
    measured[c >> 5] |= 1 << (c & 31);
    const isOn = mode === 'all' ? passed === scored : passed > 0;
    if (isOn) on[c >> 5] |= 1 << (c & 31);
  }
  return { on, measured, targetMin, targetScored };
}

function popcount(x: number): number {
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}

function testBit(bits: Uint32Array, i: number): boolean {
  return (bits[i >> 5] & (1 << (i & 31))) !== 0;
}

export interface MarkerQuery {
  targetCell: string;
  stages: string[];
  threshold: number;
  mode: StageMode;
  /**
   * Drop genes measured at fewer than this many of the selected stages in the
   * target. Defaults to requiring every selected stage, so a hit shown under
   * "ON at ALL selected stages" is actually backed by all of them.
   */
  minStagesMeasured?: number;
  /** Cap on single-gene hits returned. */
  limit?: number;
  /** How many top singles to consider when forming pairs. */
  pairPool?: number;
  maxPairs?: number;
}

export interface MarkerResult {
  /** Top hits only — capped by `limit`. See `singlesTotal` for the real count. */
  singles: MarkerHit[];
  pairs: PairHit[];
  /** Every gene ON in the target, before the display cap is applied. */
  singlesTotal: number;
  /** Clusters measured in the selected window, excluding the target. */
  offTargetTotal: number;
  genesScanned: number;
  /** Genes ON in the target but dropped for insufficient stage coverage. */
  droppedLowCoverage: number;
  /**
   * The query these results came from. Labels and exports must read this rather
   * than live form state, or a result table ends up captioned — and a CSV
   * headed — with parameters the user changed after running it.
   */
  query: {
    targetCell: string;
    stages: string[];
    threshold: number;
    mode: StageMode;
    minStagesMeasured: number;
    /** Selected stages this cluster is present in at all — the achievable ceiling. */
    stagesAvailable: number;
  };
}

/**
 * Find genes — and two-gene AND combinations — that are ON in the target
 * cluster and OFF in as many other clusters as possible.
 *
 * The pair search is what maps onto a split-GAL4: two hemidrivers whose
 * intersection labels the target, so a pair is scored on the clusters where
 * BOTH genes are ON, not on either gene alone.
 */
export async function findMarkers(q: MarkerQuery): Promise<MarkerResult> {
  const { index, data } = await loadMatrix();
  const {
    targetCell, stages, threshold, mode,
    limit = 100, pairPool = 60, maxPairs = 100,
  } = q;

  const targetIdx = index.cells.indexOf(targetCell);
  if (targetIdx < 0) throw new Error(`Unknown cluster: ${targetCell}`);

  const stageIdxs = stages
    .map(s => index.stages.indexOf(s))
    .filter(i => i >= 0);
  if (stageIdxs.length === 0) throw new Error('Select at least one stage');

  // 26 of the 212 clusters are absent from at least one stage entirely — some
  // from five of six. Defaulting the evidence bar to every *selected* stage
  // would make those clusters permanently unmarkable, so the ceiling is what
  // this cluster can actually supply.
  let stagesAvailable = 0;
  for (const s of stageIdxs) {
    for (let g = 0; g < index.genes.length; g++) {
      if (posterior(data, index, g, targetIdx, s) !== null) { stagesAvailable++; break; }
    }
  }
  const minStagesMeasured = Math.min(
    q.minStagesMeasured ?? stageIdxs.length,
    stagesAvailable
  );

  const nCells = index.cells.length;
  const singles: (MarkerHit & { on: Uint32Array })[] = [];
  let offTargetTotal = 0;
  let droppedLowCoverage = 0;

  for (let g = 0; g < index.genes.length; g++) {
    const { on, measured, targetMin, targetScored } =
      geneBitsets(data, index, g, stageIdxs, threshold, mode, targetIdx);

    // Only genes actually ON in the target can be markers for it.
    if (!testBit(on, targetIdx)) continue;

    // 896 genes in this dataset are measured at a single stage. Such a gene
    // passes the 'all' rule on one observation and, having only one stage in
    // which to be ON off-target, sorts above genes verified across all six.
    if (targetScored < minStagesMeasured) {
      droppedLowCoverage++;
      continue;
    }

    let onCount = 0;
    let measuredCount = 0;
    for (let w = 0; w < on.length; w++) {
      onCount += popcount(on[w]);
      measuredCount += popcount(measured[w]);
    }
    // Exclude the target itself from both tallies.
    const offOn = onCount - 1;
    const offMeasured = measuredCount - 1;
    if (offMeasured <= 0) continue;
    offTargetTotal = Math.max(offTargetTotal, offMeasured);

    singles.push({
      gene: index.genes[g],
      offTargetOn: offOn,
      offTargetOff: offMeasured - offOn,
      specificity: (offMeasured - offOn) / offMeasured,
      targetMargin: targetMin,
      stagesMeasured: targetScored,
      on,
    });
  }

  // Most specific first, then better-evidenced: more stages measured, then a
  // stronger posterior in the target.
  singles.sort((a, b) =>
    b.specificity - a.specificity ||
    b.stagesMeasured - a.stagesMeasured ||
    b.targetMargin - a.targetMargin
  );

  // Pair search over the most specific singles. Combining two already-broad
  // genes rarely beats combining two narrow ones, so the pool is capped.
  const pool = singles.slice(0, pairPool);
  const pairs: PairHit[] = [];
  const scratch = new Uint32Array(WORDS(nCells));

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      let both = 0;
      for (let w = 0; w < scratch.length; w++) {
        scratch[w] = pool[i].on[w] & pool[j].on[w];
        both += popcount(scratch[w]);
      }
      const offBoth = both - 1; // drop the target
      const names: string[] = [];
      if (offBoth > 0 && offBoth <= 12) {
        for (let c = 0; c < nCells; c++) {
          if (c !== targetIdx && testBit(scratch, c)) names.push(index.cells[c]);
        }
      }
      const bestSingle = Math.min(pool[i].offTargetOn, pool[j].offTargetOn);
      pairs.push({
        genes: [pool[i].gene, pool[j].gene],
        offTargetOn: offBoth,
        specificity: offTargetTotal > 0 ? (offTargetTotal - offBoth) / offTargetTotal : 0,
        offTargetNames: names,
        bestSingle,
        gain: bestSingle - offBoth,
      });
    }
  }

  // Cleanest intersection first, then the pairs where the second hemidriver
  // contributes most.
  pairs.sort((a, b) => a.offTargetOn - b.offTargetOn || b.gain - a.gain);

  // Both sort keys are maximised by whichever gene sits in the sweet spot of
  // being broad alone but clean in combination, so an unfiltered list returns
  // that one gene paired against everything else — nine rows of `Syp + X` read
  // as nine options when they are one. Cap each gene's appearances so the list
  // offers genuinely distinct reagent choices.
  const MAX_PER_GENE = 3;
  const appearances = new Map<string, number>();
  const diversePairs: PairHit[] = [];
  for (const p of pairs) {
    const a = appearances.get(p.genes[0]) || 0;
    const b = appearances.get(p.genes[1]) || 0;
    if (a >= MAX_PER_GENE || b >= MAX_PER_GENE) continue;
    appearances.set(p.genes[0], a + 1);
    appearances.set(p.genes[1], b + 1);
    diversePairs.push(p);
    if (diversePairs.length >= maxPairs) break;
  }

  return {
    singles: singles.slice(0, limit).map(({ on: _on, ...rest }) => rest),
    pairs: diversePairs,
    singlesTotal: singles.length,
    offTargetTotal,
    genesScanned: index.genes.length,
    droppedLowCoverage,
    query: { targetCell, stages, threshold, mode, minStagesMeasured, stagesAvailable },
  };
}
