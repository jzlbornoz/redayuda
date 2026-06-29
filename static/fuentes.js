"use strict";

const $ = (id) => document.getElementById(id);

const sourcesView = $("sourcesView");
const recordsView = $("recordsView");
const sourcesList = $("sourcesList");
const sourcesMessage = $("sourcesMessage");
const sourceFilter = $("sourceFilter");
const sourceSort = $("sourceSort");

const recordsList = $("recordsList");
const recordsMessage = $("recordsMessage");
const recordsCount = $("recordsCount");
const sdTitle = $("sdTitle");
const sdMeta = $("sdMeta");
const qInput = $("qInput");
const typeInput = $("typeInput");
const limitInput = $("limitInput");
const pager = $("pager");
const pagerLabel = $("pagerLabel");
const prevButton = $("prevButton");
const nextButton = $("nextButton");

const drawerBody = $("drawerBody");
const drawerTitle = $("drawerTitle");
const drawerType = $("drawerType");
const recordOffcanvasEl = $("recordOffcanvas");
const recordOffcanvas = bootstrap.Offcanvas.getOrCreateInstance(recordOffcanvasEl);

const state = { sourceId: null, q: "", recordType: "", limit: 25, offset: 0 };
let allSources = [];
const detailCache = new Map();

// ---------- etiquetas ----------
const typeLabels = {
  persona_desaparecida: "Persona desaparecida",
  persona_hospitalizada: "Persona localizada",
  centro_acopio: "Centro de acopio",
  centro_donacion: "Centro de donacion",
  recurso: "Recurso",
};
function typeLabel(value) {
  return typeLabels[value] || value || "—";
}

// ---------- utils ----------
function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function num(v) {
  if (v === null || v === undefined) return "0";
  return new Intl.NumberFormat("es-VE").format(v);
}
function fmtDate(v) {
  if (!v) return "nunca";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeStyle: "short" }).format(d);
}
function alertBox(el, type, title, body = "") {
  // Informativos/vacios en gris (alert-secondary), nunca alert-info azul.
  const cls = type === "danger" ? "alert-danger" : type === "warning" ? "alert-warning" : "alert-secondary";
  const icon = type === "danger" ? "exclamation-triangle" : type === "warning" ? "exclamation-circle" : "info-circle";
  el.innerHTML = `<div class="alert ${cls} d-flex gap-2" role="alert">
      <i class="bi bi-${icon} mt-1" aria-hidden="true"></i>
      <div><strong>${esc(title)}</strong>${body ? `<div class="small mb-0">${esc(body)}</div>` : ""}</div>
    </div>`;
}
function emptyState(icon, title, body, cta = "") {
  return `<div class="empty-state">
      <i class="bi bi-${icon}" aria-hidden="true"></i>
      <strong class="d-block mb-1">${esc(title)}</strong>
      <span class="text-muted">${esc(body)}</span>
      ${cta}
    </div>`;
}

// Skeleton de cards de fuente (placeholder-glow)
function sourceSkeleton(n) {
  const one = `
    <div class="col">
      <div class="card h-100 placeholder-glow">
        <div class="card-body">
          <span class="placeholder col-7 mb-2"></span>
          <span class="placeholder col-4 d-block mb-3"></span>
          <span class="placeholder col-10"></span>
          <span class="placeholder col-8"></span>
        </div>
        <div class="card-footer placeholder-glow"><span class="placeholder col-6"></span></div>
      </div>
    </div>`;
  return Array.from({ length: n }, () => one).join("");
}
function recordSkeleton(n) {
  const one = `
    <div class="list-group-item placeholder-glow">
      <span class="placeholder col-6 d-block mb-2"></span>
      <span class="placeholder col-4 d-block"></span>
    </div>`;
  return Array.from({ length: n }, () => one).join("");
}

// ---------- estado de salud (navbar) ----------
async function loadHealth() {
  const el = $("healthStatus");
  if (!el) return;
  try {
    const res = await fetch("/api/network/stats");
    const data = await res.json();
    const total = data.total_records ?? 0;
    el.textContent = total ? "Indice activo" : "Indice vacio";
    el.className = total ? "status-pill status-ok" : "status-pill status-warn";
  } catch {
    el.textContent = "Sin conexion";
    el.className = "status-pill status-warn";
  }
}

// ---------- navbar activo ----------
function markActiveNav() {
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.getAttribute("href") === location.pathname) {
      a.classList.add("active");
      a.setAttribute("aria-current", "page");
    }
  });
}

