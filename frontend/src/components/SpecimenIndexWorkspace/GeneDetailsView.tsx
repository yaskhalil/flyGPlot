import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { fetchGeneMetadata } from '../../utils/resolver';
import { ExternalLink, Loader, Info } from 'lucide-react';

interface GeneDetailsViewProps {
  isEmbedded?: boolean;
}

export function GeneDetailsView({ isEmbedded = false }: GeneDetailsViewProps) {
  const { allGenesList } = useAppStore();
  const [lookupGene, setLookupGene] = useState('');
  const [metadata, setMetadata] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (allGenesList.length > 0 && !lookupGene) {
      setLookupGene(allGenesList[0]);
    }
  }, [allGenesList, lookupGene]);

  useEffect(() => {
    if (lookupGene) {
      setLoading(true);
      setMetadata(null);
      fetchGeneMetadata(lookupGene)
        .then(data => {
          setMetadata(data);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
    }
  }, [lookupGene]);

  return (
    <div style={{ maxWidth: isEmbedded ? 'none' : '800px', margin: isEmbedded ? '0' : '0 auto', width: '100%' }}>
      <div className="card">
        <h2>FlyBase Registry Record Sheet</h2>
        
        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
          <label className="form-label">Inspect Specimen</label>
          <select className="form-select" value={lookupGene} onChange={(e) => setLookupGene(e.target.value)}>
            {allGenesList.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {lookupGene && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px dashed var(--border-color)', paddingTop: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <a 
                href={`https://flybase.org/search/gene/${lookupGene}`} 
                target="_blank" 
                rel="noreferrer"
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                Open {lookupGene} on FlyBase <ExternalLink size={14} style={{ marginLeft: '0.25rem' }} />
              </a>
            </div>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Loader className="animate-spin" size={24} color="var(--text-primary)" /></div>
            ) : metadata ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                <div><strong>Approved Symbol:</strong> <code style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{lookupGene}</code></div>
                <div><strong>Described Name:</strong> <span style={{ color: 'var(--text-primary)' }}>{metadata.name}</span></div>
                <div><strong>FlyBase Accession:</strong> <code style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{metadata.flybase}</code></div>
                
                <div style={{ 
                  backgroundColor: 'var(--bg-tertiary)', 
                  border: '1px dashed var(--border-color)',
                  padding: '1.25rem', 
                  borderRadius: '3px', 
                  fontSize: '0.85rem', 
                  color: 'var(--text-secondary)',
                  marginTop: '0.5rem',
                  fontFamily: 'var(--font-mono)'
                }}>
                  <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.5rem' }}>FlyBase/Ensembl Log Summary:</strong>
                  <p style={{ fontSize: '0.8rem', lineHeight: '1.45', margin: 0 }}>{metadata.summary}</p>
                </div>
              </div>
            ) : (
              <div className="alert alert-info">
                <Info className="alert-info-icon" size={16} />
                <div>Summary details not resolved. Use external links.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default GeneDetailsView;
