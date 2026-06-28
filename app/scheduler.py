"""Ingesta recurrente: sincroniza periodicamente los conectores habilitados.

Mantiene el indice local fresco sin intervencion manual, para servir la API a
terceros desde la base de datos (rapido) en vez de golpear las fuentes en vivo.
Reusa el registro de conectores y el mismo camino de escritura (upsert_records).
Mismo patron que el loop de federacion.
"""

import asyncio
import logging

from . import connectors

logger = logging.getLogger(__name__)


async def sync_all_sources(store, settings):
    """Corre el sync de cada conector con fuente habilitada. Devuelve resultados.

    Un fallo en un conector (p.ej. falta su API key) no detiene a los demas.
    """
    connectors.load_builtin_connectors()
    results = []
    for connector in connectors.all_connectors():
        if not getattr(connector.source, "enabled", False):
            continue
        sid = connector.source_id
        try:
            imported, scanned, pages = await connector.sync(
                store=store,
                settings=settings,
                source_limit=settings.auto_sync_source_limit,
                max_pages=settings.auto_sync_max_pages,
            )
            logger.info(
                "auto-sync %s: imported=%s scanned=%s pages=%s",
                sid, imported, scanned, pages,
            )
            results.append(
                {"source_id": sid, "ok": True, "imported": imported, "scanned": scanned}
            )
        except Exception as exc:  # pragma: no cover - depende de red/credenciales
            logger.warning("auto-sync %s fallo: %s", sid, exc)
            results.append({"source_id": sid, "ok": False, "error": str(exc)})
    return results


async def sync_loop(store, settings):  # pragma: no cover - loop de fondo
    logger.info(
        "Auto-sync activo (intervalo %ss)", settings.auto_sync_interval_seconds
    )
    # Primera corrida poco despues del arranque (no bloquea el startup).
    await asyncio.sleep(5)
    while True:
        try:
            await sync_all_sources(store, settings)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Error en el loop de auto-sync")
        await asyncio.sleep(settings.auto_sync_interval_seconds)
