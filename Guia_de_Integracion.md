# Guía de Integración — API Hospitales en Venezuela · v1.1

Documento técnico para integrar el padrón de **personas ingresadas/atendidas en centros de salud** (fuente: **hospitalesenvenezuela.com**) con una plataforma central que **cruza (cotea)** múltiples fuentes (desaparecidos, pacientes, fallecidos, etc.).

API REST de **solo lectura**, JSON, autenticada por clave. La clave **no** da acceso a la base de datos ni permite escribir, modificar o borrar nada.

---

## 1. Alcance y significado de los datos (leer primero)

Entender **qué representa** este padrón es clave para cruzarlo correctamente.

- **Qué contiene:** personas **registradas como ingresadas o atendidas en un centro de salud** tras el sismo. Es decir, personas **localizadas y presentes en un hospital**.
- **Qué NO es:** **no** es un registro de desaparecidos, **ni** de fallecidos. Es el universo *"localizado / ingresado en un centro de salud"*.
- **Privacidad — importante:** el padrón **no publica estado de salud ni condición** (estable/grave/fallecido). Aparecer en la lista significa únicamente **presencia registrada en un centro**, no un diagnóstico. La integración debe respetar esto y **no** inferir condición médica.
- **Por qué es valioso para el cotejo:**
  - Si una persona figura como **desaparecida** en otra fuente y **aparece aquí** (por cédula o nombre+edad), significa que **fue localizada con vida en un hospital** → es el cruce de mayor valor humanitario.
  - Permite **depurar** listas de desaparecidos (sacar a quienes ya están ubicados).
  - Cruzado con otras fuentes, ayuda a **completar** datos faltantes (cédula, contacto, centro).

| Fuente | Universo | Esta API |
|--------|----------|----------|
| hospitalesenvenezuela.com | Ingresados / atendidos en centros de salud (localizados) | ✅ Esta |
| Webs de desaparecidos | Personas buscadas / sin localizar | (otra fuente) |
| Registros de fallecidos | Personas fallecidas | (otra fuente) |

---

## 2. Inicio rápido

```bash
curl "https://ozuxfepfkvnxkywdsqxy.supabase.co/functions/v1/export-pacientes?limit=100" \
  -H "x-api-key: TU_CLAVE_API"
```

---

## 3. Endpoint

| | |
|---|---|
| **URL base** | `https://ozuxfepfkvnxkywdsqxy.supabase.co/functions/v1/export-pacientes` |
| **Métodos** | `GET` (query) · `POST` (cuerpo JSON) |
| **Formato** | JSON (UTF-8) |
| **Transporte** | HTTPS / TLS obligatorio |
| **Versión** | `1.1` (campo `api_version` en cada respuesta) |

---

## 4. Autenticación

Clave de API de 256 bits, individual por aliado. Se envía:

| Forma | Cómo | Recomendación |
|-------|------|---------------|
| Header | `x-api-key: TU_CLAVE_API` | ✅ Preferida |
| Query  | `?key=TU_CLAVE_API` | Solo pruebas |

Secreta, revocable al instante, auditada. Si se filtra, se emite otra sin afectar a los demás.

---

## 5. Parámetros

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `limit`  | entero 1–5000 | 1000 | Registros por respuesta |
| `offset` | entero ≥0 | 0 | Inicio (paginación) |
| `desde`  | ISO 8601 | — | Solo registros posteriores a esa fecha (incremental). Alias `updated_since` |

---

## 6. Paginación

`total` viene en la respuesta. Aumentar `offset` en pasos de `limit` hasta cubrir `total`.

## 7. Sincronización incremental y chequeo de frescura

- **Incremental:** guarda la hora de tu última sync y pásala en `desde`. Recomendado: sync **completa** cada 24 h (capta correcciones/depuración) + **incremental** cada pocos minutos.
- **Frescura sin descargar:** llama con `limit=1` y lee `total` (cuántos hay) y `generado` (hora del corte). Llamada mínima para saber si hay novedades.

---

## 8. Respuesta y diccionario de datos

*(valores ilustrativos)*

