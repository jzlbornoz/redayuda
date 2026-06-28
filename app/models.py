from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# Campos de IndexedRecord a los que un colaborador puede mapear su API.
# Excluye los de sistema (id, record_type, source_*, raw).
ALLOWED_TARGET_FIELDS = [
    "title",
    "summary",
    "person_name",
    "cedula",
    "age",
    "organization",
    "location_name",
    "city",
    "state",
    "country",
    "latitude",
    "longitude",
    "contact",
    "status",
    "verified",
    "observed_at",
    "updated_at",
    "source_record_id",
    "tags",
]

ALLOWED_KINDS = [
    "persona_desaparecida",
    "persona_localizada",
    "persona_hospitalizada",
    "centro_acopio",
    "centro_donacion",
    "recurso",
    "otro",
]


class Paciente(BaseModel):
    model_config = ConfigDict(extra="ignore")

    nombre: str = ""
    cedula: Optional[str] = None
    cedula_valida: Optional[bool] = None
    edad: Optional[int] = None
    hospital: str = ""
    hospital_verificado: bool = False
    ciudad: Optional[str] = None
    detalle: Optional[str] = None
    contacto: Optional[str] = None
    nota: Optional[str] = None
    fuente: str = ""
    registrado: Optional[datetime] = None


class UpstreamResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ok: bool
    api_version: str
    fuente: str
    generado: datetime
    total: int
    offset: int
    limit: int
    count: int
    pacientes: List[Paciente] = Field(default_factory=list)


class UpstreamError(BaseModel):
    ok: bool = False
    error_code: str
    error: str


class SearchResult(BaseModel):
    score: int
    reasons: List[str]
    paciente: Paciente


class SearchResponse(BaseModel):
    query: str
    count: int
    total_matches: int
    returned_offset: int
    returned_limit: int
    scanned_records: int
    scanned_pages: int
    upstream_total: int
    upstream_generated: Optional[datetime]
    next_offset: Optional[int]
    elapsed_ms: int
    results: List[SearchResult]


class ServiceInfo(BaseModel):
    name: str
    version: str
    docs: str
    endpoints: List[str]


class SourceInfo(BaseModel):
    id: str
    name: str
    kind: str
    description: str = ""
    url: Optional[str] = None
    access: str = "open"
    enabled: bool = True
    record_count: int = 0
    last_sync: Optional[datetime] = None


class IndexedRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    record_type: str
    title: str
    summary: Optional[str] = None
    person_name: Optional[str] = None
    cedula: Optional[str] = None
    age: Optional[int] = None
    organization: Optional[str] = None
    location_name: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: str = "VE"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    contact: Optional[str] = None
    status: Optional[str] = None
    verified: Optional[bool] = None
    source_id: str
    source_name: str
    source_url: Optional[str] = None
    source_record_id: Optional[str] = None
    observed_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    tags: List[str] = Field(default_factory=list)
    raw: Dict[str, Any] = Field(default_factory=dict)
    origin_node: Optional[str] = None
    origin_source: Optional[str] = None
    entity_id: Optional[str] = None


class IndexedSearchResult(BaseModel):
    score: int
    reasons: List[str]
    record: IndexedRecord
    entity_id: Optional[str] = None
    also_in_count: int = 0


class IndexedSearchResponse(BaseModel):
    query: str
    count: int
    total_matches: int
    returned_offset: int
    returned_limit: int
    source_count: int
    record_types: List[str]
    elapsed_ms: int
    results: List[IndexedSearchResult]


class FeedResponse(BaseModel):
    records: List[IndexedRecord] = Field(default_factory=list)
    next_cursor: int
    count: int
    has_more: bool


class IngestPayload(BaseModel):
    source: SourceInfo
    records: List[IndexedRecord]


class IngestResponse(BaseModel):
    ok: bool
    accepted: int
    rejected: int
    ids: List[str]


class SyncResponse(BaseModel):
    ok: bool
    source_id: str
    imported: int
    scanned: int
    pages: int
    message: str


class NetworkStats(BaseModel):
    ok: bool
    total_records: int
    total_sources: int
    record_types: Dict[str, int]
    sources: List[SourceInfo]


class PeerCreate(BaseModel):
    id: str = Field(max_length=120)
    name: str = Field(max_length=160)
    base_url: str = Field(max_length=300)
    api_key: Optional[str] = Field(default=None, max_length=300)
    enabled: bool = True
    pull_enabled: bool = True


class PeerInfo(BaseModel):
    """Vista publica de un peer; nunca expone su api_key."""

    id: str
    name: str
    base_url: str
    enabled: bool = True
    pull_enabled: bool = True
    last_cursor: int = 0
    last_pull_at: Optional[datetime] = None
    last_status: Optional[str] = None
    created_at: Optional[datetime] = None


class PeerPullResult(BaseModel):
    peer_id: str
    ok: bool
    imported: int
    scanned: int
    from_cursor: int
    to_cursor: int
    message: str = ""


class EntityInfo(BaseModel):
    id: str
    canonical_title: Optional[str] = None
    canonical_cedula: Optional[str] = None
    record_count: int = 0
    strongest_signal: Optional[str] = None


