"""Conector: Venezuela Solidaria (https://venezuelasolidaria.com).

Directorio comunitario con API publica de lectura (CORS abierto, sin auth):
GET /api/v1/resources?limit=&offset= -> {items[], pagination{total,has_more,limit,offset,returned}}
Categorias: donaciones, paginas, emergencia, quedadas (jornadas de acopio).
"""

from datetime import datetime, timezone

from ...client import HttpClient
from ...models import IndexedRecord, SourceInfo
from ..base import Connector

VS_SOURCE_ID = "venezuela_solidaria"
VS_URL = "https://api.venezuelasolidaria.com/api/v1/resources"
VS_BASE = "https://www.venezuelasolidaria.com"
VS_PAGE = 200  # tope de paginacion del upstream

# category del upstream -> record_type del indice
_CATEGORY_TYPE = {
    "donaciones": "centro_donacion",
    "quedadas": "centro_acopio",
    "emergencia": "recurso",
    "paginas": "recurso",
}


class VenezuelaSolidariaConnector(Connector):
    source = SourceInfo(
        id=VS_SOURCE_ID,
        name="Venezuela Solidaria",
        kind="recurso",
        description=(
            "Directorio comunitario: recaudaciones, contactos de emergencia, "
            "paginas y jornadas de acopio verificadas."
        ),
        url=VS_BASE,
        access="open",
        enabled=True,
    )

    async def sync(self, *, store, settings, source_limit=1000, max_pages=5, desde=None):
        store.upsert_source(self.source)
        client = HttpClient(settings)

        imported = 0
        scanned = 0
        pages = 0
        offset = 0

        while pages < max_pages:
            data = await client.get_json(VS_URL, params={"limit": VS_PAGE, "offset": offset})
            items = data.get("items", []) if isinstance(data, dict) else []
            pagination = data.get("pagination", {}) if isinstance(data, dict) else {}
            pages += 1
            scanned += len(items)

            records = []
            for item in items:
                record = _resource_to_record(item)
                record.origin_node = settings.node_id
                record.origin_source = VS_SOURCE_ID
                records.append(record)
            imported += store.upsert_records(records)

            if not pagination.get("has_more"):
                break
            offset += VS_PAGE
            if offset >= source_limit:
                break

        store.touch_source_sync(VS_SOURCE_ID)
        return imported, scanned, pages


def _resource_to_record(item):
    rid = str(item.get("id") or "")
    category = (item.get("category") or "").lower()
    record_type = _CATEGORY_TYPE.get(category, "recurso")
    title = item.get("title") or "Recurso"
    tags = ["venezuela_solidaria"]
    if category:
        tags.append(category)

    return IndexedRecord(
        id="%s:%s" % (VS_SOURCE_ID, rid),
        record_type=record_type,
        title=title,
        summary=item.get("description"),
        organization=title,
        city=item.get("city"),
        country="VE",
        latitude=item.get("lat"),
        longitude=item.get("lng"),
        contact=item.get("phone"),
        verified=bool(item.get("verified")),
        source_id=VS_SOURCE_ID,
        source_name="Venezuela Solidaria",
        source_url=item.get("link") or item.get("url") or VS_BASE,
        source_record_id=rid,
        observed_at=_parse_dt(item.get("created_at")),
        updated_at=_parse_dt(item.get("updated_at")) or datetime.now(timezone.utc),
        tags=tags,
        image_url=item.get("image"),
        raw=item,
    )


def _parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


CONNECTOR = VenezuelaSolidariaConnector()
