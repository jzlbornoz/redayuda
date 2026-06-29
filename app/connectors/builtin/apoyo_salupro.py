"""Conector: Apoyo SaluPro (https://apoyo.salu.pro).

GET /api/export?dataset=personas-desaparecidas&format=json -> array completo (streaming).
Requiere token por aliado (revocable) en cabecera X-API-Key. Por seguridad el token NO
se hardcodea: se lee de APOYO_SALUPRO_TOKEN; si falta, el sync falla (aislado por el scheduler).
"""

import os

from ...client import HttpClient
from ...models import IndexedRecord, SourceInfo
from ..base import Connector, stamp_and_upsert

AS_SOURCE_ID = "apoyo_salupro"
AS_BASE = "https://apoyo.salu.pro"
AS_EXPORT = AS_BASE + "/api/export"


def _record_type(status):
    s = (status or "").lower()
    if "encontr" in s or "fallec" in s or "avist" in s:
        return "persona_localizada"
    return "persona_desaparecida"


class ApoyoSaluProConnector(Connector):
    auto_sync = False  # pesada: solo sync a demanda
    source = SourceInfo(
        id=AS_SOURCE_ID,
        name="Apoyo SaluPro",
        kind="persona_desaparecida",
        description="Registro centralizado de personas desaparecidas (export de aliado).",
        url=AS_BASE,
        access="api_key",
        enabled=True,
    )

    async def sync(self, *, store, settings, source_limit=1000, max_pages=5, desde=None):
        token = os.getenv("APOYO_SALUPRO_TOKEN")
        if not token:
            raise RuntimeError("Falta APOYO_SALUPRO_TOKEN para Apoyo SaluPro.")
        store.upsert_source(self.source)
        rows = await HttpClient(settings).get_json(
            AS_EXPORT + "?dataset=personas-desaparecidas&format=json",
            headers={"X-API-Key": token},
        )
        rows = rows if isinstance(rows, list) else []
        imported = stamp_and_upsert(
            store, settings, AS_SOURCE_ID, [_map(r) for r in rows]
        )
        store.touch_source_sync(AS_SOURCE_ID)
        return imported, len(rows), 1


def _map(r):
    ficha = r.get("ficha_url") or ""
    rid = ficha.rstrip("/").rsplit("/", 1)[-1] if ficha else ""
    if not rid:
        import hashlib
        rid = hashlib.sha256(
            ("%s|%s|%s" % (r.get("nombre"), r.get("cedula"), r.get("ciudad"))).encode()
        ).hexdigest()[:24]
    nombre = r.get("nombre") or "Persona"
    ubic = " - ".join(p for p in [r.get("ciudad"), r.get("zona")] if p) or None
    return IndexedRecord(
        id="%s:%s" % (AS_SOURCE_ID, rid),
        record_type=_record_type(r.get("status")),
        title=nombre,
        summary=r.get("descripcion") or None,
        person_name=nombre,
        cedula=r.get("cedula") or None,
        age=r.get("edad") or None,
        city=r.get("ciudad") or None,
        location_name=ubic,
        country="VE",
        latitude=r.get("lat") or None,
        longitude=r.get("lng") or None,
        contact=r.get("telefono") or r.get("contacto") or None,
        status=r.get("status"),
        verified=bool(r.get("verificado")),
        source_id=AS_SOURCE_ID,
        source_name="Apoyo SaluPro",
        source_url=ficha or AS_BASE,
        source_record_id=rid,
        observed_at=r.get("ultima_vez") or None,
        updated_at=r.get("created_at"),
        tags=["persona", "desaparecida"],
        raw=r,
    )


CONNECTOR = ApoyoSaluProConnector()
