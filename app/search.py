import re
import unicodedata

from .models import Paciente


TOKEN_RE = re.compile(r"[a-z0-9]+")


def normalize_text(value):
    if value is None:
        return ""

    text = str(value).lower().replace("ñ", "n")
    text = unicodedata.normalize("NFD", text)
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def tokenize(value):
    return TOKEN_RE.findall(normalize_text(value))


def digits_only(value):
    return re.sub(r"\D+", "", str(value or ""))


def _contains_all_tokens(text, tokens):
    if not tokens:
        return True
    text_tokens = set(tokenize(text))
    return all(token in text_tokens for token in tokens)


def _add_score(score, reasons, amount, reason):
    score += amount
    if reason not in reasons:
        reasons.append(reason)
    return score


def matches_filters(
    paciente,
    ciudad=None,
    hospital=None,
    edad=None,
    cedula=None,
):
    if ciudad and normalize_text(ciudad) not in normalize_text(paciente.ciudad):
        return False

    if hospital and normalize_text(hospital) not in normalize_text(paciente.hospital):
        return False

    if edad is not None and paciente.edad != edad:
        return False

    if cedula and digits_only(cedula) != digits_only(paciente.cedula):
        return False

    return True


def rank_patient(paciente, query):
    query = query or ""
    normalized_query = normalize_text(query)
    tokens = tokenize(query)
    query_digits = digits_only(query)

    if not normalized_query and not query_digits:
        return 1, ["sin_consulta"]

    score = 0
    reasons = []

    patient_cedula = digits_only(paciente.cedula)
    if query_digits and patient_cedula:
        if query_digits == patient_cedula:
            score = _add_score(score, reasons, 1000, "cedula_exacta")
        elif patient_cedula.startswith(query_digits):
            score = _add_score(score, reasons, 450, "cedula_prefijo")

    fields = {
        "nombre": paciente.nombre,
        "hospital": paciente.hospital,
        "ciudad": paciente.ciudad,
        "detalle": paciente.detalle,
    }
    normalized_fields = {
        field: normalize_text(value) for field, value in fields.items()
    }

    if normalized_query:
        if normalized_query == normalized_fields["nombre"]:
            score = _add_score(score, reasons, 650, "nombre_exacto")
        elif normalized_query in normalized_fields["nombre"]:
            score = _add_score(score, reasons, 420, "nombre_contiene")

    if tokens:
        field_weights = {
            "nombre": 70,
            "hospital": 25,
            "ciudad": 25,
            "detalle": 15,
        }
        for field, weight in field_weights.items():
            field_tokens = set(tokenize(fields[field]))
            matched = [token for token in tokens if token in field_tokens]
            if matched:
                score = _add_score(
                    score,
                    reasons,
                    weight * len(matched),
                    "%s_token" % field,
                )

        if _contains_all_tokens(paciente.nombre, tokens):
            score = _add_score(score, reasons, 180, "nombre_tokens_completos")

    if paciente.edad is not None and str(paciente.edad) in tokens:
        score = _add_score(score, reasons, 60, "edad")

    return score, reasons


def ranked_results(
    pacientes,
    query="",
    ciudad=None,
    hospital=None,
    edad=None,
    cedula=None,
):
    results = []

    for paciente in pacientes:
        if not matches_filters(
            paciente,
            ciudad=ciudad,
            hospital=hospital,
            edad=edad,
            cedula=cedula,
        ):
            continue

        combined_query = " ".join(part for part in [query, cedula or ""] if part).strip()
        score, reasons = rank_patient(paciente, combined_query)
        if score <= 0:
            continue

        results.append((score, reasons, paciente))

    return sorted(
        results,
        key=lambda item: (
            -item[0],
            normalize_text(item[2].nombre),
            item[2].registrado.isoformat() if item[2].registrado else "",
        ),
    )
