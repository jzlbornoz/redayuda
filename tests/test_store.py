from app.models import IndexedRecord, SourceInfo
from app.store import IndexStore


def test_store_indexes_and_searches_records(tmp_path):
    store = IndexStore(tmp_path / "index.db")
    source = SourceInfo(
        id="aliado_demo",
        name="Aliado Demo",
        kind="desaparecidos",
        description="Fuente de prueba",
    )
    record = IndexedRecord(
        id="aliado_demo:1",
        record_type="persona_desaparecida",
        title="Maria Perez",
        person_name="Maria Perez",
        city="Caracas",
        source_id=source.id,
        source_name=source.name,
        tags=["persona", "desaparecida"],
    )

    store.upsert_source(source)
    store.upsert_records([record])
    store.touch_source_sync(source.id)

    response = store.search_records(query="maria caracas")

    assert response.total_matches == 1
    assert response.results[0].record.id == "aliado_demo:1"
    assert response.record_types == ["persona_desaparecida"]
