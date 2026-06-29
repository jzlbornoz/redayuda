"""Conector: TuIA 911 (https://tuia911.com), backend en Supabase.

GET /functions/v1/api/personas?offset=N&limit=100 -> {ok, pagination, data[]}.
JSON publico, sin auth. Personas con tipo (desaparecida/encontrada), foto y
ubicacion aproximada (municipio/referencia).
"""

from ...models import IndexedRecord, SourceInfo
from ..base import HttpListConnector

TU_SOURCE_ID = "tuia911"
TU_SITE = "https://tuia911.com"
TU_API = "https://gkpivfmnclcahppkrfzl.supabase.co/functions/v1/api/personas"

_TIPO_TO_TYPE = {
    "desaparecida": "persona_desaparecida",
    "desaparecido": "persona_desaparecida",
    "encontrada": "persona_localizada",
    "encontrado": "persona_localizada",
    "localizada": "persona_localizada",
}


def _age(value):
    try:
        n = int(value)
        return n if 0 < n < 130 else None
    except (TypeError, ValueError):
        return None


class TuIA911Connector(HttpListConnector):
    source = SourceInfo(
        id=TU_SOURCE_ID,
        name="TuIA 911",
        kind="persona_desaparecida",
        description="Reportes de personas desaparecidas y encontradas, con foto.",
        url=TU_SITE,
        access="open",
        enabled=True,
    )
    list_url = TU_API
    items_key = "data"
    page_param = "offset"
    page_size_param = "limit"
    page_size = 100
    page_start = 0

    def map_item(self, item):
        rid = item.get("id")
        nombre = (item.get("nombre") or "").strip()
        if not rid or not nombre:
            return None
        tipo = (item.get("tipo") or "").strip().lower()
        summary = (item.get("descripcion") or item.get("referencia") or "").strip() or None

        return IndexedRecord(
            id="%s:%s" % (TU_SOURCE_ID, rid),
            record_type=_TIPO_TO_TYPE.get(tipo, "persona_desaparecida"),
            title=nombre or "Persona",
            summary=summary,
            person_name=nombre or None,
            age=_age(item.get("edad")),
            location_name=(item.get("referencia") or "").strip() or None,
            city=(item.get("municipio") or "").strip() or None,
            status=(item.get("estado_registro") or "").strip() or None,
            country="VE",
            observed_at=item.get("created_at"),
            image_url=(item.get("foto_url") or "").strip() or None,
            source_id=TU_SOURCE_ID,
            source_name="TuIA 911",
            source_url=TU_SITE,
            source_record_id=str(rid),
            tags=["persona", tipo] if tipo else ["persona"],
            raw=item,
        )


CONNECTOR = TuIA911Connector()
