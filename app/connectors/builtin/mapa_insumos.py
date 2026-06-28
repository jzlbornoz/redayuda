"""Conector: Mapa de insumos Venezuela (https://mapainsumosvzla.com).

GET /api/services?page= -> {services[], total, hasMore}. Página fija de 20.
Locales/puntos de insumos (logística). record_type = recurso.
"""

from ...models import IndexedRecord, SourceInfo
from ..base import HttpListConnector

MI_SOURCE_ID = "mapa_insumos"
MI_BASE = "https://mapainsumosvzla.com"


class MapaInsumosConnector(HttpListConnector):
    source = SourceInfo(
        id=MI_SOURCE_ID,
        name="Mapa de Insumos Venezuela",
        kind="recurso",
        description="Locales y puntos donde conseguir insumos (farmacias, gas, mercados, etc.).",
        url=MI_BASE,
        access="open",
        enabled=True,
    )
    list_url = MI_BASE + "/api/services"
    items_key = "services"
    has_more_key = "hasMore"
    page_param = "page"
    page_start = 1
    page_size = 20

    def map_item(self, item):
        rid = str(item.get("id") or "")
        name = item.get("name") or "Punto de insumos"
        notes = item.get("notes")
        organization = None
        if notes and notes.lower().startswith("operador"):
            organization = notes.split(":", 1)[-1].strip()
        location_bits = [b for b in [item.get("city"), item.get("state")] if b]
        tags = ["insumos", "logistica"]
        if item.get("category"):
            tags.append(str(item.get("category")))
        return IndexedRecord(
            id="%s:%s" % (MI_SOURCE_ID, rid),
            record_type="recurso",
            title=name,
            summary=notes,
            organization=organization,
            location_name=" - ".join([name] + location_bits) if location_bits else name,
            city=item.get("city"),
            state=item.get("state"),
            country="VE",
            latitude=item.get("lat"),
            longitude=item.get("lng"),
            contact=item.get("phone"),
            source_id=MI_SOURCE_ID,
            source_name="Mapa de Insumos Venezuela",
            source_url=MI_BASE,
            source_record_id=rid,
            tags=tags,
            raw=item,
        )


CONNECTOR = MapaInsumosConnector()
