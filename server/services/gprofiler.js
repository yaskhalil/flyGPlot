// g:Profiler API client — gene set enrichment analysis
// Supports Drosophila melanogaster natively (no ortholog conversion needed)
// Docs: https://biit.cs.ut.ee/gprofiler/page/apidocs
// Free, no API key required, rate limit: ~1 req/s.

const BASE = 'https://biit.cs.ut.ee/gprofiler/api/gost/profile';

// Drosophila-focused tool — default to dmelanogaster.
// Organism can be overridden via options for cross-species queries.
function detectOrganism(genes) {
  return 'dmelanogaster';
}

// Map our generic database names to g:Profiler source codes
const SOURCE_MAP = {
  'GO_Biological_Process_2023': 'GO:BP',
  'GO_Molecular_Function_2023': 'GO:MF',
  'GO_Cellular_Component_2023': 'GO:CC',
  'KEGG_2021_Human': 'KEGG',
  'WikiPathway_2023_Drosophila': 'WP',
  'Reactome_2022': 'REAC',
};

/**
 * Run enrichment analysis using g:Profiler.
 *
 * @param {string[]} genes - Gene symbols to analyze.
 * @param {string[]} databases - List of database names.
 * @param {object} [options]
 * @param {string} [options.organism] - Override organism detection.
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<object>} { job_id, genes_submitted, genes_mapped, databases, results }
 */
export async function runGProfiler(genes, databases = ['GO_Biological_Process_2023'], options = {}) {
  if (!genes || genes.length === 0) {
    return { error: 'At least one gene required', genes_submitted: 0 };
  }

  const organism = options.organism || detectOrganism(genes);

  // Map requested databases to g:Profiler sources
  const sources = databases
    .map(d => SOURCE_MAP[d])
    .filter(Boolean);

  // Default to GO:BP if nothing maps
  if (sources.length === 0) {
    sources.push('GO:BP');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(BASE, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organism,
        query: genes,
        sources,
        significance_threshold_method: 'fdr',
        user_threshold: 0.05,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`g:Profiler HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const rawResults = data.result || [];

    // Group results by source
    const grouped = {};
    for (const source of sources) {
      grouped[source] = [];
    }

    const mappedGenes = new Set();

    // Track which query genes were mapped (g:Profiler returns FBgn IDs in overlapping_genes,
    // so we match them back to the original query by case-insensitive comparison)
    const queryLower = new Set(genes.map(g => g.toLowerCase()));

    for (const row of rawResults) {
      const source = row.source;
      if (!grouped[source]) continue;

      // Map overlapping FBgn IDs back to original query symbols
      const mappedOverlap = (row.overlapping_genes || []).filter(Boolean).map(id => {
        const lower = id.toLowerCase();
        // Try exact match against query first
        const exact = genes.find(g => g.toLowerCase() === lower);
        if (exact) return exact;
        // Return the ID as-is if no match (g:Profiler uses FBgn IDs)
        return id;
      });

      for (const g of mappedOverlap) {
        mappedGenes.add(g.toLowerCase());
      }

      grouped[source].push({
        rank: grouped[source].length + 1,
        term: `${row.name} (${row.native})`,
        pValue: row.p_value,
        zScore: row.p_value ? -Math.log10(row.p_value) : 0,
        combinedScore: row.intersection_size,
        overlappingGenes: mappedOverlap,
        termId: row.native,
        significant: row.significant || false,
        intersectionSize: row.intersection_size || 0,
        termSize: row.term_size || 0,
      });
    }

    // Sort each source by p-value
    for (const source of sources) {
      grouped[source].sort((a, b) => a.pValue - b.pValue);
      grouped[source].forEach((r, i) => { r.rank = i + 1; });
    }

    return {
      jobId: `gp_${organism}_${Date.now()}`,
      genesSubmitted: genes.length,
      genesMapped: Math.min(mappedGenes.size, genes.length),
      organism,
      databases: sources,
      results: grouped,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('g:Profiler request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