```json
{
  "ok": true,
  "api_version": "1.1",
  "fuente": "hospitalesenvenezuela.com",
  "generado": "2026-06-27T03:40:00Z",
  "total": 27900,
  "offset": 0,
  "limit": 100,
  "count": 100,
  "pacientes": [
    {
      "nombre": "José Antonio Pérez García",
      "cedula": "12345678",
      "cedula_valida": true,
      "edad": 40,
      "hospital": "Hospital Universitario de Caracas",
      "hospital_verificado": true,
      "ciudad": "Caracas",
      "detalle": "40 años · Petare",
      "contacto": "04141234567",
      "nota": null,
      "fuente": "hospitalesenvenezuela.com",
      "registrado": "2026-06-26T18:10:22Z"
    }
  ]
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `nombre` | string | Nombre completo, normalizado a Título (original intacto en la base) |
| `cedula` | string \| null | Cédula completa. `null` si no tiene/no se registró |
| `cedula_valida` | bool \| null | `true` si está en el rango venezolano (1.000.000–40.000.000). `false` = fuera de rango (extranjera/antigua/por revisar). `null` si no hay cédula |
| `edad` | número \| null | Edad estimada (derivada de `detalle`) |
| `hospital` | string | Centro de salud |
| `hospital_verificado` | bool | `true` = coincide con catálogo oficial; `false` = nombre aportado, por verificar |
| `ciudad` | string \| null | Ciudad del centro |
| `detalle` | string \| null | Texto libre: edad, sector/origen, área, notas |
| `contacto` | string \| null | Teléfono del familiar que registró |
| `nota` | string \| null | Contexto cuando el centro no está verificado (dato colaborativo en verificación) |
| `fuente` | string | `"hospitalesenvenezuela.com"` (acompaña a cada registro) |
| `registrado` | string ISO 8601 | Fecha/hora de registro |

---

## 9. Guía de cotejo (cross-matching) — cómo cruzar con tus otras fuentes

### 9.1 Claves de coincidencia (en orden de confianza)

1. **Cédula** (`cedula` con `cedula_valida = true`) → **match fuerte**. Es el identificador único nacional.
2. **Nombre normalizado + edad** → match para personas **sin** cédula, o como refuerzo. Súbele confianza si coinciden también `hospital`/`ciudad`.
3. **Solo nombre normalizado** → match **débil** (posible homónimo). Usar únicamente como candidato a revisión, no como confirmación.

### 9.2 Normalización de nombres (replica EXACTA de la fuente)

Para que tus cruces por nombre coincidan con cómo se almacena aquí, normaliza **igual** en ambos lados:

```js
// 1) Normalizar: minúsculas, sin acentos, ñ→n, solo alfanumérico, espacios colapsados
function normalizar(nombre) {
  return (nombre || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, " ")
    .trim().replace(/\s+/g, " ");
}

// 2) Clave independiente del orden (empareja "García José" con "José García")
function claveNombre(nombre) {
  return normalizar(nombre).split(" ").filter(Boolean).sort().join(" ");
}

// 3) ¿Coinciden dos personas?
function esMatch(a, b) {
  const cedulaA = a.cedula_valida ? a.cedula : null;
  const cedulaB = b.cedula_valida ? b.cedula : null;
  if (cedulaA && cedulaB) return cedulaA === cedulaB;        // match fuerte
  return claveNombre(a.nombre) === claveNombre(b.nombre)      // match por nombre+edad
      && a.edad != null && a.edad === b.edad;
}
```

### 9.3 Recomendaciones para la web central

- **Prioriza** matches con `cedula_valida = true`. Trátalos como confirmados.
- Para sin cédula, exige **nombre normalizado + edad** (y de ser posible mismo hospital/ciudad) antes de unificar.
- Marca los matches por **solo nombre** como *"posible, requiere revisión"*; no los fusiones automáticamente (riesgo de homónimos).
- Respeta `hospital_verificado` y `nota`: un centro no verificado es dato colaborativo en proceso, no un error.
- **Idempotencia:** usa `cedula` (o `claveNombre+edad`) como clave estable para no duplicar al re-sincronizar.
- **No infieras condición** (vivo/grave/fallecido) a partir de la presencia en este padrón.

---

## 10. Códigos de respuesta

| HTTP | `error_code` | Significado |
|------|--------------|-------------|
| 200 | — | OK |
| 400 | `parametros_invalidos` | `offset`/`limit` fuera de rango |
| 401 | `falta_clave` / `clave_invalida` | Clave ausente o inválida/revocada |
| 429 | `rate_limit` | Excediste el límite (§11). Reintenta con backoff |
| 500 | `error_interno` | Error temporal. Reintenta |

Errores: `{ "ok": false, "error_code": "...", "error": "mensaje" }`.

---

## 11. Límites de uso

- **120 solicitudes/minuto por clave.** Suficiente para descarga completa (~6 llamadas) o sync continua. Solo frena abuso.
- Al exceder → `429`; espera y reintenta (exponential backoff).
- Uso auditado por clave.

---

## 12. Arquitectura, seguridad e integridad

- **PostgreSQL** (Supabase) con *Row Level Security* en **denegación total**: ningún cliente toca las tablas; todo pasa por funciones controladas y auditadas.
- **Edge function** dedicada valida la clave y delega en un procedimiento de **solo lectura**; la credencial maestra nunca sale del servidor.
- **Superficie mínima:** solo se entrega el padrón. Sin rutas de escritura, sin acceso a otras tablas, sin introspección de esquema.
- **Defensa:** TLS, claves de 256 bits revocables, rate limiting, validación de parámetros, auditoría, errores que no filtran detalles internos.
- **Integridad:** la normalización ocurre **en lectura**; el dato original queda **intacto** en la base (vista reversible, sin pérdida). Cédulas contrastadas al rango venezolano (se marcan, no se borran). Depuración continua de duplicados.

---

## 13. Términos de uso

Datos personales (`cedula`, `contacto`). El portal aliado se compromete a:

1. Usarlos **solo** para localizar personas y unificar información humanitaria.
2. **Conservar la atribución** `fuente: "hospitalesenvenezuela.com"` que acompaña a cada registro.
3. **Proteger** los datos y no cederlos a terceros no autorizados.
4. **No** usarlos con fines comerciales/publicitarios.
5. Atender correcciones/eliminaciones canalizadas por el equipo de origen.

Incumplir → revocación inmediata de la clave.

---

## 14. Versionado

- **v1.1** — `cedula_valida` (rango venezolano), `nota` de verificación, atribución `fuente` por registro, guía de cotejo.
- **v1.0** — Lectura paginada, sync incremental, normalización, `hospital_verificado`, rate limiting, auditoría.

---

*Hospitales en Venezuela · contacto técnico para solicitar/revocar claves.*
