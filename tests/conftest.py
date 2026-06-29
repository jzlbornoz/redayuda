import os

import pytest
from fastapi.testclient import TestClient

from app import config, main
from app.models import Paciente, UpstreamResponse


class FakeHospitalesClient:
    """Cliente upstream falso: devuelve un payload fijo sin tocar la red."""

    def __init__(self, pacientes=None, total=None):
        self._pacientes = pacientes or []
        self._total = total if total is not None else len(self._pacientes)

    async def export_pacientes(self, limit=1000, offset=0, desde=None):
        page = self._pacientes[offset : offset + limit]
        return UpstreamResponse(
            ok=True,
            api_version="test",
            fuente="fake",
            generado="2026-06-27T00:00:00+00:00",
            total=self._total,
            offset=offset,
            limit=limit,
            count=len(page),
            pacientes=page,
        )


def _reset_caches():
    config.get_settings.cache_clear()
    main.get_store.cache_clear()
    main.get_proposal_rate_limiter.cache_clear()
    main.get_read_rate_limiter.cache_clear()


@pytest.fixture
def env_keys(monkeypatch):
    """Helper para fijar/limpiar las claves de escritura y refrescar settings."""

    def _set(**values):
        for name in (
            "INGEST_API_KEY",
            "ADMIN_API_KEY",
            "HOSPITALES_API_KEY",
            "ALLOW_OPEN_WRITES",
            "DEV_MODE",
        ):
            monkeypatch.delenv(name, raising=False)
        for name, value in values.items():
            if value is None:
                monkeypatch.delenv(name, raising=False)
            else:
                monkeypatch.setenv(name, str(value))
        _reset_caches()

    _set()
    return _set


@pytest.fixture
def make_client(tmp_path, monkeypatch):
    """Construye un TestClient con DB aislada y cliente upstream falso."""
    created = []

    def _make(pacientes=None):
        db_path = tmp_path / ("index_%d.db" % len(created))
        monkeypatch.setenv("DATABASE_PATH", str(db_path))
        _reset_caches()

        fake = FakeHospitalesClient(pacientes=pacientes)
        main.app.dependency_overrides[main.get_client] = lambda: fake

        client = TestClient(main.app)
        created.append(client)
        return client

    yield _make

    main.app.dependency_overrides.clear()
    _reset_caches()


@pytest.fixture
def sample_paciente():
    return Paciente(
        nombre="Jose Antonio Perez",
        cedula="12345678",
        edad=40,
        hospital="Hospital Universitario de Caracas",
        ciudad="Caracas",
        registrado="2026-06-26T18:10:22+00:00",
    )
