"""Federacion nodo-a-nodo por PULL.

Un nodo sondea el feed incremental de sus peers (`GET /api/records/feed?since=`)
y los ingesta por el mismo camino de escritura (`upsert_records`). La procedencia
(`origin_node`) evita bucles: no reimportamos lo que nacio en este nodo y pedimos
al peer que excluya nuestro `node_id`.
"""

import asyncio
import logging

from .client import HttpClient
from .models import IndexedRecord

logger = logging.getLogger(__name__)


class PeerClient:
    def __init__(self, settings):
        self.settings = settings
        self._http = HttpClient(settings)

    async def fetch_feed(self, base_url, since, limit, exclude_node=None, api_key=None):
        url = base_url.rstrip("/") + "/api/records/feed"
        params = {"since": since, "limit": limit}
        if exclude_node:
            params["exclude_node"] = exclude_node
        headers = {}
        if api_key:
            headers["x-peer-key"] = api_key
        return await self._http.get_json(url, params=params, headers=headers)


async def pull_peer(store, peer, settings):
    """Sincroniza un peer desde su cursor. Devuelve (imported, scanned, from, to)."""
    client = PeerClient(settings)
    from_cursor = int(peer.get("last_cursor", 0) or 0)
    since = from_cursor
    imported = 0
    scanned = 0

    while True:
        data = await client.fetch_feed(
            peer["base_url"],
            since,
            settings.federation_pull_limit,
            exclude_node=settings.node_id,
            api_key=peer.get("api_key"),
        )

        raw_records = data.get("records", [])
        if not raw_records:
            break

        fresh = []
        sources_seen = {}
        for raw in raw_records:
            scanned += 1
            try:
                record = IndexedRecord.model_validate(raw)
            except Exception:
                logger.warning("Registro federado invalido de peer %s", peer["id"])
                continue
            # No reimportar lo que nacio en este nodo (anti-bucle).
            if record.origin_node and record.origin_node == settings.node_id:
                continue
            sources_seen.setdefault(record.source_id, record.source_name)
            fresh.append(record)

        for source_id, source_name in sources_seen.items():
            store.ensure_source(source_id, source_name)
        if fresh:
            imported += store.upsert_records(fresh)

        since = int(data.get("next_cursor", since) or since)
        if not data.get("has_more"):
            break

    store.update_peer_cursor(peer["id"], since, "ok")
    return imported, scanned, from_cursor, since


async def pull_all_peers(store, settings):
    results = []
    for peer in store.peer_pull_targets():
        try:
            imported, scanned, frm, to = await pull_peer(store, peer, settings)
            results.append(
                {
                    "peer_id": peer["id"],
                    "ok": True,
                    "imported": imported,
                    "scanned": scanned,
                    "from_cursor": frm,
                    "to_cursor": to,
                    "message": "",
                }
            )
        except Exception as exc:  # pragma: no cover - errores de red/peer
            logger.exception("Fallo el pull del peer %s", peer["id"])
            store.update_peer_cursor(
                peer["id"], int(peer.get("last_cursor", 0) or 0), "error: %s" % exc
            )
            results.append(
                {
                    "peer_id": peer["id"],
                    "ok": False,
                    "imported": 0,
                    "scanned": 0,
                    "from_cursor": int(peer.get("last_cursor", 0) or 0),
                    "to_cursor": int(peer.get("last_cursor", 0) or 0),
                    "message": str(exc),
                }
            )
    return results


async def federation_loop(store, settings):  # pragma: no cover - loop de fondo
    logger.info(
        "Loop de federacion activo (intervalo %ss)",
        settings.federation_pull_interval_seconds,
    )
    while True:
        try:
            await asyncio.sleep(settings.federation_pull_interval_seconds)
            await pull_all_peers(store, settings)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Error en el loop de federacion")
