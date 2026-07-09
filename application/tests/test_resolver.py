import pytest
from typing import List, Dict, Optional
from backend.resolver import GeneSynonymResolver, EnsemblClient, ResolutionResult

class InMemoryEnsemblClient:
    """In-memory mock adapter for EnsemblClient seam"""
    def __init__(self):
        self.search_db: Dict[str, List[Dict[str, str]]] = {}
        self.lookup_db: Dict[str, str] = {}
        self.should_fail: bool = False

    def search_symbol(self, symbol: str) -> List[Dict[str, str]]:
        if self.should_fail:
            raise Exception("Remote server down")
        return self.search_db.get(symbol, [])

    def lookup_id(self, gene_id: str) -> Optional[str]:
        if self.should_fail:
            raise Exception("Remote server down")
        return self.lookup_db.get(gene_id)

    def get_gene_metadata(self, symbol: str) -> Optional[Dict[str, str]]:
        if self.should_fail:
            raise Exception("Remote server down")
        return {
            'name': 'Achi',
            'flybase': 'FBgn0033749',
            'symbol': symbol,
            'summary': 'Dummy summary'
        }

def test_resolve_direct_success():
    client = InMemoryEnsemblClient()
    client.search_db["achi"] = [{"id": "FBgn0033749", "type": "gene"}]
    client.lookup_db["FBgn0033749"] = "achi"

    resolver = GeneSynonymResolver(client)
    canonical, warning = resolver.resolve("achi")

    assert canonical == "achi"
    assert warning is None

def test_resolve_multiple_mappings_warning():
    client = InMemoryEnsemblClient()
    client.search_db["ambiguous"] = [
        {"id": "FBgn0033749", "type": "gene"},
        {"id": "FBgn0000015", "type": "gene"}
    ]
    client.lookup_db["FBgn0033749"] = "achi"
    client.lookup_db["FBgn0000015"] = "Abd-B"

    resolver = GeneSynonymResolver(client)
    canonical, warning = resolver.resolve("ambiguous")

    assert canonical == "achi"
    assert "maps to multiple genes" in warning
    assert "achi, Abd-B" in warning

def test_resolve_api_down():
    client = InMemoryEnsemblClient()
    client.should_fail = True

    resolver = GeneSynonymResolver(client)
    with pytest.raises(RuntimeError) as excinfo:
        resolver.resolve("achi")
    assert "Ensembl API down" in str(excinfo.value)

def test_resolve_bulk():
    client = InMemoryEnsemblClient()
    client.search_db["obsolete_achi"] = [{"id": "FBgn0033749", "type": "gene"}]
    client.lookup_db["FBgn0033749"] = "achi"

    resolver = GeneSynonymResolver(client)
    all_genes_map = {"ab": "ab", "achi": "achi", "abd-b": "Abd-B"}

    # Input: ab (direct match), obsolete_achi (synonym), unknown (unresolved)
    result = resolver.resolve_bulk("ab, obsolete_achi, unknown", all_genes_map)

    assert result.resolved_symbols == ["ab", "achi"]
    assert result.warnings == []
    assert result.unresolved == ["unknown"]
    assert result.api_down is False

def test_get_gene_metadata():
    client = InMemoryEnsemblClient()
    resolver = GeneSynonymResolver(client)
    res = resolver.get_gene_metadata("achi")
    assert res is not None
    assert res['symbol'] == "achi"
    assert res['flybase'] == "FBgn0033749"
