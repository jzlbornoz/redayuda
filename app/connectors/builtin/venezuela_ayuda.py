"""Conector: Venezuela Ayuda (https://venezuela-ayuda-drab.vercel.app).

Directorio curado (autor "Alonzo") publicado como un unico JSON con CORS abierto:
GET /data.json -> objeto con categorias anidadas (refugios, hospitales, lineas de
emergencia, canales de donacion). No trae personas. Este conector aplana esas
categorias en IndexedRecord individuales.
"""

import hashlib
from datetime import datetime, timezone

from ...client import HttpClient
from ...models import IndexedRecord, SourceInfo
from ..base import Connector

VA_SOURCE_ID = "venezuela_ayuda"
VA_DATA_URL = "https://venezuela-ayuda-drab.vercel.app/data.json"
VA_BASE_URL = "https://venezuela-ayuda-drab.vercel.app"


class VenezuelaAyudaConnector(Connector):
    source = SourceInfo(
        id=VA_SOURCE_ID,
        name="Venezuela Ayuda",
        kind="recurso",
        description=(
            "Directorio curado de refugios, hospitales, lineas de emergencia y "
            "canales de donacion verificados."
        ),
        url=VA_BASE_URL,
        access="open",
        enabled=True,
    )

    async def sync(self, *, store, settings, source_limit=1000, max_pages=1, desde=None):
        store.upsert_source(self.source)
        data = await HttpClient(settings).get_json(VA_DATA_URL)
        records = list(_records_from_data(data or {}, settings.node_id))
        imported = store.upsert_records(records)
        store.touch_source_sync(VA_SOURCE_ID)
        # (imported, scanned, pages): un solo documento = 1 "pagina".
        return imported, len(records), 1


def _record(node_id, record_type, title, *, tags, summary=None, organization=None,
            city=None, location_name=None, contact=None, source_url=None):
    seed = "%s|%s|%s|%s" % (record_type, title, source_url or "", contact or "")
    rid = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:24]
    return IndexedRecord(
        id="%s:%s" % (VA_SOURCE_ID, rid),
        record_type=record_type,
        title=title,
        summary=summary,
        organization=organization,
        location_name=location_name,
        city=city,
        country="VE",
        contact=contact,
        source_id=VA_SOURCE_ID,
        source_name="Venezuela Ayuda",
        source_url=source_url or VA_BASE_URL,
        source_record_id=rid,
        updated_at=datetime.now(timezone.utc),
        tags=tags,
        origin_node=node_id,
        origin_source=VA_SOURCE_ID,
    )


def _records_from_data(data, node_id):
    # Refugios oficiales (Caracas) -> recurso (albergue)
    refugios = (data.get("refugios") or {}).get("caracas_alcaldia_oficial") or []
    for item in refugios:
        sede = item.get("sede")
        if not sede:
            continue
        yield _record(
            node_id, "recurso", sede,
            tags=["refugio", "albergue"],
            organization=sede,
            location_name=item.get("parroquia"),
            city="Caracas",
            summary="Refugio - %s" % item.get("parroquia", "Caracas"),
        )

    # Hospitales / clinicas (arrays de nombres) -> recurso (centro de salud)
    hospitales = data.get("hospitales") or {}
    for nombre in (hospitales.get("publicos") or []):
        yield _record(
            node_id, "recurso", str(nombre),
            tags=["hospital", "centro_salud", "publico"], organization=str(nombre),
        )
    for nombre in (hospitales.get("clinicas") or []):
        yield _record(
            node_id, "recurso", str(nombre),
            tags=["clinica", "centro_salud"], organization=str(nombre),
        )

    # Canales de donacion (internacionales y en Venezuela) -> centro_donacion
    for item in (data.get("donar") or []):
        nombre = item.get("nombre")
        if not nombre:
            continue
        yield _record(
            node_id, "centro_donacion", nombre,
            tags=["donacion"], organization=nombre,
            summary=item.get("enfoque"), source_url=item.get("url"),
        )
    for item in ((data.get("donar_en_venezuela") or {}).get("organizaciones") or []):
        nombre = item.get("nombre")
        if not nombre:
            continue
        recibe = item.get("recibe")
        resumen = item.get("tipo")
        if recibe:
            resumen = "%s · recibe: %s" % (resumen or "", ", ".join(recibe))
        yield _record(
            node_id, "centro_donacion", nombre,
            tags=["donacion", "venezuela"], organization=nombre,
            summary=resumen or item.get("acopio"), source_url=item.get("url"),
        )

    # Lineas de emergencia -> recurso (telefono)
    telefonos = data.get("telefonos") or {}
    for group in telefonos.values():
        if not isinstance(group, list):
            continue
        for item in group:
            titulo = item.get("linea") or item.get("entidad") or item.get("operadora")
            numero = item.get("numero")
            if not titulo or not numero:
                continue
            yield _record(
                node_id, "recurso", str(titulo),
                tags=["linea_emergencia", "telefono"], contact=str(numero),
                summary="Telefono: %s" % numero,
            )


CONNECTOR = VenezuelaAyudaConnector()
