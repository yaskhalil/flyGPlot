// Home View — Dashboard overview with dataset stats and workflow guide

import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Dna, BarChart2, Compass, Network, Book, Loader } from 'lucide-react';

interface DatasetProfile {
  geneCount: number;
  stageCount: number;
  cellCount: number;
  loadedGenes: number;
}

const TABS = [
  { id: 'SpecimenIndex', num: '01', label: 'SPECIMEN_INDEX', icon: <Dna size={16} />, title: 'Gene Selection & Diagnostics', desc: 'Browse gene metadata, resolve symbols via FlyBase/Ensembl, and build your active cohort.' },
  { id: 'LedgerCharts', num: '02', label: 'LEDGER_CHARTS', icon: <BarChart2 size={16} />, title: 'Expression Visualization', desc: 'Boxplot-led expression profiles across developmental stages and cell-type trajectories.' },
  { id: 'CoexpWorkbench', num: '03', label: 'COEXP_WORKBENCH', icon: <Compass size={16} />, title: 'Co-expression Analysis', desc: 'Pearson, Spearman, and Jaccard correlation matrices with scatter plot dashboards.' },
  { id: 'EnrichmentLab', num: '04', label: 'ENRICHMENT_LAB', icon: <Network size={16} />, title: 'Functional Enrichment', desc: 'GO term and pathway enrichment via g:Profiler (native Drosophila) and Enrichr.' },
  { id: 'NetworkView', num: '05', label: 'NETWORK_VIEW', icon: <Network size={16} />, title: 'PPI Network Browser', desc: 'STRING-DB protein-protein interaction graphs with force-directed layout and zoom/pan.' },
];

const STEP_COLORS = ['var(--secondary)', 'var(--success)', 'var(--primary)', 'var(--warning)', 'var(--error)'];

