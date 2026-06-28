// Red Humanitaria de Datos — pagina Buscar (Bootstrap 5)
// Search-first: pulso de la red por defecto; resultados solo al buscar.

const form = document.querySelector("#searchForm");
const queryInput = document.querySelector("#queryInput");
const cedulaInput = document.querySelector("#cedulaInput");
const cityInput = document.querySelector("#cityInput");
const recordTypeInput = document.querySelector("#recordTypeInput");
const sourceInput = document.querySelector("#sourceInput");
const limitInput = document.querySelector("#limitInput");
const clearButton = document.querySelector("#clearButton");
const submitButton = form.querySelector('[type="submit"]');

const resultsList = document.querySelector("#resultsList");
const messageArea = document.querySelector("#messageArea");
const loadMoreButton = document.querySelector("#loadMoreButton");
const resultCount = document.querySelector("#resultCount");
const resultsHeading = document.querySelector("#resultsHeading");
const activeTypeFilter = document.querySelector("#activeTypeFilter");
const healthStatus = document.querySelector("#healthStatus");
const freshnessText = document.querySelector("#freshnessText");

const metricMatches = document.querySelector("#metricMatches");
const metricScanned = document.querySelector("#metricScanned");
const metricTime = document.querySelector("#metricTime");

const networkState = document.querySelector("#networkState");
const resultsView = document.querySelector("#resultsView");
const statRecords = document.querySelector("#statRecords");
const statSources = document.querySelector("#statSources");
const statFresh = document.querySelector("#statFresh");

const drawerBody = document.querySelector("#drawerBody");
const offcanvasEl = document.querySelector("#recordOffcanvas");
const offcanvasTitle = document.querySelector("#recordOffcanvasTitle");

const state = {
  nextOffset: null,
  lastParams: null,
  loading: false,
};

// ---------- Etiquetas ----------
const reasonLabels = {
  cedula_exacta: "Cedula exacta",
  cedula_prefijo: "Cedula parcial",
  titulo_exacto: "Titulo exacto",
  titulo_contiene: "Titulo contiene",
  persona_exacto: "Persona exacta",
  persona_contiene: "Persona contiene",
  titulo: "Titulo",
  persona: "Persona",
  organizacion: "Organizacion",
  ubicacion: "Ubicacion",
  resumen: "Resumen",
  etiquetas: "Etiquetas",
  edad: "Edad",
  sin_consulta: "Sin consulta",
};

const typeLabels = {
  persona_desaparecida: "Persona desaparecida",
  persona_hospitalizada: "Persona localizada",
  centro_acopio: "Centro de acopio",
  centro_donacion: "Centro de donacion",
  recurso: "Recurso",
};

// ---------- Utilidades ----------
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function compactNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return new Intl.NumberFormat("es-VE").format(Number(value));
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("es-VE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function typeLabel(value) {
  return typeLabels[value] || value || "--";
}

function reasonLabel(reason) {
  return reasonLabels[reason] || String(reason).replaceAll("_", " ");
}

// ---------- Mensajes / alertas ----------
function setMessage(type, title, body = "") {
  const cls = type === "error" ? "alert-danger" : type === "warn" ? "alert-warning" : "alert-secondary";
  const icon = type === "error" ? "bi-exclamation-triangle" : type === "warn" ? "bi-exclamation-circle" : "bi-info-circle";
  messageArea.innerHTML = `
    <div class="alert ${cls} d-flex gap-2" role="alert">
      <i class="bi ${icon} flex-shrink-0 mt-1" aria-hidden="true"></i>
      <div>
        <strong>${escapeHtml(title)}</strong>
        ${body ? `<div class="small mb-0">${escapeHtml(body)}</div>` : ""}
      </div>
    </div>
  `;
}

function clearMessage() {
  messageArea.innerHTML = "";
}

// ---------- Metricas ----------
function resetMetrics() {
  metricMatches.textContent = "--";
  metricScanned.textContent = "--";
  metricTime.textContent = "--";
}

// ---------- Indicador de filtro de tipo ----------
function updateTypeFilterIndicator() {
  const value = recordTypeInput.value;
  if (value) {
    activeTypeFilter.textContent = `Tipo: ${typeLabel(value)} ✕`;
    activeTypeFilter.classList.remove("d-none");
  } else {
    activeTypeFilter.textContent = "";
    activeTypeFilter.classList.add("d-none");
  }
}

