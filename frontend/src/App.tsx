import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { 
  Dna, 
  BarChart2, 
  Compass, 
  ChevronRight, 
  ChevronDown, 
  Trash2, 
  AlertTriangle, 
  Loader 
} from 'lucide-react';
import SpecimenIndexWorkspace from './components/SpecimenIndexWorkspace/SpecimenIndexWorkspace';
import LedgerChartsWorkspace from './components/LedgerChartsWorkspace/LedgerChartsWorkspace';
import CoexpWorkbenchWorkspace from './components/CoexpWorkbenchWorkspace/CoexpWorkbenchWorkspace';
import EnrichmentLab from './components/EnrichmentLab/EnrichmentLab';
import NetworkView from './components/NetworkView/NetworkView';

const getTabDetails = (tab: string) => {
  switch (tab) {
    case 'SpecimenIndex':
      return {
        title: 'Notebook Specimen Index',
        description: 'Dataset diagnostics, mathematical definitions, and gene specimen selection.',
        icon: <Dna size={16} />
      };
    case 'LedgerCharts':
      return {
        title: 'Ledger Plotter Workbench',
        description: 'Millimeter graph paper plotter for expression profiles and developmental trajectories.',
        icon: <BarChart2 size={16} />
      };
    case 'CoexpWorkbench':
      return {
        title: 'Co-expression Laboratory',
        description: 'Transcription factor correlation matrices, scatter plots, and linear regression fits.',
        icon: <Compass size={16} />
      };
    case 'EnrichmentLab':
      return {
        title: 'Functional Enrichment Lab',
        description: 'GO term and pathway enrichment analysis for active gene cohorts.',
        icon: <Compass size={16} />
      };
    case 'NetworkView':
      return {
        title: 'PPI Network View',
        description: 'STRING-DB protein-protein interaction network visualization.',
        icon: <Compass size={16} />
      };
    default:
      return {
        title: 'Fly TF Expression Console',
        description: 'Scientific workbench for Drosophila transcriptomics.',
        icon: <Compass size={16} />
      };
  }
};

