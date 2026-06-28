"""Resolucion de entidades ("guardar separado + enlazar").

Funciones puras de matching, sin acceso a la base de datos. Reusan la
normalizacion de `app/search.py` para no duplicar reglas. Cada registro
conserva su procedencia; el enlace solo agrupa registros que probablemente
refieren a la misma persona.
"""

from .search import digits_only, normalize_text


def match_keys(record):
    """Claves de bloqueo para hallar candidatos. record es dict-like.

    Devuelve [(key, kind)]. Vacio para registros que no son personas (sin
    person_name ni cedula), p.ej. centros de acopio.
    """
    cedula = digits_only(record.get("cedula"))
    name = normalize_text(record.get("person_name"))
    if not name and not cedula:
        return []

    keys = []
    if cedula:
        keys.append(("cedula:%s" % cedula, "cedula"))
    if name:
        city = normalize_text(record.get("city"))
        if city:
            keys.append(("nombre_ciudad:%s|%s" % (name, city), "nombre_ciudad"))
        age = record.get("age")
        if age is not None:
            keys.append(("nombre_edad:%s|%s" % (name, age), "nombre_edad"))
    return keys


def match_decision(a, b):
    """Decide si dos registros son la misma entidad.

    Devuelve (signal, confidence, score) o None. Regla anti-falso-positivo:
    si ambos tienen cedula y difieren, NUNCA se enlazan.
    """
    cedula_a = digits_only(a.get("cedula"))
    cedula_b = digits_only(b.get("cedula"))

    if cedula_a and cedula_b:
        if cedula_a == cedula_b:
            return ("cedula", "strong", 1000)
        return None  # conflicto de cedula: desambiguador fuerte

    name_a = normalize_text(a.get("person_name"))
    name_b = normalize_text(b.get("person_name"))
    if not name_a or name_a != name_b:
        return None

    city_a = normalize_text(a.get("city"))
    city_b = normalize_text(b.get("city"))
    if city_a and city_a == city_b:
        return ("nombre_ciudad", "weak", 300)

    age_a = a.get("age")
    age_b = b.get("age")
    if age_a is not None and age_a == age_b:
        return ("nombre_edad", "weak", 250)

    return None


def override_key(record_a, record_b):
    """Clave canonica (ordenada) para un override manual entre dos registros."""
    return tuple(sorted((record_a, record_b)))
