// Biological constants used across services

export const DROSOPHILA = {
  taxonId: 7227,
  species: 'Drosophila melanogaster',
  ensemblName: 'drosophila_melanogaster',
  genomeBuild: 'dm6',
};

export const CACHE_TTL = {
  geneLookup: 24 * 3600 * 1000,       // 24 hours
  enrichment: 7 * 24 * 3600 * 1000,   // 7 days
  ppiNetwork: 7 * 24 * 3600 * 1000,   // 7 days
  geoMetadata: 30 * 24 * 3600 * 1000, // 30 days
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
