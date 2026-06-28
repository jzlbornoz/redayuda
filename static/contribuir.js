"use strict";

const form = document.getElementById("proposalForm");
const messageArea = document.getElementById("messageArea");
const formStatus = document.getElementById("formStatus");
const mappingRows = document.getElementById("mappingRows");
const contractFields = document.getElementById("contractFields");
const exampleRequest = document.getElementById("exampleRequest");
const healthStatus = document.getElementById("healthStatus");

let targetFields = [];

/* ---------- utilidades ---------- */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setMessage(type, title, body = "") {
  // type: success | danger | warning
  const icon =
    type === "success"
      ? "bi-check-circle"
      : type === "warning"
        ? "bi-exclamation-triangle"
        : "bi-exclamation-triangle";
  messageArea.innerHTML = `
    <div class="alert alert-${type} d-flex align-items-start gap-2" role="alert">
      <i class="bi ${icon} fs-5 lh-1"></i>
      <div>
        <strong>${escapeHtml(title)}</strong>
        ${body ? `<div class="small mb-0">${escapeHtml(body)}</div>` : ""}
      </div>
    </div>
  `;
  messageArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearMessage() {
  messageArea.innerHTML = "";
}

function extractError(payload, fallback) {
  const detail = payload && payload.detail;
  if (typeof detail === "string") return detail;
  if (detail && detail.error) return detail.error;
  if (Array.isArray(detail) && detail.length && detail[0].msg) return detail[0].msg;
  return fallback;
}

function fillSelect(select, values) {
  if (!select) return;
  select.innerHTML = (values || [])
    .map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)
    .join("");
}

let feedbackIdSeq = 0;

function setInvalid(field, message = "") {
  if (!field) return;
  field.classList.add("is-invalid");
  field.setAttribute("aria-invalid", "true");
  const feedback = field.parentElement.querySelector(".invalid-feedback");
  if (feedback) {
    if (message) feedback.textContent = message;
    if (!feedback.id) feedback.id = `invfb-${++feedbackIdSeq}`;
    const describedBy = (field.getAttribute("aria-describedby") || "")
      .split(/\s+/)
      .filter(Boolean);
    if (!describedBy.includes(feedback.id)) describedBy.push(feedback.id);
    field.setAttribute("aria-describedby", describedBy.join(" "));
  }
}

function clearFieldInvalid(field) {
  field.classList.remove("is-invalid");
  field.removeAttribute("aria-invalid");
  const feedback = field.parentElement.querySelector(".invalid-feedback");
  if (feedback && feedback.id) {
    const describedBy = (field.getAttribute("aria-describedby") || "")
      .split(/\s+/)
      .filter((id) => id && id !== feedback.id);
    if (describedBy.length) field.setAttribute("aria-describedby", describedBy.join(" "));
    else field.removeAttribute("aria-describedby");
  }
}

function clearValidation() {
  form.querySelectorAll(".is-invalid").forEach(clearFieldInvalid);
  const mappingError = document.getElementById("mappingError");
  if (mappingError) {
    mappingError.hidden = true;
    mappingError.textContent = "";
  }
}

function markInvalid(name, message = "") {
  const field = form.querySelector(`[name="${name}"]`);
  if (!field) return;
  setInvalid(field, message);
}

function showMappingError(message) {
  const mappingError = document.getElementById("mappingError");
  if (!mappingError) return;
  mappingError.textContent = message;
  mappingError.hidden = false;
}

/* ---------- navbar + health ---------- */

function markActiveNav() {
  const path = location.pathname;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const href = link.getAttribute("href");
    if (href === path || (href === "/contribuir" && path.startsWith("/contribuir"))) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
  });
}