export function HomeView() {
  const { allGenesList, stagesList, cellsList, setActiveTab, activeTab } = useAppStore();
  const [profile, setProfile] = useState<DatasetProfile | null>(null);

  useEffect(() => {
    if (allGenesList.length > 0) {
      setProfile({
        geneCount: allGenesList.length,
        stageCount: stagesList.length,
        cellCount: cellsList.length,
        loadedGenes: allGenesList.length,
      });
    }
  }, [allGenesList, stagesList, cellsList]);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
      {/* ── Header ───────────────────────────────────────────── */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', border: 'none', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ color: 'var(--secondary)' }}>FlyGPlot</span>
          <span style={{ fontWeight: 400, fontSize: '1.2rem', color: 'var(--text-muted)' }}>Ledger</span>
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '600px', lineHeight: 1.6 }}>
          A laboratory notebook and computational workbench for <strong style={{ color: 'var(--text-primary)' }}>Drosophila melanogaster</strong> transcription factor expression analysis.
          Explore gene expression across developmental stages, compute co-expression networks, run functional enrichment, and visualize protein-protein interactions.
        </p>
      </div>

      {/* ── Dataset Stats ────────────────────────────────────── */}
      {profile && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <StatCard value={profile.geneCount.toLocaleString()} label="Genes in Dataset" mono />
          <StatCard value={profile.stageCount} label="Developmental Stages" mono />
          <StatCard value={profile.cellCount.toLocaleString()} label="Cell Types / Clusters" mono />
          <StatCard value={`FlyBase + Ensembl`} label="Gene Resolution" mono={false} />
        </div>
      )}

      {/* ── Workflow Pipeline ────────────────────────────────── */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', border: 'none', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Book size={16} style={{ color: 'var(--text-primary)' }} />
          EXPERIMENTAL_PROTOCOL
          <span style={{ fontWeight: 400, fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>5 chapters</span>
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {TABS.map((tab, i) => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem 0.75rem',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'background 0.1s',
                borderBottom: i < TABS.length - 1 ? '1px solid var(--border-color)' : 'none',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: activeTab === tab.id ? STEP_COLORS[i] : 'var(--bg-tertiary)',
                border: `2px solid ${STEP_COLORS[i]}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                color: activeTab === tab.id ? 'white' : STEP_COLORS[i],
                fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
                transition: 'all 0.15s',
              }}>
                {tab.num}
              </div>
              <div style={{ flexGrow: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.15rem' }}>
                  {tab.icon}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {tab.label}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {tab.title}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                  {tab.desc}
                </div>
              </div>
              <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Data Sources ─────────────────────────────────────── */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', border: 'none', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Compass size={16} style={{ color: 'var(--text-primary)' }} />
          DATA_SOURCES
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <SourceCard name="FlyBase" url="https://flybase.org" desc="Drosophila gene database — resolution, GO terms, alleles, orthologs" />
          <SourceCard name="Ensembl" url="https://ensembl.org" desc="Genome annotation — synonym resolution and homology lookup" />
          <SourceCard name="STRING-DB" url="https://string-db.org" desc="Protein-protein interaction network queries" />
          <SourceCard name="g:Profiler" url="https://biit.cs.ut.ee/gprofiler" desc="Functional enrichment with native Drosophila support" />
          <SourceCard name="Enrichr" url="https://maayanlab.cloud/Enrichr" desc="Gene set enrichment analysis (human ortholog fallback)" />
          <SourceCard name="NCBI GEO" url="https://ncbi.nlm.nih.gov/geo" desc="Public expression dataset search" />
        </div>
      </div>

      {/* ── Quick Start ──────────────────────────────────────── */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', border: 'none', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BarChart2 size={16} style={{ color: 'var(--text-primary)' }} />
          QUICK_START
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <div><strong style={{ color: 'var(--text-primary)' }}>1.</strong> The <strong style={{ color: 'var(--secondary)' }}>sidebar</strong> on the left controls your gene cohort and filters. Stage badges toggle developmental stages, the slider sets expression cutoffs, and the bag holds your active gene list.</div>
          <div><strong style={{ color: 'var(--text-primary)' }}>2.</strong> <strong style={{ color: 'var(--secondary)' }}>Search or paste</strong> gene symbols in the <em>Specimen Index</em> tab. Use the autocomplete for quick lookup or the batch resolver for multiple symbols at once.</div>
          <div><strong style={{ color: 'var(--text-primary)' }}>3.</strong> <strong style={{ color: 'var(--secondary)' }}>Visualize expression</strong> in the <em>Ledger Charts</em> tab — boxplot profiles across stages or spline trajectories across cell types.</div>
          <div><strong style={{ color: 'var(--text-primary)' }}>4.</strong> <strong style={{ color: 'var(--secondary)' }}>Compute correlations</strong> in the <em>Co-expression Workbench</em>. Pearson, Spearman, and Jaccard metrics with scatter plot dashboards and configurable thresholds.</div>
          <div><strong style={{ color: 'var(--text-primary)' }}>5.</strong> <strong style={{ color: 'var(--secondary)' }}>Run enrichment</strong> in the <em>Enrichment Lab</em>. g:Profiler supports Drosophila genes natively; results are cached for 7 days.</div>
          <div><strong style={{ color: 'var(--text-primary)' }}>6.</strong> <strong style={{ color: 'var(--secondary)' }}>Query PPI networks</strong> in the <em>Network View</em>. Drag to pan, scroll to zoom, and explore STRING-DB interactions.</div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ value, label, mono }: { value: string | number; label: string; mono: boolean }) {
  return (
    <div className="card" style={{ padding: '1.25rem', margin: 0 }}>
      <div style={{ fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginTop: '0.15rem' }}>
        {label}
      </div>
    </div>
  );
}

function SourceCard({ name, url, desc }: { name: string; url: string; desc: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ textDecoration: 'none', display: 'block', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', transition: 'border-color 0.1s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-primary)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)'; }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{name}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{desc}</div>
    </a>
  );
}

export default HomeView;
