"""Conector: Reencuentra VE (https://reencuentra-ve.vercel.app).

GET /api/v1/centros -> {ok, meta{total}, data:[...]} (centros de acopio/ayuda/medicos).
Su /api/v1/personas exige q (solo busqueda) -> no enumerable, no se ingiere.
CORS, sin auth.
"""

from ...client import HttpClient
from ...models import IndexedRecord, SourceInfo
from ..base import Connector, stamp_and_upsert

RE_SOURCE_ID = "reencuentra_ve"
RE_BASE = "https://reencuentra-ve.vercel.app"


class ReencuentraVeConnector(Connector):
    source = SourceInfo(
        id=RE_SOURCE_ID,
        name="Reencuentra VE",
        kind="recurso",
        description="Centros de acopio, ayuda y puntos medicos.",
        url=RE_BASE,
        access="open",
        enabled=True,
    )

    async def sync(self, *, store, settings, source_limit=1000, max_pages=5, desde=None):
        store.upsert_source(self.source)
        data = await HttpClient(settings).get_json(RE_BASE + "/api/v1/centros")
        items = (data.get("data") if isinstance(data, dict) else data) or []
        imported = stamp_and_upsert(store, settings, RE_SOURCE_ID, [_map(x) for x in items])
        store.touch_source_sync(RE_SOURCE_ID)
        return imported, len(items), 1


def _map(x):
    rid = str(x.get("id") or "")
    nombre = x.get("nombre") or "Centro"
    tipo = (x.get("tipo") or "").lower()
    return IndexedRecord(
        id="%s:%s" % (RE_SOURCE_ID, rid),
        record_type="centro_acopio" if "acopio" in tipo else "recurso",
        title=nombre,
        summary=x.get("descripcion"),
        organization=nombre,
        location_name=x.get("direccion") or x.get("municipio"),
        city=x.get("municipio"),
        country="VE",
        contact=x.get("contacto") or None,
        verified=bool(x.get("verificado")),
        source_id=RE_SOURCE_ID,
        source_name="Reencuentra VE",
        source_url=RE_BASE,
        source_record_id=rid,
        tags=["centro", tipo or "recurso"],
        raw=x,
    )


CONNECTOR = ReencuentraVeConnector()
