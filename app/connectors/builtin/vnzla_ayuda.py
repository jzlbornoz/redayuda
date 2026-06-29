"""Conector: Vnzla Ayuda (https://vnzla-ayuda.vercel.app).

Supabase PostgREST con clave publishable (publica por diseno, RLS protege la data).
Los datos YA vienen casi en nuestro esquema:
  GET /rest/v1/survivors_public  -> personas (source_record_id, person_name, age, city,
      state, country, location_name, status, verified, observed_at, updated_at, tags)
  GET /rest/v1/centers_public    -> centros (title, type, status, location_name, city,
      state, country, latitude, longitude, contact, capacity, tags)
Paginacion PostgREST: ?limit=&offset= (max 1000). Headers: apikey + Authorization + Accept-Profile.
"""

import os

from ...client import HttpClient
from ...models import IndexedRecord, SourceInfo
from ..base import Connector, stamp_and_upsert

VA2_SOURCE_ID = "vnzla_ayuda"
VA2_REST = "https://kqtilzssuynblfkuqxyx.supabase.co/rest/v1"
VA2_BASE = "https://vnzla-ayuda.vercel.app"
# Clave publishable (anon) compartida publicamente por la fuente para lectura.
VA2_KEY = os.getenv("VNZLA_AYUDA_KEY", "sb_publishable_udPVuneAoBbPorp0N0nd-w_pLgp36S8")
VA2_PAGE = 1000


def _headers():
    return {"apikey": VA2_KEY, "Authorization": "Bearer " + VA2_KEY, "Accept-Profile": "public"}


def _person_type(status):
    s = (status or "").lower()
    if "encontr" in s or "reunid" in s or "salvo" in s or "vida" in s:
        return "persona_localizada"
    if "hospital" in s:
        return "persona_hospitalizada"
    return "persona_desaparecida"


_CENTER_TYPE = {"albergue": "recurso", "refugio": "recurso",
                "acopio": "centro_acopio", "distribucion": "centro_acopio",
                "donacion": "centro_donacion"}


class VnzlaAyudaConnector(Connector):
    source = SourceInfo(
        id=VA2_SOURCE_ID,
        name="Vnzla Ayuda",
        kind="recurso",
        description="Sobrevivientes y centros de acopio verificados (datos en esquema comun).",
        url=VA2_BASE,
        access="api_key",
        enabled=True,
    )

    async def sync(self, *, store, settings, source_limit=1000, max_pages=5, desde=None):
        store.upsert_source(self.source)
        client = HttpClient(settings)
        imported = scanned = pages = 0

        for table, mapper in (("survivors_public", _map_person), ("centers_public", _map_center)):
            offset = 0
            while pages < 2000:
                rows = await client.get_json(
                    "%s/%s?limit=%d&offset=%d" % (VA2_REST, table, VA2_PAGE, offset),
                    headers=_headers(),
                )
                rows = rows if isinstance(rows, list) else []
                pages += 1
                scanned += len(rows)
                imported += stamp_and_upsert(
                    store, settings, VA2_SOURCE_ID, [mapper(r) for r in rows]
                )
                if len(rows) < VA2_PAGE:
                    break
                offset += VA2_PAGE

        store.touch_source_sync(VA2_SOURCE_ID)
        return imported, scanned, pages


def _map_person(r):
    rid = str(r.get("source_record_id") or "")
    name = r.get("person_name") or "Persona"
    return IndexedRecord(
        id="%s:p:%s" % (VA2_SOURCE_ID, rid),
        record_type=_person_type(r.get("status")),
        title=name,
        person_name=r.get("person_name"),
        age=r.get("age"),
        city=r.get("city") or None,
        state=r.get("state") or None,
        country=r.get("country") or "VE",
        location_name=r.get("location_name"),
        status=r.get("status"),
        verified=bool(r.get("verified")),
        source_id=VA2_SOURCE_ID,
        source_name="Vnzla Ayuda",
        source_url=VA2_BASE,
        source_record_id="p:" + rid,
        observed_at=r.get("observed_at"),
        updated_at=r.get("updated_at"),
        tags=(r.get("tags") or []) + ["persona"],
        raw=r,
    )


def _map_center(r):
    rid = str(r.get("source_record_id") or "")
    title = r.get("title") or "Centro"
    tipo = (r.get("type") or "").lower()
    return IndexedRecord(
        id="%s:c:%s" % (VA2_SOURCE_ID, rid),
        record_type=_CENTER_TYPE.get(tipo, "recurso"),
        title=title,
        organization=title,
        location_name=r.get("location_name"),
        city=r.get("city") or None,
        state=r.get("state") or None,
        country=r.get("country") or "VE",
        latitude=r.get("latitude"),
        longitude=r.get("longitude"),
        contact=r.get("contact"),
        status=r.get("status"),
        source_id=VA2_SOURCE_ID,
        source_name="Vnzla Ayuda",
        source_url=VA2_BASE,
        source_record_id="c:" + rid,
        updated_at=r.get("verified_at"),
        tags=(r.get("tags") or []) + ["centro", tipo or "recurso"],
        raw=r,
    )


CONNECTOR = VnzlaAyudaConnector()
