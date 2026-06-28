"""Conector: Data global La Guaira (http://62.146.225.76:9090).

GET /public/pacientes?page=&limit= -> {total, page, limit, results[]}. CORS *, sin auth.
HTTP sin TLS y datos sensibles -> consumir server-side. Todos son pacientes (hospitalizados).
"""

from ...models import IndexedRecord, SourceInfo
from ..base import HttpListConnector

DG_SOURCE_ID = "data_guaira"
DG_BASE = "http://62.146.225.76:9090"


class DataGuairaConnector(HttpListConnector):
    source = SourceInfo(
        id=DG_SOURCE_ID,
        name="Data Global La Guaira",
        kind="persona_hospitalizada",
        description="Pacientes registrados en hospitales (curado y verificado por humanos).",
        url=DG_BASE,
        access="open",
        enabled=True,
    )
    list_url = DG_BASE + "/public/pacientes"
    items_key = "results"
    page_param = "page"
    page_start = 1
    page_size_param = "limit"
    page_size = 200

    def map_item(self, item):
        rid = str(item.get("id") or "")
        nombre = item.get("nombre_completo") or "Paciente"
        hospital = item.get("hospital")
        return IndexedRecord(
            id="%s:%s" % (DG_SOURCE_ID, rid),
            record_type="persona_hospitalizada",
            title=nombre,
            summary=hospital,
            person_name=nombre,
            cedula=item.get("cedula"),
            age=item.get("edad"),
            organization=hospital,
            location_name=hospital,
            city=item.get("sector"),
            country="VE",
            status=item.get("estado"),
            source_id=DG_SOURCE_ID,
            source_name="Data Global La Guaira",
            source_url=DG_BASE,
            source_record_id=rid,
            tags=["persona", "hospital", "centro_salud"],
            raw=item,
        )


CONNECTOR = DataGuairaConnector()
