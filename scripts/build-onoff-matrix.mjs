// Precompute a packed ON/OFF posterior matrix from the per-gene JSON files.
//
// The per-gene files total ~859 MB, so a cluster-first query ("which genes mark
// Dm8?") cannot scan them at request time. This collapses every
// (gene, cluster, stage) mixture-modeling posterior into a 4-bit value, which
// puts the whole matrix in a few MB and lets the marker search run in the
// browser with no server round-trip.
//
// 4 bits gives 16 probability levels (~0.067 granularity) — finer than any
// threshold a user picks off a slider, and half the size of a byte-per-value
// layout. Clusters absent at a stage are stored as a sentinel so "not measured"
// stays distinct from "measured and OFF".
//
// Usage: node scripts/build-onoff-matrix.mjs

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'frontend', 'public', 'data');
const GENES_DIR = join(DATA_DIR, 'genes');
const OUT_BIN = join(DATA_DIR, 'onoff_matrix.bin');
const OUT_IDX = join(DATA_DIR, 'onoff_index.json');

// A nibble holds 0..15. Value 0 is reserved for "cluster not measured at this
// stage", so real posteriors quantize to 0..14 and are stored as value+1. Using
// 15 levels here would push a posterior of 1.0 to 16, which wraps to 0 and
// silently reads back as not-measured.
const NOT_MEASURED = 0;
const LEVELS = 14;

function main() {
  const { stages, cells } = JSON.parse(readFileSync(join(DATA_DIR, 'cell_list.json'), 'utf8'));
  const cellIndex = new Map(cells.map((c, i) => [c, i]));

  const files = readdirSync(GENES_DIR).filter(f => f.endsWith('.json'));
  // Sort so the output ordering is deterministic across rebuilds.
  files.sort();

  const nCells = cells.length;
  const nStages = stages.length;
  const perGene = nCells * nStages;

  const genes = [];
  // Two values per byte.
  const packed = new Uint8Array(Math.ceil((files.length * perGene) / 2));

  let processed = 0;
  let skipped = 0;

  for (const file of files) {
    let data;
    try {
      data = JSON.parse(readFileSync(join(GENES_DIR, file), 'utf8'));
    } catch {
      skipped++;
      continue;
    }
    const mm = data.mixture_modeling;
    if (!mm) { skipped++; continue; }

    const geneIdx = genes.length;
    genes.push(data.gene || file.replace(/\.json$/, ''));

    for (let s = 0; s < nStages; s++) {
      const stageProbs = mm[stages[s]];
      if (!stageProbs) continue;
      for (const cell in stageProbs) {
        const c = cellIndex.get(cell);
        if (c === undefined) continue;
        const prob = stageProbs[cell];
        if (typeof prob !== 'number' || Number.isNaN(prob)) continue;

        const q = Math.round(Math.min(1, Math.max(0, prob)) * LEVELS) + 1;
        const flat = (geneIdx * nCells + c) * nStages + s;
        const byte = flat >> 1;
        if (flat & 1) {
          packed[byte] = (packed[byte] & 0x0f) | (q << 4);
        } else {
          packed[byte] = (packed[byte] & 0xf0) | q;
        }
      }
    }

    if (++processed % 1000 === 0) {
      process.stdout.write(`  ${processed}/${files.length} genes\r`);
    }
  }

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUT_BIN, packed);
  writeFileSync(OUT_IDX, JSON.stringify({
    genes,
    cells,
    stages,
    levels: LEVELS,
    notMeasured: NOT_MEASURED,
    bitsPerValue: 4,
    // Consumers reconstruct a posterior as (value - 1) / levels.
    layout: 'flat = (gene * nCells + cell) * nStages + stage; low nibble first',
  }));

  const mb = (packed.length / 1024 / 1024).toFixed(2);
  console.log(`\nWrote ${OUT_BIN} (${mb} MB)`);
  console.log(`  ${genes.length} genes x ${nCells} clusters x ${nStages} stages`);
  if (skipped) console.log(`  skipped ${skipped} files with no mixture_modeling`);
}

main();
