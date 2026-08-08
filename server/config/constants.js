// Biological constants used across services

export const DROSOPHILA = {
  taxonId: 7227,
  species: 'Drosophila melanogaster',
  ensemblName: 'drosophila_melanogaster',
  genomeBuild: 'dm6',
};

export const CACHE_TTL = {
  geneLookup: 24 * 3600 * 1000,       // 24 hours
  // Short, because a fallback result is evidence the primary was down, not a
  // durable answer — it should not outlive the outage that produced it.
  geneLookupFallback: 30 * 60 * 1000, // 30 minutes
  enrichment: 7 * 24 * 3600 * 1000,   // 7 days
  ppiNetwork: 7 * 24 * 3600 * 1000,   // 7 days
};

export const ENRICHR_DATABASES = [
  'GO_Biological_Process_2023',
  'GO_Molecular_Function_2023',
  'GO_Cellular_Component_2023',
  'KEGG_2021_Human',
  'WikiPathway_2023_Drosophila',
  'Reactome_2022',
  'Panther_2016',
];

export const HTTP_TIMEOUT = 15000; // 15s default timeout for external API calls
