"""Registro de conectores con autodescubrimiento.

Cada modulo en `app/connectors/builtin/` expone `CONNECTOR = MiConnector()`.
`load_builtin_connectors()` los descubre e importa una sola vez. Agregar una
fuente nueva = 1 archivo nuevo en `builtin/`, sin tocar main.py ni este modulo.
"""

import importlib
import logging
import pkgutil

_REGISTRY = {}
_loaded = False
logger = logging.getLogger(__name__)


def register(connector):
    """Registra (o reemplaza) un conector por su source_id."""
    _REGISTRY[connector.source_id] = connector
    return connector


def get(source_id):
    return _REGISTRY.get(source_id)


def all_connectors():
    return list(_REGISTRY.values())


def source_infos():
    return [connector.source for connector in _REGISTRY.values()]


def load_builtin_connectors(force=False):
    """Importa cada modulo de builtin/ y registra su atributo CONNECTOR."""
    global _loaded
    if _loaded and not force:
        return

    from . import builtin

    for module_info in pkgutil.iter_modules(builtin.__path__):
        name = module_info.name
        if name.startswith("_"):
            continue
        try:
            module = importlib.import_module(
                "%s.%s" % (builtin.__name__, name)
            )
            connector = getattr(module, "CONNECTOR", None)
            if connector is not None:
                register(connector)
        except Exception:  # pragma: no cover - un conector roto no debe tumbar el arranque
            logger.exception("No se pudo cargar el conector builtin '%s'", name)

    _loaded = True
