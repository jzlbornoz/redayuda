"""Conector: SOS Venezuela – Central de Ayuda Verificada (ve-emergency-map).

GET /api/v1/registry -> {status, count, data:[...]} : alertas/campañas/necesidades
verificadas por la comunidad (contraloría ciudadana). Salió en vivo (antes "en desarrollo").
"""

from ...client import HttpClient
from ...models import IndexedRecord, SourceInfo
from ..base import Connector, stamp_and_upsert

SC_SOURCE_ID = "sos_central"
SC_BASE = "https://ve-emergency-map.vercel.app"


class SosCentralConnector(Connector):
    source = SourceInfo(
        id=SC_SOURCE_ID,
        name="SOS Central de Ayuda Verificada",
        kind="recurso",
        description="Alertas y necesidades verificadas por contraloría ciudadana (anti-fraude).",
        url=SC_BASE,
        access="open",
        enabled=True,
    )

    async def sync(self, *, store, settings, source_limit=1000, max_pages=5, desde=None):
        store.upsert_source(self.source)
        data = await HttpClient(settings).get_json(SC_BASE + "/api/v1/registry")
        items = (data.get("data") if isinstance(data, dict) else data) or []
        imported = stamp_and_upsert(store, settings, SC_SOURCE_ID, [_map(x) for x in items])
        store.touch_source_sync(SC_SOURCE_ID)
        return imported, len(items), 1


def _map(x):
    rid = str(x.get("id") or "")
    return IndexedRecord(
        id="%s:%s" % (SC_SOURCE_ID, rid),
        record_type="recurso",
        title=x.get("title") or "Alerta",
        summary=x.get("description"),
        country="VE",
        source_id=SC_SOURCE_ID,
        source_name="SOS Central de Ayuda Verificada",
        source_url=x.get("source_url") or x.get("evidence_url") or SC_BASE,
        source_record_id=rid,
        tags=["alerta", "contraloria", "verificado"],
        raw=x,
    )


CONNECTOR = SosCentralConnector()
