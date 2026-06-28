"""Shim de compatibilidad sobre el registro de conectores.

La logica de conectores vive ahora en `app/connectors/`. Este modulo mantiene
la API publica historica (`HOSPITALES_SOURCE_ID`, `seed_builtin_sources`,
`sync_hospitales`, `paciente_to_record`) para no romper imports existentes.
"""

from . import connectors
from .connectors.builtin.hospitales import (  # noqa: F401  (re-export)
    HOSPITALES_SOURCE_ID,
    paciente_to_record,
)


def seed_builtin_sources(store):
    """Carga los conectores integrados y registra su SourceInfo en el indice."""
    connectors.load_builtin_connectors()
    for source in connectors.source_infos():
        store.upsert_source(source)


async def sync_hospitales(client, store, source_limit=1000, max_pages=5, desde=None):
    """Wrapper delgado retrocompatible: sincroniza el conector de hospitales."""
    connectors.load_builtin_connectors()
    connector = connectors.get(HOSPITALES_SOURCE_ID)
    from .config import get_settings

    return await connector.sync(
        store=store,
        settings=get_settings(),
        source_limit=source_limit,
        max_pages=max_pages,
        desde=desde,
    )
