const form = document.querySelector("#searchForm");
const queryInput = document.querySelector("#queryInput");
const clearButton = document.querySelector("#clearButton");
const syncButton = document.querySelector("#syncButton");
const sourceInput = document.querySelector("#sourceInput");
const resultsList = document.querySelector("#resultsList");
const messageArea = document.querySelector("#messageArea");
const loadMoreButton = document.querySelector("#loadMoreButton");
const resultCount = document.querySelector("#resultCount");
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
const recordTypeInput = document.querySelector("#recordTypeInput");

function showResults() {
  networkState.hidden = true;
  resultsView.hidden = false;
}

function showNetwork() {
  resultsView.hidden = true;
  networkState.hidden = false;
}

const state = {
  nextOffset: null,
  lastParams: null,
  loading: false,
};

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
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("es-VE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function typeLabel(value) {
  return typeLabels[value] || value || "--";
}

function setMessage(type, title, body = "") {
  messageArea.innerHTML = `
    <div class="message ${type === "error" ? "error" : ""}">
      <strong>${escapeHtml(title)}</strong>
      ${body ? `<p>${escapeHtml(body)}</p>` : ""}
    </div>
  `;
}

function clearMessage() {
  messageArea.innerHTML = "";
}

function setLoading(isLoading, append = false) {
  state.loading = isLoading;
  form.querySelector(".primary-button").disabled = isLoading;
  loadMoreButton.disabled = isLoading;
  syncButton.disabled = isLoading;

  if (isLoading && !append) {
    resultsList.innerHTML = `
      <div class="skeleton"></div>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
    `;
    resultCount.textContent = "Buscando";
  }
}

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

function field(label, value) {
  const displayValue = value === null || value === undefined || value === "" ? "--" : value;

  return `
    <div class="field">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(displayValue)}</strong>
    </div>
  `;
}

function renderBadges(result) {
  const record = result.record;
  const badges = [
    `<span class="badge">${escapeHtml(typeLabel(record.record_type))}</span>`,
    ...result.reasons.map((reason) => {
      const label = reasonLabels[reason] || reason.replaceAll("_", " ");
      return `<span class="badge">${escapeHtml(label)}</span>`;
    }),
  ];

  for (const tag of record.tags.slice(0, 4)) {
    badges.push(`<span class="badge">${escapeHtml(tag)}</span>`);
  }

  if (record.verified === false) {
    badges.push('<span class="badge warning">Por verificar</span>');
  } else if (record.verified === true) {
    badges.push('<span class="badge">Verificado</span>');
  }

  return badges.join("");
}

function renderResult(result) {
  const record = result.record;
  const location = [record.location_name, record.city, record.state, record.country]
    .filter(Boolean)
    .join(" - ");

  return `
    <article class="result-card">
      <div class="result-top">
        <div>
          <h3 class="result-name">${escapeHtml(record.title || "Registro sin titulo")}</h3>
          <div class="badges">${renderBadges(result)}</div>
        </div>
        <div class="score" title="Puntaje de coincidencia">${escapeHtml(result.score)}</div>
      </div>
      <div class="fields">
        ${field("Persona", record.person_name)}
        ${field("Cedula", record.cedula)}
        ${field("Ubicacion", location)}
        ${field("Organizacion", record.organization)}
        ${field("Estado", record.status)}
        ${field("Contacto", record.contact)}
        ${field("Fuente", record.source_name)}
        ${field("Actualizado", formatDate(record.updated_at))}
      </div>
    </article>
  `;
}

function renderResponse(data, append = false) {
  clearMessage();

  metricMatches.textContent = compactNumber(data.total_matches);
  metricScanned.textContent = compactNumber(data.source_count);
  metricTime.textContent = `${compactNumber(data.elapsed_ms)} ms`;
  resultCount.textContent = `${compactNumber(data.total_matches)} coincidencias`;
  freshnessText.textContent = data.record_types.length
    ? `Tipos: ${data.record_types.map(typeLabel).join(", ")}`
    : "Indice sin coincidencias";

  const html = data.results.map(renderResult).join("");

  if (append) {
    resultsList.insertAdjacentHTML("beforeend", html);
  } else {
    resultsList.innerHTML = html;
  }

  if (!data.results.length && !append) {
    setMessage(
      "info",
      "Sin resultados en el indice",
      "Sincroniza una fuente o ajusta los filtros para ampliar la busqueda."
    );
  }

  const next = data.returned_offset + data.returned_limit;
  state.nextOffset = next < data.total_matches ? next : null;
  loadMoreButton.hidden = state.nextOffset === null;
}

