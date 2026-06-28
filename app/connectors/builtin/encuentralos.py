"""Conector: Encuentralos (https://encuentralos.tecnosoft.dev).

GET /api/personas?limit=&offset= -> {items[], total}. Sin auth (consumir backend).
"""

from ...models import IndexedRecord, SourceInfo
from ..base import HttpListConnector

EN_SOURCE_ID = "encuentralos"
EN_BASE = "https://encuentralos.tecnosoft.dev"


def _record_type(estado):
    e = (estado or "").lower()
    if "hospital" in e:
        return "persona_hospitalizada"
    if "localiz" in e or "salvo" in e or "encontr" in e or "vida" in e:
        return "persona_localizada"
    return "persona_desaparecida"


class EncuentralosConnector(HttpListConnector):
    source = SourceInfo(
        id=EN_SOURCE_ID,
        name="Encuentralos",
        kind="persona_desaparecida",
        description="Reportes de personas desaparecidas (agentes IA por WhatsApp/Telegram).",
        url=EN_BASE,
        access="open",
        enabled=True,
    )
    list_url = EN_BASE + "/api/personas"
    items_key = "items"
    page_param = "offset"
    page_size_param = "limit"
    page_size = 100

    def map_item(self, item):
        rid = str(item.get("id") or "")
        nombre = item.get("nombre") or "Persona desaparecida"
        estado = item.get("estado")
        return IndexedRecord(
            id="%s:%s" % (EN_SOURCE_ID, rid),
            record_type=_record_type(estado),
            title=nombre,
            summary=item.get("descripcion"),
            person_name=nombre,
            cedula=item.get("cedula"),
            age=item.get("edad"),
            location_name=item.get("ultima_ubicacion"),
            city=item.get("ultima_ubicacion"),
            country="VE",
            latitude=item.get("ultima_lat"),
            longitude=item.get("ultima_lng"),
            contact=item.get("reporta_contacto"),
            status=estado or None,
            source_id=EN_SOURCE_ID,
            source_name="Encuentralos",
            source_url=EN_BASE,
            source_record_id=rid,
            observed_at=item.get("ultima_vez"),
            updated_at=item.get("creado"),
            tags=["persona", "desaparecida"],
            raw=item,
        )


CONNECTOR = EncuentralosConnector()
