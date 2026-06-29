import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from time import perf_counter
from typing import Optional

from fastapi import Depends, Header, HTTPException, Query, FastAPI, Request, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import connectors, federation, proposals, scheduler
from .client import HospitalesClient, HttpClient
from .config import get_settings
from .models import (
    ConnectorContract,
    ConnectorProposalIn,
    ConnectorProposalOut,
    PreviewRequest,
    PreviewResponse,
    EntityInfo,
    EntityLinkRequest,
    EntityMember,
    EntityResponse,
    EntityUnlinkRequest,
    FeedResponse,
    IndexedRecord,
    IndexedSearchResponse,
    IngestPayload,
    IngestResponse,
    NetworkStats,
    PeerCreate,
    PeerInfo,
    PeerPullResult,
    ProposalDetail,
    ProposalReview,
    ProposalSummary,
    SearchResponse,
    SearchResult,
    ServiceInfo,
    SourceInfo,
    SyncResponse,
    UpstreamResponse,
)
from .search import ranked_results
from .sources import seed_builtin_sources
from .store import IndexStore


API_VERSION = "0.1.0"
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"


@asynccontextmanager
async def lifespan(app):
    settings = get_settings()
    tasks = []
    if settings.federation_pull_enabled:
        tasks.append(
            asyncio.create_task(federation.federation_loop(get_store(), settings))
        )
    if settings.auto_sync_enabled:
        tasks.append(
            asyncio.create_task(scheduler.sync_loop(get_store(), settings))
        )
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()


