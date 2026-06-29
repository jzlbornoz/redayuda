// Red Humanitaria de Datos — pagina /red (La red)
// Independiente de app.js: replica por su cuenta los contratos de
// #healthStatus, nav activo y formato de fecha/numero.

const healthStatus = document.querySelector("#healthStatus");
const statRecords = document.querySelector("#statRecords");
const statSources = document.querySelector("#statSources");
const statFresh = document.querySelector("#statFresh");
const redSources = document.querySelector("#redSources");
const redSourcesMessage = document.querySelector("#redSourcesMessage");
const redTypeBreakdown = document.querySelector("#redTypeBreakdown");

// ---------- Etiquetas de tipo (mismo contrato que app.js) ----------
const typeLabels = {
  persona_desaparecida: "Persona desaparecida",
  persona_hospitalizada: "Persona localizada",
  centro_acopio: "Centro de acopio",
  centro_donacion: "Centro de donacion",
  recurso: "Recurso",
};

function typeLabel(value) {
  return typeLabels[value] || value || "--";
}

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

// ---------- Skeleton ----------
function skeletonCards(n = 6) {
  let html = "";
  for (let i = 0; i < n; i += 1) {
    html += `
      <div class="col">
        <div class="card h-100 placeholder-glow">
          <div class="card-body">
            <span class="placeholder col-7 d-block mb-2"></span>
            <span class="placeholder col-4 me-1"></span>
            <span class="placeholder col-3"></span>
            <span class="placeholder col-10 d-block mt-2"></span>
          </div>
        </div>
      </div>
    `;
  }
  return html;
}

// ---------- Render directorio de apps conectadas ----------
function renderSources(sources) {
  if (!sources || !sources.length) {
    redSources.innerHTML = "";
    redSourcesMessage.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-diagram-3" aria-hidden="true"></i>
        <strong class="d-block">Aún no hay apps conectadas</strong>
        <span class="text-muted">Conecta tu app a la red para que aparezca aquí.</span>
      </div>
    `;
    return;
  }
  redSourcesMessage.innerHTML = "";

  const html = sources
    .map((source) => {
      const name = escapeHtml(source.name || source.id || "Fuente");
      const kind = source.kind || source.record_type;
      const kindBadge = kind
        ? `<span class="badge text-bg-primary">${escapeHtml(typeLabel(kind))}</span>`
        : "";
      const enabled = source.enabled !== false;
      const statePill = enabled
        ? `<span class="status-pill status-ok">Activa</span>`
        : `<span class="status-pill status-warn">Inactiva</span>`;
      const description = source.description
        ? `<p class="text-muted fs-7 mb-2">${escapeHtml(source.description)}</p>`
        : "";
      const count =
        source.record_count !== undefined && source.record_count !== null
          ? `<span class="text-muted fs-7"><i class="bi bi-collection me-1" aria-hidden="true"></i>${compactNumber(source.record_count)} registros</span>`
          : "";
      const lastSync = source.last_sync
        ? `<span class="text-muted fs-7"><i class="bi bi-clock-history me-1" aria-hidden="true"></i>${escapeHtml(formatDate(source.last_sync))}</span>`
        : "";

      return `
        <div class="col">
          <a href="/fuentes" class="card h-100 text-decoration-none text-reset">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                <h3 class="h6 mb-0 text-truncate">${name}</h3>
                ${statePill}
              </div>
              <div class="d-flex flex-wrap gap-1 mb-2">${kindBadge}</div>
              ${description}
              <div class="d-flex flex-wrap gap-3">${count}${lastSync}</div>
            </div>
          </a>
        </div>
      `;
    })
    .join("");

  redSources.innerHTML = html;
}

// ---------- Desglose por tipo ----------
function renderTypeBreakdown(recordTypes) {
  if (!recordTypes || !Object.keys(recordTypes).length) {
    redTypeBreakdown.innerHTML = "";
    return;
  }
  redTypeBreakdown.innerHTML = Object.entries(recordTypes)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(
      ([type, count]) =>
        `<span class="badge border text-secondary fw-normal">${escapeHtml(typeLabel(type))} · ${compactNumber(count)}</span>`
    )
    .join("");
}

// ---------- Carga de la red ----------
async function loadNetwork() {
  redSources.innerHTML = skeletonCards();
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

    // Contrato real de #healthStatus (igual que app.js l.451-452/462-463)
    healthStatus.textContent = data.total_records ? "Indice activo" : "Indice vacio";
    healthStatus.className = data.total_records ? "status-pill status-ok" : "status-pill status-warn";

    renderTypeBreakdown(data.record_types);
    renderSources(data.sources || []);
  } catch {
    healthStatus.textContent = "Sin conexion";
    healthStatus.className = "status-pill status-warn";
    statRecords.textContent = "--";
    statSources.textContent = "--";
    statFresh.textContent = "--";
    redTypeBreakdown.innerHTML = "";
    redSources.innerHTML = "";
    redSourcesMessage.innerHTML = `
      <div class="alert alert-danger d-flex gap-2" role="alert">
        <i class="bi bi-exclamation-triangle flex-shrink-0 mt-1" aria-hidden="true"></i>
        <div>
          <strong>No se pudo cargar la red</strong>
          <div class="small mb-0">Revisa que el servidor siga activo e intenta de nuevo.</div>
        </div>
      </div>
    `;
  }
}

// ---------- Navbar activo (replica markActiveNav de app.js) ----------
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

// ---------- Init ----------
markActiveNav();
loadNetwork();
