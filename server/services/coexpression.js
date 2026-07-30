// Server-side co-expression engine
// Computes pairwise gene expression correlations (Pearson, Spearman, Jaccard)
// Uses static JSON files for the built-in dataset; can also work on imported datasets.

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENES_DIR = path.resolve(__dirname, '../../frontend/public/data/genes');
const GENE_LIST_PATH = path.resolve(__dirname, '../../frontend/public/data/gene_list.json');

/**
 * Load the full gene list from the static index.
 */
function loadGeneList() {
  if (!existsSync(GENE_LIST_PATH)) return [];
  return JSON.parse(readFileSync(GENE_LIST_PATH, 'utf8'));
}

/**
 * Load gene expression data from static JSON file.
 * Returns null if not found.
 */
function loadGeneData(gene) {
  // Sanitize: prevent path traversal
  const safeGene = gene.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeGene || safeGene !== gene.replace(/\.\./g, '')) return null;
  const filePath = path.resolve(GENES_DIR, `${safeGene}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Build a flat expression vector from a gene's data across selected stages.
 * Returns [{ key: "P15_Dm4 (#9)", value: 0.42 }, ...]
 */
function buildExpressionVector(geneData, stages) {
  if (!geneData || !geneData.expression) return [];
  const vectors = [];
  const selectedStages = stages || Object.keys(geneData.expression);
  for (const stage of selectedStages) {
    const cells = geneData.expression[stage];
    if (!cells) continue;
    for (const [cell, value] of Object.entries(cells)) {
      vectors.push({
        key: `${stage}_${cell}`,
        value: value,
      });
    }
  }
  return vectors;
}

/**
 * Align two expression vectors to the same keys (stage_cell combinations).
 */
function alignVectors(vecA, vecB) {
  const mapB = new Map(vecB.map(v => [v.key, v.value]));
  const alignedA = [];
  const alignedB = [];

  for (const a of vecA) {
    const bVal = mapB.get(a.key);
    if (bVal !== undefined) {
      alignedA.push(a.value);
      alignedB.push(bVal);
    }
  }

  return { alignedA, alignedB, n: alignedA.length };
}

/**
 * Compute Pearson correlation coefficient.
 */
function pearson(x, y) {
  const n = x.length;
  if (n < 3) return 0;

  const sumX = x.reduce((s, v) => s + v, 0);
  const sumY = y.reduce((s, v) => s + v, 0);
  const sumXY = x.reduce((s, v, i) => s + v * y[i], 0);
  const sumXX = x.reduce((s, v) => s + v * v, 0);
  const sumYY = y.reduce((s, v) => s + v * v, 0);

  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));

  if (den === 0) return 0;
  return num / den;
}

/**
 * Compute Spearman rank correlation.
 */
function spearman(x, y) {
  const rank = (arr) => {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(arr.length);
    for (let i = 0; i < sorted.length; i++) {
      ranks[sorted[i].i] = i + 1;
    }
    // Handle ties (average ranks)
    const result = new Array(arr.length);
    let i = 0;
    while (i < arr.length) {
      let j = i;
      while (j < arr.length && sorted[j].v === sorted[i].v) j++;
      const avgRank = (ranks[sorted[i].i] + ranks[sorted[j - 1].i]) / 2;
      for (let k = i; k < j; k++) {
        result[sorted[k].i] = avgRank;
      }
      i = j;
    }
    return result;
  };

  const rankX = rank(x);
  const rankY = rank(y);
  return pearson(rankX, rankY);
}

/**
 * Compute Jaccard similarity based on co-expression (binary: expressed above threshold).
 */
function jaccard(x, y, threshold = 0.1) {
  const bx = x.map(v => v >= threshold);
  const by = y.map(v => v >= threshold);

  let intersection = 0;
  let union = 0;

  for (let i = 0; i < bx.length; i++) {
    if (bx[i] || by[i]) union++;
    if (bx[i] && by[i]) intersection++;
  }

  return union === 0 ? 0 : intersection / union;
}

/**
 * Compute co-expression for a reference gene against all other genes.
 *
 * @param {string} refGene - Reference gene symbol.
 * @param {object} options
 * @param {string[]} [options.stages] - Stages to include (default: all).
 * @param {string} [options.metric='pearson'] - 'pearson' | 'spearman' | 'jaccard'.
 * @param {number} [options.minScore=0] - Minimum absolute score to include.
 * @param {number} [options.maxResults=500] - Max results to return.
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<object>} { gene, metric, count, results: [{gene, score}], stages }
 */
export async function computeCoexpression(refGene, options = {}) {
  const {
    stages = null,
    metric = 'pearson',
    minScore = 0,
    maxResults = 500,
    signal = null,
  } = options;

  // Load reference gene data
  const refData = loadGeneData(refGene);
  if (!refData) {
    return { error: `Gene '${refGene}' not found in dataset` };
  }

  const geneList = loadGeneList();
  const refVec = buildExpressionVector(refData, stages);
  const usedStages = stages || Object.keys(refData.expression);

  if (refVec.length < 3) {
    return { error: `Reference gene '${refGene}' has insufficient expression data (${refVec.length} samples)` };
  }

  const results = [];
  const batchSize = 100;

  for (let i = 0; i < geneList.length; i += batchSize) {
    if (signal?.aborted) return { error: 'Aborted' };

    const batch = geneList.slice(i, i + batchSize);

    // Load all genes in batch in parallel
    const batchData = batch.map(gene => {
      if (gene === refGene) return null;
      return loadGeneData(gene);
    });

    for (let j = 0; j < batch.length; j++) {
      const otherGene = batch[j];
      const otherData = batchData[j];

      if (otherGene === refGene || !otherData) continue;

      const otherVec = buildExpressionVector(otherData, usedStages);
      const { alignedA, alignedB, n } = alignVectors(refVec, otherVec);

      if (n < 3) continue;

      let score = 0;
      switch (metric) {
        case 'spearman':
          score = spearman(alignedA, alignedB);
          break;
        case 'jaccard':
          score = jaccard(alignedA, alignedB);
          break;
        default:
          score = pearson(alignedA, alignedB);
      }

      if (Math.abs(score) >= minScore) {
        results.push({ gene: otherGene, score: +score.toFixed(4) });
      }
    }
  }

  // Sort by absolute score descending
  results.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  return {
    gene: refGene,
    metric,
    count: results.length,
    maxResults,
    stages: usedStages,
    results: results.slice(0, maxResults),
  };
}

/**
 * Bulk compute co-expression for a set of genes (for precomputation).
 * Loads all gene data once, builds matrix, computes pairwise.
 *
 * @param {string[]} genes - Genes to compute pairwise.
 * @param {object} options
 * @returns {Promise<object>} { pairwise, metrics }
 */
export async function computePairwise(genes, options = {}) {
  const { stages = null, metrics = ['pearson', 'spearman'] } = options;

  // Load all gene data
  const geneData = {};
  for (const gene of genes) {
    const data = loadGeneData(gene);
    if (data) geneData[gene] = data;
  }

  const geneList = Object.keys(geneData);
  const pairwise = {};

  for (const metric of metrics) {
    pairwise[metric] = [];
  }

  for (let i = 0; i < geneList.length; i++) {
    for (let j = i + 1; j < geneList.length; j++) {
      const gA = geneList[i];
      const gB = geneList[j];

      const vecA = buildExpressionVector(geneData[gA], stages);
      const vecB = buildExpressionVector(geneData[gB], stages);
      const { alignedA, alignedB, n } = alignVectors(vecA, vecB);

      if (n < 3) continue;

      for (const metric of metrics) {
        let score = 0;
        switch (metric) {
          case 'spearman': score = spearman(alignedA, alignedB); break;
          default: score = pearson(alignedA, alignedB); break;
        }
        pairwise[metric].push({ geneA: gA, geneB: gB, score: +score.toFixed(4) });
      }
    }
  }

  return {
    genes: geneList,
    sampleCount: geneList.length > 0
      ? buildExpressionVector(geneData[geneList[0]], stages).length
      : 0,
    pairwiseCount: pairwise[metrics[0] || 'pearson'].length,
    pairwise,
  };
}
