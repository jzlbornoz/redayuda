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
      <div class="card skeleton-glow">
        <div class="card__body">
          <span class="skeleton skeleton--text mb-2" style="inline-size:58%"></span>
          <span class="skeleton skeleton--text mb-2" style="inline-size:33%"></span>
          <span class="skeleton skeleton--text" style="inline-size:83%"></span>
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
      const kindTag = kind
        ? `<span class="tag tag--accent">${escapeHtml(typeLabel(kind))}</span>`
        : "";
      const enabled = source.enabled !== false;
      const statePill = enabled
        ? `<span class="status-pill status-ok">Activa</span>`
        : `<span class="status-pill status-warn">Inactiva</span>`;
      const description = source.description
        ? `<p class="text-muted small mb-2">${escapeHtml(source.description)}</p>`
        : "";
      const count =
        source.record_count !== undefined && source.record_count !== null
          ? `<span class="text-muted small">${compactNumber(source.record_count)} registros</span>`
          : "";
      const lastSync = source.last_sync
        ? `<span class="text-muted small">${escapeHtml(formatDate(source.last_sync))}</span>`
        : "";

      return `
        <a href="/fuentes" class="card card--link text-decoration-none text-reset">
          <div class="card__body">
            <div class="cluster cluster--between mb-2" style="align-items:flex-start">
              <h3 class="card__title text-truncate mb-0">${name}</h3>
              ${statePill}
            </div>
            <div class="cluster mb-2">${kindTag}</div>
            ${description}
            <div class="cluster gap-3">${count}${lastSync}</div>
          </div>
        </a>
      `;
    })
    .join("");

  redSources.innerHTML = html;
}

// ---------- Desglose por tipo (grafico de barras) ----------
function renderTypeBreakdown(recordTypes) {
  if (!recordTypes || !Object.keys(recordTypes).length) {
    redTypeBreakdown.innerHTML = "";
    return;
  }
  const entries = Object.entries(recordTypes)
    .map(([type, count]) => [type, Number(count) || 0])
    .sort((a, b) => b[1] - a[1]);

  const max = entries.length ? entries[0][1] : 0;

  const bars = entries
    .map(([type, count], i) => {
      const pct = max > 0 ? Math.round((count / max) * 100) : 0;
      const peak = i === 0 ? " bar--peak" : "";
      return `
        <li class="bar${peak}">
          <span class="bar__label">${escapeHtml(typeLabel(type))}</span>
          <span class="bar__track"><span class="bar__fill" style="inline-size:${pct}%"></span></span>
          <span class="bar__value">${compactNumber(count)}</span>
        </li>
      `;
    })
    .join("");

  redTypeBreakdown.innerHTML = `<ul class="bars">${bars}</ul>`;
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
      <div class="alert alert-danger" role="alert">
        <strong>No se pudo cargar la red</strong>
        <div class="small mb-0">Revisa que el servidor siga activo e intenta de nuevo.</div>
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