// ---------- Vistas ----------
function showResults() {
  networkState.hidden = true;
  resultsView.hidden = false;
}

function showNetwork() {
  resultsView.hidden = true;
  networkState.hidden = false;
}

// ---------- Carga ----------
function skeletonItems(n = 4) {
  let html = "";
  for (let i = 0; i < n; i += 1) {
    html += `
      <div class="list-group-item placeholder-glow">
        <span class="placeholder col-6 d-block mb-2"></span>
        <span class="placeholder col-3 me-1"></span>
        <span class="placeholder col-2"></span>
        <span class="placeholder col-8 d-block mt-2"></span>
      </div>
    `;
  }
  return html;
}

function setLoading(isLoading, append = false) {
  state.loading = isLoading;
  submitButton.disabled = isLoading;
  loadMoreButton.disabled = isLoading;

  if (isLoading && !append) {
    resultsList.innerHTML = skeletonItems();
    resultCount.textContent = "Buscando...";
  }
}

// ---------- Parametros ----------
function readParams(offset = 0) {
  const data = new FormData(form);
  const params = new URLSearchParams();
  params.set("offset", String(offset));

  for (const [key, value] of data.entries()) {
    const normalized = String(value).trim();
    if (normalized) {
      params.set(key, normalized);
    }
  }

  if (!params.has("limit")) {
    params.set("limit", "20");
  }

  return params;
}

// ---------- Render de resultados ----------
function badge(text, variant = "secondary", icon = "") {
  const ic = icon ? `<i class="bi ${icon} me-1" aria-hidden="true"></i>` : "";
  return `<span class="badge text-bg-${variant}">${ic}${escapeHtml(text)}</span>`;
}

function renderResultItem(result) {
  const record = result.record;
  const title = record.title || record.person_name || "Registro sin titulo";
  const location = [record.city, record.state].filter(Boolean).join(", ");

  const badges = [badge(typeLabel(record.record_type), "primary")];
  if (location) {
    badges.push(`<span class="badge text-bg-secondary"><i class="bi bi-geo-alt me-1" aria-hidden="true"></i>${escapeHtml(location)}</span>`);
  }
  if (record.verified === true) {
    badges.push(`<span class="badge text-bg-success"><i class="bi bi-patch-check me-1" aria-hidden="true"></i>Verificado</span>`);
  } else if (record.verified === false) {
    badges.push(`<span class="badge text-bg-secondary">Por verificar</span>`);
  }
  if (result.also_in_count > 1) {
    badges.push(`<span class="badge border text-secondary">en ${compactNumber(result.also_in_count)} fuentes</span>`);
  }

  const reasons = (result.reasons || [])
    .slice(0, 4)
    .map((r) => `<span class="badge border text-secondary fw-normal">${escapeHtml(reasonLabel(r))}</span>`)
    .join(" ");

  const scorePct = Math.max(4, Math.min(100, Math.round((Number(result.score) || 0) * 10)));

  return `
    <button type="button" class="list-group-item list-group-item-action" data-id="${escapeHtml(record.id)}">
      <div class="d-flex justify-content-between align-items-start gap-3">
        <div class="min-w-0">
          <div class="fw-semibold text-truncate">${escapeHtml(title)}</div>
          <div class="d-flex flex-wrap gap-1 mt-1">${badges.join(" ")}</div>
        </div>
        <span class="text-muted fs-7 flex-shrink-0">${escapeHtml(record.source_name || "")}</span>
      </div>
      ${record.summary ? `<p class="text-muted small mb-2 mt-2">${escapeHtml(record.summary)}</p>` : '<div class="mt-2"></div>'}
      ${reasons ? `<div class="d-flex flex-wrap gap-1 mb-2">${reasons}</div>` : ""}
      <div class="score-bar" title="Relevancia"><span style="width:${scorePct}%"></span></div>
    </button>
  `;
}

