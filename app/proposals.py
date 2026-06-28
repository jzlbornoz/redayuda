"""Logica del formulario self-service de registro de APIs.

Recibe propuestas de colaboradores externos (su endpoint + documentacion +
mapeo a IndexedRecord), las valida de forma segura (anti-SSRF, anti-spam,
rate limit) y las deja en estado `pending` para revision de un admin. Una
propuesta NUNCA escribe registros ni activa un conector por si sola.
"""

import ipaddress
import re
import socket
import time
from collections import deque
from urllib.parse import urlsplit

from .models import (
    ALLOWED_KINDS,
    ALLOWED_TARGET_FIELDS,
    ConnectorContract,
    ContractField,
    SourceInfo,
)
from .search import normalize_text

REQUIRED_TARGET_FIELDS = {"title"}

# Claves frecuentes donde vive el array de registros en respuestas JSON.
COMMON_LIST_KEYS = [
    "items", "results", "data", "services", "records", "people",
    "personas", "pacientes", "resources", "rows", "list",
]

# Sugerencias de mapeo por TOKEN (no subcadena, para evitar city->cedula,
# image->age, etc.). Un campo coincide si alguno de sus tokens (separados por
# no-alfanumericos) es igual o empieza por la pista.
MAPPING_HINTS = [
    (("nombre", "name", "fullname"), "person_name"),
    (("cedula", "documento", "dni"), "cedula"),
    (("edad", "age"), "age"),
    (("organizacion", "organiz", "hospital", "centro"), "organization"),
    (("ciudad", "city", "localidad", "locality"), "city"),
    (("estado", "state", "provincia"), "state"),
    (("lat", "latitud", "latitude"), "latitude"),
    (("lng", "lon", "long", "longitud", "longitude"), "longitude"),
    (("telefono", "phone", "contacto", "contact"), "contact"),
    (("status", "condicion", "estatus"), "status"),
    (("descripcion", "descrip", "summary", "resumen", "nota"), "summary"),
    (("titulo", "title"), "title"),
    (("url", "link", "enlace"), "source_url"),
]


def locate_list(payload, data_path=None):
    """Encuentra el array de registros dentro de un JSON heterogeneo."""
    node = payload
    if data_path:
        for part in str(data_path).split("."):
            if isinstance(node, dict):
                node = node.get(part)
            else:
                node = None
                break
        return node if isinstance(node, list) else None
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in COMMON_LIST_KEYS:
            value = payload.get(key)
            if isinstance(value, list):
                return value
        for value in payload.values():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                return value
    return None


def detect_fields(payload, data_path=None):
    """Devuelve (campos, registro_muestra, total) de una respuesta JSON."""
    items = locate_list(payload, data_path)
    if not items:
        return [], None, 0
    first = items[0] if isinstance(items[0], dict) else {}
    return list(first.keys()), first, len(items)


def _tokens(field):
    return [t for t in re.split(r"[^a-z0-9]+", str(field).lower()) if t]


def _field_matches(field, needles):
    toks = _tokens(field)
    return any(tok == n or tok.startswith(n) for tok in toks for n in needles)


def suggest_mapping(source_fields):
    """Sugiere {campo_origen: campo_esquema} a partir de los nombres detectados.

    Coincidencia por token (no subcadena) para evitar falsos positivos como
    'city'->'cedula' o 'image'->'age'. Cada campo destino se asigna una sola vez.
    """
    mapping = {}
    used = set()
    for field in source_fields:
        for needles, target in MAPPING_HINTS:
            if target in used or target not in ALLOWED_TARGET_FIELDS:
                continue
            if _field_matches(field, needles):
                mapping[field] = target
                used.add(target)
                break
    return mapping


def validate_public_url(url):
    """Valida que la URL sea http(s) hacia un host publico (anti-SSRF).

    Lanza ValueError si el esquema no es http/https, falta host, o el host
    resuelve a una IP privada/loopback/reservada. Devuelve la URL normalizada.
    """
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"}:
        raise ValueError("La URL debe usar http o https.")
    if not parts.hostname:
        raise ValueError("La URL no tiene host.")

    try:
        infos = socket.getaddrinfo(parts.hostname, None)
    except socket.gaierror as exc:
        raise ValueError("No se pudo resolver el host de la URL.") from exc

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise ValueError("La URL apunta a una direccion no publica.")

    return url


def slugify_source_id(name):
    base = normalize_text(name).replace(" ", "_").strip("_")
    base = base[:48] or "fuente"
    suffix = "%08x" % (abs(hash(name)) % (16 ** 8))
    return "%s_%s" % (base, suffix)


class RateLimiter:
    """Limitador en memoria por IP (ventana deslizante)."""

    def __init__(self, max_per_window, window_seconds=3600):
        self.max_per_window = max_per_window
        self.window_seconds = window_seconds
        self._hits = {}

    def check(self, ip, now=None):
        now = time.time() if now is None else now
        bucket = self._hits.setdefault(ip, deque())
        while bucket and now - bucket[0] > self.window_seconds:
            bucket.popleft()
        if len(bucket) >= self.max_per_window:
            return False
        bucket.append(now)
        return True


def proposal_to_connector_spec(proposal, source_id):
    return {
        "source_id": source_id,
        "endpoint_url": proposal.endpoint_url,
        "http_method": proposal.http_method,
        "auth_type": proposal.auth_type,
        "auth_header": proposal.auth_header,
        "pagination": proposal.pagination.model_dump(),
        "data_path": proposal.data_path,
        "field_mapping": proposal.field_mapping,
    }


def proposal_to_source(proposal, source_id):
    """SourceInfo desactivada para una propuesta aprobada (sin sync aun)."""
    return SourceInfo(
        id=source_id,
        name=proposal.source_name,
        kind=proposal.kind,
        description=proposal.description or "Fuente propuesta por un colaborador.",
        url=proposal.endpoint_url,
        access=proposal.auth_type,
        enabled=False,
    )


def build_contract():
    return ConnectorContract(
        record_fields=[
            ContractField(name=name, required=name in REQUIRED_TARGET_FIELDS)
            for name in ALLOWED_TARGET_FIELDS
        ],
        allowed_kinds=ALLOWED_KINDS,
        auth_types=["none", "api_key", "bearer"],
        pagination_styles=["none", "offset", "page", "cursor"],
        example_request={
            "source_name": "App Desaparecidos Demo",
            "kind": "persona_desaparecida",
            "description": "Reportes ciudadanos de personas desaparecidas.",
            "endpoint_url": "https://ejemplo.org/api/registros",
            "http_method": "GET",
            "auth_type": "api_key",
            "auth_header": "x-api-key",
            "pagination": {
                "style": "offset",
                "limit_param": "limit",
                "offset_param": "offset",
                "page_size": 100,
            },
            "data_path": "data",
            "field_mapping": {
                "person_name": "nombre_completo",
                "cedula": "documento",
                "city": "ciudad",
                "title": "nombre_completo",
            },
            "contact_email": "equipo@ejemplo.org",
        },
        example_record={
            "id": "app_demo:123",
            "record_type": "persona_desaparecida",
            "title": "Maria Perez",
            "person_name": "Maria Perez",
            "city": "Caracas",
            "source_id": "app_demo",
            "source_name": "App Desaparecidos Demo",
        },
    )