// ---------- listado de fuentes ----------
async function loadSources() {
  sourcesMessage.innerHTML = "";
  sourcesList.innerHTML = sourceSkeleton(6);
  try {
    const res = await fetch("/api/sources");
    if (!res.ok) throw new Error("HTTP " + res.status);
    allSources = await res.json();
    renderStats();
    renderSources();
  } catch (err) {
    sourcesList.innerHTML = "";
    alertBox(sourcesMessage, "danger", "No se pudieron cargar las fuentes", String(err));
  }
}

function renderStats() {
  const total = allSources.reduce((a, s) => a + (s.record_count || 0), 0);
  const active = allSources.filter((s) => s.enabled).length;
  $("statSources").textContent = num(allSources.length);
  $("statRecords").textContent = num(total);
  $("statActive").textContent = num(active);
}

function renderSources() {
  const term = sourceFilter.value.trim().toLowerCase();
  let list = allSources.filter(
    (s) => !term ||
      (s.name || "").toLowerCase().includes(term) ||
      (s.kind || "").toLowerCase().includes(term)
  );
  const sort = sourceSort.value;
  list = list.slice().sort((a, b) => {
    if (sort === "name") return (a.name || "").localeCompare(b.name || "");
    if (sort === "recent") return String(b.last_sync || "").localeCompare(String(a.last_sync || ""));
    return (b.record_count || 0) - (a.record_count || 0);
  });

  if (!list.length) {
    sourcesList.innerHTML = `<div class="col-12">${emptyState(
      "search",
      "Sin resultados",
      allSources.length ? "Ninguna fuente coincide con el filtro." : "Aún no hay fuentes registradas."
    )}</div>`;
    return;
  }

  sourcesList.innerHTML = list.map(card).join("");
  sourcesList.querySelectorAll("[data-source]").forEach((el) => {
    el.addEventListener("click", () => openSource(el.dataset.source));
  });
}

function card(s) {
  const status = s.enabled
    ? `<span class="badge text-bg-success"><i class="bi bi-broadcast me-1" aria-hidden="true"></i>Activa</span>`
    : `<span class="badge text-bg-secondary">Inactiva</span>`;
  return `
    <div class="col">
      <div class="card h-100 cursor-pointer" role="button" tabindex="0"
           data-source="${esc(s.id)}" aria-label="Ver registros de ${esc(s.name)}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
            <h2 class="card-title h6 mb-0">${esc(s.name)}</h2>
            ${status}
          </div>
          <div class="d-flex flex-wrap gap-2 mb-2">
            <span class="badge text-bg-primary">${esc(s.kind)}</span>
          </div>
          ${s.description ? `<p class="text-muted small mb-0">${esc(s.description)}</p>` : ""}
        </div>
        <div class="card-footer d-flex justify-content-between align-items-center text-muted fs-7">
          <span><i class="bi bi-collection me-1" aria-hidden="true"></i>${num(s.record_count)} registros</span>
          <span><i class="bi bi-clock-history me-1" aria-hidden="true"></i>${fmtDate(s.last_sync)}</span>
        </div>
      </div>
    </div>`;
}

// ---------- detalle de fuente ----------
function openSource(id) {
  const s = allSources.find((x) => x.id === id);
  state.sourceId = id;
  state.q = ""; state.recordType = ""; state.offset = 0;
  qInput.value = "";
  typeInput.innerHTML = `<option value="">Todos los tipos</option>`;
  sdTitle.textContent = s ? s.name : id;
  sdMeta.innerHTML = sourceMeta(s);
  sourcesView.hidden = true;
  recordsView.hidden = false;
  window.scrollTo(0, 0);
  history.pushState({ source: id }, "", `/fuentes?source=${encodeURIComponent(id)}`);
  loadRecords();
}

function sourceMeta(s) {
  if (!s) return "";
  const enabled = s.enabled
    ? `<span class="badge text-bg-success"><i class="bi bi-broadcast me-1" aria-hidden="true"></i>Activa</span>`
    : `<span class="badge text-bg-secondary">Inactiva</span>`;
  const bits = [
    `<span class="badge text-bg-primary">${esc(s.kind)}</span>`,
    enabled,
    `<span class="text-muted fs-7"><i class="bi bi-collection me-1" aria-hidden="true"></i><b>${num(s.record_count)}</b> registros</span>`,
    `<span class="text-muted fs-7"><i class="bi bi-clock-history me-1" aria-hidden="true"></i>Últ. sync: <b>${fmtDate(s.last_sync)}</b></span>`,
  ];
  if (s.url) bits.push(`<a class="btn btn-link btn-sm p-0 fs-7" href="${esc(s.url)}" target="_blank" rel="noopener"><i class="bi bi-link-45deg me-1" aria-hidden="true"></i>Sitio de la fuente</a>`);
  return bits.join("");
}

