"""Conector: VenezuelaEncuentra (https://venezuela-encuentra.vercel.app).

Implementa VENP (protocolo abierto de interoperabilidad). Endpoints publicos:
  GET /api/v1/persons -> {success, data:[...]}  (personas reportadas)
  GET /api/v1/centers -> centros de ayuda
Paginacion ?limit=&offset=. CORS, sin auth.
"""

from ...client import HttpClient
from ...models import IndexedRecord, SourceInfo
from ..base import Connector, stamp_and_upsert

VE_SOURCE_ID = "venezuela_encuentra"
VE_API = "https://venezuela-encuentra.vercel.app/api/v1"
VE_BASE = "https://venezuela-encuentra.vercel.app"
VE_PAGE = 100


class VenezuelaEncuentraConnector(Connector):
    source = SourceInfo(
        id=VE_SOURCE_ID,
        name="VenezuelaEncuentra",
        kind="persona_desaparecida",
        description="Busqueda de personas desaparecidas y centros de ayuda (red VENP interoperable).",
        url=VE_BASE,
        access="open",
        enabled=True,
    )

    async def sync(self, *, store, settings, source_limit=1000, max_pages=5, desde=None):
        store.upsert_source(self.source)
        client = HttpClient(settings)
        imported = scanned = pages = 0

        for path, mapper in (("/persons", _map_person), ("/centers", _map_center)):
            offset = 0
            while pages < 2000:
                data = await client.get_json(
                    "%s%s?limit=%d&offset=%d" % (VE_API, path, VE_PAGE, offset)
                )
                items = data.get("data") if isinstance(data, dict) else data
                items = items or []
                pages += 1
                scanned += len(items)
                imported += stamp_and_upsert(
                    store, settings, VE_SOURCE_ID, [mapper(x) for x in items]
                )
                if len(items) < VE_PAGE:
                    break
                offset += VE_PAGE

        store.touch_source_sync(VE_SOURCE_ID)
        return imported, scanned, pages


def _map_person(x):
    rid = str(x.get("id") or "")
    nombre = x.get("full_name") or "Persona"
    return IndexedRecord(
        id="%s:p:%s" % (VE_SOURCE_ID, rid),
        record_type="persona_desaparecida",
        title=nombre,
        summary=x.get("description"),
        person_name=nombre,
        cedula=x.get("cedula") or None,
        age=x.get("age_approx") or x.get("age"),
        location_name=x.get("last_seen_location"),
        state=x.get("state") or None,
        country="VE",
        latitude=x.get("last_seen_lat"),
        longitude=x.get("last_seen_lng"),
        contact=x.get("phone") or None,
        status=x.get("status"),
        source_id=VE_SOURCE_ID,
        source_name="VenezuelaEncuentra",
        source_url=VE_BASE,
        source_record_id="p:" + rid,
        tags=["persona"],
        image_url=x.get("photo_url"),
        raw=x,
    )


def _map_center(x):
    rid = str(x.get("id") or "")
    title = x.get("name") or x.get("title") or "Centro"
    return IndexedRecord(
        id="%s:c:%s" % (VE_SOURCE_ID, rid),
        record_type="recurso",
        title=title,
        organization=title,
        location_name=x.get("location") or x.get("address") or x.get("location_name"),
        city=x.get("city") or None,
        state=x.get("state") or None,
        country="VE",
        latitude=x.get("lat") or x.get("latitude"),
        longitude=x.get("lng") or x.get("longitude"),
        contact=x.get("phone") or x.get("contact"),
        source_id=VE_SOURCE_ID,
        source_name="VenezuelaEncuentra",
        source_url=VE_BASE,
        source_record_id="c:" + rid,
        tags=["centro"],
        raw=x,
    )


CONNECTOR = VenezuelaEncuentraConnector()
