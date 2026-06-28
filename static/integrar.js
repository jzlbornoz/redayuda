"use strict";

const promptsEl = document.getElementById("prompts");
const schemaFieldsEl = document.getElementById("schemaFields");
const healthStatus = document.getElementById("healthStatus");
const ORIGIN = location.origin;

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function markActiveNav() {
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.getAttribute("href") === location.pathname) {
      a.classList.add("active");
      a.setAttribute("aria-current", "page");
    }
  });
}

async function loadHealth() {
  try {
    const d = await (await fetch("/api/network/stats")).json();
    if (d.total_records > 0) {
      healthStatus.className = "status-pill status-ok";
      healthStatus.textContent = "Indice activo";
    } else {
      healthStatus.className = "status-pill status-warn";
      healthStatus.textContent = "Indice vacio";
    }
  } catch {
    healthStatus.className = "status-pill status-warn";
    healthStatus.textContent = "Sin conexion";
  }
}

function promptCard(id, icon, title, desc, body) {
  return `
    <div class="card">
      <div class="card-body p-3 p-lg-4">
        <div class="d-flex align-items-start justify-content-between gap-2 mb-2">
          <h3 class="h6 mb-0"><i class="bi ${icon} me-1" aria-hidden="true"></i>${esc(title)}</h3>
          <button class="btn btn-sm btn-outline-primary copy-btn" data-target="${id}" type="button">
            <i class="bi bi-clipboard me-1" aria-hidden="true"></i>Copiar
          </button>
        </div>
        <p class="text-muted small">${esc(desc)}</p>
        <pre class="doc-block mb-0" id="${id}">${esc(body)}</pre>
      </div>
    </div>`;
}

function buildPrompts(schema) {
  const fields = (schema.record_fields || []).map((f) => f.name);
  const required = (schema.record_fields || []).filter((f) => f.required).map((f) => f.name);
  const kinds = (schema.allowed_kinds || []).join(", ");
  const fieldList = fields.join(", ");

  const promptA = `Estoy colaborando en una red abierta de datos humanitarios de Venezuela.
Quiero EXPONER un endpoint de lectura en mi app para que la red pueda sincronizar mis datos.

Tarea:
1. Crea un endpoint HTTP GET publico (sin auth, con CORS abierto) que devuelva JSON.
2. Debe devolver una lista paginada de mis registros. Formato sugerido:
   { "items": [ { ...registro... } ], "total": <n> }  con parametros ?limit= y ?offset=.
3. Cada registro debe poder mapearse a este esquema comun (campos):
   ${fieldList}
   Obligatorio al menos: ${required.join(", ") || "title o person_name u organization"}.
   No es obligatorio renombrar tus campos: basta con que sean estables y consistentes.
4. No incluyas datos sensibles innecesarios; respeta la privacidad de las personas.

Cuando este listo, dame la URL del endpoint para registrarla en ${ORIGIN}/contribuir
(ahi pego la URL, detecto los campos y mapeo cada uno al esquema comun).`;

  const exampleRecord = JSON.stringify(schema.example_record || {}, null, 2);
  const promptB = `Estoy colaborando en una red abierta de datos humanitarios de Venezuela.
Quiero que mi app EMPUJE sus datos a la red (ya traducidos al esquema comun).

Endpoint destino: POST ${ORIGIN}/api/ingest
Cabeceras: content-type: application/json ; x-ingest-key: <MI_CLAVE_DE_INGESTA>
(la clave la solicito al equipo de la red).

Cuerpo (JSON):
{
  "source": { "id": "mi_app", "name": "Mi App", "kind": "<uno de: ${kinds}>",
              "description": "que datos aporto" },
  "records": [ <cada registro con estos campos del esquema: ${fieldList}> ]
}

Ejemplo de un registro valido:
${exampleRecord}

Tarea: agrega a mi app una funcion que, periodicamente o al cambiar datos, mapee mis
registros a ese esquema y haga el POST por lotes (idempotente: usa un id estable por
registro). Maneja errores 401 (clave) y 5xx con reintento.`;

  const promptC = `Quiero CONSUMIR la red abierta de datos humanitarios de Venezuela desde mi app.

Endpoints (publicos, JSON):
- Buscar: GET ${ORIGIN}/api/records/search?q=texto&city=&record_type=&cedula=&limit=&offset=
- Feed incremental (para sincronizar): GET ${ORIGIN}/api/records/feed?since=<cursor>&limit=
- Fuentes: GET ${ORIGIN}/api/sources
- Detalle: GET ${ORIGIN}/api/records/{id}

Cada registro trae su procedencia (source_id, source_name, source_url) y, si aplica,
entity_id para agrupar duplicados entre fuentes. Tarea: integra una busqueda/listado en
mi app consumiendo estos endpoints, mostrando la fuente de cada dato.`;

  promptsEl.innerHTML = [
    promptCard("promptA", "bi-box-arrow-in-down", "A. Crear un endpoint de lectura en mi app",
      "Pega esto en Claude Code (u otro LLM) sobre tu proyecto. Genera el endpoint que la red sincronizara.", promptA),
    promptCard("promptB", "bi-box-arrow-up", "B. Empujar mis datos a la red",
      "Para que tu app envie sus datos ya mapeados al esquema comun.", promptB),
    promptCard("promptC", "bi-search", "C. Consumir la red en mi app",
      "Para mostrar en tu app los datos federados de todas las fuentes.", promptC),
  ].join("");

  promptsEl.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = document.getElementById(btn.dataset.target).textContent;
      try {
        await navigator.clipboard.writeText(text);
        const prev = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Copiado';
        setTimeout(() => { btn.innerHTML = prev; }, 1600);
      } catch {
        btn.textContent = "Selecciona y copia manualmente";
      }
    });
  });

  schemaFieldsEl.innerHTML =
    '<div class="d-flex flex-wrap gap-2">' +
    (schema.record_fields || []).map((f) =>
      `<span class="badge ${f.required ? "text-bg-primary" : "text-bg-secondary"}">${esc(f.name)}${f.required ? " *" : ""}</span>`
    ).join("") + "</div>";
}

async function init() {
  markActiveNav();
  loadHealth();
  try {
    const schema = await (await fetch("/api/connectors/schema")).json();
    buildPrompts(schema);
  } catch (e) {
    promptsEl.innerHTML = '<div class="alert alert-danger">No se pudo cargar el esquema.</div>';
  }
}
init();
