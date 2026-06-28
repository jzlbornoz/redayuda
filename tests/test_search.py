from datetime import datetime

from app.models import Paciente
from app.search import normalize_text, ranked_results


def test_normalize_text_matches_source_rules():
    assert normalize_text(" José  García Núñez ") == "jose garcia nunez"
    assert normalize_text("Petare / Caracas") == "petare caracas"


def test_ranked_results_prioritizes_exact_cedula():
    pacientes = [
        Paciente(
            nombre="Maria Fernanda Rojas",
            cedula=None,
            edad=7,
            hospital="Pediatria",
            registrado=datetime.fromisoformat("2026-06-27T01:05:00+00:00"),
        ),
        Paciente(
            nombre="Jose Antonio Perez Garcia",
            cedula="12345678",
            cedula_valida=True,
            edad=40,
            hospital="Hospital Universitario de Caracas",
            ciudad="Caracas",
            registrado=datetime.fromisoformat("2026-06-26T18:10:22+00:00"),
        ),
    ]

    results = ranked_results(pacientes, query="12345678")

    assert results[0][2].nombre == "Jose Antonio Perez Garcia"
    assert "cedula_exacta" in results[0][1]


def test_ranked_results_supports_filters():
    pacientes = [
        Paciente(nombre="Ana Perez", edad=20, hospital="Hospital Central", ciudad="Valencia"),
        Paciente(nombre="Ana Perez", edad=20, hospital="Hospital Sur", ciudad="Caracas"),
    ]

    results = ranked_results(pacientes, query="Ana", ciudad="Valencia")

    assert len(results) == 1
    assert results[0][2].hospital == "Hospital Central"

