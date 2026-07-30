import { useState } from 'react';
import ExpressionTrendView from './ExpressionTrendView';
import CellCentricView from './CellCentricView';
import OnOffMatrix from './OnOffMatrix';
import CellTypeHeatmap from '../shared/CellTypeHeatmap';
import { WorkspaceLayout } from '../shared/WorkspaceLayout';
import { BarChart2 } from 'lucide-react';

export function LedgerChartsWorkspace() {
  const [activeTab, setActiveTab] = useState<'boxplot' | 'trajectory' | 'onoff' | 'heatmap'>('boxplot');
  const [pivotView, setPivotView] = useState(false);

  return (
    <WorkspaceLayout
      title="EXPRESSION_DASHBOARD"
      icon={<BarChart2 size={14} />}
      controls={
        <>
          <div className="toggle-group" style={{ marginBottom: '1.25rem' }}>
            <button className={`toggle-group-btn ${activeTab === 'boxplot' ? 'active' : ''}`}
              onClick={() => setActiveTab('boxplot')}>Boxplot Ledger</button>
            <button className={`toggle-group-btn ${activeTab === 'trajectory' ? 'active' : ''}`}
              onClick={() => setActiveTab('trajectory')}>Trajectory Splines</button>
            <button className={`toggle-group-btn ${activeTab === 'onoff' ? 'active' : ''}`}
              onClick={() => setActiveTab('onoff')}>On/Off Matrix</button>
            <button className={`toggle-group-btn ${activeTab === 'heatmap' ? 'active' : ''}`}
              onClick={() => setActiveTab('heatmap')}>Cell Heatmap</button>
          </div>

          {activeTab === 'boxplot' && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-checkbox-label">
                <input type="checkbox" checked={pivotView} onChange={(e) => setPivotView(e.target.checked)} />
                <span>Pivot by Cell Type</span>
              </label>
            </div>
          )}
        </>
      }
    >
      {activeTab === 'boxplot' ? (
        <ExpressionTrendView isEmbedded={true} pivotView={pivotView} setPivotView={setPivotView} />
      ) : activeTab === 'trajectory' ? (
        <CellCentricView />
      ) : activeTab === 'onoff' ? (
        <OnOffMatrix />
      ) : (
        <CellTypeHeatmap />
      )}
    </WorkspaceLayout>
  );
}

export default LedgerChartsWorkspace;
