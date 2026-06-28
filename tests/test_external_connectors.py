import pytest

from app import connectors
from app.config import get_settings
from app.store import IndexStore


@pytest.fixture
def anyio_backend():
    return "asyncio"


def test_external_connectors_are_discovered():
    connectors.load_builtin_connectors(force=True)
    ids = {s.id for s in connectors.source_infos()}
    assert {"faro_ve", "venezuela_ayuda", "venezuela_solidaria"}.issubset(ids)


VS_PAGES = [
    {
        "items": [
            {"id": "a1", "category": "donaciones", "title": "We Love Foundation",
             "description": "Ayuda", "city": "La Guaira", "lat": 10.6, "lng": -66.9,
             "verified": True, "link": "https://www.venezuelasolidaria.com/recurso/a1",
             "url": "https://welove.foundation", "created_at": "2026-06-27T23:33:33+00:00",
             "updated_at": "2026-06-27T23:33:33+00:00"},
        ],
        "pagination": {"total": 2, "has_more": True, "limit": 200, "offset": 0, "returned": 1},
    },
    {
        "items": [
            {"id": "b2", "category": "quedadas", "title": "Jornada de acopio Chacao",
             "city": "Caracas", "verified": False},
        ],
        "pagination": {"total": 2, "has_more": False, "limit": 200, "offset": 200, "returned": 1},
    },
]


@pytest.mark.anyio
async def test_venezuela_solidaria_paginates_and_maps(tmp_path, monkeypatch):
    from app.client import HttpClient

    calls = {"n": 0}

    async def fake_get_json(self, url, params=None, headers=None):
        page = VS_PAGES[calls["n"]] if calls["n"] < len(VS_PAGES) else {"items": [], "pagination": {"has_more": False}}
        calls["n"] += 1
        return page

    monkeypatch.setattr(HttpClient, "get_json", fake_get_json)
    connectors.load_builtin_connectors(force=True)
    connector = connectors.get("venezuela_solidaria")

    store = IndexStore(tmp_path / "index.db")
    imported, scanned, pages = await connector.sync(
        store=store, settings=get_settings(), source_limit=5000, max_pages=10
    )
    assert imported == 2 and pages == 2

    donacion = store.search_records(query="we love")
    assert donacion.results[0].record.record_type == "centro_donacion"
    assert donacion.results[0].record.latitude == 10.6

    acopio = store.search_records(query="jornada acopio")
    assert acopio.results[0].record.record_type == "centro_acopio"


FARO_PAYLOAD = {
    "ok": True,
    "count": 2,
    "persons": [
        {
            "id": "abc-1",
            "full_name": "Jose Perez",
            "age": 46,
            "home_city": "Caracas",
            "last_known_location_text": "La Guaira",
            "lat": 10.6,
            "lng": -66.9,
            "status": "missing",
            "is_minor": False,
            "source_url": "https://venezuelatebusca.com",
            "created_at": "2026-06-28T01:00:10+00:00",
            "last_seen_at": None,
        },
        {
            "id": "abc-2",
            "given_name": "Maria",
            "family_name": "Gomez",
            "home_city": "Vargas",
            "status": "missing",
            "is_minor": True,
            "medical_urgent": True,
        },
    ],
}


@pytest.mark.anyio
async def test_faro_connector_imports_and_maps(tmp_path, monkeypatch):
    from app.client import HttpClient

    async def fake_get_json(self, url, params=None, headers=None):
        return FARO_PAYLOAD

    monkeypatch.setattr(HttpClient, "get_json", fake_get_json)
    connectors.load_builtin_connectors(force=True)
    connector = connectors.get("faro_ve")

    store = IndexStore(tmp_path / "index.db")
    imported, scanned, pages = await connector.sync(
        store=store, settings=get_settings(), source_limit=1000, max_pages=5
    )
    assert imported == 2

    found = store.search_records(query="jose perez")
    assert found.total_matches == 1
    rec = found.results[0].record
    assert rec.record_type == "persona_desaparecida"
    assert rec.latitude == 10.6
    assert rec.status == "desaparecida"
    assert rec.origin_source == "faro_ve"

    minor = store.get_record("faro_ve:abc-2")
    assert minor.person_name == "Maria Gomez"
    assert "menor" in minor.tags and "urgencia_medica" in minor.tags


VA_PAYLOAD = {
    "refugios": {
        "caracas_alcaldia_oficial": [
            {"parroquia": "San Bernardino", "sede": "Complejo Cultural Guayana"}
        ]
    },
    "hospitales": {"publicos": ["Hospital Vargas"], "clinicas": ["Clinica Avila"]},
    "donar": [
        {"nombre": "World Central Kitchen", "url": "https://wck.org/donate", "enfoque": "Comida"}
    ],
    "donar_en_venezuela": {
        "organizaciones": [
            {"nombre": "Caritas de Venezuela", "url": "https://caritasvenezuela.org",
             "tipo": "Iglesia", "recibe": ["medicinas", "agua"]}
        ]
    },
    "telefonos": {
        "emergencia_nacional_oficial": [{"linea": "VEN 9-1-1", "numero": "911"}]
    },
}


@pytest.mark.anyio
async def test_venezuela_ayuda_flattens_categories(tmp_path, monkeypatch):
    from app.client import HttpClient

    async def fake_get_json(self, url, params=None, headers=None):
        return VA_PAYLOAD

    monkeypatch.setattr(HttpClient, "get_json", fake_get_json)
    connectors.load_builtin_connectors(force=True)
    connector = connectors.get("venezuela_ayuda")

    store = IndexStore(tmp_path / "index.db")
    imported, scanned, pages = await connector.sync(
        store=store, settings=get_settings()
    )
    # 1 refugio + 1 publico + 1 clinica + 1 donar + 1 org + 1 telefono = 6
    assert imported == 6

    donacion = store.search_records(query="world central kitchen")
    assert donacion.total_matches == 1
    assert donacion.results[0].record.record_type == "centro_donacion"

    refugio = store.search_records(query="guayana")
    assert refugio.total_matches == 1
    assert "refugio" in refugio.results[0].record.tags
