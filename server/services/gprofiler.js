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
        // Required for g:Profiler to return per-term `intersections`. Without it
        // the response carries no gene-level detail and every term comes back
        // with an empty overlap list.
        no_evidences: false,
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

    // g:Profiler reports gene-level overlap positionally: for each result row,
    // `intersections[i]` holds the evidence codes for the i-th gene in
    // `meta.genes_metadata.query.<q>.ensgs`. A non-empty entry means that gene is
    // in the term. We resolve those Ensembl/FBgn IDs back to the caller's symbols
    // via the `mapping` table so results are reported in the user's own vocabulary.
    const queryMeta = data?.meta?.genes_metadata?.query || {};
    const firstQueryKey = Object.keys(queryMeta)[0];
    const ensgs = firstQueryKey ? queryMeta[firstQueryKey].ensgs || [] : [];
    const mapping = firstQueryKey ? queryMeta[firstQueryKey].mapping || {} : {};

    // FBgn -> original input symbol
    const idToSymbol = {};
    for (const [symbol, ids] of Object.entries(mapping)) {
      for (const id of ids || []) idToSymbol[id] = symbol;
    }

    const failed = new Set((data?.meta?.genes_metadata?.failed || []).map(g => g.toLowerCase()));
    const mappedGenes = new Set(
      genes.filter(g => !failed.has(g.toLowerCase()) && (mapping[g] || []).length > 0)
    );

    for (const row of rawResults) {
      const source = row.source;
      if (!grouped[source]) continue;

      const intersections = row.intersections || [];
      const overlappingGenes = [];
      for (let i = 0; i < ensgs.length; i++) {
        const evidence = intersections[i];
        if (evidence && evidence.length > 0) {
          overlappingGenes.push(idToSymbol[ensgs[i]] || ensgs[i]);
        }
      }

      grouped[source].push({
        rank: grouped[source].length + 1,
        term: `${row.name} (${row.native})`,
        pValue: row.p_value,
        // g:Profiler is a hypergeometric test and reports no z-score or Enrichr
        // combined score. Exposing -log10(p) under its own name keeps the two
        // backends from being silently compared on incompatible statistics.
        negLog10P: row.p_value ? -Math.log10(row.p_value) : 0,
        overlappingGenes,
        termId: row.native,
        significant: row.significant || false,
        intersectionSize: row.intersection_size || 0,
        termSize: row.term_size || 0,
        querySize: row.query_size || 0,
        precision: row.precision ?? null,
        recall: row.recall ?? null,
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
      genesMapped: mappedGenes.size,
      // A symbol g:Profiler cannot map is dropped from the query, shrinking the
      // set the test actually ran on. Returned so the UI can name it rather
      // than reporting a p-value over a silently smaller gene list.
      genesFailed: genes.filter(g => !mappedGenes.has(g)),
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
