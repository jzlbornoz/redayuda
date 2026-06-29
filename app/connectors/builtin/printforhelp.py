"""Conector: PrintForHelp (https://api.printforhelp.org).

GET /api/v1/collection-centers -> array de centros de acopio (incluye diaspora),
con necesidades y geolocalizacion. Publico, sin auth. (FastAPI.)
"""

from ...client import HttpClient
from ...models import IndexedRecord, SourceInfo
from ..base import Connector, stamp_and_upsert

PF_SOURCE_ID = "printforhelp"
PF_API = "https://api.printforhelp.org/api/v1"
PF_BASE = "https://printforhelp.org"


class PrintForHelpConnector(Connector):
    source = SourceInfo(
        id=PF_SOURCE_ID,
        name="PrintForHelp",
        kind="centro_acopio",
        description="Centros de acopio (dentro y fuera de Venezuela) con sus necesidades.",
        url=PF_BASE,
        access="open",
        enabled=True,
    )

    async def sync(self, *, store, settings, source_limit=1000, max_pages=5, desde=None):
        store.upsert_source(self.source)
        data = await HttpClient(settings).get_json(PF_API + "/collection-centers")
        items = data if isinstance(data, list) else (data.get("data") if isinstance(data, dict) else []) or []
        imported = stamp_and_upsert(store, settings, PF_SOURCE_ID, [_map(x) for x in items])
        store.touch_source_sync(PF_SOURCE_ID)
        return imported, len(items), 1


def _map(x):
    rid = str(x.get("id") or "")
    nombre = x.get("name") or "Centro de acopio"
    return IndexedRecord(
        id="%s:%s" % (PF_SOURCE_ID, rid),
        record_type="centro_acopio",
        title=nombre,
        summary=x.get("description"),
        organization=nombre,
        location_name=x.get("address"),
        city=x.get("city"),
        country=x.get("country") or "VE",
        contact=x.get("contact"),
        verified=bool(x.get("verified")),
        source_id=PF_SOURCE_ID,
        source_name="PrintForHelp",
        source_url=x.get("location_url") or PF_BASE,
        source_record_id=rid,
        tags=["centro_acopio", "acopio"],
        raw=x,
    )


CONNECTOR = PrintForHelpConnector()
