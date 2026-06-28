"""Conector: SOS Venezuela (https://sosvenezuela.nodalyst.ai).

GET /api/people?limit=&offset= -> {total, count, results[]}. CORS *, sin auth.
Personas tras catástrofe (desaparecido/con_vida/hospitalizado/encontrado/fallecido).
Nota: la base puede estar vacía; el conector indexará en cuanto carguen datos.
"""

from ...models import IndexedRecord, SourceInfo
from ..base import HttpListConnector

SOS_SOURCE_ID = "sos_venezuela"
SOS_BASE = "https://sosvenezuela.nodalyst.ai"


def _record_type(status):
    s = (status or "").lower()
    if "hospital" in s:
        return "persona_hospitalizada"
    if "vida" in s or "encontr" in s or "salvo" in s or "fallec" in s:
        return "persona_localizada"
    return "persona_desaparecida"


class SosVenezuelaConnector(HttpListConnector):
    source = SourceInfo(
        id=SOS_SOURCE_ID,
        name="SOS Venezuela",
        kind="persona_desaparecida",
        description="Reporte y consulta de personas tras catástrofe (desaparecidos, con vida, hospitalizados, fallecidos).",
        url=SOS_BASE,
        access="open",
        enabled=True,
    )
    list_url = SOS_BASE + "/api/people"
    items_key = "results"
    page_param = "offset"
    page_size_param = "limit"
    page_size = 200

    def map_item(self, item):
        rid = str(item.get("id") or "")
        nombre = item.get("full_name") or "Persona"
        status = item.get("status")
        return IndexedRecord(
            id="%s:%s" % (SOS_SOURCE_ID, rid),
            record_type=_record_type(status),
            title=nombre,
            summary=item.get("description"),
            person_name=nombre,
            cedula=item.get("cedula"),
            age=item.get("age"),
            location_name=item.get("last_seen_at") or item.get("location"),
            city=item.get("locality"),
            country="VE",
            contact=item.get("reporter_contact"),
            status=status,
            source_id=SOS_SOURCE_ID,
            source_name="SOS Venezuela",
            source_url=SOS_BASE,
            source_record_id=rid,
            observed_at=item.get("last_seen_date"),
            updated_at=item.get("updated_at") or item.get("created_at"),
            tags=["persona"],
            raw=item,
        )


CONNECTOR = SosVenezuelaConnector()
