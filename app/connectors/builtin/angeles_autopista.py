"""Conector: Ángeles de la Autopista (https://angelesdelaautopista.com).

GET /api/datos.json -> doc con centros[] (acopio) y sismos[] (no se indexan).
Lee el canal de Telegram con IA. Requiere User-Agent de navegador (Cloudflare).
"""

import hashlib

from ...client import HttpClient
from ...models import IndexedRecord, SourceInfo
from ..base import Connector

AA_SOURCE_ID = "angeles_autopista"
AA_URL = "https://angelesdelaautopista.com/api/datos.json"
AA_BASE = "https://angelesdelaautopista.com"
_UA = {"User-Agent": "Mozilla/5.0 (RedHumanitariaDeDatos/1.0; +https://git.eriktaveras.com)"}


class AngelesAutopistaConnector(Connector):
    source = SourceInfo(
        id=AA_SOURCE_ID,
        name="Ángeles de la Autopista",
        kind="centro_acopio",
        description="Centros de acopio extraídos en vivo del canal oficial de emergencias (Telegram).",
        url=AA_BASE,
        access="open",
        enabled=True,
    )

    async def sync(self, *, store, settings, source_limit=1000, max_pages=5, desde=None):
        store.upsert_source(self.source)
        data = await HttpClient(settings).get_json(AA_URL, headers=_UA)
        centros = (data.get("centros") if isinstance(data, dict) else None) or []
        records = []
        for item in centros:
            record = _map(item)
            record.origin_node = settings.node_id
            record.origin_source = AA_SOURCE_ID
            records.append(record)
        imported = store.upsert_records(records)
        store.touch_source_sync(AA_SOURCE_ID)
        return imported, len(centros), 1


def _map(item):
    nombre = item.get("nombre") or "Centro de acopio"
    ubicacion = item.get("ubicacion")
    seed = "%s|%s" % (nombre, ubicacion or "")
    rid = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:24]
    return IndexedRecord(
        id="%s:%s" % (AA_SOURCE_ID, rid),
        record_type="centro_acopio",
        title=nombre,
        summary=item.get("necesidades"),
        organization=nombre,
        location_name=ubicacion,
        country="VE",
        status=item.get("estado"),
        source_id=AA_SOURCE_ID,
        source_name="Ángeles de la Autopista",
        source_url=item.get("link") or AA_BASE,
        source_record_id=rid,
        updated_at=item.get("tg_fecha"),
        tags=["centro_acopio", "telegram"],
        raw=item,
    )


CONNECTOR = AngelesAutopistaConnector()
