from app import entities
from app.models import IndexedRecord
from app.store import IndexStore


def _persona(record_id, name, source, cedula=None, city=None, age=None):
    return IndexedRecord(
        id=record_id,
        record_type="persona_desaparecida",
        title=name,
        person_name=name,
        cedula=cedula,
        city=city,
        age=age,
        source_id=source,
        source_name=source,
    )


# ----- funciones puras -------------------------------------------------------

def test_match_keys_skips_non_person():
    org = {"cedula": None, "person_name": None, "city": "Caracas"}
    assert entities.match_keys(org) == []


def test_match_decision_same_cedula_is_strong():
    a = {"cedula": "12345678", "person_name": "Jose"}
    b = {"cedula": "12.345.678", "person_name": "J"}
    decision = entities.match_decision(a, b)
    assert decision is not None and decision[0] == "cedula"


def test_match_decision_conflicting_cedula_never_links():
    a = {"cedula": "111", "person_name": "Ana Gomez", "city": "Caracas"}
    b = {"cedula": "222", "person_name": "Ana Gomez", "city": "Caracas"}
    assert entities.match_decision(a, b) is None


def test_match_decision_weak_name_city():
    a = {"person_name": "Ana Gomez", "city": "Caracas"}
    b = {"person_name": "ana gomez", "city": "caracas"}
    decision = entities.match_decision(a, b)
    assert decision is not None and decision[1] == "weak"


# ----- integracion con el store ---------------------------------------------

def test_same_cedula_across_sources_links(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    store.ensure_source("app_a")
    store.ensure_source("app_b")
    store.upsert_records([_persona("app_a:1", "Jose Perez", "app_a", cedula="12345678")])
    store.upsert_records([_persona("app_b:1", "J. Perez", "app_b", cedula="12345678")])

    a = store.get_record("app_a:1")
    b = store.get_record("app_b:1")
    assert a.entity_id is not None
    assert a.entity_id == b.entity_id

    result = store.get_entity(a.entity_id)
    assert result is not None
    ent, members = result
    assert ent["record_count"] == 2
    # Procedencia intacta: cada registro conserva su fuente.
    assert {m.source_id for m in members} == {"app_a", "app_b"}


def test_cedula_conflict_blocks_link(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    store.ensure_source("s")
    store.upsert_records([_persona("s:1", "Ana Gomez", "s", cedula="111", city="Caracas")])
    store.upsert_records([_persona("s:2", "Ana Gomez", "s", cedula="222", city="Caracas")])

    assert store.get_record("s:1").entity_id is None
    assert store.get_record("s:2").entity_id is None


def test_unlink_is_reversible(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    store.ensure_source("s")
    store.upsert_records([_persona("s:1", "Luis Diaz", "s", cedula="999")])
    store.upsert_records([_persona("s:2", "Luis Diaz", "s", cedula="999")])

    entity_id = store.get_record("s:1").entity_id
    assert entity_id is not None

    assert store.unlink_record("s:1") is True
    assert store.get_record("s:1").entity_id is None
    # La entidad de 2 quedo en 1 miembro y se disolvio.
    assert store.get_entity(entity_id) is None


def test_search_group_by_entity_collapses(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    store.ensure_source("a")
    store.ensure_source("b")
    store.upsert_records([_persona("a:1", "Maria Lopez", "a", cedula="555")])
    store.upsert_records([_persona("b:1", "Maria Lopez", "b", cedula="555")])

    plain = store.search_records(query="maria lopez")
    assert plain.total_matches == 2
    assert plain.results[0].also_in_count == 1

    grouped = store.search_records(query="maria lopez", group_by_entity=True)
    assert grouped.total_matches == 1
