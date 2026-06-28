import pytest

from app import connectors, scheduler
from app.config import get_settings
from app.store import IndexStore


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_sync_all_runs_enabled_and_survives_failures(tmp_path, monkeypatch):
    connectors.load_builtin_connectors(force=True)

    calls = []

    # faro_ve: sync exitoso falso
    faro = connectors.get("faro_ve")
    async def ok_sync(*, store, settings, source_limit, max_pages, desde=None):
        calls.append("faro_ve")
        return 3, 3, 1
    monkeypatch.setattr(faro, "sync", ok_sync)

    # hospitales_venezuela: falla (p.ej. falta API key) -> no debe tumbar el resto
    hosp = connectors.get("hospitales_venezuela")
    async def boom_sync(*, store, settings, source_limit, max_pages, desde=None):
        calls.append("hospitales_venezuela")
        raise RuntimeError("api_key_missing")
    monkeypatch.setattr(hosp, "sync", boom_sync)

    store = IndexStore(tmp_path / "index.db")
    results = await scheduler.sync_all_sources(store, get_settings())

    by_id = {r["source_id"]: r for r in results}
    assert by_id["faro_ve"]["ok"] is True
    assert by_id["hospitales_venezuela"]["ok"] is False
    assert "faro_ve" in calls and "hospitales_venezuela" in calls


@pytest.mark.anyio
async def test_sync_all_skips_disabled_sources(tmp_path, monkeypatch):
    connectors.load_builtin_connectors(force=True)
    faro = connectors.get("faro_ve")
    monkeypatch.setattr(faro.source, "enabled", False)

    ran = []
    async def tracking_sync(*, store, settings, source_limit, max_pages, desde=None):
        ran.append("faro_ve")
        return 0, 0, 0
    monkeypatch.setattr(faro, "sync", tracking_sync)

    store = IndexStore(tmp_path / "index.db")
    results = await scheduler.sync_all_sources(store, get_settings())

    assert "faro_ve" not in [r["source_id"] for r in results]
    assert ran == []
