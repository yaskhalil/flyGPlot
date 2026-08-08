import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { 
  Dna, 
  BarChart2, 
  Compass, 
  Book,
  ChevronRight,
  ChevronLeft,
  Trash2, 
  AlertTriangle, 
  Loader,
  Network,
  ChevronDown,
  Target,
} from 'lucide-react';
import HomeView from './components/HomeView/HomeView';
import SpecimenIndexWorkspace from './components/SpecimenIndexWorkspace/SpecimenIndexWorkspace';
import LedgerChartsWorkspace from './components/LedgerChartsWorkspace/LedgerChartsWorkspace';
import CoexpWorkbenchWorkspace from './components/CoexpWorkbenchWorkspace/CoexpWorkbenchWorkspace';
import EnrichmentLab from './components/EnrichmentLab/EnrichmentLab';
import NetworkView from './components/NetworkView/NetworkView';
import MarkerSelectorWorkspace from './components/MarkerSelector/MarkerSelectorWorkspace';

interface TabDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const TABS: TabDef[] = [
  { id: 'Home', label: 'HOME', icon: <Book size={14} />, title: 'FlyGPlot Console', description: 'Overview, workflow guide, and data sources.' },
  { id: 'SpecimenIndex', label: 'GENES', icon: <Dna size={14} />, title: 'Gene Registry', description: 'Search, resolve, and manage your gene cohort.' },
  { id: 'MarkerSelector', label: 'MARKERS', icon: <Target size={14} />, title: 'Marker Selector', description: 'Start from a cell type: find genes and split-GAL4 pairs that mark it and nothing else.' },
  { id: 'LedgerCharts', label: 'EXPRESSION', icon: <BarChart2 size={14} />, title: 'Expression Dashboard', description: 'Boxplot profiles, developmental trajectories, and ON/OFF matrices.' },
  { id: 'CoexpWorkbench', label: 'MODULES', icon: <Compass size={14} />, title: 'Co-expression Modules', description: 'Pairwise scatter plots, aggregate correlation, and hierarchical module clustering.' },
  { id: 'EnrichmentLab', label: 'ANALYSIS', icon: <Network size={14} />, title: 'Functional Analysis', description: 'GO/pathway enrichment via g:Profiler and Enrichr.' },
  { id: 'NetworkView', label: 'NETWORK', icon: <Network size={14} />, title: 'PPI Network Browser', description: 'STRING-DB protein interaction graphs with force-directed layout.' },
];

const TAB_MAP = Object.fromEntries(TABS.map(t => [t.id, t]));

export default function App() {
  const { 
    allGenesList, 
    isIndexLoading, 
    indexError,
    loadIndex,
    selectedGenes,
    setSelectedGenes,
    activeTab,
    setActiveTab,
    fetchGeneData,
  } = useAppStore();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [bagExpanded, setBagExpanded] = useState(false);

  // Load index data on mount
  useEffect(() => {
    loadIndex();
  }, [loadIndex]);

  // Pre-load data for active selected genes
  useEffect(() => {
    if (allGenesList.length > 0) {
      selectedGenes.forEach(gene => {
        fetchGeneData(gene);
      });
    }
  }, [selectedGenes, allGenesList, fetchGeneData]);

  if (isIndexLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
        <Loader className="animate-spin" size={32} color="var(--primary)" />
        <h2 style={{ border: 'none', color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-mono)', fontSize: '1.1rem', letterSpacing: '0.05em' }}>BOOTING_LEDGER_BUFFER...</h2>
        <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>Loading index databases</p>
      </div>
    );
  }

  if (indexError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1.25rem', padding: '2rem', textAlign: 'center', backgroundColor: 'var(--bg-secondary)', color: 'var(--error)' }}>
        <AlertTriangle size={48} color="var(--error)" />
        <h2 style={{ border: 'none', color: 'var(--error)', margin: 0, fontFamily: 'var(--font-mono)', fontSize: '1.1rem' }}>LOAD_FAILED</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', fontSize: '0.85rem' }}>{indexError}. Ensure database JSON indexes exist.</p>
      </div>
    );
  }

  const currentTab = TAB_MAP[activeTab] || TABS[0];

  return (
    <div className="app-container">
      {/* Sidebar — navigation only */}
      <aside className={`sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
        <div className="sidebar-title">
          <div className="sidebar-title-text">
            <Compass size={20} style={{ color: 'var(--secondary)' }} />
            <span>FlyGPlot</span>
          </div>
          <span className="sidebar-subtitle">Drosophila TF Explorer</span>
        </div>

        <nav className="sidebar-nav">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`sidebar-nav-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Sidebar toggle */}
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Main Work Panel */}
      <main className="main-panel">
        <header className="main-header">
          <div className="view-meta">
            <span className="view-title">
              {currentTab.icon}
              {currentTab.title}
            </span>
            <span className="view-description">{currentTab.description}</span>
          </div>

          {/* Gene cohort badge */}
<div className="header-cohort">
            <div
              className={`cohort-badge ${selectedGenes.length === 0 ? 'empty' : ''}`}
              onClick={() => selectedGenes.length > 0 && setBagExpanded(!bagExpanded)}
              title={selectedGenes.length > 0 ? 'Click to view gene cohort' : undefined}
            >
              <span className={`status-dot ${selectedGenes.length > 0 ? 'has-genes' : ''}`} />
              <span className="cohort-count">
                {selectedGenes.length} gene{selectedGenes.length !== 1 ? 's' : ''}
              </span>
              {selectedGenes.length > 0 && (
                <span className="cohort-chevron">
                  {bagExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                </span>
              )}
            </div>

            {selectedGenes.length > 0 && (
              <button
                className="btn btn-secondary cohort-clear-btn"
                onClick={() => { if (confirm('Clear gene cohort?')) setSelectedGenes([]); }}
                title="Clear cohort"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        </header>

        {/* Expandable gene bag row */}
        {bagExpanded && selectedGenes.length > 0 && (
          <div style={{
            padding: '0.5rem 2rem', backgroundColor: 'var(--bg-card)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center',
          }}>
            {selectedGenes.map(gene => (
              <span key={gene} className="gene-chip">
                {gene}
                <span className="gene-chip-remove" onClick={() => setSelectedGenes(selectedGenes.filter(g => g !== gene))}>&times;</span>
              </span>
            ))}
          </div>
        )}

        <section className="tab-content">
          {activeTab === 'Home' && <HomeView />}
          {activeTab === 'SpecimenIndex' && <SpecimenIndexWorkspace />}
          {activeTab === 'MarkerSelector' && <MarkerSelectorWorkspace />}
          {activeTab === 'LedgerCharts' && <LedgerChartsWorkspace />}
          {activeTab === 'CoexpWorkbench' && <CoexpWorkbenchWorkspace />}
          {activeTab === 'EnrichmentLab' && <EnrichmentLab />}
          {activeTab === 'NetworkView' && <NetworkView />}
        </section>
      </main>
    </div>
  );
}