export default function App() {
  const { 
    allGenesList, 
    stagesList, 
    isIndexLoading, 
    indexError,
    loadIndex,
    selectedStages,
    setSelectedStages,
    minExpression,
    setMinExpression,
    excludeLowExpression,
    setExcludeLowExpression,
    selectedGenes,
    setSelectedGenes,
    activeTab,
    setActiveTab,
    fetchGeneData
  } = useAppStore();

  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [selectionExpanded, setSelectionExpanded] = useState(true);

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

  const activeTabDetails = getTabDetails(activeTab);

  return (
    <div className="app-container">
      {/* 1. Global Navigation & Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-title">
          <div className="sidebar-title-text">
            <Compass size={20} style={{ color: 'var(--secondary)' }} />
            <span>FlyGPlot Ledger</span>
          </div>
          <span className="sidebar-subtitle">Lab Notebook & Logs</span>
        </div>
        
        {allGenesList.length > 0 ? (
          <>
            <div className="sidebar-section" style={{ backgroundColor: 'transparent', border: 'none', padding: 0, boxShadow: 'none' }}>
              <div className="sidebar-section-title" style={{ paddingLeft: '0.25rem' }}>
                <span>Ledger Chapters</span>
              </div>
              <nav className="sidebar-nav">
                <button className={`sidebar-nav-btn ${activeTab === 'SpecimenIndex' ? 'active' : ''}`} onClick={() => setActiveTab('SpecimenIndex')}>
                  <Dna size={14} />
                  <span>01_SPECIMEN_INDEX</span>
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'LedgerCharts' ? 'active' : ''}`} onClick={() => setActiveTab('LedgerCharts')}>
                  <BarChart2 size={14} />
                  <span>02_LEDGER_CHARTS</span>
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'CoexpWorkbench' ? 'active' : ''}`} onClick={() => setActiveTab('CoexpWorkbench')}>
                  <Compass size={14} />
                  <span>03_COEXP_WORKBENCH</span>
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'EnrichmentLab' ? 'active' : ''}`} onClick={() => setActiveTab('EnrichmentLab')}>
                  <Compass size={14} />
                  <span>04_ENRICHMENT_LAB</span>
                </button>
                <button className={`sidebar-nav-btn ${activeTab === 'NetworkView' ? 'active' : ''}`} onClick={() => setActiveTab('NetworkView')}>
                  <Compass size={14} />
                  <span>05_NETWORK_VIEW</span>
                </button>
              </nav>
            </div>

            <div className="divider" style={{ margin: '0.25rem 0 0.75rem 0' }}></div>

            <div className="sidebar-section">
              <div className="sidebar-section-title" onClick={() => setFiltersExpanded(!filtersExpanded)}>
                <span>Filter Rules</span>
                {filtersExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </div>
              
              {filtersExpanded && (
                <div className="sidebar-section-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.5rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.68rem' }}>Stages Array</label>
                    <div className="stage-badge-container">
                      {stagesList.map(stage => {
                        const isSelected = selectedStages.includes(stage);
                        return (
                          <span 
                            key={stage}
                            className={`stage-badge ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedStages(selectedStages.filter(s => s !== stage));
                              } else {
                                setSelectedStages([...selectedStages, stage]);
                              }
                            }}
                          >
                            {stage}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.68rem' }}>Min Cutoff ({minExpression.toFixed(2)})</label>
                    <input 
                      type="range" 
                      min="0" 
                      max="5" 
                      step="0.05" 
                      value={minExpression}
                      onChange={(e) => setMinExpression(parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--primary)' }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={excludeLowExpression}
                        onChange={(e) => setExcludeLowExpression(e.target.checked)}
                      />
                      <span style={{ fontSize: '0.7rem' }}>Filter &lt; 0.10</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="divider" style={{ margin: '0.25rem 0 0.75rem 0' }}></div>

            <div className="sidebar-section" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', marginBottom: 0 }}>
              <div className="sidebar-section-title" onClick={() => setSelectionExpanded(!selectionExpanded)}>
                <span>Specimen Bag ({selectedGenes.length})</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  {selectedGenes.length > 0 && (
                    <span 
                      style={{ display: 'inline-flex', cursor: 'pointer', color: 'var(--error)' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Clear active cohort bag?")) {
                          setSelectedGenes([]);
                        }
                      }} 
                      title="Clear active cohort"
                    >
                      <Trash2 size={12} />
                    </span>
                  )}
                  {selectionExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </div>
              </div>
              
              {selectionExpanded && (
                <div style={{ 
                  flexGrow: 1, 
                  backgroundColor: 'var(--bg-tertiary)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '3px', 
                  padding: '0.6rem', 
                  overflowY: 'auto',
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                  marginTop: '0.5rem',
                  maxHeight: '180px',
                  fontFamily: 'var(--font-mono)'
                }}>
                  {selectedGenes.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                      {selectedGenes.map(gene => (
                        <span key={gene} className="gene-chip">
                          {gene}
                          <span 
                            className="gene-chip-remove"
                            onClick={() => setSelectedGenes(selectedGenes.filter(g => g !== gene))}
                          >
                            &times;
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Bag empty. Pinned records will show here.</span>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="alert alert-warning">
            <AlertTriangle className="alert-warning-icon" size={14} />
            <div>No dataset loaded.</div>
          </div>
        )}
      </aside>

      {/* 2. Main Work Panel */}
      <main className="main-panel">
        <header className="main-header">
          <div className="view-meta">
            <span className="view-title">
              {activeTabDetails.title}
            </span>
            <span className="view-description">{activeTabDetails.description}</span>
          </div>
          <div className="status-badge-container">
            <div className="status-badge">
              <span className="status-dot"></span>
              <span style={{ marginLeft: '0.4rem' }}>INDEX_STABLE</span>
            </div>
          </div>
        </header>

        <section className="tab-content">
          {activeTab === 'SpecimenIndex' && <SpecimenIndexWorkspace />}
          {activeTab === 'LedgerCharts' && <LedgerChartsWorkspace />}
          {activeTab === 'CoexpWorkbench' && <CoexpWorkbenchWorkspace />}
          {activeTab === 'EnrichmentLab' && <EnrichmentLab />}
          {activeTab === 'NetworkView' && <NetworkView />}
        </section>
      </main>
    </div>
  );
}