function renderResponse(data, append = false) {
  clearMessage();

  metricMatches.textContent = compactNumber(data.total_matches);
  metricScanned.textContent = compactNumber(data.source_count);
  metricTime.textContent = `${compactNumber(data.elapsed_ms)} ms`;
  resultCount.textContent = `${compactNumber(data.total_matches)} coincidencias`;

  const html = data.results.map(renderResultItem).join("");

  if (append) {
    resultsList.insertAdjacentHTML("beforeend", html);
  } else {
    resultsList.innerHTML = html;
  }

  if (!data.results.length && !append) {
    resultsList.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-search" aria-hidden="true"></i>
        <strong class="d-block">Sin resultados en el indice</strong>
        <span class="text-muted">Ajusta los filtros o sincroniza una fuente para ampliar la busqueda.</span>
      </div>
    `;
  }

  const next = data.returned_offset + data.returned_limit;
  state.nextOffset = next < data.total_matches ? next : null;
  loadMoreButton.hidden = state.nextOffset === null;
}

// ---------- Detalle (offcanvas) ----------
function detailRow(label, value, isHtml = false) {
  const display = value === null || value === undefined || value === "" ? "--" : value;
  return `
    <div class="detail-row">
      <dt>${escapeHtml(label)}</dt>
      <dd>${isHtml ? display : escapeHtml(display)}</dd>
    </div>
  `;
}

function renderDetail(record) {
  const location = [record.location_name, record.city, record.state, record.country]
    .filter(Boolean)
    .join(" - ");

  const tags = (record.tags || []).length
    ? record.tags.map((t) => `<span class="badge border text-secondary me-1">${escapeHtml(t)}</span>`).join("")
    : "--";

  let sourceLink = escapeHtml(record.source_name || "--");
  if (record.source_url) {
    sourceLink = `<a class="btn btn-link p-0 align-baseline" href="${escapeHtml(record.source_url)}" target="_blank" rel="noopener">${escapeHtml(record.source_name || record.source_url)} <i class="bi bi-link-45deg" aria-hidden="true"></i></a>`;
  }

  offcanvasTitle.textContent = record.title || record.person_name || "Detalle del registro";

  drawerBody.innerHTML = `
    <div class="d-flex flex-wrap gap-1 mb-3">
      ${badge(typeLabel(record.record_type), "primary")}
      ${record.verified === true ? `<span class="badge text-bg-success"><i class="bi bi-patch-check me-1" aria-hidden="true"></i>Verificado</span>` : ""}
      ${record.status ? `<span class="badge border text-secondary">${escapeHtml(record.status)}</span>` : ""}
    </div>
    ${record.summary ? `<p class="text-muted">${escapeHtml(record.summary)}</p>` : ""}
    <dl class="mb-0">
      ${detailRow("Persona", record.person_name)}
      ${detailRow("Cedula", record.cedula)}
      ${detailRow("Edad", record.age)}
      ${detailRow("Organizacion", record.organization)}
      ${detailRow("Ubicacion", location)}
      ${detailRow("Contacto", record.contact)}
      ${detailRow("Etiquetas", tags, true)}
      ${detailRow("Fuente", sourceLink, true)}
      ${detailRow("Observado", formatDate(record.observed_at))}
      ${detailRow("Actualizado", formatDate(record.updated_at))}
    </dl>
  `;
}

async function openRecord(id) {
  const oc = bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl);
  offcanvasTitle.textContent = "Cargando...";
  drawerBody.innerHTML = `
    <div class="placeholder-glow">
      <span class="placeholder col-8 d-block mb-2"></span>
      <span class="placeholder col-5 d-block mb-2"></span>
      <span class="placeholder col-10 d-block"></span>
    </div>
  `;
  oc.show();

  try {
    const response = await fetch(`/api/records/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error("not found");
    const record = await response.json();
    renderDetail(record);
  } catch {
    offcanvasTitle.textContent = "Error";
    drawerBody.innerHTML = `
      <div class="alert alert-danger" role="alert">
        <i class="bi bi-exclamation-triangle me-1" aria-hidden="true"></i> No se pudo cargar el registro.
      </div>
    `;
  }
}

// ---------- Errores ----------
function extractError(payload, fallback) {
  const detail = payload?.detail || payload;
  return {
    title: detail?.error_code || "Error",
    body: detail?.error || (typeof detail === "string" ? detail : fallback),
  };
}

