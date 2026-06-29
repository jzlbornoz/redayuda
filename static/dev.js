/* dev.js — página de desarrolladores: esquema en vivo, curl copiable, prompts LLM. */
(function () {
  "use strict";
  const { escapeHtml, fetchJSON } = window.RH;
  const ORIGIN = location.origin;
  const promptsEl = document.getElementById("prompts");
  const schemaFieldsEl = document.getElementById("schemaFields");

  // bloque de código con botón copiar
  function codeBlock(id, code) {
    return `<div class="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
      <button type="button" data-copy="${id}" class="absolute right-2 top-2 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-white/20">Copiar</button>
      <pre id="${id}" class="overflow-x-auto p-4 pt-9 text-xs leading-relaxed text-slate-100"><code>${escapeHtml(code)}</code></pre></div>`;
  }

  function mountCode(slot, id, code) {
    const el = document.querySelector(`[data-code="${slot}"]`);
    if (el) el.innerHTML = codeBlock(id, code);
  }

  function promptCard(id, title, desc, body) {
    return `<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex items-start justify-between gap-2">
        <div><h3 class="font-semibold text-slate-900">${escapeHtml(title)}</h3>
        <p class="mt-0.5 text-sm text-slate-500">${escapeHtml(desc)}</p></div>
        <button type="button" data-copy="${id}" class="flex-shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">Copiar</button>
      </div>
      <pre id="${id}" class="mt-3 max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 ring-1 ring-slate-100"><code>${escapeHtml(body)}</code></pre></div>`;
  }

  function build(schema) {
    const fields = (schema.record_fields || []).map((f) => f.name);
    const required = (schema.record_fields || []).filter((f) => f.required).map((f) => f.name);
    const kinds = (schema.allowed_kinds || []).join(", ");
    const fieldList = fields.join(", ");
    const exampleRecord = JSON.stringify(schema.example_record || {}, null, 2);

    // chips de esquema
    schemaFieldsEl.innerHTML = (schema.record_fields || []).map((f) =>
      `<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${f.required ? "bg-brand-50 text-brand-700 ring-brand-100" : "bg-slate-100 text-slate-600 ring-slate-200"}">${escapeHtml(f.name)}${f.required ? " *" : ""}</span>`
    ).join("");

    // curl push
    mountCode("curlIngest", "curlIngest",
`curl -X POST ${ORIGIN}/api/ingest \\
  -H "content-type: application/json" \\
  -H "x-ingest-key: TU_CLAVE" \\
  -d '{
    "source": { "id": "mi_app", "name": "Mi App",
                "kind": "${(schema.allowed_kinds || ["otro"])[0]}", "description": "que aporto" },
    "records": [
${exampleRecord.split("\n").map((l) => "      " + l).join("\n")}
    ]
  }'`);

    // curl read
    mountCode("curlRead", "curlRead",
`# Buscar en todas las fuentes
curl "${ORIGIN}/api/records/search?q=centro+de+acopio&city=Caracas&limit=10"

# Buscar por cedula
curl "${ORIGIN}/api/records/search?cedula=12345678"

# Feed incremental (para sincronizar tu copia)
curl "${ORIGIN}/api/records/feed?since=0&limit=100"

# Detalle de un registro
curl "${ORIGIN}/api/records/ID_DEL_REGISTRO"`);

    // prompts
    const promptA = `Estoy colaborando en una red abierta de datos humanitarios de Venezuela.
Quiero EXPONER un endpoint de lectura en mi app para que la red sincronice mis datos.

Tarea:
1. Crea un endpoint HTTP GET publico (sin auth, CORS abierto) que devuelva JSON.
2. Lista paginada: { "items": [ {...} ], "total": <n> } con ?limit= y ?offset=.
3. Cada registro debe poder mapearse a este esquema comun: ${fieldList}
   Obligatorio al menos: ${required.join(", ") || "title / person_name / organization"}.
4. No incluyas datos sensibles innecesarios.

Cuando este listo dame la URL para registrarla en ${ORIGIN}/contribuir.`;

    const promptB = `Quiero que mi app EMPUJE sus datos a la red (ya en el esquema comun).

Endpoint: POST ${ORIGIN}/api/ingest
Cabeceras: content-type: application/json ; x-ingest-key: <MI_CLAVE>
Cuerpo:
{ "source": { "id":"mi_app","name":"Mi App","kind":"<${kinds}>","description":"..." },
  "records": [ <registros con: ${fieldList}> ] }

Ejemplo de registro:
${exampleRecord}

Tarea: agrega una funcion que mapee mis registros y haga POST por lotes
(idempotente, id estable). Maneja 401 y 5xx con reintento.`;

    const promptC = `Quiero CONSUMIR la red abierta de datos humanitarios desde mi app.

Endpoints (publicos, JSON):
- Buscar: GET ${ORIGIN}/api/records/search?q=&city=&record_type=&cedula=&limit=&offset=
- Feed:   GET ${ORIGIN}/api/records/feed?since=<cursor>&limit=
- Fuentes:GET ${ORIGIN}/api/sources
- Detalle:GET ${ORIGIN}/api/records/{id}

Cada registro trae procedencia (source_id, source_name, source_url) y entity_id para
agrupar duplicados. Tarea: integra busqueda/listado mostrando la fuente de cada dato.`;

    promptsEl.innerHTML = [
      promptCard("promptA", "A · Exponer un endpoint de lectura", "Genera el endpoint que la red sincronizará.", promptA),
      promptCard("promptB", "B · Empujar mis datos", "Tu app envía datos ya mapeados al esquema común.", promptB),
      promptCard("promptC", "C · Consumir la red", "Muestra en tu app los datos de todas las fuentes.", promptC),
    ].join("");
  }

  // copiar (delegado)
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const el = document.getElementById(btn.dataset.copy);
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.textContent);
      const prev = btn.textContent; btn.textContent = "Copiado ✓";
      setTimeout(() => { btn.textContent = prev; }, 1500);
    } catch (_) { btn.textContent = "copia manual"; }
  });

  (async () => {
    try { build(await fetchJSON("/api/connectors/schema")); }
    catch (_) { promptsEl.innerHTML = `<div class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">No se pudo cargar el esquema.</div>`; }
  })();
})();
