"""Logica del formulario self-service de registro de APIs.

Recibe propuestas de colaboradores externos (su endpoint + documentacion +
mapeo a IndexedRecord), las valida de forma segura (anti-SSRF, anti-spam,
rate limit) y las deja en estado `pending` para revision de un admin. Una
propuesta NUNCA escribe registros ni activa un conector por si sola.
"""

import ipaddress
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