// ---------- Busqueda ----------
async function runSearch(offset = 0, append = false) {
  if (state.loading) return;

  const params =
    append && state.lastParams ? new URLSearchParams(state.lastParams) : readParams(offset);
  params.set("offset", String(offset));
  state.lastParams = new URLSearchParams(params);

  showResults();
  updateTypeFilterIndicator();
  if (!append) {
    // Mueve el foco al encabezado de resultados para lectores de pantalla.
    resultsHeading.focus();
  }
  setLoading(true, append);

  try {
    const response = await fetch(`/api/records/search?${params.toString()}`);
    const payload = await response.json();

    if (!response.ok) {
      const error = extractError(payload, "No se pudo completar la busqueda.");
      setMessage("error", error.title, error.body);
      resetMetrics();
      if (!append) {
        resultsList.innerHTML = "";
        resultCount.textContent = "Sin resultados";
        loadMoreButton.hidden = true;
      }
      // En "Cargar mas": conservamos los resultados y dejamos el boton para reintentar.
      return;
    }

    renderResponse(payload, append);
  } catch {
    setMessage("error", "Conexion fallida", "Revisa que el servidor siga activo.");
    resetMetrics();
    if (!append) {
      resultsList.innerHTML = "";
      resultCount.textContent = "Sin resultados";
      loadMoreButton.hidden = true;
    }
    // En "Cargar mas": conservamos los resultados y dejamos el boton para reintentar.
  } finally {
    setLoading(false, append);
  }
}

// ---------- Pulso de la red ----------
async function loadStats() {
  try {
    const response = await fetch("/api/network/stats");
    const data = await response.json();
    if (!response.ok) throw new Error("stats unavailable");

    statRecords.textContent = compactNumber(data.total_records);
    statSources.textContent = compactNumber(data.total_sources);

    const lastSync = (data.sources || [])
      .map((s) => s.last_sync)
      .filter(Boolean)
      .sort()
      .pop();
    statFresh.textContent = lastSync ? formatDate(lastSync) : "nunca";

    freshnessText.textContent = `${compactNumber(data.total_records)} registros indexados`;
    healthStatus.textContent = data.total_records ? "Indice activo" : "Indice vacio";
    healthStatus.className = data.total_records ? "status-pill status-ok" : "status-pill status-warn";

    sourceInput.innerHTML = '<option value="">Todas</option>';
    for (const source of data.sources || []) {
      const option = document.createElement("option");
      option.value = source.id;
      option.textContent = `${source.name} (${compactNumber(source.record_count)})`;
      sourceInput.appendChild(option);
    }
  } catch {
    healthStatus.textContent = "Sin conexion";
    healthStatus.className = "status-pill status-warn";
    statRecords.textContent = "--";
    statSources.textContent = "--";
    statFresh.textContent = "--";
  }
}

// ---------- Navbar activo ----------
function markActiveNav() {
  const path = location.pathname;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const href = link.getAttribute("href");
    const active = href === "/" ? path === "/" : path.startsWith(href);
    if (active) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
  });
}

// ---------- Eventos ----------
form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(0, false);
});

clearButton.addEventListener("click", () => {
  form.reset();
  clearMessage();
  resultsList.innerHTML = "";
  resultCount.textContent = "";
  loadMoreButton.hidden = true;
  state.nextOffset = null;
  state.lastParams = null;
  updateTypeFilterIndicator();
  showNetwork();
  loadStats();
  queryInput.focus();
});

// Indicador de filtro de tipo: al pulsarlo limpia el tipo y re-busca.
activeTypeFilter.addEventListener("click", () => {
  recordTypeInput.value = "";
  updateTypeFilterIndicator();
  runSearch(0, false);
});

// Mantener el indicador en sincronia si se cambia el tipo desde los filtros avanzados.
recordTypeInput.addEventListener("change", updateTypeFilterIndicator);

networkState.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-type], [data-q]");
  if (!chip) return;
  if (chip.dataset.type !== undefined) {
    queryInput.value = "";
    recordTypeInput.value = chip.dataset.type;
  } else if (chip.dataset.q !== undefined) {
    recordTypeInput.value = "";
    queryInput.value = chip.dataset.q;
  }
  runSearch(0, false);
});

resultsList.addEventListener("click", (event) => {
  const item = event.target.closest("[data-id]");
  if (!item) return;
  openRecord(item.dataset.id);
});

loadMoreButton.addEventListener("click", () => {
  if (state.nextOffset !== null) {
    runSearch(state.nextOffset, true);
  }
});

// ---------- Init ----------
markActiveNav();
loadStats();
queryInput.focus();
