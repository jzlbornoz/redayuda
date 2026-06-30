from dataclasses import dataclass
from functools import lru_cache
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional during bare syntax checks
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv()


UPSTREAM_URL = (
    "https://ozuxfepfkvnxkywdsqxy.supabase.co/functions/v1/export-pacientes"
)
BASE_DIR = Path(__file__).resolve().parent.parent


def _get_int(name, default, minimum=None, maximum=None):
    raw = os.getenv(name)
    if raw is None:
        return default

    try:
        value = int(raw)
    except ValueError:
        return default

    if minimum is not None:
        value = max(value, minimum)
    if maximum is not None:
        value = min(value, maximum)
    return value


def _get_float(name, default, minimum=None):
    raw = os.getenv(name)
    if raw is None:
        return default

    try:
        value = float(raw)
    except ValueError:
        return default

    if minimum is not None:
        value = max(value, minimum)
    return value


def _get_bool(name, default=False):
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on", "si", "sí"}


def _default_node_id():
    import socket

    return "nodo-" + socket.gethostname().split(".")[0].lower()


@dataclass(frozen=True)
class Settings:
    app_name: str
    upstream_url: str
    hospitales_api_key: str
    ingest_api_key: str
    admin_api_key: str
    database_path: str
    request_timeout_seconds: float
    default_source_limit: int
    default_max_pages: int
    allow_unauthenticated_writes: bool
    sqlite_busy_timeout_ms: int
    node_id: str
    federation_pull_enabled: bool
    federation_pull_interval_seconds: int
    federation_pull_limit: int
    proposals_enabled: bool
    proposal_rate_limit_per_hour: int
    read_rate_limit_per_min: int
    read_cache_seconds: int
    auto_sync_enabled: bool
    auto_sync_interval_seconds: int
    auto_sync_source_limit: int
    auto_sync_max_pages: int


@lru_cache(maxsize=1)
def get_settings():
    return Settings(
        app_name=os.getenv("APP_NAME", "Curalink Red Ayuda"),
        upstream_url=os.getenv("UPSTREAM_URL", UPSTREAM_URL),
        hospitales_api_key=os.getenv("HOSPITALES_API_KEY", ""),
        ingest_api_key=os.getenv("INGEST_API_KEY", ""),
        admin_api_key=os.getenv("ADMIN_API_KEY", ""),
        database_path=os.getenv("DATABASE_PATH", str(BASE_DIR / "data" / "index.db")),
        request_timeout_seconds=_get_float("REQUEST_TIMEOUT_SECONDS", 15.0, 1.0),
        default_source_limit=_get_int("DEFAULT_SOURCE_LIMIT", 1000, 1, 5000),
        default_max_pages=_get_int("DEFAULT_MAX_PAGES", 5, 1, 50),
        allow_unauthenticated_writes=_get_bool("ALLOW_OPEN_WRITES", False)
        or _get_bool("DEV_MODE", False),
        sqlite_busy_timeout_ms=_get_int("SQLITE_BUSY_TIMEOUT_MS", 5000, 0),
        node_id=os.getenv("NODE_ID", "") or _default_node_id(),
        federation_pull_enabled=_get_bool("FEDERATION_PULL_ENABLED", False),
        federation_pull_interval_seconds=_get_int(
            "FEDERATION_PULL_INTERVAL_SECONDS", 300, 10
        ),
        federation_pull_limit=_get_int("FEDERATION_PULL_LIMIT", 200, 1, 1000),
        proposals_enabled=_get_bool("PROPOSALS_ENABLED", True),
        proposal_rate_limit_per_hour=_get_int("PROPOSAL_RATE_LIMIT", 5, 1, 1000),
        read_rate_limit_per_min=_get_int("READ_RATE_LIMIT_PER_MIN", 120, 0),
        read_cache_seconds=_get_int("READ_CACHE_SECONDS", 30, 0),
        auto_sync_enabled=_get_bool("AUTO_SYNC_ENABLED", False),
        auto_sync_interval_seconds=_get_int("AUTO_SYNC_INTERVAL_SECONDS", 21600, 60),
        auto_sync_source_limit=_get_int("AUTO_SYNC_SOURCE_LIMIT", 5000, 1, 5000),
        auto_sync_max_pages=_get_int("AUTO_SYNC_MAX_PAGES", 10, 1, 50),
    )
