"""Conector: Te Busco (https://tebusco.lovable.app).

GET /api/public/personas?estado=&ubicacion=&q=&limit=&offset= -> {data[], meta{total}}.
CORS, sin auth. Personas desaparecidas / a salvo / fallecidas / no identificadas.
"""

from ...models import IndexedRecord, SourceInfo
from ..base import HttpListConnector

TB_SOURCE_ID = "tebusco"
TB_BASE = "https://tebusco.lovable.app"


def _record_type(estado):
    e = (estado or "").lower()
    if "salvo" in e or "vida" in e or "encontr" in e:
        return "persona_localizada"
    if "fallec" in e:
        return "persona_localizada"
    if "no_ident" in e or "no ident" in e:
        return "persona_localizada"
    return "persona_desaparecida"


class TeBuscoConnector(HttpListConnector):
    source = SourceInfo(
        id=TB_SOURCE_ID,
        name="Te Busco",
        kind="persona_desaparecida",
        description="Reportes ciudadanos de personas desaparecidas, a salvo, fallecidas o no identificadas.",
        url=TB_BASE,
        access="open",
        enabled=True,
    )
    list_url = TB_BASE + "/api/public/personas"
    items_key = "data"
    page_param = "offset"
    page_size_param = "limit"
    page_size = 100

    def map_item(self, item):
        rid = str(item.get("id") or "")
        nombre = item.get("nombre_completo") or "Persona"
        estado = item.get("estado")
        summary = " · ".join(
            p for p in [item.get("descripcion_fisica"), item.get("vestimenta")] if p
        ) or None
        return IndexedRecord(
            id="%s:%s" % (TB_SOURCE_ID, rid),
            record_type=_record_type(estado),
            title=nombre,
            summary=summary,
            person_name=nombre,
            age=item.get("edad"),
            location_name=item.get("ultima_ubicacion"),
            city=item.get("ultima_ubicacion"),
            country="VE",
            status=estado,
            verified=bool(item.get("verificado")),
            source_id=TB_SOURCE_ID,
            source_name="Te Busco",
            source_url=TB_BASE,
            source_record_id=rid,
            observed_at=item.get("fecha_visto_ultima_vez"),
            updated_at=item.get("actualizado_en") or item.get("creado_en"),
            tags=["persona"],
            raw=item,
        )


CONNECTOR = TeBuscoConnector()
