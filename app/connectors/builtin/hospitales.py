import hashlib
from datetime import datetime, timezone

from ...client import HospitalesClient
from ...models import IndexedRecord, SourceInfo
from ..base import HttpKeyConnector


HOSPITALES_SOURCE_ID = "hospitales_venezuela"


class HospitalesConnector(HttpKeyConnector):
    source = SourceInfo(
        id=HOSPITALES_SOURCE_ID,
        name="Hospitales en Venezuela",
        kind="personas_atendidas",
        description=(
            "Padron de personas registradas como ingresadas o atendidas "
            "en centros de salud. No indica condicion medica."
        ),
        url="https://hospitalesenvenezuela.com",
        access="api_key",
        enabled=True,
    )

    async def fetch_page(self, settings, limit, offset, desde):
        client = HospitalesClient(settings)
        payload = await client.export_pacientes(
            limit=limit, offset=offset, desde=desde
        )
        return payload.pacientes, payload.count, payload.total

    def map_item(self, paciente):
        return paciente_to_record(paciente)


def paciente_to_record(paciente):
    source_record_id = _source_record_id(paciente)
    title = paciente.nombre or "Persona registrada en centro de salud"
    location = " - ".join(part for part in [paciente.hospital, paciente.ciudad] if part)

    return IndexedRecord(
        id="%s:%s" % (HOSPITALES_SOURCE_ID, source_record_id),
        record_type="persona_hospitalizada",
        title=title,
        summary=location or paciente.detalle,
        person_name=paciente.nombre,
        cedula=paciente.cedula,
        age=paciente.edad,
        organization=paciente.hospital,
        location_name=paciente.hospital,
        city=paciente.ciudad,
        country="VE",
        contact=paciente.contacto,
        status="registrada_en_centro_salud",
        verified=paciente.hospital_verificado,
        source_id=HOSPITALES_SOURCE_ID,
        source_name="Hospitales en Venezuela",
        source_url="https://hospitalesenvenezuela.com",
        source_record_id=source_record_id,
        observed_at=paciente.registrado,
        updated_at=paciente.registrado or datetime.now(timezone.utc),
        tags=[
            "persona",
            "hospital",
            "centro_salud",
            "localizada",
        ],
        raw=paciente.model_dump(mode="json"),
    )


def _source_record_id(paciente):
    stable = "|".join(
        str(part or "")
        for part in [
            paciente.cedula,
            paciente.nombre,
            paciente.edad,
            paciente.hospital,
            paciente.ciudad,
            paciente.registrado.isoformat() if paciente.registrado else "",
        ]
    )
    return hashlib.sha256(stable.encode("utf-8")).hexdigest()[:24]


CONNECTOR = HospitalesConnector()
