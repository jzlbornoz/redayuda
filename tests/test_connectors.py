import pytest

from app import connectors
from app.connectors.builtin.hospitales import HOSPITALES_SOURCE_ID
from app.models import Paciente


def test_registry_discovers_hospitales():
    connectors.load_builtin_connectors(force=True)
    connector = connectors.get(HOSPITALES_SOURCE_ID)
    assert connector is not None
    assert connector.source.id == HOSPITALES_SOURCE_ID


def test_source_infos_includes_hospitales():
    connectors.load_builtin_connectors(force=True)
    ids = {s.id for s in connectors.source_infos()}
    assert HOSPITALES_SOURCE_ID in ids


def test_get_unknown_connector_is_none():
    connectors.load_builtin_connectors(force=True)
    assert connectors.get("no_existe") is None


@pytest.mark.anyio
async def test_connector_sync_persists(tmp_path, monkeypatch):
    from app.config import get_settings
    from app.store import IndexStore

    connectors.load_builtin_connectors(force=True)
    connector = connectors.get(HOSPITALES_SOURCE_ID)

    pacientes = [
        Paciente(nombre="Ana Perez", cedula="111", hospital="Central", ciudad="Valencia"),
        Paciente(nombre="Luis Diaz", cedula="222", hospital="Sur", ciudad="Caracas"),
    ]

    async def fake_fetch_page(settings, limit, offset, desde):
        page = pacientes[offset : offset + limit]
        return page, len(page), len(pacientes)

    monkeypatch.setattr(connector, "fetch_page", fake_fetch_page)

    store = IndexStore(tmp_path / "index.db")
    imported, scanned, pages = await connector.sync(
        store=store,
        settings=get_settings(),
        source_limit=1000,
        max_pages=5,
    )

    assert imported == 2
    assert scanned == 2
    response = store.search_records(query="ana valencia")
    assert response.total_matches == 1


def test_sync_unknown_source_returns_404(env_keys, make_client):
    env_keys(ADMIN_API_KEY="adm")
    client = make_client()

    response = client.post(
        "/api/sources/desconocida/sync", headers={"x-admin-key": "adm"}
    )
    assert response.status_code == 404


@pytest.fixture
def anyio_backend():
    return "asyncio"
