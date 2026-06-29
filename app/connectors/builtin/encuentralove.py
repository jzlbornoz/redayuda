"""Conector: EncuentraLove (https://encuentralove.com).

GET /api/v1/personas?pagina=N -> {total, pagina, porPagina, paginas, personas[]}.
JSON publico, sin auth, ~17.5k personas hospitalizadas (nombre, cedula, hospital,
estado de verificacion). Paginas de 500.
"""

from ...models import IndexedRecord, SourceInfo
from ..base import HttpListConnector

EL_SOURCE_ID = "encuentralove"
EL_BASE = "https://encuentralove.com"


def _age(value):
    try:
        n = int(str(value).strip())
        return n if 0 < n < 130 else None
    except (TypeError, ValueError):
        return None


class EncuentraLoveConnector(HttpListConnector):
    source = SourceInfo(
        id=EL_SOURCE_ID,
        name="EncuentraLove",
        kind="persona_hospitalizada",
        description="Personas localizadas en hospitales (nombre, cedula, centro).",
        url=EL_BASE,
        access="open",
        enabled=True,
    )
    list_url = EL_BASE + "/api/v1/personas"
    items_key = "personas"
    page_param = "pagina"
    page_start = 0
    page_step = 1
    page_size_param = "porPagina"
    page_size = 500

    def map_item(self, item):
        nombre = (item.get("nombre") or "").strip()
        cedula = (item.get("cedula") or "").strip() or None
        hospital = (item.get("hospital") or "").strip() or None
        estado = (item.get("estado") or "").strip() or None
        if not nombre and not cedula:
            return None

        rid = cedula or "%s_%s" % (
            "".join(ch for ch in nombre.lower() if ch.isalnum())[:32] or "x",
            "".join(ch for ch in (hospital or "").lower() if ch.isalnum())[:16],
        )
        verified = None
        if estado:
            verified = "verificado" in estado.lower() and "no verificado" not in estado.lower()

        return IndexedRecord(
            id="%s:%s" % (EL_SOURCE_ID, rid),
            record_type="persona_hospitalizada",
            title=nombre or "Persona",
            person_name=nombre or None,
            cedula=cedula,
            age=_age(item.get("edad")),
            organization=hospital,
            location_name=hospital,
            status=estado,
            verified=verified,
            country="VE",
            source_id=EL_SOURCE_ID,
            source_name="EncuentraLove",
            source_url=EL_BASE,
            source_record_id=cedula,
            tags=["persona", "hospital"],
            raw=item,
        )


CONNECTOR = EncuentraLoveConnector()
