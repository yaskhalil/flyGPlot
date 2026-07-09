import requests
import re
from typing import Protocol, List, Dict, Optional, Tuple, NamedTuple
from functools import lru_cache

class EnsemblClient(Protocol):
    def search_symbol(self, symbol: str) -> List[Dict[str, str]]:
        """Query xrefs/symbol/drosophila_melanogaster/{symbol}"""
        ...

    def lookup_id(self, gene_id: str) -> Optional[str]:
        """Query lookup/id/{gene_id} to get display_name"""
        ...

    def get_gene_metadata(self, symbol: str) -> Optional[Dict[str, str]]:
        """Query gene metadata from Ensembl and FlyBase"""
        ...

class HttpEnsemblAdapter:
    def __init__(self, timeout: float = 3.0):
        self.timeout = timeout

    def search_symbol(self, symbol: str) -> List[Dict[str, str]]:
        url = f"https://rest.ensembl.org/xrefs/symbol/drosophila_melanogaster/{symbol}?content-type=application/json"
        r = requests.get(url, timeout=self.timeout)
        if r.status_code != 200:
            r.raise_for_status()
        return r.json()

    def lookup_id(self, gene_id: str) -> Optional[str]:
        url = f"https://rest.ensembl.org/lookup/id/{gene_id}?content-type=application/json"
        r = requests.get(url, timeout=self.timeout)
        if r.status_code == 404:
            return None
        if r.status_code != 200:
            r.raise_for_status()
        return r.json().get('display_name')

    def get_gene_metadata(self, symbol: str) -> Optional[Dict[str, str]]:
        meta = {}
        ens_url = f"https://rest.ensembl.org/lookup/symbol/drosophila_melanogaster/{symbol}"
        try:
            r1 = requests.get(ens_url, headers={"Content-Type": "application/json"}, timeout=self.timeout)
            if r1.status_code == 200:
                d1 = r1.json()
                meta['flybase'] = d1.get('id', 'N/A')
                desc = d1.get('description', '')
                meta['name'] = desc.split(' [')[0] if desc else 'Unknown'
                meta['symbol'] = d1.get('display_name', symbol)
        except Exception:
            pass
            
        if meta.get('flybase') and meta['flybase'] != 'N/A':
            fb_url = f"https://api.flybase.org/api/v1.0/gene/summaries/auto/{meta['flybase']}"
            try:
                r2 = requests.get(fb_url, timeout=self.timeout)
                if r2.status_code == 200:
                    d2 = r2.json()
                    resultset = d2.get('resultset', {})
                    results = resultset.get('result', [])
                    if results and len(results) > 0:
                        meta['summary'] = results[0].get('summary', '')
            except Exception:
                pass
                
        if not meta:
            return None
        return {
            'name': meta.get('name', 'Unknown'),
            'flybase': meta.get('flybase', 'N/A'),
            'symbol': meta.get('symbol', symbol),
            'summary': meta.get('summary', 'No detailed biological summary available.')
        }

class ResolutionResult(NamedTuple):
    resolved_symbols: List[str]
    warnings: List[str]
    unresolved: List[str]
    api_down: bool

class GeneSynonymResolver:
    def __init__(self, client: EnsemblClient):
        self.client = client

    @lru_cache(maxsize=1024)
    def resolve(self, symbol: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Resolves a single symbol to its canonical display name.
        Returns: (canonical_symbol, warning_msg)
        """
        symbol_clean = symbol.strip()
        if not symbol_clean:
            return None, None

        try:
            data = self.client.search_symbol(symbol_clean)
        except Exception:
            raise RuntimeError("Ensembl API down")

        if not data:
            return None, None

        gene_ids = [x['id'] for x in data if x.get('type') == 'gene']
        if not gene_ids:
            return None, None

        display_names = []
        for gid in gene_ids:
            try:
                dname = self.client.lookup_id(gid)
                if dname and dname not in display_names:
                    display_names.append(dname)
            except Exception:
                pass

        if not display_names:
            return None, None

        canonical = display_names[0]
        warning = None
        if len(display_names) > 1:
            warning = f"Synonym '{symbol_clean}' maps to multiple genes: {', '.join(display_names)}. Using '{canonical}'."
        return canonical, warning

    def resolve_bulk(self, bulk_input_str: str, all_genes_map_lower: Dict[str, str]) -> ResolutionResult:
        raw_symbols = [s.strip() for s in re.split(r'[\s,]+', bulk_input_str) if s.strip()]
        
        resolved = []
        warnings = []
        unresolved = []
        api_down = False

        for sym in raw_symbols:
            sym_lower = sym.lower()
            if sym_lower in all_genes_map_lower:
                resolved.append(all_genes_map_lower[sym_lower])
            else:
                try:
                    canonical, warning = self.resolve(sym)
                    if canonical:
                        canonical_lower = canonical.lower()
                        if canonical_lower in all_genes_map_lower:
                            resolved.append(all_genes_map_lower[canonical_lower])
                            if warning:
                                warnings.append(warning)
                        else:
                            unresolved.append(f"{sym} (resolved to '{canonical}', but not present in dataset)")
                    else:
                        unresolved.append(sym)
                except Exception:
                    api_down = True
                    unresolved.append(sym)

        seen = set()
        dedup_resolved = [x for x in resolved if not (x in seen or seen.add(x))]
        return ResolutionResult(
            resolved_symbols=dedup_resolved,
            warnings=warnings,
            unresolved=unresolved,
            api_down=api_down
        )

    def get_gene_metadata(self, symbol: str) -> Optional[Dict[str, str]]:
        return self.client.get_gene_metadata(symbol)
