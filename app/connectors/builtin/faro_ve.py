"""Conector: Faro VE (https://faro-ve.com).

Personas desaparecidas reportadas en la red Person Finder, con ubicacion
aproximada (lat/lng). API publica JSON con CORS abierto, sin auth.
Endpoint: GET /api/persons?limit=N  ->  {ok, count, persons[]}
(no soporta offset; devuelve hasta `limit` en una sola pagina).
"""

from ...client import HttpClient
from ...models import IndexedRecord, SourceInfo
from ..base import HttpKeyConnector

FARO_SOURCE_ID = "faro_ve"
FARO_PERSONS_URL = "https://faro-ve.com/api/persons"


class FaroVeConnector(HttpKeyConnector):
    source = SourceInfo(
        id=FARO_SOURCE_ID,
        name="Faro VE",
        kind="persona_desaparecida",
        description=(
            "Personas desaparecidas reportadas en Faro VE (red Person Finder), "
            "con ubicacion aproximada."
        ),
        url="https://faro-ve.com",
        access="open",
        enabled=True,
    )

    async def fetch_page(self, settings, limit, offset, desde):
        # /api/persons ignora offset y entrega hasta `limit` en una sola pagina;
        # devolver total = count hace que el bucle base corte tras la primera.
        data = await HttpClient(settings).get_json(
            FARO_PERSONS_URL, params={"limit": limit}
        )
        persons = data.get("persons", []) if isinstance(data, dict) else []
        count = len(persons)
        return persons, count, count

    def map_item(self, person):
        return faro_person_to_record(person)


def faro_person_to_record(person):
    pid = str(person.get("id") or person.get("pfif_id") or "")
    full_name = (
        person.get("full_name")
        or " ".join(
            part
            for part in [person.get("given_name"), person.get("family_name")]
            if part
        ).strip()
        or "Persona desaparecida"
    )

    raw_status = (person.get("status") or "").lower()
    status = "desaparecida" if raw_status == "missing" else (raw_status or None)

    tags = ["persona", "desaparecida"]
    if person.get("is_minor"):
        tags.append("menor")
    if person.get("medical_urgent"):
        tags.append("urgencia_medica")

    return IndexedRecord(
        id="%s:%s" % (FARO_SOURCE_ID, pid),
        record_type="persona_desaparecida",
        title=full_name,
        summary=person.get("description") or person.get("last_known_location_text"),
        person_name=full_name,
        age=person.get("age"),
        location_name=person.get("last_known_location_text")
        or person.get("home_neighborhood"),
        city=person.get("home_city"),
        country="VE",
        latitude=person.get("lat"),
        longitude=person.get("lng"),
        status=status,
        source_id=FARO_SOURCE_ID,
        source_name="Faro VE",
        source_url=person.get("source_url") or "https://faro-ve.com",
        source_record_id=pid,
        observed_at=person.get("last_seen_at"),
        updated_at=person.get("last_seen_at") or person.get("created_at"),
        tags=tags,
        image_url=person.get("photo_url"),
        raw=person,
    )


CONNECTOR = FaroVeConnector()
