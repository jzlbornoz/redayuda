"""Conector: Refugios Venezuela / CentrosInsumosVzla (refugiosvzla.duckdns.org).

GET /api/centros -> {centros:[...]} (array único, sin paginación). CORS, sin auth.
Refugios y centros de acopio con necesidades/disponibilidad y geolocalización.
"""

from datetime import datetime, timezone

from ...client import HttpClient
from ...models import IndexedRecord, SourceInfo
from ..base import Connector

RV_SOURCE_ID = "refugios_vzla"
RV_BASE = "https://refugiosvzla.duckdns.org"


class RefugiosVzlaConnector(Connector):
    source = SourceInfo(
        id=RV_SOURCE_ID,
        name="Refugios Venezuela",
        kind="recurso",
        description="Refugios y centros de acopio: qué necesitan y qué tienen disponible.",
        url=RV_BASE,
        access="open",
        enabled=True,
    )

    async def sync(self, *, store, settings, source_limit=1000, max_pages=5, desde=None):
        store.upsert_source(self.source)
        data = await HttpClient(settings).get_json(RV_BASE + "/api/centros")
        items = (data.get("centros") if isinstance(data, dict) else data) or []
        records = []
        for item in items:
            record = _map(item)
            record.origin_node = settings.node_id
            record.origin_source = RV_SOURCE_ID
            records.append(record)
        imported = store.upsert_records(records)
        store.touch_source_sync(RV_SOURCE_ID)
        return imported, len(items), 1


def _map(item):
    rid = str(item.get("id") or "")
    nombre = item.get("nombre") or "Centro"
    tipo = (item.get("tipo") or "").lower()
    record_type = "centro_acopio" if "acopio" in tipo else "recurso"
    necesidades = item.get("necesidades")
    if isinstance(necesidades, list):
        necesidades = ", ".join(str(n) for n in necesidades)
    updated = item.get("actualizado")
    if isinstance(updated, (int, float)):
        updated = datetime.fromtimestamp(updated / 1000, tz=timezone.utc)
    return IndexedRecord(
        id="%s:%s" % (RV_SOURCE_ID, rid),
        record_type=record_type,
        title=nombre,
        summary=necesidades or item.get("nota") or None,
        organization=nombre,
        location_name=item.get("zona"),
        city=item.get("zona"),
        country="VE",
        latitude=item.get("lat"),
        longitude=item.get("lng"),
        contact=item.get("contacto") or None,
        status=item.get("estado"),
        verified=bool(item.get("verif")),
        source_id=RV_SOURCE_ID,
        source_name="Refugios Venezuela",
        source_url=RV_BASE,
        source_record_id=rid,
        updated_at=updated,
        tags=[tipo or "refugio", "logistica"],
        image_url=(item.get("fotos") or [None])[0] if isinstance(item.get("fotos"), list) else None,
        raw=item,
    )


CONNECTOR = RefugiosVzlaConnector()
