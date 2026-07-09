// IGV Genome Browser embed component
// Embeds an IGV.js genome browser showing a gene's genomic locus
// Uses the @igvteam/igv library — falls back gracefully if not installed

import { useEffect, useRef, useState } from 'react';

interface IGVBrowserProps {
  gene: string;
  genome?: string;
  height?: number;
}

// Lazy-load IGV only when the component mounts
let igvModule: any = null;

export function IGVBrowser({ gene, genome = 'dm6', height = 200 }: IGVBrowserProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const browserRef = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [igvAvailable, setIgvAvailable] = useState(true);

  useEffect(() => {
    // Try to dynamically import IGV
    let cancelled = false;

    async function init() {
      try {
        if (!igvModule) {
          igvModule = await import('igv');
        }
        if (cancelled || !containerRef.current) return;

        const igv = igvModule.default || igvModule;

        // Clean up any previous browser
        if (browserRef.current) {
          try { browserRef.current.remove(); } catch {}
        }

        const locus = gene; // IGV can search by gene symbol if the annotation track supports it

        browserRef.current = igv.createBrowser(containerRef.current, {
          genome: genome,
          locus: locus,
          showNavigation: true,
          showRuler: true,
          tracks: [
            {
              name: 'RefSeq Genes',
              url: `https://hgdownload.soe.ucsc.edu/goldenPath/${genome}/bigZips/genes/${genome}.refGene.gtf.gz`,
              type: 'annotation',
              order: 1,
            },
            {
              name: 'Drosophila mRNA',
              url: `https://hgdownload.soe.ucsc.edu/goldenPath/${genome}/bigZips/${genome}.mrna.fa.gz`,
              type: 'sequence',
              order: 2,
              visibilityWindow: 100000,
            },
          ],
        });

        if (!cancelled) setStatus('ready');
      } catch (err: any) {
        console.warn('[IGV] Failed to load:', err.message);
        if (!cancelled) {
          setIgvAvailable(false);
          setStatus('error');
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [gene, genome]);

  if (!igvAvailable) {
    return (
      <div style={{
        background: 'var(--bg-tertiary)', border: '1px dashed var(--border-color)',
        borderRadius: '4px', padding: '0.75rem', fontSize: '0.75rem',
        color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'var(--font-mono)',
      }}>
        IGV genome browser not available. Install with: <code style={{ fontSize: '0.7rem' }}>npm install @igvteam/igv</code>
      </div>
    );
  }

  return (
    <div style={{
      border: '1px solid var(--border-color)', borderRadius: '4px',
      overflow: 'hidden', background: '#faf9f6',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.3rem 0.6rem', background: 'var(--bg-tertiary)',
        borderBottom: '1px solid var(--border-color)',
        fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700,
      }}>
        <span>IGV Genome Browser — {gene} @ {genome}</span>
        <a
          href={`https://flybase.org/search/gene/${gene}`}
          target="_blank" rel="noreferrer"
          style={{ color: 'var(--secondary)', textDecoration: 'none', fontSize: '0.6rem' }}
        >
          FlyBase ↗
        </a>
      </div>
      {status === 'loading' && (
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
          Loading IGV browser...
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          height: status === 'ready' ? height : 0,
          width: '100%',
          transition: 'height 0.3s',
        }}
      />
    </div>
  );
}

export default IGVBrowser;
