/* contribuir.js — registrar fuente (asistente). Lógica de detección/validación
 * sobre /api/connectors/preview, /schema y /proposals. DOM con clases Tailwind. */
(function () {
  "use strict";
  const { escapeHtml, fetchJSON } = window.RH;

  const form = document.getElementById("proposalForm");
  const messageArea = document.getElementById("messageArea");
  const formStatus = document.getElementById("formStatus");
  const mappingRows = document.getElementById("mappingRows");
  const contractFields = document.getElementById("contractFields");
  let targetFields = [];

  // ---------------------------------------------------------------- mensajes
  function setMessage(type, title, body = "") {
    // Monocromo: distinguir por símbolo + (solo error) borde izq. rojo.
    const mark = type === "success" ? "✓" : type === "warning" ? "⚠" : "✕";
    const tone = type === "danger"
      ? "border-l-4 border-red-600 bg-ink-50 text-ink-900"
      : "border-l-4 border-ink-900 bg-ink-50 text-ink-900";
    messageArea.innerHTML = `<div role="alert" class="border ${tone} px-4 py-3 text-sm"><strong>${mark} ${escapeHtml(title)}</strong>${body ? `<div class="mt-0.5 text-ink-600">${escapeHtml(body)}</div>` : ""}</div>`;
    messageArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  const clearMessage = () => { messageArea.innerHTML = ""; };

  function extractError(payload, fallback) {
    const d = payload && payload.detail;
    if (typeof d === "string") return d;
    if (d && d.error) return d.error;
    if (Array.isArray(d) && d.length && d[0].msg) return d[0].msg;
    return fallback;
  }

  // ---------------------------------------------------------------- validación
  function fb(field) { const l = field.closest("label"); return l ? l.querySelector(".rh-fb") : null; }
  function setInvalid(field, msg = "") { if (!field) return; field.classList.add("is-invalid"); field.setAttribute("aria-invalid", "true"); const f = fb(field); if (f && msg) f.textContent = msg; }
  function clearInvalid(field) { field.classList.remove("is-invalid"); field.removeAttribute("aria-invalid"); const f = fb(field); if (f) f.textContent = ""; }
  function clearValidation() {
    form.querySelectorAll(".is-invalid").forEach(clearInvalid);
    const me = document.getElementById("mappingError"); if (me) { me.hidden = true; me.textContent = ""; }
  }
  function markInvalid(name, msg = "") { const f = form.querySelector(`[name="${name}"]`); if (f) setInvalid(f, msg); }
  function showMappingError(msg) { const me = document.getElementById("mappingError"); if (me) { me.textContent = msg; me.hidden = false; } }

  function fillSelect(sel, values) { if (sel) sel.innerHTML = (values || []).map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join(""); }

  // ---------------------------------------------------------------- mapeo
  let seq = 0;
  function addMappingRow(target = "", source = "") {
    seq += 1;
    const row = document.createElement("div");
    row.className = "flex items-center gap-2";
    row.dataset.target = target;
    const options = ['<option value="">— campo del esquema —</option>']
      .concat(targetFields.map((f) => `<option value="${escapeHtml(f.name)}" ${f.name === target ? "selected" : ""}>${escapeHtml(f.name)}${f.required ? " *" : ""}</option>`))
      .join("");
    row.innerHTML = `
      <select class="rh-in map-target" aria-label="Campo del esquema">${options}</select>
      <span class="text-slate-300" aria-hidden="true">←</span>
      <input class="rh-in map-source" placeholder="campo en tu API" aria-label="Campo en tu API" value="${escapeHtml(source)}">
      <button type="button" class="map-remove grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-slate-400 ring-1 ring-inset ring-slate-200 hover:bg-rose-50 hover:text-rose-600" aria-label="Quitar">×</button>`;
    const select = row.querySelector(".map-target");
    select.addEventListener("change", () => { row.dataset.target = select.value; markDuplicates(); });
    row.querySelector(".map-remove").addEventListener("click", () => { row.remove(); markDuplicates(); });
    mappingRows.appendChild(row);
  }

  function markDuplicates() {
    const rows = Array.from(mappingRows.children);
    const counts = {};
    rows.forEach((r) => { const t = r.querySelector(".map-target").value.trim(); if (t) counts[t] = (counts[t] || 0) + 1; });
    const dups = [];
    rows.forEach((r) => {
      const s = r.querySelector(".map-target"); const t = s.value.trim();
      if (t && counts[t] > 1) { s.classList.add("is-invalid"); s.setAttribute("aria-invalid", "true"); if (!dups.includes(t)) dups.push(t); }
      else { s.classList.remove("is-invalid"); s.removeAttribute("aria-invalid"); }
    });
    return dups;
  }
  function markRowInvalid(target) {
    let m = false;
    Array.from(mappingRows.children).forEach((r) => { if (r.dataset.target === String(target)) { const s = r.querySelector(".map-target"); s.classList.add("is-invalid"); s.setAttribute("aria-invalid", "true"); m = true; } });
    return m;
  }
  function collectMapping() {
    const map = {};
    Array.from(mappingRows.children).forEach((r) => {
      const t = r.querySelector(".map-target").value.trim();
      const s = r.querySelector(".map-source").value.trim();
      if (t && s) map[t] = s;
    });
    return map;
  }

  // ---------------------------------------------------------------- esquema
  function toggleAuthHeader() {
    const wrap = document.getElementById("authHeaderWrap");
    const h = document.getElementById("authHeader");
    const isKey = document.getElementById("authType").value === "api_key";
    wrap.hidden = !isKey;
    if (h) { h.required = isKey; if (!isKey) clearInvalid(h); }
  }

  async function loadSchema() {
    try {
      const schema = await fetchJSON("/api/connectors/schema");
      targetFields = schema.record_fields || [];
      fillSelect(document.getElementById("kindSelect"), schema.allowed_kinds);
      fillSelect(document.getElementById("authType"), schema.auth_types);
      fillSelect(document.getElementById("pageStyle"), schema.pagination_styles);
      toggleAuthHeader();
      contractFields.innerHTML = targetFields.map((f) =>
        `<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${f.required ? "bg-brand-50 text-brand-700 ring-brand-100" : "bg-slate-100 text-slate-600 ring-slate-200"}">${escapeHtml(f.name)}${f.required ? " *" : ""}</span>`
      ).join("");
      addMappingRow("title");
      addMappingRow("person_name");
    } catch (e) {
      setMessage("danger", "No se pudo cargar el esquema", String(e));
    }
  }

  // ---------------------------------------------------------------- detección
  async function autodetect() {
    const btn = document.getElementById("detectBtn");
    const status = document.getElementById("detectStatus");
    const url = (document.getElementById("endpointUrl").value || "").trim();
    const dataPath = (document.getElementById("dataPath").value || "").trim();
    if (!url) { status.textContent = "Pega primero la URL del endpoint."; return; }
    btn.disabled = true; status.textContent = "Consultando tu endpoint…";
    try {
      const body = await fetchJSON("/api/connectors/preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint_url: url, data_path: dataPath || null }),
      });
      const suggested = body.suggested_mapping || {};
      const fields = body.fields || [];
      mappingRows.innerHTML = "";
      Object.entries(suggested).forEach(([src, tgt]) => addMappingRow(tgt, src));
      fields.filter((f) => !(f in suggested)).forEach((f) => addMappingRow("", f));
      if (!fields.length) addMappingRow("title");
      const n = Object.keys(suggested).length;
      status.textContent = `${fields.length} campos detectados (${body.count} registros). ${n} mapeados automáticamente; revisa el resto.`;
    } catch (err) {
      status.textContent = extractError(err.payload, "No se pudieron detectar los campos.");
    } finally { btn.disabled = false; }
  }

  // ---------------------------------------------------------------- envío
  async function submitForm(event) {
    event.preventDefault();
    clearMessage(); clearValidation();
    const data = new FormData(form);
    if (data.get("website")) return; // honeypot

    if (!form.checkValidity()) {
      const invalids = form.querySelectorAll(":invalid");
      invalids.forEach((el) => setInvalid(el, el.validationMessage));
      setMessage("danger", "Faltan datos obligatorios", "Revisa los campos marcados.");
      invalids[0] && invalids[0].scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const sampleField = document.getElementById("sampleResponse");
    const sampleRaw = (data.get("sample_response") || "").trim();
    if (sampleRaw) { try { JSON.parse(sampleRaw); } catch (err) { setInvalid(sampleField, `JSON inválido: ${err.message}`); setMessage("danger", "JSON de ejemplo inválido", "Corrígelo o déjalo vacío."); return; } }

    const mapping = collectMapping();
    if (!Object.keys(mapping).length) { showMappingError("Mapea al menos un campo."); setMessage("danger", "Falta el mapeo", "Mapea al menos un campo destino con su origen."); return; }
    const dups = markDuplicates();
    if (dups.length) { showMappingError(`Destinos repetidos: ${dups.join(", ")}.`); setMessage("danger", "Mapeo duplicado", `Repetidos: ${dups.join(", ")}.`); return; }

    const missing = [];
    if (!["title", "person_name", "organization"].some((f) => mapping[f])) missing.push("uno de title/person_name/organization");
    targetFields.filter((f) => f.required && !mapping[f.name]).forEach((f) => { missing.push(f.name); markRowInvalid(f.name); });
    if (missing.length) { const t = `Falta mapear: ${missing.join(", ")}.`; showMappingError(t); setMessage("danger", "Mapeo incompleto", t); return; }

    const payload = {
      source_name: data.get("source_name"), kind: data.get("kind"), description: data.get("description") || "",
      endpoint_url: data.get("endpoint_url"), http_method: data.get("http_method") || "GET",
      auth_type: data.get("auth_type") || "none", auth_header: data.get("auth_header") || null,
      data_path: data.get("data_path") || null, field_mapping: mapping,
      sample_response: data.get("sample_response") || null, docs: data.get("docs") || null,
      contact_name: data.get("contact_name") || null, contact_email: data.get("contact_email") || null,
      website: "", pagination: { style: data.get("pagination_style") || "none", page_size: Number(data.get("page_size")) || 100 },
    };

    const button = form.querySelector('[type="submit"]');
    button.disabled = true; const prev = button.textContent; button.textContent = "Enviando…"; formStatus.textContent = "";
    try {
      const res = await fetch("/api/connectors/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (res.status === 202) {
        form.reset(); clearValidation(); mappingRows.innerHTML = ""; addMappingRow("title"); addMappingRow("person_name"); toggleAuthHeader();
        document.getElementById("detectStatus").textContent = "";
        setMessage("success", "Propuesta recibida", "Gracias. Un administrador la revisará antes de activarla.");
      } else if (res.status === 429) {
        const ra = Number(res.headers.get("Retry-After"));
        setMessage("warning", "Demasiados envíos", ra > 0 ? `Reintenta en ${ra} s.` : extractError(body, "Reintenta luego."));
      } else if (res.status === 422 && Array.isArray(body.detail)) {
        let flagged = false;
        body.detail.forEach((err) => {
          const loc = err.loc || [];
          if (loc.includes("field_mapping")) { const key = loc[loc.indexOf("field_mapping") + 1]; if (key && markRowInvalid(String(key))) flagged = true; else { showMappingError(err.msg || "Revisa el mapeo."); flagged = true; } return; }
          const name = loc[loc.length - 1]; if (name) markInvalid(String(name), err.msg || "");
        });
        if (flagged) mappingRows.scrollIntoView({ behavior: "smooth", block: "center" });
        setMessage("danger", "No se pudo enviar", extractError(body, "Revisa los datos."));
      } else {
        setMessage("danger", "No se pudo enviar", extractError(body, "Revisa los datos."));
      }
    } catch (e) {
      setMessage("danger", "Error de red", String(e));
    } finally {
      button.disabled = false; button.textContent = prev;
    }
  }

  // ---------------------------------------------------------------- init
  document.getElementById("detectBtn").addEventListener("click", autodetect);
  document.getElementById("addMappingRow").addEventListener("click", () => addMappingRow());
  document.getElementById("authType").addEventListener("change", toggleAuthHeader);
  form.addEventListener("submit", submitForm);
  loadSchema();
})();
