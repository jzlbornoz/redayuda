from app import proposals


VALID = {
    "source_name": "App Desaparecidos Demo",
    "kind": "persona_desaparecida",
    "description": "Reportes ciudadanos.",
    "endpoint_url": "https://example.com/api/registros",
    "auth_type": "none",
    "field_mapping": {"person_name": "nombre", "title": "nombre", "city": "ciudad"},
    "contact_email": "equipo@ejemplo.org",
}


def test_schema_is_public(env_keys, make_client):
    env_keys()
    client = make_client()
    schema = client.get("/api/connectors/schema").json()
    assert "person_name" in [f["name"] for f in schema["record_fields"]]
    assert "persona_desaparecida" in schema["allowed_kinds"]


def test_submit_proposal_is_accepted_and_pending(env_keys, make_client):
    env_keys(ADMIN_API_KEY="adm")
    client = make_client()

    resp = client.post("/api/connectors/proposals", json=VALID)
    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "pending"

    # No crea registros ni fuente activa todavia.
    sources = {s["id"]: s for s in client.get("/api/sources").json()}
    assert body["source_id"] not in sources

    # El admin la ve en pending.
    pend = client.get(
        "/api/connectors/proposals", params={"status": "pending"},
        headers={"x-admin-key": "adm"},
    ).json()
    assert len(pend) == 1


def test_honeypot_rejected(env_keys, make_client):
    env_keys()
    client = make_client()
    payload = dict(VALID, website="http://spam")
    assert client.post("/api/connectors/proposals", json=payload).status_code == 422


def test_private_url_rejected(env_keys, make_client):
    env_keys()
    client = make_client()
    payload = dict(VALID, endpoint_url="http://127.0.0.1:8000/api")
    resp = client.post("/api/connectors/proposals", json=payload)
    assert resp.status_code == 422
    assert resp.json()["detail"]["error_code"] == "url_invalida"


def test_mapping_must_include_anchor_field(env_keys, make_client):
    env_keys()
    client = make_client()
    payload = dict(VALID, field_mapping={"city": "ciudad"})
    assert client.post("/api/connectors/proposals", json=payload).status_code == 422


def test_rate_limit(env_keys, make_client, monkeypatch):
    monkeypatch.setenv("PROPOSAL_RATE_LIMIT", "2")
    env_keys()  # refresca settings; PROPOSAL_RATE_LIMIT permanece
    client = make_client()

    assert client.post("/api/connectors/proposals", json=VALID).status_code == 202
    assert client.post("/api/connectors/proposals", json=VALID).status_code == 202
    assert client.post("/api/connectors/proposals", json=VALID).status_code == 429


def test_review_approve_creates_disabled_source(env_keys, make_client):
    env_keys(ADMIN_API_KEY="adm")
    client = make_client()
    headers = {"x-admin-key": "adm"}

    pid = client.post("/api/connectors/proposals", json=VALID).json()["id"]
    review = client.post(
        "/api/connectors/proposals/%s/review" % pid,
        json={"action": "approve"},
        headers=headers,
    )
    assert review.status_code == 200
    assert review.json()["status"] == "approved"

    source = next(
        s for s in client.get("/api/sources").json()
        if s["name"] == "App Desaparecidos Demo"
    )
    assert source["enabled"] is False  # aprobada pero inactiva hasta sync


def test_proposal_endpoints_require_admin(env_keys, make_client):
    env_keys(ADMIN_API_KEY="adm")
    client = make_client()
    assert client.get("/api/connectors/proposals").status_code == 401


def test_detect_and_suggest_mapping():
    from app import proposals
    payload = {"items": [{"nombre": "Ana", "cedula": "111", "city": "Caracas",
                          "image": "x.png", "lat": 10.5, "lng": -66.9}], "total": 1}
    fields, sample, count = proposals.detect_fields(payload)
    assert count == 1 and "nombre" in fields
    m = proposals.suggest_mapping(fields)
    # token-based: sin falsos positivos (city!=cedula)
    assert m["nombre"] == "person_name"
    assert m["city"] == "city"
    assert m["cedula"] == "cedula"
    assert m["image"] == "image_url"
    assert m["lat"] == "latitude" and m["lng"] == "longitude"


def test_preview_endpoint_rejects_private_url(env_keys, make_client):
    env_keys()
    client = make_client()
    r = client.post("/api/connectors/preview", json={"endpoint_url": "http://127.0.0.1/x"})
    assert r.status_code == 422
    assert r.json()["detail"]["error_code"] == "url_invalida"


def test_validate_public_url_unit():
    import pytest

    assert proposals.validate_public_url("https://example.com/x")
    with pytest.raises(ValueError):
        proposals.validate_public_url("ftp://example.com")
    with pytest.raises(ValueError):
        proposals.validate_public_url("http://10.0.0.1/internal")
