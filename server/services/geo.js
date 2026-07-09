// NCBI GEO (Gene Expression Omnibus) API client
// Uses NCBI E-utilities: esearch, esummary, efetch
// Docs: https://www.ncbi.nlm.nih.gov/books/NBK25500/

import config from '../config/env.js';
import { HTTP_TIMEOUT } from '../config/constants.js';

const BASE = config.ncbi.baseUrl;
const EMAIL = config.ncbi.email || 'fly@explorer.dev';

/**
 * Build query params with required email and optional API key.
 */
function params(extra = {}) {
  const p = new URLSearchParams({
    email: EMAIL,
    ...extra,
  });
  if (config.ncbi.apiKey) p.set('api_key', config.ncbi.apiKey);
  return p;
}

/**
 * Fetch XML from NCBI E-utilities and parse to JSON (simplified).
 */
async function eutilFetch(endpoint, queryParams) {
  const url = `${BASE}/${endpoint}?${queryParams.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'fly-expression-explorer/1.0' },
    });
    if (!res.ok) throw new Error(`NCBI HTTP ${res.status}: ${res.statusText}`);
    const xml = await res.text();
    return xml;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('NCBI request timed out');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Simple XML to JSON parser for NCBI XML structures.
 * Extracts key-value pairs from <Item> elements.
 */
function parseNcbiXml(xml) {
  const results = [];

  // Extract DocSum elements (NCBI esummary format)
  const docMatches = xml.match(/<DocSum>([\s\S]*?)<\/DocSum>/g) || [];

  for (const doc of docMatches) {
    const item = {};
    // Extract all <Item Name="key">value</Item>
    const itemMatches = doc.match(/<Item\s+Name="([^"]*)"[^>]*>([\s\S]*?)<\/Item>/g) || [];
    for (const im of itemMatches) {
      const nameMatch = im.match(/Name="([^"]*)"/);
      const valMatch = im.match(/>([\s\S]*)<\/Item>/);
      if (nameMatch && valMatch) {
        const key = nameMatch[1];
        let val = valMatch[1].trim();
        // Unescape HTML entities
        val = val.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        item[key] = val;
      }
    }
    if (Object.keys(item).length > 0) results.push(item);
  }

  return results;
}

/**
 * Search GEO Datasets.
 *
 * @param {string} query - Search query.
 * @param {number} [max=10] - Max results.
 * @returns {Promise<object>} { total_count, datasets: [...] }
 */
export async function searchDatasets(query, max = 10) {
  if (!query || !query.trim()) return { total_count: 0, datasets: [] };

  // Step 1: ESearch — get GEO IDs
  const searchParams = params({
    db: 'gds',
    term: query.trim(),
    retmax: String(Math.min(max, 20)),
    retmode: 'xml',
    sort: 'relevance',
  });

  const searchXml = await eutilFetch('esearch.fcgi', searchParams);

  // Parse IDs from XML
  const idMatches = searchXml.match(/<Id>(\d+)<\/Id>/g) || [];
  const ids = idMatches.map(m => m.replace(/<\/?Id>/g, ''));

  if (ids.length === 0) return { total_count: 0, datasets: [] };

  // Get total count
  const countMatch = searchXml.match(/<Count>(\d+)<\/Count>/);
  const totalCount = countMatch ? parseInt(countMatch[1]) : 0;

  // Step 2: ESummary — get dataset details
  const summaryParams = params({
    db: 'gds',
    id: ids.join(','),
    retmode: 'xml',
  });

  const summaryXml = await eutilFetch('esummary.fcgi', summaryParams);
  const parsed = parseNcbiXml(summaryXml);

  const datasets = parsed.map(item => ({
    accession: item.Accession || item.GSE || null,
    title: item.title || item.Title || 'Unknown',
    summary: item.Summary || item.summary || null,
    organism: item.Organism || item.organism || null,
    platform: item.Platform || item.platform || null,
    platformId: item.GPL || null,
    sampleCount: parseInt(item.SupplementaryFile_count || item.n_samples || '0') || 0,
    design: item.study_design || item.design || null,
    pubmedId: item.PMid || item.PMID || null,
    gdsType: item.gdsType || item.type || null,
    geoLink: `https://ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${item.Accession || item.GSE || ''}`,
    suppFiles: item.SupplementaryFile ? item.SupplementaryFile.split(';').map(s => s.trim()).filter(Boolean) : [],
    valueType: item.value_type || null,
    subType: item.sub_type || null,
  }));

  return { total_count: totalCount, datasets };
}

/**
 * Get full details for a specific GEO accession.
 *
 * @param {string} accession - GSE number.
 * @returns {Promise<object|null>} Dataset details with samples.
 */
export async function getDataset(accession) {
  const searchParams = params({
    db: 'gds',
    term: accession,
    retmax: '1',
    retmode: 'xml',
  });

  const xml = await eutilFetch('esearch.fcgi', searchParams);
  const idMatches = xml.match(/<Id>(\d+)<\/Id>/g) || [];
  if (idMatches.length === 0) return null;

  const id = idMatches[0].replace(/<\/?Id>/g, '');

  const summaryParams = params({
    db: 'gds',
    id,
    retmode: 'xml',
  });

  const summaryXml = await eutilFetch('esummary.fcgi', summaryParams);
  const parsed = parseNcbiXml(summaryXml);

  if (parsed.length === 0) return null;

  const item = parsed[0];

  // Parse sample table
  const samples = [];
  const sampleMatches = summaryXml.match(/<Item\s+Name="Sample"\s+Type="Structure"[^>]*>([\s\S]*?)<\/Item>/g) || [];
  for (const sm of sampleMatches) {
    const titleMatch = sm.match(/<Item\s+Name="Title"[^>]*>([\s\S]*?)<\/Item>/);
    const geoMatch = sm.match(/<Item\s+Name="GeoAccession"[^>]*>([\s\S]*?)<\/Item>/);
    const sourceMatch = sm.match(/<Item\s+Name="Source"[^>]*>([\s\S]*?)<\/Item>/);
    if (titleMatch && geoMatch) {
      samples.push({
        id: geoMatch[1].trim(),
        title: titleMatch[1].trim(),
        source: sourceMatch ? sourceMatch[1].trim() : null,
      });
    }
  }

  return {
    accession: item.Accession || item.GSE || accession,
    title: item.title || item.Title || 'Unknown',
    summary: item.Summary || item.summary || null,
    organism: item.Organism || item.organism || null,
    platform: item.Platform || item.platform || null,
    design: item.study_design || item.design || null,
    pubmedId: item.PMid || item.PMID || null,
    samples,
    sampleCount: samples.length || parseInt(item.n_samples || '0'),
    valueType: item.value_type || null,
    suppFiles: item.SupplementaryFile ? item.SupplementaryFile.split(';').map(s => s.trim()).filter(Boolean) : [],
    geoLink: `https://ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${item.Accession || accession}`,
  };
}
