import DataConfigView from './DataConfigView';
import ReadmeView from './ReadmeView';
import GeneSelectionView from './GeneSelectionView';
import GeneDetailsView from './GeneDetailsView';

export function SpecimenIndexWorkspace() {
  return (
    <div className="specimen-index-workspace" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', alignItems: 'start', width: '100%' }}>
      {/* Column 1: Info & Diagnostics */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
        <DataConfigView isEmbedded={true} />
        <ReadmeView isEmbedded={true} />
      </div>

      {/* Column 2: Selection & Saved Cohorts */}
      <div style={{ minWidth: 0 }}>
        <GeneSelectionView isEmbedded={true} />
      </div>

      {/* Column 3: FlyBase lookup */}
      <div style={{ minWidth: 0 }}>
        <GeneDetailsView isEmbedded={true} />
      </div>
    </div>
  );
}

export default SpecimenIndexWorkspace;
