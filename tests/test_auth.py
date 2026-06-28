INGEST_BODY = {
    "source": {"id": "aliado", "name": "Aliado", "kind": "desaparecidos"},
    "records": [
        {
            "id": "aliado:1",
            "record_type": "persona_desaparecida",
            "title": "Maria Perez",
            "source_id": "aliado",
            "source_name": "Aliado",
        }
    ],
}


def test_ingest_fails_closed_when_key_missing(env_keys, make_client):
    env_keys()  # sin keys, sin dev mode
    client = make_client()

    response = client.post("/api/ingest", json=INGEST_BODY)

    assert response.status_code == 503
    assert response.json()["detail"]["error_code"] == "write_key_no_configurada"


def test_ingest_rejects_wrong_key(env_keys, make_client):
    env_keys(INGEST_API_KEY="secreta")
    client = make_client()

    response = client.post(
        "/api/ingest", json=INGEST_BODY, headers={"x-ingest-key": "mala"}
    )

    assert response.status_code == 401
    assert response.json()["detail"]["error_code"] == "ingest_key_invalida"


def test_ingest_accepts_correct_key(env_keys, make_client):
    env_keys(INGEST_API_KEY="secreta")
    client = make_client()

    response = client.post(
        "/api/ingest", json=INGEST_BODY, headers={"x-ingest-key": "secreta"}
    )

    assert response.status_code == 200
    assert response.json()["accepted"] == 1


def test_dev_mode_allows_open_writes(env_keys, make_client):
    env_keys(ALLOW_OPEN_WRITES="1")
    client = make_client()

    response = client.post("/api/ingest", json=INGEST_BODY)

    assert response.status_code == 200


def test_admin_sync_fails_closed_when_key_missing(env_keys, make_client):
    env_keys()
    client = make_client()

    response = client.post("/api/sources/hospitales_venezuela/sync")

    assert response.status_code == 503
    assert response.json()["detail"]["error_code"] == "write_key_no_configurada"


def test_reads_are_always_open(env_keys, make_client):
    env_keys()
    client = make_client()

    assert client.get("/api/records/search").status_code == 200
    assert client.get("/api/sources").status_code == 200
    assert client.get("/health").json()["writes_protected"] is True
