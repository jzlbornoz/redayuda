"""Conector: Red Pana Venezuela (https://red-pana-venezuela.vercel.app).

GET /api/albergues -> {count, albergues:[...]}  · GET /api/insumos -> {count, insumos:[...]}
JSON, CORS, 60/min. Datos de grupos de WhatsApp estructurados con IA.
"""

from ...client import HttpClient
from ...models import IndexedRecord, SourceInfo
from ..base import Connector, stamp_and_upsert

RP_SOURCE_ID = "red_pana"
RP_BASE = "https://red-pana-venezuela.vercel.app"


class RedPanaConnector(Connector):
    source = SourceInfo(
        id=RP_SOURCE_ID,
        name="Red Pana Venezuela",
        kind="recurso",
        description="Albergues, refugios, centros de acopio e insumos (lo que se necesita y lo que hay).",
        url=RP_BASE,
        access="open",
        enabled=True,
    )

    async def sync(self, *, store, settings, source_limit=1000, max_pages=5, desde=None):
        store.upsert_source(self.source)
        client = HttpClient(settings)
        imported = scanned = 0

        alb = await client.get_json(RP_BASE + "/api/albergues")
        albergues = (alb.get("albergues") if isinstance(alb, dict) else alb) or []
        scanned += len(albergues)
        imported += stamp_and_upsert(
            store, settings, RP_SOURCE_ID, [_map_albergue(x) for x in albergues]
        )

        ins = await client.get_json(RP_BASE + "/api/insumos")
        insumos = (ins.get("insumos") if isinstance(ins, dict) else ins) or []
        scanned += len(insumos)
        imported += stamp_and_upsert(
            store, settings, RP_SOURCE_ID, [_map_insumo(x) for x in insumos]
        )

        store.touch_source_sync(RP_SOURCE_ID)
        return imported, scanned, 2


def _map_albergue(x):
    rid = str(x.get("id") or "")
    nombre = x.get("nombre") or "Albergue"
    loc = x.get("direccion") or x.get("zona")
    return IndexedRecord(
        id="%s:alb:%s" % (RP_SOURCE_ID, rid),
        record_type="recurso",
        title=nombre,
        summary=x.get("necesidades"),
        organization=nombre,
        location_name=loc,
        city=x.get("zona") or x.get("municipio"),
        state=x.get("estado_geo"),
        country="VE",
        contact=x.get("contacto") or None,
        status=x.get("estado") or None,
        source_id=RP_SOURCE_ID,
        source_name="Red Pana Venezuela",
        source_url=RP_BASE,
        source_record_id="alb:" + rid,
        tags=["albergue", "refugio", str(x.get("tipo") or "")],
        image_url=x.get("foto_url") or x.get("foto"),
        raw=x,
    )


def _map_insumo(x):
    rid = str(x.get("id") or "")
    titulo = x.get("titulo") or x.get("nombre") or x.get("tipo") or "Insumo"
    return IndexedRecord(
        id="%s:ins:%s" % (RP_SOURCE_ID, rid),
        record_type="recurso",
        title=str(titulo),
        summary=x.get("descripcion") or x.get("necesidad"),
        city=x.get("zona"),
        country="VE",
        contact=x.get("contacto") or None,
        status=x.get("urgencia") or x.get("tipo") or None,
        source_id=RP_SOURCE_ID,
        source_name="Red Pana Venezuela",
        source_url=RP_BASE,
        source_record_id="ins:" + rid,
        tags=["insumo", str(x.get("tipo") or "")],
        raw=x,
    )


CONNECTOR = RedPanaConnector()