app = FastAPI(
    title="Red Humanitaria de Datos",
    version=API_VERSION,
    description=(
        "Indice abierto para federar fuentes humanitarias: personas desaparecidas, "
        "personas localizadas, centros de acopio, donaciones y otros datos utiles."
    ),
    lifespan=lifespan,
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


_READ_CACHE_PREFIXES = (
    "/api/records/search",
    "/api/records/feed",
    "/api/records/",
    "/api/sources",
    "/api/network/stats",
    "/api/connectors/schema",
    "/api/entities/",
)


@lru_cache(maxsize=1)
def get_read_rate_limiter():
    return proposals.RateLimiter(
        get_settings().read_rate_limit_per_min, window_seconds=60
    )


@app.middleware("http")
async def cache_and_limit(request, call_next):
    """Cabeceras de caché y rate-limit para servir a muchos consumidores.

    - HTML de páginas: no-store (carga siempre la versión de assets vigente).
    - /static: no-cache (revalida por ETag).
    - Lecturas GET de la API: rate-limit por IP + Cache-Control corto para que
      navegadores y el borde (Cloudflare) absorban el grueso del tráfico.
    - Escrituras/otros: no-store.
    """
    path = request.url.path
    settings = get_settings()
    is_read = request.method == "GET" and path.startswith(_READ_CACHE_PREFIXES)

    if is_read and settings.read_rate_limit_per_min:
        ip = request.client.host if request.client else "desconocido"
        if not get_read_rate_limiter().check(ip):
            return JSONResponse(
                status_code=429,
                content={"ok": False, "error_code": "rate_limit",
                         "error": "Demasiadas solicitudes; intenta en un momento."},
            )

    response = await call_next(request)

    if path in ("/", "/contribuir", "/fuentes", "/integrar"):
        response.headers["Cache-Control"] = "no-store"
    elif path.startswith("/static"):
        response.headers["Cache-Control"] = "no-cache"
    elif is_read and settings.read_cache_seconds:
        s = settings.read_cache_seconds
        response.headers["Cache-Control"] = (
            "public, max-age=%d, stale-while-revalidate=%d" % (s, s * 4)
        )
    return response


def get_client():
    return HospitalesClient(get_settings())


@lru_cache(maxsize=1)
def get_store():
    settings = get_settings()
    store = IndexStore(
        settings.database_path,
        busy_timeout_ms=settings.sqlite_busy_timeout_ms,
    )
    seed_builtin_sources(store)
    return store


@lru_cache(maxsize=1)
def get_proposal_rate_limiter():
    return proposals.RateLimiter(
        get_settings().proposal_rate_limit_per_hour, window_seconds=3600
    )


@app.get("/", include_in_schema=False)
@app.head("/", include_in_schema=False)
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/contribuir", include_in_schema=False)
@app.head("/contribuir", include_in_schema=False)
async def contribuir():
    return FileResponse(STATIC_DIR / "contribuir.html")


@app.get("/fuentes", include_in_schema=False)
@app.head("/fuentes", include_in_schema=False)
async def fuentes():
    return FileResponse(STATIC_DIR / "fuentes.html")


@app.get("/integrar", include_in_schema=False)
@app.head("/integrar", include_in_schema=False)
async def integrar():
    return FileResponse(STATIC_DIR / "integrar.html")


@app.get("/favicon.ico", include_in_schema=False)
@app.head("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse(STATIC_DIR / "assets" / "favicon.png", media_type="image/png")


@app.get("/apple-touch-icon.png", include_in_schema=False)
@app.get("/apple-touch-icon-precomposed.png", include_in_schema=False)
@app.head("/apple-touch-icon.png", include_in_schema=False)
@app.head("/apple-touch-icon-precomposed.png", include_in_schema=False)
async def apple_touch_icon():
    return FileResponse(
        STATIC_DIR / "assets" / "apple-touch-icon.png",
        media_type="image/png",
    )


@app.get("/api", response_model=ServiceInfo, tags=["sistema"])
async def root():
    return ServiceInfo(
        name=get_settings().app_name,
        version=API_VERSION,
        docs="/docs",
        endpoints=[
            "/api/sources",
            "/api/records/search",
            "/api/records/feed",
            "/api/ingest",
            "/api/network/stats",
            "/api/peers",
            "/api/entities/{id}",
            "/api/connectors/schema",
            "/api/connectors/preview",
            "/api/connectors/proposals",
            "/fuentes",
            "/contribuir",
            "/integrar",
            "/buscar",
            "/docs",
            "/health",
        ],
    )


@app.get("/health", tags=["sistema"])
async def health():
    settings = get_settings()
    stats = get_store().stats()
    return {
        "ok": True,
        "mode": "indexer",
        "database_path": settings.database_path,
        "records_indexed": stats["total_records"],
        "sources_registered": stats["total_sources"],
        "upstream_configured": bool(settings.hospitales_api_key),
        "ingest_key_configured": bool(settings.ingest_api_key),
        "admin_key_configured": bool(settings.admin_api_key),
        "writes_protected": not settings.allow_unauthenticated_writes,
        "node_id": settings.node_id,
        "auto_sync_enabled": settings.auto_sync_enabled,
    }


@app.get("/api/sources", response_model=list[SourceInfo], tags=["red"])
async def sources(store: IndexStore = Depends(get_store)):
    return store.list_sources()


@app.get("/api/network/stats", response_model=NetworkStats, tags=["red"])
async def network_stats(store: IndexStore = Depends(get_store)):
    return NetworkStats(ok=True, **store.stats())


@app.get("/api/records/search", response_model=IndexedSearchResponse, tags=["red"])
async def search_records(
    q: str = Query("", max_length=180, description="Texto libre en todas las fuentes."),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    record_type: Optional[str] = Query(None, max_length=80),
    source_id: Optional[str] = Query(None, max_length=120),
    city: Optional[str] = Query(None, max_length=100),
    cedula: Optional[str] = Query(None, max_length=32),
    group_by_entity: bool = Query(False, description="Colapsa duplicados por entidad."),
    store: IndexStore = Depends(get_store),
):
    return store.search_records(
        query=q,
        limit=limit,
        offset=offset,
        record_type=record_type,
        source_id=source_id,
        city=city,
        cedula=cedula,
        group_by_entity=group_by_entity,
    )


@app.get("/api/records/feed", response_model=FeedResponse, tags=["red"])
async def records_feed(
    since: int = Query(0, ge=0, description="Cursor: ultimo feed_seq ya consumido."),
    limit: int = Query(100, ge=1, le=1000),
    exclude_node: Optional[str] = Query(
        None, max_length=120, description="Excluye registros con este origin_node."
    ),
    store: IndexStore = Depends(get_store),
):
    records, next_cursor, has_more = store.feed_records(
        since_seq=since, limit=limit, exclude_origin=exclude_node
    )
    return FeedResponse(
        records=records,
        next_cursor=next_cursor,
        count=len(records),
        has_more=has_more,
    )


@app.get("/api/records/{record_id}", response_model=IndexedRecord, tags=["red"])
async def get_record(record_id: str, store: IndexStore = Depends(get_store)):
    record = store.get_record(record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Registro no encontrado.")
    return record


@app.post("/api/ingest", response_model=IngestResponse, tags=["red"])
async def ingest_records(
    payload: IngestPayload,
    x_ingest_key: Optional[str] = Header(None),
    store: IndexStore = Depends(get_store),
):
    _require_ingest_key(x_ingest_key)

    node_id = get_settings().node_id
    for record in payload.records:
        # Procedencia: lo que entra por ingest nace en este nodo, salvo que el
        # aliado ya declare un origen (re-publicacion de datos federados).
        if record.origin_node is None:
            record.origin_node = node_id
            record.origin_source = record.source_id

    store.upsert_source(payload.source)
    accepted = store.upsert_records(payload.records)
    store.touch_source_sync(payload.source.id)
    return IngestResponse(
        ok=True,
        accepted=accepted,
        rejected=0,
        ids=[record.id for record in payload.records],
    )


@app.post("/api/sources/{source_id}/sync", response_model=SyncResponse, tags=["red"])
async def sync_source(
    source_id: str,
    source_limit: Optional[int] = Query(None, ge=1, le=5000),
    max_pages: Optional[int] = Query(None, ge=1, le=50),
    desde: Optional[datetime] = None,
    x_admin_key: Optional[str] = Header(None),
    store: IndexStore = Depends(get_store),
):
    _require_admin_key(x_admin_key)

    connector = connectors.get(source_id)
    if connector is None:
        raise HTTPException(
            status_code=404,
            detail="Fuente no soportada por un conector local.",
        )
    if not connector.source.enabled:
        raise HTTPException(
            status_code=409,
            detail="Conector deshabilitado; un administrador debe activarlo.",
        )

    settings = get_settings()
    imported, scanned, pages = await connector.sync(
        store=store,
        settings=settings,
        source_limit=source_limit or settings.default_source_limit,
        max_pages=max_pages or settings.default_max_pages,
        desde=desde,
    )
    return SyncResponse(
        ok=True,
        source_id=source_id,
        imported=imported,
        scanned=scanned,
        pages=pages,
        message="Fuente sincronizada en el indice local.",
    )


@app.post("/api/sources/sync-all", tags=["red"])
async def sync_all_sources(
    x_admin_key: Optional[str] = Header(None),
    store: IndexStore = Depends(get_store),
):
    _require_admin_key(x_admin_key)
    results = await scheduler.sync_all_sources(store, get_settings())
    return {"ok": True, "results": results}


@app.get("/api/peers", response_model=list[PeerInfo], tags=["federacion"])
async def list_peers(
    x_admin_key: Optional[str] = Header(None),
    store: IndexStore = Depends(get_store),
):
    _require_admin_key(x_admin_key)
    return store.list_peers()


@app.post("/api/peers", response_model=PeerInfo, tags=["federacion"])
async def add_peer(
    peer: PeerCreate,
    x_admin_key: Optional[str] = Header(None),
    store: IndexStore = Depends(get_store),
):
    _require_admin_key(x_admin_key)
    return store.add_peer(peer)


@app.delete("/api/peers/{peer_id}", tags=["federacion"])
async def delete_peer(
    peer_id: str,
    x_admin_key: Optional[str] = Header(None),
    store: IndexStore = Depends(get_store),
):
    _require_admin_key(x_admin_key)
    if not store.delete_peer(peer_id):
        raise HTTPException(status_code=404, detail="Peer no encontrado.")
    return {"ok": True, "deleted": peer_id}


@app.post(
    "/api/peers/{peer_id}/pull", response_model=PeerPullResult, tags=["federacion"]
)
async def pull_peer(
    peer_id: str,
    x_admin_key: Optional[str] = Header(None),
    store: IndexStore = Depends(get_store),
):
    _require_admin_key(x_admin_key)
    peer = store.get_peer(peer_id)
    if peer is None:
        raise HTTPException(status_code=404, detail="Peer no encontrado.")

    target = {
        "id": peer.id,
        "base_url": peer.base_url,
        "api_key": None,
        "last_cursor": peer.last_cursor,
    }
    # Recuperar api_key real (no expuesta en PeerInfo) para el pull.
    for row in store.peer_pull_targets():
        if row["id"] == peer_id:
            target = row
            break

    settings = get_settings()
    imported, scanned, frm, to = await federation.pull_peer(store, target, settings)
    return PeerPullResult(
        peer_id=peer_id,
        ok=True,
        imported=imported,
        scanned=scanned,
        from_cursor=frm,
        to_cursor=to,
        message="Pull completado.",
    )


@app.get("/api/entities/{entity_id}", response_model=EntityResponse, tags=["red"])
async def get_entity(entity_id: str, store: IndexStore = Depends(get_store)):
    result = store.get_entity(entity_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Entidad no encontrada.")
    ent, members = result
    return EntityResponse(
        entity=EntityInfo(
            id=ent["id"],
            canonical_title=ent["canonical_title"],
            canonical_cedula=ent["canonical_cedula"],
            record_count=ent["record_count"],
            strongest_signal=ent["strongest_signal"],
        ),
        members=[EntityMember(record=record) for record in members],
    )


@app.post("/api/entities/link", tags=["red"])
async def link_entities(
    payload: EntityLinkRequest,
    x_admin_key: Optional[str] = Header(None),
    store: IndexStore = Depends(get_store),
):
    _require_admin_key(x_admin_key)
    if store.get_record(payload.record_a) is None or store.get_record(payload.record_b) is None:
        raise HTTPException(status_code=404, detail="Registro no encontrado.")
    store.link_records(payload.record_a, payload.record_b)
    record = store.get_record(payload.record_b)
    return {"ok": True, "entity_id": record.entity_id}


@app.post("/api/entities/unlink", tags=["red"])
async def unlink_entity(
    payload: EntityUnlinkRequest,
    x_admin_key: Optional[str] = Header(None),
    store: IndexStore = Depends(get_store),
):
    _require_admin_key(x_admin_key)
    if not store.unlink_record(payload.record_id):
        raise HTTPException(
            status_code=404,
            detail="Registro sin entidad o inexistente.",
        )
    return {"ok": True, "record_id": payload.record_id}


@app.get("/api/connectors/schema", response_model=ConnectorContract, tags=["red"])
async def connector_schema():
    return proposals.build_contract()


@app.post("/api/connectors/preview", response_model=PreviewResponse, tags=["red"])
async def preview_connector(payload: PreviewRequest, request: Request):
    """Autodetecta los campos del endpoint propuesto para asistir el mapeo.

    Consulta la URL del colaborador (con guardia anti-SSRF), localiza el array
    de registros y devuelve sus campos + un mapeo sugerido al esquema comun.
    """
    if not get_proposal_rate_limiter().check(
        request.client.host if request.client else "desconocido"
    ):
        raise HTTPException(
            status_code=429,
            detail={"ok": False, "error_code": "rate_limit", "error": "Demasiados intentos."},
        )
    try:
        proposals.validate_public_url(payload.endpoint_url)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"ok": False, "error_code": "url_invalida", "error": str(exc)},
        )

    try:
        data = await HttpClient(get_settings()).get_json(payload.endpoint_url)
    except HTTPException:
        raise HTTPException(
            status_code=502,
            detail={
                "ok": False,
                "error_code": "preview_fallido",
                "error": "No se pudo leer/parsear la respuesta del endpoint.",
            },
        )

    fields, sample, count = proposals.detect_fields(data, payload.data_path)
    if not fields:
        raise HTTPException(
            status_code=422,
            detail={
                "ok": False,
                "error_code": "sin_lista",
                "error": "No se encontro un array de registros. Indica la ruta a los datos (data_path).",
            },
        )
    return PreviewResponse(
        ok=True,
        count=count,
        fields=fields,
        sample=sample if isinstance(sample, dict) else {},
        suggested_mapping=proposals.suggest_mapping(fields),
    )


@app.post(
    "/api/connectors/proposals",
    response_model=ConnectorProposalOut,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["red"],
)
async def submit_proposal(
    proposal: ConnectorProposalIn,
    request: Request,
    store: IndexStore = Depends(get_store),
):
    settings = get_settings()
    if not settings.proposals_enabled:
        raise HTTPException(
            status_code=503,
            detail={
                "ok": False,
                "error_code": "proposals_deshabilitado",
                "error": "El registro de fuentes esta deshabilitado.",
            },
        )

    ip = request.client.host if request.client else "desconocido"
    if not get_proposal_rate_limiter().check(ip):
        raise HTTPException(
            status_code=429,
            detail={
                "ok": False,
                "error_code": "rate_limit",
                "error": "Demasiados envios; intenta mas tarde.",
            },
        )

    try:
        proposals.validate_public_url(proposal.endpoint_url)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"ok": False, "error_code": "url_invalida", "error": str(exc)},
        )

    source_id = proposals.slugify_source_id(proposal.source_name)
    spec = proposals.proposal_to_connector_spec(proposal, source_id)
    proposal_id = store.insert_proposal(proposal, source_id, spec, ip)
    return ConnectorProposalOut(
        ok=True,
        id=proposal_id,
        status="pending",
        source_id=source_id,
        message="Propuesta recibida; un administrador la revisara.",
    )


