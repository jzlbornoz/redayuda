"""Conector: Conecta Venezuela (https://conecta-venezuela.lovable.app).

Dos endpoints públicos paginados (page/limit), formato {data[], pagination{total_pages}}:
- GET /api/public/personas -> reportes de personas (estado: desaparecido/encontrado/...)
- GET /api/public/centros   -> centros de acopio, hospitales, clínicas (campo `tipo`)
CORS, sin auth. (Hoy personas puede venir vacío; indexa al cargarse.)
"""

from datetime import datetime, timezone

from ...client import HttpClient
from ...models import IndexedRecord, SourceInfo
from ..base import Connector

CV_SOURCE_ID = "conecta_venezuela"
CV_BASE = "https://conecta-venezuela.lovable.app"
CV_PAGE = 100

_CENTRO_TYPE = {
    "centro_acopio": "centro_acopio",
    "acopio": "centro_acopio",
    "punto_recaudacion": "centro_donacion",
    "donacion": "centro_donacion",
}


def _persona_type(estado):
    e = (estado or "").lower()
    if "encontr" in e or "salvo" in e or "vida" in e or "localiz" in e:
        return "persona_localizada"
    if "hospital" in e:
        return "persona_hospitalizada"
    return "persona_desaparecida"


class ConectaVenezuelaConnector(Connector):
    source = SourceInfo(
        id=CV_SOURCE_ID,
        name="Conecta Venezuela",
        kind="recurso",
        description="Personas en búsqueda y centros de acopio/salud (plataforma integral).",
        url=CV_BASE,
        access="open",
        enabled=True,
    )

    async def sync(self, *, store, settings, source_limit=1000, max_pages=5, desde=None):
        store.upsert_source(self.source)
        client = HttpClient(settings)
        imported = scanned = pages = 0

        for path, mapper in (
            ("/api/public/personas", self._map_persona),
            ("/api/public/centros", self._map_centro),
        ):
            page = 1
            while pages < 2000:
                data = await client.get_json(
                    CV_BASE + path, params={"page": page, "limit": CV_PAGE}
                )
                items = (data.get("data") if isinstance(data, dict) else None) or []
                pages += 1
                scanned += len(items)
                records = []
                for item in items:
                    record = mapper(item)
                    record.origin_node = settings.node_id
                    record.origin_source = CV_SOURCE_ID
                    records.append(record)
                imported += store.upsert_records(records)
                if len(items) < CV_PAGE:
                    break
                page += 1

        store.touch_source_sync(CV_SOURCE_ID)
        return imported, scanned, pages

    def _map_persona(self, item):
        rid = str(item.get("id") or "")
        nombre = item.get("nombre") or item.get("nombre_completo") or "Persona"
        return IndexedRecord(
            id="%s:persona:%s" % (CV_SOURCE_ID, rid),
            record_type=_persona_type(item.get("status") or item.get("estado")),
            title=nombre,
            person_name=nombre,
            cedula=item.get("ci") or item.get("cedula"),
            city=item.get("ciudad"),
            state=item.get("estado"),
            country="VE",
            status=item.get("status"),
            source_id=CV_SOURCE_ID,
            source_name="Conecta Venezuela",
            source_url=CV_BASE,
            source_record_id="persona:" + rid,
            tags=["persona"],
            raw=item,
        )

    def _map_centro(self, item):
        rid = str(item.get("id") or "")
        nombre = item.get("nombre") or "Centro"
        tipo = (item.get("tipo") or "").lower()
        return IndexedRecord(
            id="%s:centro:%s" % (CV_SOURCE_ID, rid),
            record_type=_CENTRO_TYPE.get(tipo, "recurso"),
            title=nombre,
            summary=item.get("necesidades") or item.get("descripcion"),
            organization=nombre,
            location_name=item.get("direccion") or item.get("ciudad"),
            city=item.get("ciudad"),
            state=item.get("estado"),
            country="VE",
            latitude=item.get("lat"),
            longitude=item.get("lng"),
            contact=item.get("telefono"),
            source_id=CV_SOURCE_ID,
            source_name="Conecta Venezuela",
            source_url=CV_BASE,
            source_record_id="centro:" + rid,
            tags=["centro", tipo or "recurso"],
            raw=item,
        )


CONNECTOR = ConectaVenezuelaConnector()