class EntityMember(BaseModel):
    record: IndexedRecord


class EntityResponse(BaseModel):
    entity: EntityInfo
    members: List[EntityMember] = Field(default_factory=list)


class EntityLinkRequest(BaseModel):
    record_a: str
    record_b: str


class EntityUnlinkRequest(BaseModel):
    record_id: str


# ----- Propuestas de conectores (formulario self-service) --------------------


class ProposalPagination(BaseModel):
    style: str = "none"  # none | offset | page | cursor
    limit_param: Optional[str] = None
    offset_param: Optional[str] = None
    page_param: Optional[str] = None
    cursor_param: Optional[str] = None
    page_size: int = Field(default=100, ge=1, le=5000)

    @field_validator("style")
    @classmethod
    def _valid_style(cls, value):
        allowed = {"none", "offset", "page", "cursor"}
        if value not in allowed:
            raise ValueError("style invalido")
        return value


class ConnectorProposalIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_name: str = Field(min_length=3, max_length=120)
    kind: str = Field(max_length=60)
    description: str = Field(default="", max_length=600)
    endpoint_url: str = Field(max_length=400)
    http_method: str = "GET"
    auth_type: str = "none"  # none | api_key | bearer
    auth_header: Optional[str] = Field(default=None, max_length=80)
    pagination: ProposalPagination = Field(default_factory=ProposalPagination)
    data_path: Optional[str] = Field(default=None, max_length=120)
    field_mapping: Dict[str, str] = Field(default_factory=dict)
    sample_response: Optional[str] = Field(default=None, max_length=8000)
    docs: Optional[str] = Field(default=None, max_length=4000)
    contact_name: Optional[str] = Field(default=None, max_length=120)
    contact_email: Optional[str] = Field(default=None, max_length=160)
    # Honeypot anti-spam: debe llegar vacio (los bots lo rellenan).
    website: str = ""

    @field_validator("kind")
    @classmethod
    def _valid_kind(cls, value):
        if value not in ALLOWED_KINDS:
            raise ValueError("kind no permitido")
        return value

    @field_validator("http_method")
    @classmethod
    def _valid_method(cls, value):
        value = value.upper()
        if value not in {"GET", "POST"}:
            raise ValueError("http_method invalido")
        return value

    @field_validator("auth_type")
    @classmethod
    def _valid_auth(cls, value):
        if value not in {"none", "api_key", "bearer"}:
            raise ValueError("auth_type invalido")
        return value

    @field_validator("website")
    @classmethod
    def _honeypot_empty(cls, value):
        if value:
            raise ValueError("spam detectado")
        return value

    @field_validator("field_mapping")
    @classmethod
    def _valid_mapping(cls, value):
        unknown = [k for k in value if k not in ALLOWED_TARGET_FIELDS]
        if unknown:
            raise ValueError("campos destino no permitidos: %s" % ", ".join(unknown))
        if not any(k in value for k in ("title", "person_name", "organization")):
            raise ValueError(
                "el mapeo debe incluir al menos title, person_name u organization"
            )
        return value


class ConnectorProposalOut(BaseModel):
    ok: bool
    id: str
    status: str
    source_id: str
    message: str


class ProposalSummary(BaseModel):
    id: str
    status: str
    source_name: str
    kind: str
    endpoint_url: str
    contact_email: Optional[str] = None
    created_at: Optional[datetime] = None


class ProposalDetail(ProposalSummary):
    source_id: str
    description: str = ""
    http_method: str = "GET"
    auth_type: str = "none"
    auth_header: Optional[str] = None
    pagination: Dict[str, Any] = Field(default_factory=dict)
    data_path: Optional[str] = None
    field_mapping: Dict[str, str] = Field(default_factory=dict)
    sample_response: Optional[str] = None
    docs: Optional[str] = None
    contact_name: Optional[str] = None
    review_notes: Optional[str] = None
    reviewed_at: Optional[datetime] = None


class ProposalReview(BaseModel):
    action: str  # approve | reject
    review_notes: Optional[str] = Field(default=None, max_length=600)
    enabled: bool = False

    @field_validator("action")
    @classmethod
    def _valid_action(cls, value):
        if value not in {"approve", "reject"}:
            raise ValueError("action invalida")
        return value


class PreviewRequest(BaseModel):
    endpoint_url: str = Field(max_length=400)
    data_path: Optional[str] = Field(default=None, max_length=120)


class PreviewResponse(BaseModel):
    ok: bool
    count: int
    fields: List[str] = Field(default_factory=list)
    sample: Dict[str, Any] = Field(default_factory=dict)
    suggested_mapping: Dict[str, str] = Field(default_factory=dict)


class ContractField(BaseModel):
    name: str
    required: bool = False


class ConnectorContract(BaseModel):
    record_fields: List[ContractField]
    allowed_kinds: List[str]
    auth_types: List[str]
    pagination_styles: List[str]
    example_request: Dict[str, Any]
    example_record: Dict[str, Any]