@app.get(
    "/api/connectors/proposals",
    response_model=list[ProposalSummary],
    tags=["red"],
)
async def list_proposals(
    status_filter: Optional[str] = Query(None, alias="status", max_length=20),
    x_admin_key: Optional[str] = Header(None),
    store: IndexStore = Depends(get_store),
):
    _require_admin_key(x_admin_key)
    return [_proposal_summary(row) for row in store.list_proposals(status_filter)]


@app.get(
    "/api/connectors/proposals/{proposal_id}",
    response_model=ProposalDetail,
    tags=["red"],
)
async def get_proposal(
    proposal_id: str,
    x_admin_key: Optional[str] = Header(None),
    store: IndexStore = Depends(get_store),
):
    _require_admin_key(x_admin_key)
    row = store.get_proposal(proposal_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada.")
    return _proposal_detail(row)


@app.post(
    "/api/connectors/proposals/{proposal_id}/review",
    response_model=ProposalDetail,
    tags=["red"],
)
async def review_proposal(
    proposal_id: str,
    review: ProposalReview,
    x_admin_key: Optional[str] = Header(None),
    store: IndexStore = Depends(get_store),
):
    _require_admin_key(x_admin_key)
    row = store.get_proposal(proposal_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada.")

    if review.action == "approve":
        # Registra la fuente DESACTIVADA; un admin debe activarla/sincronizarla.
        store.upsert_source(
            SourceInfo(
                id=row["source_id"],
                name=row["source_name"],
                kind=row["kind"],
                description=row["description"]
                or "Fuente propuesta por un colaborador.",
                url=row["endpoint_url"],
                access=row["auth_type"],
                enabled=review.enabled,
            )
        )
        store.set_proposal_status(proposal_id, "approved", review.review_notes)
    else:
        store.set_proposal_status(proposal_id, "rejected", review.review_notes)

    return _proposal_detail(store.get_proposal(proposal_id))


@app.get("/pacientes", response_model=UpstreamResponse, tags=["fuente"])
async def pacientes(
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    desde: Optional[datetime] = None,
    client: HospitalesClient = Depends(get_client),
):
    return await client.export_pacientes(limit=limit, offset=offset, desde=desde)


@app.get("/frescura", response_model=UpstreamResponse, tags=["fuente"])
async def frescura(client: HospitalesClient = Depends(get_client)):
    return await client.export_pacientes(limit=1, offset=0)


@app.get("/buscar", response_model=SearchResponse, tags=["busqueda"])
@app.get("/search", response_model=SearchResponse, tags=["busqueda"])
async def buscar(
    q: str = Query("", max_length=160, description="Texto libre: nombre, cedula, hospital o ciudad."),
    limit: int = Query(20, ge=1, le=100, description="Resultados devueltos."),
    offset: int = Query(0, ge=0, description="Offset de resultados ya rankeados."),
    ciudad: Optional[str] = Query(None, max_length=80),
    hospital: Optional[str] = Query(None, max_length=120),
    edad: Optional[int] = Query(None, ge=0, le=130),
    cedula: Optional[str] = Query(None, max_length=32),
    desde: Optional[datetime] = Query(None, description="Filtro incremental de la API externa."),
    source_offset: int = Query(0, ge=0, description="Offset inicial en la API externa."),
    source_limit: Optional[int] = Query(None, ge=1, le=5000, description="Tamano de pagina de la API externa."),
    max_pages: Optional[int] = Query(None, ge=1, le=50, description="Maximo de paginas externas a escanear."),
    client: HospitalesClient = Depends(get_client),
):
    settings = get_settings()
    source_limit = source_limit or settings.default_source_limit
    max_pages = max_pages or settings.default_max_pages

    started = perf_counter()
    all_matches = []
    scanned_records = 0
    scanned_pages = 0
    upstream_total = 0
    upstream_generated = None

    for page in range(max_pages):
        upstream_offset = source_offset + (page * source_limit)
        payload = await client.export_pacientes(
            limit=source_limit,
            offset=upstream_offset,
            desde=desde,
        )

        scanned_pages += 1
        scanned_records += payload.count
        upstream_total = payload.total
        upstream_generated = payload.generado

        all_matches.extend(
            ranked_results(
                payload.pacientes,
                query=q,
                ciudad=ciudad,
                hospital=hospital,
                edad=edad,
                cedula=cedula,
            )
        )

        if payload.count < source_limit:
            break
        if upstream_offset + payload.count >= payload.total:
            break

    total_matches = len(all_matches)
    page_matches = all_matches[offset : offset + limit]
    next_offset = offset + limit if offset + limit < total_matches else None

    elapsed_ms = int((perf_counter() - started) * 1000)

    return SearchResponse(
        query=q,
        count=len(page_matches),
        total_matches=total_matches,
        returned_offset=offset,
        returned_limit=limit,
        scanned_records=scanned_records,
        scanned_pages=scanned_pages,
        upstream_total=upstream_total,
        upstream_generated=upstream_generated,
        next_offset=next_offset,
        elapsed_ms=elapsed_ms,
        results=[
            SearchResult(score=score, reasons=reasons, paciente=paciente)
            for score, reasons, paciente in page_matches
        ],
    )


def _proposal_summary(row):
    return ProposalSummary(
        id=row["id"],
        status=row["status"],
        source_name=row["source_name"],
        kind=row["kind"],
        endpoint_url=row["endpoint_url"],
        contact_email=row["contact_email"],
        created_at=row["created_at"],
    )


def _proposal_detail(row):
    import json

    return ProposalDetail(
        id=row["id"],
        status=row["status"],
        source_name=row["source_name"],
        kind=row["kind"],
        endpoint_url=row["endpoint_url"],
        contact_email=row["contact_email"],
        created_at=row["created_at"],
        source_id=row["source_id"],
        description=row["description"],
        http_method=row["http_method"],
        auth_type=row["auth_type"],
        auth_header=row["auth_header"],
        pagination=json.loads(row["pagination_json"] or "{}"),
        data_path=row["data_path"],
        field_mapping=json.loads(row["field_mapping_json"] or "{}"),
        sample_response=row["sample_response"],
        docs=row["docs"],
        contact_name=row["contact_name"],
        review_notes=row["review_notes"],
        reviewed_at=row["reviewed_at"],
    )


def _require_write_key(received_key, configured_key, *, error_code, error):
    settings = get_settings()
    if not configured_key:
        if settings.allow_unauthenticated_writes:
            return
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "ok": False,
                "error_code": "write_key_no_configurada",
                "error": (
                    "Escrituras deshabilitadas: configura la clave de acceso "
                    "(o ALLOW_OPEN_WRITES=1 solo en desarrollo)."
                ),
            },
        )
    if received_key != configured_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"ok": False, "error_code": error_code, "error": error},
        )


def _require_ingest_key(received_key):
    _require_write_key(
        received_key,
        get_settings().ingest_api_key,
        error_code="ingest_key_invalida",
        error="Clave de ingestion invalida.",
    )


def _require_admin_key(received_key):
    _require_write_key(
        received_key,
        get_settings().admin_api_key,
        error_code="admin_key_invalida",
        error="Clave administrativa invalida.",
    )
