"use strict";

const form = document.getElementById("proposalForm");
const messageArea = document.getElementById("messageArea");
const formStatus = document.getElementById("formStatus");
const mappingRows = document.getElementById("mappingRows");
const contractFields = document.getElementById("contractFields");
const exampleRequest = document.getElementById("exampleRequest");

let targetFields = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setMessage(type, title, body = "") {
  messageArea.innerHTML = `
    <div class="message ${type === "error" ? "error" : ""}">
      <strong>${escapeHtml(title)}</strong>
      ${body ? `<p>${escapeHtml(body)}</p>` : ""}
    </div>
  `;
}

function extractError(payload, fallback) {
  const detail = payload && payload.detail;
  if (typeof detail === "string") return detail;
  if (detail && detail.error) return detail.error;
  if (Array.isArray(detail) && detail.length && detail[0].msg) return detail[0].msg;
  return fallback;
}

function fillSelect(select, values) {
  select.innerHTML = values
    .map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)
    .join("");
}

function addMappingRow(target = "", source = "") {
  const row = document.createElement("div");
  row.className = "mapping-row";
  const options = ['<option value="">— campo destino —</option>']
    .concat(
      targetFields.map(
        (f) =>
          `<option value="${escapeHtml(f.name)}" ${f.name === target ? "selected" : ""}>${escapeHtml(f.name)}${f.required ? " *" : ""}</option>`
      )
    )
    .join("");
  row.innerHTML = `
    <select class="map-target">${options}</select>
    <span class="map-arrow" aria-hidden="true">←</span>
    <input class="map-source" placeholder="campo en tu API" value="${escapeHtml(source)}">
    <button type="button" class="secondary-button map-remove" aria-label="Quitar">✕</button>
  `;
  row.querySelector(".map-remove").addEventListener("click", () => row.remove());
  mappingRows.appendChild(row);
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

async function loadSchema() {
  try {
    const response = await fetch("/api/connectors/schema");
    const schema = await response.json();
    targetFields = schema.record_fields || [];

    fillSelect(document.getElementById("kindSelect"), schema.allowed_kinds);
    fillSelect(document.getElementById("authType"), schema.auth_types);
    fillSelect(document.getElementById("pageStyle"), schema.pagination_styles);

    contractFields.innerHTML = targetFields
      .map(
        (f) =>
          `<li><code>${escapeHtml(f.name)}</code>${f.required ? '<span class="req">obligatorio</span>' : ""}</li>`
      )
      .join("");
    exampleRequest.textContent = JSON.stringify(schema.example_request, null, 2);

    addMappingRow("title");
    addMappingRow("person_name");
  } catch (error) {
    setMessage("error", "No se pudo cargar el esquema", String(error));
  }
}

function toggleAuthHeader() {
  const wrap = document.getElementById("authHeaderWrap");
  wrap.hidden = document.getElementById("authType").value !== "api_key";
}

async function submitForm(event) {
  event.preventDefault();
  const data = new FormData(form);

  if (data.get("website")) return; // honeypot

  const mapping = collectMapping();
  if (!Object.keys(mapping).length) {
    setMessage("error", "Falta el mapeo", "Mapea al menos un campo destino.");
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

  const button = form.querySelector(".primary-button");
  button.disabled = true;
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
      mappingRows.innerHTML = "";
      addMappingRow("title");
      formStatus.textContent = "";
      setMessage(
        "info",
        "Propuesta recibida",
        "Gracias. Un administrador revisara tu fuente antes de activarla."
      );
    } else if (response.status === 429) {
      setMessage("error", "Demasiados envios", extractError(body, "Intenta mas tarde."));
    } else {
      setMessage("error", "No se pudo enviar", extractError(body, "Revisa los datos del formulario."));
    }
  } catch (error) {
    setMessage("error", "Error de red", String(error));
  } finally {
    button.disabled = false;
    if (formStatus.textContent === "Enviando...") formStatus.textContent = "";
  }
}

document.getElementById("addMappingRow").addEventListener("click", () => addMappingRow());
document.getElementById("authType").addEventListener("change", toggleAuthHeader);
form.addEventListener("submit", submitForm);

loadSchema();