function backToSources() {
  recordsView.hidden = true;
  sourcesView.hidden = false;
  history.pushState({}, "", "/fuentes");
}

async function loadRecords() {
  recordsMessage.innerHTML = "";
  recordsCount.textContent = "";
  recordsList.innerHTML = recordSkeleton(6);
  pager.hidden = true;
  state.limit = Number(limitInput.value) || 25;

  const params = new URLSearchParams({
    source_id: state.sourceId, q: state.q,
    limit: String(state.limit), offset: String(state.offset),
  });
  if (state.recordType) params.set("record_type", state.recordType);

  try {
    const res = await fetch(`/api/records/search?${params}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    populateTypes(data.record_types);
    recordsCount.textContent = `${num(data.total_matches)} registros · ${data.elapsed_ms} ms`;

    if (!data.results.length) {
      recordsList.innerHTML = emptyState(
        "inbox",
        "Sin registros",
        state.q || state.recordType
          ? "Prueba otra búsqueda o filtro."
          : "Esta fuente todavía no tiene registros indexados."
      );
      return;
    }
    recordsList.innerHTML = data.results.map((r) => row(r)).join("");
    recordsList.querySelectorAll("[data-record]").forEach((el) => {
      el.addEventListener("click", () => openDrawer(el.dataset.record, el.dataset.title, el.dataset.type));
    });
    renderPager(data);
  } catch (err) {
    recordsList.innerHTML = "";
    alertBox(recordsMessage, "danger", "No se pudieron cargar los registros", String(err));
  }
}

function populateTypes(types) {
  if (!types || !types.length) return;
  const cur = state.recordType;
  typeInput.innerHTML = ['<option value="">Todos los tipos</option>']
    .concat(types.map((t) => `<option value="${esc(t)}"${t === cur ? " selected" : ""}>${esc(typeLabel(t))}</option>`))
    .join("");
}

function row(result) {
  const rec = result.record;
  const bits = [];
  if (rec.cedula) bits.push("CI " + esc(rec.cedula));
  if (rec.city) bits.push(`<i class="bi bi-geo-alt" aria-hidden="true"></i> ${esc(rec.city)}`);
  if (rec.organization && rec.organization !== rec.title) bits.push(esc(rec.organization));
  if (rec.status) bits.push(esc(rec.status));

  const badges = [`<span class="badge text-bg-primary">${esc(typeLabel(rec.record_type))}</span>`];
  if (rec.verified) badges.push(`<span class="badge text-bg-success"><i class="bi bi-patch-check me-1" aria-hidden="true"></i>Verificado</span>`);
  if (result.also_in_count > 1) badges.push(`<span class="badge text-bg-secondary">en ${num(result.also_in_count)} fuentes</span>`);

  return `
    <button type="button"
            class="list-group-item list-group-item-action d-flex justify-content-between align-items-center gap-3"
            data-record="${esc(rec.id)}" data-title="${esc(rec.title)}" data-type="${esc(rec.record_type)}">
      <span class="min-w-0">
        <span class="d-block fw-semibold text-truncate">${esc(rec.title || "Sin título")}</span>
        <span class="d-block text-muted small text-truncate">${bits.join(" · ") || "&nbsp;"}</span>
      </span>
      <span class="d-flex flex-column align-items-end gap-1 flex-shrink-0 text-end">
        <span class="d-flex flex-wrap justify-content-end gap-1">${badges.join("")}</span>
        <span class="text-muted fs-8"><i class="bi bi-clock-history me-1" aria-hidden="true"></i>${fmtDate(rec.updated_at)}</span>
      </span>
    </button>`;
}

function renderPager(data) {
  const from = data.returned_offset + 1;
  const to = data.returned_offset + data.count;
  pagerLabel.textContent = `${num(from)}–${num(to)} de ${num(data.total_matches)}`;
  prevButton.disabled = state.offset <= 0;
  nextButton.disabled = to >= data.total_matches;
  pager.hidden = data.total_matches <= state.limit && state.offset === 0;
}

// ---------- offcanvas de detalle ----------
function detailRow(label, value, isHtml = false) {
  const display = value === null || value === undefined || value === "" ? "—" : value;
  return `<div class="detail-row"><dt>${esc(label)}</dt><dd>${isHtml ? display : esc(display)}</dd></div>`;
}

async function openDrawer(id, title, type) {
  drawerTitle.textContent = title || "Registro";
  drawerType.textContent = typeLabel(type);
  recordOffcanvas.show();

  if (detailCache.has(id)) { drawerBody.innerHTML = detailCache.get(id); return; }
  drawerBody.innerHTML = `<div class="d-flex justify-content-center py-5"><span class="spinner-border" role="status" aria-label="Cargando"></span></div>`;
  try {
    const res = await fetch(`/api/records/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const rec = await res.json();
    const html = detail(rec);
    detailCache.set(id, html);
    drawerBody.innerHTML = html;
  } catch (err) {
    alertBox(drawerBody, "danger", "No se pudo cargar el registro", String(err));
  }
}

function detail(rec) {
  const location = [rec.location_name, rec.city, rec.state, rec.country]
    .filter(Boolean)
    .join(" · ");

  const tags = (rec.tags || []).length
    ? rec.tags.map((t) => `<span class="badge text-bg-secondary">${esc(t)}</span>`).join(" ")
    : "—";

  let sourceLink = esc(rec.source_name || "—");
  if (rec.source_url) {
    sourceLink = `<a class="btn btn-link p-0 align-baseline" href="${esc(rec.source_url)}" target="_blank" rel="noopener">${esc(rec.source_name || rec.source_url)} <i class="bi bi-link-45deg" aria-hidden="true"></i></a>`;
  }

  const badges = [`<span class="badge text-bg-primary">${esc(typeLabel(rec.record_type))}</span>`];
  if (rec.verified === true) badges.push(`<span class="badge text-bg-success"><i class="bi bi-patch-check me-1" aria-hidden="true"></i>Verificado</span>`);
  if (rec.status) badges.push(`<span class="badge border text-secondary">${esc(rec.status)}</span>`);

  const hasRaw = rec.raw && Object.keys(rec.raw).length;

  const img = rec.image_url
    ? `<img src="${esc(rec.image_url)}" alt="Imagen de ${esc(rec.title || "registro")}"
         class="img-fluid rounded mb-3 d-block" style="max-height:280px;object-fit:cover;width:100%"
         loading="lazy" referrerpolicy="no-referrer"
         onerror="this.remove()">`
    : "";

  return `
    ${img}
    <div class="d-flex flex-wrap gap-1 mb-3">${badges.join(" ")}</div>
    ${rec.summary ? `<p class="text-muted">${esc(rec.summary)}</p>` : ""}
    <dl class="mb-3">
      ${detailRow("Persona", rec.person_name)}
      ${detailRow("Cédula", rec.cedula)}
      ${detailRow("Edad", rec.age)}
      ${detailRow("Organización", rec.organization)}
      ${detailRow("Ubicación", location)}
      ${detailRow("Contacto", rec.contact)}
      ${detailRow("Etiquetas", tags, true)}
      ${detailRow("Fuente", sourceLink, true)}
      ${detailRow("Observado", fmtDate(rec.observed_at))}
      ${detailRow("Actualizado", fmtDate(rec.updated_at))}
    </dl>
    ${hasRaw ? `<details class="mb-0"><summary class="eyebrow mb-2" style="cursor:pointer">Datos de origen (raw)</summary>
       <pre class="doc-block mb-0">${esc(JSON.stringify(rec.raw, null, 2))}</pre></details>` : ""}`;
}

// ---------- eventos ----------
sourceFilter.addEventListener("input", renderSources);
sourceSort.addEventListener("change", renderSources);
$("backButton").addEventListener("click", backToSources);
sourcesList.addEventListener("keydown", (e) => {
  const card = e.target.closest("[data-source]");
  if (card && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    openSource(card.dataset.source);
  }
});
$("recordsSearch").addEventListener("submit", (e) => {
  e.preventDefault();
  state.q = qInput.value.trim();
  state.recordType = typeInput.value;
  state.offset = 0;
  loadRecords();
});
typeInput.addEventListener("change", () => {
  state.recordType = typeInput.value; state.offset = 0; loadRecords();
});
limitInput.addEventListener("change", () => { state.offset = 0; loadRecords(); });
prevButton.addEventListener("click", () => { state.offset = Math.max(0, state.offset - state.limit); loadRecords(); window.scrollTo(0, 0); });
nextButton.addEventListener("click", () => { state.offset += state.limit; loadRecords(); window.scrollTo(0, 0); });
window.addEventListener("popstate", () => {
  const sid = new URLSearchParams(location.search).get("source");
  if (!sid) backToSources();
});

// ---------- inicio ----------
async function init() {
  markActiveNav();
  loadHealth();
  await loadSources();
  const sid = new URLSearchParams(location.search).get("source");
  if (sid && allSources.some((s) => s.id === sid)) openSource(sid);
}
init();