function extractError(payload, fallback) {
  const detail = payload?.detail || payload;
  return {
    title: detail?.error_code || "Error",
    body: detail?.error || (typeof detail === "string" ? detail : fallback),
  };
}

async function runSearch(offset = 0, append = false) {
  if (state.loading) {
    return;
  }

  const params = append && state.lastParams ? new URLSearchParams(state.lastParams) : readParams(offset);
  params.set("offset", String(offset));
  state.lastParams = new URLSearchParams(params);

  showResults();
  setLoading(true, append);

  try {
    const response = await fetch(`/api/records/search?${params.toString()}`);
    const payload = await response.json();

    if (!response.ok) {
      const error = extractError(payload, "No se pudo completar la busqueda.");
      setMessage("error", error.title, error.body);
      resultsList.innerHTML = "";
      resultCount.textContent = "Sin resultados";
      loadMoreButton.hidden = true;
      return;
    }

    renderResponse(payload, append);
  } catch (error) {
    setMessage("error", "Conexion fallida", "Revisa que el servidor FastAPI siga activo.");
    resultsList.innerHTML = "";
    loadMoreButton.hidden = true;
  } finally {
    setLoading(false, append);
  }
}

async function loadStats() {
  try {
    const response = await fetch("/api/network/stats");
    const data = await response.json();

    if (!response.ok) {
      throw new Error("stats unavailable");
    }

    statRecords.textContent = compactNumber(data.total_records);
    statSources.textContent = compactNumber(data.total_sources);
    const lastSync = data.sources
      .map((s) => s.last_sync)
      .filter(Boolean)
      .sort()
      .pop();
    statFresh.textContent = lastSync ? formatDate(lastSync) : "nunca";
    freshnessText.textContent = `${compactNumber(data.total_records)} registros indexados`;
    healthStatus.textContent = data.total_records ? "Indice activo" : "Indice vacio";
    healthStatus.className = data.total_records ? "status-pill status-ok" : "status-pill status-warn";

    sourceInput.innerHTML = '<option value="">Todas</option>';
    for (const source of data.sources) {
      const option = document.createElement("option");
      option.value = source.id;
      option.textContent = `${source.name} (${compactNumber(source.record_count)})`;
      sourceInput.appendChild(option);
    }
  } catch {
    healthStatus.textContent = "Sin conexion";
    healthStatus.className = "status-pill status-warn";
  }
}

async function syncHospitales() {
  if (state.loading) {
    return;
  }

  setLoading(true, false);
  setMessage("info", "Sincronizando fuente", "Importando registros de Hospitales en Venezuela al indice local.");

  try {
    const response = await fetch("/api/sources/hospitales_venezuela/sync?source_limit=1000&max_pages=5", {
      method: "POST",
    });
    const payload = await response.json();

    if (!response.ok) {
      const error = extractError(payload, "No se pudo sincronizar la fuente.");
      setMessage("error", error.title, error.body);
      resultsList.innerHTML = "";
      return;
    }

    setMessage(
      "info",
      "Fuente sincronizada",
      `${compactNumber(payload.imported)} registros importados desde ${compactNumber(payload.pages)} paginas.`
    );
    await loadStats();
    await runSearch(0, false);
  } catch {
    setMessage("error", "Sincronizacion fallida", "Revisa la clave HOSPITALES_API_KEY y la conexion.");
  } finally {
    setLoading(false, false);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(0, false);
});

clearButton.addEventListener("click", () => {
  form.reset();
  resultsList.innerHTML = "";
  clearMessage();
  resultCount.textContent = "";
  loadMoreButton.hidden = true;
  state.nextOffset = null;
  showNetwork();
  loadStats();
  queryInput.focus();
});

networkState.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
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

syncButton.addEventListener("click", () => {
  syncHospitales();
});

loadMoreButton.addEventListener("click", () => {
  if (state.nextOffset !== null) {
    runSearch(state.nextOffset, true);
  }
});

loadStats();
queryInput.focus();
