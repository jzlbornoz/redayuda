import pytest

from app import federation
from app.config import get_settings
from app.models import PeerCreate
from app.store import IndexStore


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _remote_record(record_id, person_name, origin_node):
    return {
        "id": record_id,
        "record_type": "persona_desaparecida",
        "title": person_name,
        "person_name": person_name,
        "source_id": "peer_src",
        "source_name": "Fuente del Peer",
        "origin_node": origin_node,
        "origin_source": "peer_src",
    }


def test_peer_crud_hides_api_key(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    store.add_peer(
        PeerCreate(id="nodoB", name="Nodo B", base_url="http://b:8000", api_key="secreta")
    )

    peers = store.list_peers()
    assert len(peers) == 1
    assert not hasattr(peers[0], "api_key")  # PeerInfo nunca expone la clave

    # La clave si esta disponible internamente para el pull.
    target = store.peer_pull_targets()[0]
    assert target["api_key"] == "secreta"

    assert store.delete_peer("nodoB") is True
    assert store.list_peers() == []


def test_feed_excludes_origin_node(tmp_path):
    from app.models import IndexedRecord

    store = IndexStore(tmp_path / "index.db")
    store.ensure_source("s")
    store.upsert_records(
        [
            IndexedRecord(
                id="s:1", record_type="x", title="Local",
                source_id="s", source_name="s", origin_node="nodoA",
            ),
            IndexedRecord(
                id="s:2", record_type="x", title="Ajeno",
                source_id="s", source_name="s", origin_node="nodoB",
            ),
        ]
    )

    records, _, _ = store.feed_records(since_seq=0, limit=10, exclude_origin="nodoA")
    ids = {r.id for r in records}
    assert ids == {"s:2"}


@pytest.mark.anyio
async def test_pull_peer_ingests_and_skips_own(tmp_path, monkeypatch):
    settings = get_settings()
    store = IndexStore(tmp_path / "index.db")

    pages = [
        {
            "records": [
                _remote_record("peer_src:1", "Remoto Uno", "nodoB"),
                _remote_record("peer_src:2", "Mio De Vuelta", settings.node_id),
            ],
            "next_cursor": 2,
            "has_more": False,
        }
    ]

    async def fake_fetch_feed(self, base_url, since, limit, exclude_node=None, api_key=None):
        return pages.pop(0) if pages else {"records": [], "next_cursor": since, "has_more": False}

    monkeypatch.setattr(federation.PeerClient, "fetch_feed", fake_fetch_feed)

    peer = {"id": "nodoB", "base_url": "http://b:8000", "api_key": None, "last_cursor": 0}
    imported, scanned, frm, to = await federation.pull_peer(store, peer, settings)

    assert scanned == 2
    assert imported == 1  # el registro con nuestro propio origin_node se descarta
    assert to == 2

    # La fuente federada se creo y el registro remoto es consultable.
    response = store.search_records(query="remoto uno")
    assert response.total_matches == 1
    assert store.get_peer("nodoB") is None  # no se agrego peer; solo se uso pull directo


@pytest.mark.anyio
async def test_pull_peer_advances_cursor(tmp_path, monkeypatch):
    settings = get_settings()
    store = IndexStore(tmp_path / "index.db")

    pages = [
        {"records": [_remote_record("peer_src:1", "A", "nodoB")], "next_cursor": 5, "has_more": True},
        {"records": [_remote_record("peer_src:2", "B", "nodoB")], "next_cursor": 9, "has_more": False},
    ]

    async def fake_fetch_feed(self, base_url, since, limit, exclude_node=None, api_key=None):
        return pages.pop(0) if pages else {"records": [], "next_cursor": since, "has_more": False}

    monkeypatch.setattr(federation.PeerClient, "fetch_feed", fake_fetch_feed)

    peer = {"id": "nodoB", "base_url": "http://b:8000", "api_key": None, "last_cursor": 0}
    imported, scanned, frm, to = await federation.pull_peer(store, peer, settings)

    assert imported == 2
    assert to == 9
