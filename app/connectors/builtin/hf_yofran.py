"""Conector: Venezuela (HuggingFace Space Yofran23).

API Gradio de 2 pasos (prefijo OBLIGATORIO /gradio_api):
  1) POST /gradio_api/call/api_personas  body {"data":[]}  -> {event_id}
  2) GET  /gradio_api/call/api_personas/{event_id}  -> SSE; el evento "complete"
     trae data: [ {status, total, data:[ ...registros... ]} ]
Trae TODO en una llamada (~14k pacientes hospitalizados). Sin auth, CORS abierto.
"""

import json

import httpx

from ...models import IndexedRecord, SourceInfo
from ..base import Connector

HF_SOURCE_ID = "hf_yofran"
HF_BASE = "https://yofran23-venezuela.hf.space"
HF_CALL = HF_BASE + "/gradio_api/call/api_personas"


class HfYofranConnector(Connector):
    source = SourceInfo(
        id=HF_SOURCE_ID,
        name="Registro Hospitales (Yofran)",
        kind="persona_hospitalizada",
        description="Registros médicos y reportes civiles de pacientes en hospitales.",
        url=HF_BASE,
        access="open",
        enabled=True,
    )

    async def sync(self, *, store, settings, source_limit=1000, max_pages=5, desde=None):
        store.upsert_source(self.source)
        timeout = max(60.0, settings.request_timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            start = await client.post(HF_CALL, json={"data": []})
            start.raise_for_status()
            event_id = start.json().get("event_id")
            if not event_id:
                raise ValueError("HF: sin event_id")
            stream = await client.get("%s/%s" % (HF_CALL, event_id))
            stream.raise_for_status()
            items = _extract_records(stream.text)

        records = []
        node_id = settings.node_id
        for item in items:
            record = _map(item)
            record.origin_node = node_id
            record.origin_source = HF_SOURCE_ID
            records.append(record)
        imported = store.upsert_records(records)
        store.touch_source_sync(HF_SOURCE_ID)
        return imported, len(items), 1


def _extract_records(sse_text):
    """Extrae el array de registros de la respuesta SSE de Gradio."""
    for line in sse_text.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        payload = line[len("data:"):].strip()
        try:
            obj = json.loads(payload)
        except ValueError:
            continue
        # Gradio envuelve la salida en una lista: [ {status,total,data:[...]} ]
        if isinstance(obj, list) and obj and isinstance(obj[0], dict) and "data" in obj[0]:
            return obj[0]["data"] or []
        if isinstance(obj, dict) and isinstance(obj.get("data"), list):
            return obj["data"]
    return []


def _map(item):
    rid = str(item.get("id") or "")
    nombre = item.get("nombre") or "Paciente"
    hospital = item.get("hospital")
    notas = item.get("notas") or ""
    if not hospital and notas.lower().startswith("hospital"):
        hospital = notas.split(":", 1)[-1].strip()
    return IndexedRecord(
        id="%s:%s" % (HF_SOURCE_ID, rid),
        record_type="persona_hospitalizada",
        title=nombre,
        summary=item.get("descripcion") or notas or None,
        person_name=nombre,
        cedula=item.get("cedula_norm") or item.get("cedula"),
        age=item.get("edad"),
        organization=hospital,
        location_name=hospital,
        country="VE",
        status=item.get("condicion"),
        source_id=HF_SOURCE_ID,
        source_name="Registro Hospitales (Yofran)",
        source_url=HF_BASE,
        source_record_id=rid,
        updated_at=item.get("fecha_update"),
        tags=["persona", "hospital", "centro_salud"],
        raw=item,
    )


CONNECTOR = HfYofranConnector()
