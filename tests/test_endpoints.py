def _ingest_body(record_id="acopio_app:1", title="Centro Chacao"):
    return {
        "source": {
            "id": "acopio_app",
            "name": "Acopio App",
            "kind": "centro_acopio",
        },
        "records": [
            {
                "id": record_id,
                "record_type": "centro_acopio",
                "title": title,
                "source_id": "acopio_app",
                "source_name": "Acopio App",
                "city": "Caracas",
            }
        ],
    }


def test_ingest_then_search_roundtrip(env_keys, make_client):
    env_keys(INGEST_API_KEY="ing")
    client = make_client()

    resp = client.post(
        "/api/ingest", json=_ingest_body(), headers={"x-ingest-key": "ing"}
    )
    assert resp.status_code == 200

    found = client.get("/api/records/search", params={"q": "chacao"}).json()
    assert found["total_matches"] == 1
    assert found["results"][0]["record"]["id"] == "acopio_app:1"


def test_ingest_is_idempotent(env_keys, make_client):
    env_keys(INGEST_API_KEY="ing")
    client = make_client()
    headers = {"x-ingest-key": "ing"}

    client.post("/api/ingest", json=_ingest_body(), headers=headers)
    client.post(
        "/api/ingest",
        json=_ingest_body(title="Centro Chacao Actualizado"),
        headers=headers,
    )

    found = client.get("/api/records/search", params={"q": "chacao"}).json()
    assert found["total_matches"] == 1
    assert found["results"][0]["record"]["title"] == "Centro Chacao Actualizado"


def test_ingest_updates_source_record_count(env_keys, make_client):
    env_keys(INGEST_API_KEY="ing")
    client = make_client()

    client.post(
        "/api/ingest", json=_ingest_body(), headers={"x-ingest-key": "ing"}
    )

    sources = {s["id"]: s for s in client.get("/api/sources").json()}
    assert sources["acopio_app"]["record_count"] == 1
    assert sources["acopio_app"]["last_sync"] is not None


def test_get_record_not_found(env_keys, make_client):
    env_keys()
    client = make_client()

    assert client.get("/api/records/inexistente").status_code == 404


def _ingest_persona(client, headers, record_id, person_name, cedula=None, city="Caracas"):
    body = {
        "source": {"id": "aliado", "name": "Aliado", "kind": "desaparecidos"},
        "records": [
            {
                "id": record_id,
                "record_type": "persona_desaparecida",
                "title": person_name,
                "person_name": person_name,
                "cedula": cedula,
                "city": city,
                "source_id": "aliado",
                "source_name": "Aliado",
            }
        ],
    }
    return client.post("/api/ingest", json=body, headers=headers)


def test_search_is_accent_insensitive(env_keys, make_client):
    env_keys(INGEST_API_KEY="ing")
    client = make_client()
    headers = {"x-ingest-key": "ing"}

    _ingest_persona(client, headers, "aliado:1", "José Núñez")

    found = client.get("/api/records/search", params={"q": "jose nunez"}).json()
    assert found["total_matches"] == 1
    assert found["results"][0]["record"]["person_name"] == "José Núñez"


def test_search_exact_cedula_ranks_first(env_keys, make_client):
    env_keys(INGEST_API_KEY="ing")
    client = make_client()
    headers = {"x-ingest-key": "ing"}

    _ingest_persona(client, headers, "aliado:1", "Maria Gomez", cedula="12345678")
    _ingest_persona(client, headers, "aliado:2", "Pedro Gomez", cedula="99999999")

    found = client.get("/api/records/search", params={"cedula": "12345678"}).json()
    assert found["results"][0]["record"]["cedula"] == "12345678"
    assert "cedula_exacta" in found["results"][0]["reasons"]


def test_reingest_updates_fts(env_keys, make_client):
    env_keys(INGEST_API_KEY="ing")
    client = make_client()
    headers = {"x-ingest-key": "ing"}

    _ingest_persona(client, headers, "aliado:1", "Carlos Original")
    _ingest_persona(client, headers, "aliado:1", "Carlos Renombrado")

    assert client.get("/api/records/search", params={"q": "original"}).json()["total_matches"] == 0
    assert client.get("/api/records/search", params={"q": "renombrado"}).json()["total_matches"] == 1


def test_feed_is_incremental(env_keys, make_client):
    env_keys(INGEST_API_KEY="ing")
    client = make_client()
    headers = {"x-ingest-key": "ing"}

    _ingest_persona(client, headers, "aliado:1", "Uno")
    feed1 = client.get("/api/records/feed", params={"since": 0}).json()
    assert feed1["count"] == 1
    cursor = feed1["next_cursor"]

    _ingest_persona(client, headers, "aliado:2", "Dos")
    feed2 = client.get("/api/records/feed", params={"since": cursor}).json()
    assert feed2["count"] == 1
    assert feed2["records"][0]["person_name"] == "Dos"


def test_feed_reappears_after_update(env_keys, make_client):
    env_keys(INGEST_API_KEY="ing")
    client = make_client()
    headers = {"x-ingest-key": "ing"}

    _ingest_persona(client, headers, "aliado:1", "Uno")
    cursor = client.get("/api/records/feed", params={"since": 0}).json()["next_cursor"]

    _ingest_persona(client, headers, "aliado:1", "Uno Editado")
    feed = client.get("/api/records/feed", params={"since": cursor}).json()
    assert feed["count"] == 1
    assert feed["records"][0]["person_name"] == "Uno Editado"