async function checkHealth() {
  try {
    const response = await fetch("/api/network/stats");
    if (!response.ok) throw new Error("stats no disponible");
    const data = await response.json();
    if (data && Number(data.total_records) > 0) {
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

/* ---------- mapeo de campos ---------- */

let mappingRowSeq = 0;

function addMappingRow(target = "", source = "") {
  const rowId = `maprow-${++mappingRowSeq}`;
  const row = document.createElement("div");
  row.className = "mapping-row row g-2 align-items-start align-items-lg-center";
  row.dataset.rowId = rowId;
  row.dataset.target = target;
  const options = ['<option value="">— campo destino —</option>']
    .concat(
      targetFields.map(
        (f) =>
          `<option value="${escapeHtml(f.name)}" ${f.name === target ? "selected" : ""}>${escapeHtml(f.name)}${f.required ? " *" : ""}</option>`
      )
    )
    .join("");
  row.innerHTML = `
    <div class="col-12 col-lg-5">
      <select class="form-select form-select-sm map-target" data-row-id="${rowId}" name="map_target_${mappingRowSeq}" aria-label="Campo del esquema">${options}</select>
    </div>
    <div class="col-auto text-muted px-0 d-none d-lg-flex align-items-center" aria-hidden="true"><i class="bi bi-arrow-left-short"></i></div>
    <div class="col-12 col-lg">
      <input class="form-control form-control-sm map-source" data-row-id="${rowId}" name="map_source_${mappingRowSeq}" placeholder="campo en tu API" aria-label="Campo en tu API" value="${escapeHtml(source)}">
    </div>
    <div class="col-auto">
      <button type="button" class="btn btn-outline-danger btn-sm map-remove" aria-label="Quitar campo">
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
    </div>
  `;
  const select = row.querySelector(".map-target");
  select.addEventListener("change", () => {
    row.dataset.target = select.value;
    markDuplicateTargets();
  });
  row.querySelector(".map-remove").addEventListener("click", () => {
    row.remove();
    markDuplicateTargets();
  });
  mappingRows.appendChild(row);
}

// Marca las filas cuyo campo destino esta repetido. Devuelve la lista de
// destinos duplicados (para mensajes).
function markDuplicateTargets() {
  const counts = {};
  const rows = Array.from(mappingRows.querySelectorAll(".mapping-row"));
  rows.forEach((row) => {
    const target = row.querySelector(".map-target").value.trim();
    if (target) counts[target] = (counts[target] || 0) + 1;
  });
  const duplicates = [];
  rows.forEach((row) => {
    const select = row.querySelector(".map-target");
    const target = select.value.trim();
    if (target && counts[target] > 1) {
      select.classList.add("is-invalid");
      select.setAttribute("aria-invalid", "true");
      if (!duplicates.includes(target)) duplicates.push(target);
    } else {
      select.classList.remove("is-invalid");
      select.removeAttribute("aria-invalid");
    }
  });
  return duplicates;
}

// Resalta la fila cuyo destino coincide (para errores 422 de field_mapping).
function markMappingRowInvalid(targetName) {
  const rows = Array.from(mappingRows.querySelectorAll(".mapping-row"));
  let marked = false;
  rows.forEach((row) => {
    if (row.dataset.target && row.dataset.target === String(targetName)) {
      const select = row.querySelector(".map-target");
      select.classList.add("is-invalid");
      select.setAttribute("aria-invalid", "true");
      marked = true;
    }
  });
  return marked;
}

function collectMapping() {
  const mapping = {};
  mappingRows.querySelectorAll(".mapping-row").forEach((row) => {
    const target = row.querySelector(".map-target").value.trim();
    const source = row.querySelector(".map-source").value.trim();
    if (target && source) mapping[target] = source;
  });
  return mapping;
}

/* ---------- esquema ---------- */

async function loadSchema() {
  try {
    const response = await fetch("/api/connectors/schema");
    const schema = await response.json();
    targetFields = schema.record_fields || [];

    fillSelect(document.getElementById("kindSelect"), schema.allowed_kinds);
    fillSelect(document.getElementById("authType"), schema.auth_types);
    fillSelect(document.getElementById("pageStyle"), schema.pagination_styles);
    toggleAuthHeader();

    contractFields.innerHTML = targetFields
      .map(
        (f) => `
          <li class="list-group-item d-flex align-items-center justify-content-between px-0">
            <code>${escapeHtml(f.name)}</code>
            ${f.required ? '<span class="badge text-bg-primary">obligatorio</span>' : ""}
          </li>`
      )
      .join("");

    exampleRequest.textContent = JSON.stringify(schema.example_request, null, 2);

    addMappingRow("title");
    addMappingRow("person_name");
  } catch (error) {
    contractFields.innerHTML = "";
    exampleRequest.textContent = "";
    setMessage("danger", "No se pudo cargar el esquema", String(error));
  }
}

function toggleAuthHeader() {
  const wrap = document.getElementById("authHeaderWrap");
  const authHeader = document.getElementById("authHeader");
  const isApiKey = document.getElementById("authType").value === "api_key";
  wrap.hidden = !isApiKey;
  if (authHeader) {
    authHeader.required = isApiKey;
    if (!isApiKey) clearFieldInvalid(authHeader);
  }
}

/* ---------- envio ---------- */

async function submitForm(event) {
  event.preventDefault();
  clearMessage();
  clearValidation();

  const data = new FormData(form);

  if (data.get("website")) return; // honeypot: bot detectado, ignorar en silencio

  // Validacion nativa: vuelca validationMessage en cada feedback y enfoca el
  // primer campo invalido.
  if (!form.checkValidity()) {
    const invalids = form.querySelectorAll(":invalid");
    invalids.forEach((el) => setInvalid(el, el.validationMessage));
    setMessage("danger", "Faltan datos obligatorios", "Revisa los campos marcados en rojo.");
    const first = invalids[0];
    if (first) {
      first.scrollIntoView({ behavior: "smooth", block: "center" });
      first.focus({ preventScroll: true });
    }
    return;
  }

  // Validacion del JSON de ejemplo (si no esta vacio).
  const sampleField = document.getElementById("sampleResponse");
  const sampleRaw = (data.get("sample_response") || "").trim();
  if (sampleRaw) {
    try {
      JSON.parse(sampleRaw);
    } catch (err) {
      setInvalid(sampleField, `JSON invalido: ${err.message}`);
      setMessage("danger", "JSON de ejemplo invalido", "Corrige el ejemplo de respuesta o dejalo vacio.");
      sampleField.scrollIntoView({ behavior: "smooth", block: "center" });
      sampleField.focus({ preventScroll: true });
      return;
    }
  }

  const mapping = collectMapping();
  if (!Object.keys(mapping).length) {
    showMappingError("Mapea al menos un campo destino con su campo de origen.");
    setMessage("danger", "Falta el mapeo", "Mapea al menos un campo destino con su campo de origen.");
    document.getElementById("mappingRows").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  // Destinos duplicados.
  const duplicates = markDuplicateTargets();
  if (duplicates.length) {
    showMappingError(`Campos destino repetidos: ${duplicates.join(", ")}. Usa cada destino una sola vez.`);
    setMessage("danger", "Mapeo duplicado", `Hay campos destino repetidos: ${duplicates.join(", ")}.`);
    document.getElementById("mappingRows").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  // Regla del esquema: al menos uno de title/person_name/organization y todos
  // los campos required mapeados.
  const missing = [];
  const anchors = ["title", "person_name", "organization"];
  if (!anchors.some((f) => mapping[f])) {
    missing.push("uno de title/person_name/organization");
  }
  targetFields
    .filter((f) => f.required && !mapping[f.name])
    .forEach((f) => {
      missing.push(f.name);
      markMappingRowInvalid(f.name);
    });
  if (missing.length) {
    const text = `Falta mapear: ${missing.join(", ")}.`;
    showMappingError(text);
    setMessage("danger", "Mapeo incompleto", text);
    document.getElementById("mappingRows").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const payload = {
    source_name: data.get("source_name"),
    kind: data.get("kind"),
    description: data.get("description") || "",
    endpoint_url: data.get("endpoint_url"),
    http_method: data.get("http_method") || "GET",
    auth_type: data.get("auth_type") || "none",
    auth_header: data.get("auth_header") || null,
    data_path: data.get("data_path") || null,
    field_mapping: mapping,
    sample_response: data.get("sample_response") || null,
    docs: data.get("docs") || null,
    contact_name: data.get("contact_name") || null,
    contact_email: data.get("contact_email") || null,
    website: "",
    pagination: {
      style: data.get("pagination_style") || "none",
      page_size: Number(data.get("page_size")) || 100,
    },
  };

  const button = form.querySelector('[type="submit"]');
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML =
    '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Enviando...';
  formStatus.textContent = "Enviando...";

  try {
    const response = await fetch("/api/connectors/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));

    if (response.status === 202) {
      form.reset();
      clearValidation();
      mappingRows.innerHTML = "";
      addMappingRow("title");
      addMappingRow("person_name");
      toggleAuthHeader();
      formStatus.textContent = "";
      setMessage(
        "success",
        "Propuesta recibida",
        "Gracias. Un administrador revisara tu fuente antes de activarla."
      );
    } else if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const msg =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? `Reintenta en ${retryAfter} segundos.`
          : extractError(body, "Reintenta luego.");
      setMessage("warning", "Demasiados envios", msg);
    } else if (response.status === 422) {
      // marcar campos invalidos cuando el detalle lo indique
      const detail = body && body.detail;
      let mappingFlagged = false;
      if (Array.isArray(detail)) {
        detail.forEach((err) => {
          const loc = err.loc || [];
          if (loc.includes("field_mapping")) {
            // el ultimo segmento suele ser la clave destino del mapeo
            const idx = loc.indexOf("field_mapping");
            const targetKey = loc[idx + 1];
            if (targetKey && markMappingRowInvalid(String(targetKey))) {
              mappingFlagged = true;
            } else {
              showMappingError(err.msg || "Revisa el mapeo de campos.");
              mappingFlagged = true;
            }
            return;
          }
          const name = loc[loc.length - 1];
          if (name) markInvalid(String(name), err.msg || "");
        });
      }
      if (mappingFlagged) {
        document.getElementById("mappingRows").scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setMessage("danger", "No se pudo enviar", extractError(body, "Revisa los datos del formulario."));
    } else {
      setMessage("danger", "No se pudo enviar", extractError(body, "Revisa los datos del formulario."));
    }
  } catch (error) {
    setMessage("danger", "Error de red", String(error));
  } finally {
    button.disabled = false;
    button.innerHTML = originalHtml;
    if (formStatus.textContent === "Enviando...") formStatus.textContent = "";
  }
}

/* ---------- init ---------- */

async function autodetectFields() {
  const detectBtn = document.getElementById("detectBtn");
  const detectStatus = document.getElementById("detectStatus");
  const url = (document.getElementById("endpointUrl").value || "").trim();
  const dataPath = (document.getElementById("dataPath").value || "").trim();
  if (!url) {
    detectStatus.textContent = "Pega primero la URL del endpoint.";
    return;
  }
  detectBtn.disabled = true;
  detectStatus.textContent = "Consultando tu endpoint…";
  try {
    const res = await fetch("/api/connectors/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint_url: url, data_path: dataPath || null }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      detectStatus.textContent = extractError(body, "No se pudieron detectar los campos.");
      return;
    }
    const suggested = body.suggested_mapping || {};
    const fields = body.fields || [];
    // Reconstruye el mapeo: primero los sugeridos, luego el resto sin destino.
    mappingRows.innerHTML = "";
    Object.entries(suggested).forEach(([src, tgt]) => addMappingRow(tgt, src));
    fields.filter((f) => !(f in suggested)).forEach((f) => addMappingRow("", f));
    const n = Object.keys(suggested).length;
    detectStatus.textContent =
      `${fields.length} campos detectados (${body.count} registros). ${n} mapeados automaticamente; revisa el resto.`;
  } catch (err) {
    detectStatus.textContent = "Error de red al consultar el endpoint.";
  } finally {
    detectBtn.disabled = false;
  }
}

document.getElementById("detectBtn").addEventListener("click", autodetectFields);
document.getElementById("addMappingRow").addEventListener("click", () => addMappingRow());
document.getElementById("authType").addEventListener("change", toggleAuthHeader);
form.addEventListener("submit", submitForm);

markActiveNav();
checkHealth();
loadSchema();
