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
    assert {
        "faro_ve", "venezuela_ayuda", "venezuela_solidaria",
        "encuentralos", "data_guaira", "mapa_insumos", "sos_venezuela", "hf_yofran",
        "tebusco", "conecta_venezuela", "refugios_vzla", "angeles_autopista",
    }.issubset(ids)


@pytest.mark.anyio
async def test_httplist_connectors_paginate(tmp_path, monkeypatch):
    """HttpListConnector pagina y mapea (offset, page y hasMore)."""
    from app.client import HttpClient

    fixtures = {
        # encuentralos: offset/limit + total
        "encuentralos": [
            {"items": [{"id": 1, "nombre": "Ana Perez", "cedula": "111",
                        "estado": "desaparecido", "ultima_ubicacion": "Caracas"}],
             "total": 1},
            {"items": [], "total": 1},
        ],
        # data_guaira: page + results
        "data_guaira": [
            {"results": [{"id": 9, "nombre_completo": "Luis Diaz", "hospital": "Vargas",
                          "estado": "ESTABLE", "edad": 40}], "total": 1, "page": 1},
            {"results": []},
        ],
        # mapa_insumos: page + hasMore
        "mapa_insumos": [
            {"services": [{"id": "x1", "name": "Farmacia Sur", "city": "Caracas",
                           "state": "Miranda", "lat": 10.5, "lng": -66.9,
                           "notes": "Operador: Cruz Roja"}], "hasMore": False},
        ],
    }
    state = {"encuentralos": 0, "data_guaira": 0, "mapa_insumos": 0}

    async def fake_get_json(self, url, params=None, headers=None):
        if "encuentralos" in url:
            key = "encuentralos"
        elif "62.146.225.76" in url:
            key = "data_guaira"
        else:
            key = "mapa_insumos"
        pages = fixtures[key]
        i = min(state[key], len(pages) - 1)
        state[key] += 1
        return pages[i]

    monkeypatch.setattr(HttpClient, "get_json", fake_get_json)
    connectors.load_builtin_connectors(force=True)
    store = IndexStore(tmp_path / "index.db")

    for sid, expect_type in [
        ("encuentralos", "persona_desaparecida"),
        ("data_guaira", "persona_hospitalizada"),
        ("mapa_insumos", "recurso"),
    ]:
        imported, scanned, pages = await connectors.get(sid).sync(
            store=store, settings=get_settings(), source_limit=5000, max_pages=10
        )
        assert imported == 1, sid

    assert store.get_record("encuentralos:1").record_type == "persona_desaparecida"
    assert store.get_record("data_guaira:9").organization == "Vargas"
    mi = store.get_record("mapa_insumos:x1")
    assert mi.record_type == "recurso" and mi.organization == "Cruz Roja"


def test_hf_sse_parsing():
    from app.connectors.builtin.hf_yofran import _extract_records, _map
    sse = (
        "event: complete\n"
        'data: [{"status":"success","total":2,"data":['
        '{"id":11478,"nombre":"IZAGUIRRE Yenny","cedula_norm":"84157899",'
        '"condicion":"Sin informacion","notas":"Hospital: Banuta"}]}]\n'
    )
    recs = _extract_records(sse)
    assert len(recs) == 1
    mapped = _map(recs[0])
    assert mapped.record_type == "persona_hospitalizada"
    assert mapped.cedula == "84157899"
    assert mapped.organization == "Banuta"


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
