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

const drawer = $("drawer");
const drawerBackdrop = $("drawerBackdrop");
const drawerBody = $("drawerBody");
const drawerTitle = $("drawerTitle");
const drawerType = $("drawerType");

const state = { sourceId: null, q: "", recordType: "", limit: 25, offset: 0 };
let allSources = [];
const detailCache = new Map();

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
function msg(el, type, title, body = "") {
  el.innerHTML = `<div class="message ${type === "error" ? "error" : ""}">
    <strong>${esc(title)}</strong>${body ? `<p>${esc(body)}</p>` : ""}</div>`;
}
function skeleton(n, cls) {
  return Array.from({ length: n }, () => `<div class="${cls}"></div>`).join("");
}

// ---------- listado de fuentes ----------
async function loadSources() {
  sourcesMessage.innerHTML = "";
  sourcesList.innerHTML = skeleton(6, "skeleton-row");
  try {
    const res = await fetch("/api/sources");
    allSources = await res.json();
    renderStats();
    renderSources();
  } catch (err) {
    sourcesList.innerHTML = "";
    msg(sourcesMessage, "error", "No se pudieron cargar las fuentes", String(err));
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
    sourcesList.innerHTML = `<div class="empty-state"><strong>Sin resultados</strong>
      ${allSources.length ? "Ninguna fuente coincide con el filtro." : "Aún no hay fuentes registradas."}</div>`;
    return;
  }

  sourcesList.innerHTML = list.map(card).join("");
  sourcesList.querySelectorAll("[data-source]").forEach((el) => {
    el.addEventListener("click", () => openSource(el.dataset.source));
  });
}

function card(s) {
  return `
    <button class="source-card ${s.enabled ? "" : "is-disabled"}" data-source="${esc(s.id)}">
      <div class="sc-top">
        <h2 class="sc-name">${esc(s.name)}</h2>
        <span class="sc-status ${s.enabled ? "" : "off"}" title="${s.enabled ? "activa" : "deshabilitada"}"></span>
      </div>
      <div class="sc-count"><b>${num(s.record_count)}</b><span>registros</span></div>
      <div class="sc-tags"><span class="badge">${esc(s.kind)}</span></div>
      ${s.description ? `<p class="sc-desc">${esc(s.description)}</p>` : ""}
      <div class="sc-foot">
        <span>Sync: ${fmtDate(s.last_sync)}</span>
        <span class="sc-go">Ver →</span>
      </div>
    </button>`;
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
  const bits = [
    `<span class="badge">${esc(s.kind)}</span>`,
    `<span><b>${num(s.record_count)}</b> registros</span>`,
    `<span>Últ. sync: <b>${fmtDate(s.last_sync)}</b></span>`,
  ];
  if (s.url) bits.push(`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>`);
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
  recordsList.innerHTML = skeleton(6, "skeleton-row");
  pager.hidden = true;
  state.limit = Number(limitInput.value) || 25;

  const params = new URLSearchParams({
    source_id: state.sourceId, q: state.q,
    limit: String(state.limit), offset: String(state.offset),
  });
  if (state.recordType) params.set("record_type", state.recordType);

  try {
    const res = await fetch(`/api/records/search?${params}`);
    const data = await res.json();
    populateTypes(data.record_types);
    recordsCount.textContent = `${num(data.total_matches)} registros · ${data.elapsed_ms} ms`;

    if (!data.results.length) {
      recordsList.innerHTML = `<div class="empty-state"><strong>Sin registros</strong>
        ${state.q || state.recordType ? "Prueba otra búsqueda o filtro." : "Esta fuente todavía no tiene registros indexados."}</div>`;
      return;
    }
    recordsList.innerHTML = data.results.map((r) => row(r.record)).join("");
    recordsList.querySelectorAll("[data-record]").forEach((el) => {
      el.addEventListener("click", () => openDrawer(el.dataset.record, el.dataset.title, el.dataset.type));
    });
    renderPager(data);
  } catch (err) {
    recordsList.innerHTML = "";
    msg(recordsMessage, "error", "No se pudieron cargar los registros", String(err));
  }
}

function populateTypes(types) {
  if (!types || !types.length) return;
  const cur = state.recordType;
  typeInput.innerHTML = ['<option value="">Todos los tipos</option>']
    .concat(types.map((t) => `<option value="${esc(t)}"${t === cur ? " selected" : ""}>${esc(t)}</option>`))
    .join("");
}

function row(rec) {
  const bits = [];
  if (rec.cedula) bits.push("CI " + esc(rec.cedula));
  if (rec.city) bits.push(esc(rec.city));
  if (rec.organization && rec.organization !== rec.title) bits.push(esc(rec.organization));
  if (rec.status) bits.push(esc(rec.status));
  return `
    <button class="rec" data-record="${esc(rec.id)}" data-title="${esc(rec.title)}" data-type="${esc(rec.record_type)}">
      <div class="rec-main">
        <p class="rec-title">${esc(rec.title || "Sin título")}</p>
        <p class="rec-sub">${bits.join(" · ") || "&nbsp;"}</p>
      </div>
      <div class="rec-aside">
        <span class="badge">${esc(rec.record_type)}</span>
        <span class="rec-date">${fmtDate(rec.updated_at)}</span>
        <span class="rec-chevron" aria-hidden="true">›</span>
      </div>
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

// ---------- drawer de detalle ----------
const FIELDS = [
  ["person_name", "Persona", 1], ["cedula", "Cédula", 0], ["age", "Edad", 0],
  ["organization", "Organización", 1], ["location_name", "Ubicación", 1],
  ["city", "Ciudad", 0], ["state", "Estado", 0], ["country", "País", 0],
  ["latitude", "Lat", 0], ["longitude", "Lng", 0], ["contact", "Contacto", 1],
  ["status", "Estatus", 0], ["verified", "Verificado", 0], ["summary", "Resumen", 1],
  ["source_id", "Fuente", 0], ["source_record_id", "ID en fuente", 0],
  ["source_url", "URL fuente", 1], ["origin_node", "Nodo origen", 0],
  ["entity_id", "Entidad", 0], ["observed_at", "Observado", 0], ["updated_at", "Actualizado", 0],
];

async function openDrawer(id, title, type) {
  drawerTitle.textContent = title || "Registro";
  drawerType.textContent = (type || "").toUpperCase();
  drawer.classList.add("open");
  drawerBackdrop.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");

  if (detailCache.has(id)) { drawerBody.innerHTML = detailCache.get(id); return; }
  drawerBody.innerHTML = `<p class="hint">Cargando…</p>`;
  try {
    const res = await fetch(`/api/records/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const rec = await res.json();
    const html = detail(rec);
    detailCache.set(id, html);
    drawerBody.innerHTML = html;
  } catch (err) {
    drawerBody.innerHTML = `<p class="hint">No se pudo cargar: ${esc(String(err))}</p>`;
  }
}

function detail(rec) {
  const rows = FIELDS
    .filter(([k]) => rec[k] !== null && rec[k] !== undefined && rec[k] !== "")
    .map(([k, label, wide]) => {
      let v = rec[k];
      if (k === "observed_at" || k === "updated_at") v = fmtDate(v);
      if (typeof v === "boolean") v = v ? "sí" : "no";
      return `<div class="kv${wide ? " wide" : ""}"><span>${esc(label)}</span><strong>${esc(v)}</strong></div>`;
    }).join("");
  const tags = (rec.tags || []).map((t) => `<span class="badge">${esc(t)}</span>`).join("");
  const hasRaw = rec.raw && Object.keys(rec.raw).length;
  return `
    <div class="kv-list">${rows}</div>
    ${tags ? `<div class="drawer-tags">${tags}</div>` : ""}
    ${hasRaw ? `<details class="drawer-raw"><summary>Datos de origen (raw)</summary>
       <pre class="doc-block">${esc(JSON.stringify(rec.raw, null, 2))}</pre></details>` : ""}`;
}

function closeDrawer() {
  drawer.classList.remove("open");
  drawerBackdrop.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}

// ---------- eventos ----------
sourceFilter.addEventListener("input", renderSources);
sourceSort.addEventListener("change", renderSources);
$("backButton").addEventListener("click", backToSources);
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
prevButton.addEventListener("click", () => { state.offset = Math.max(0, state.offset - state.limit); loadRecords(); });
nextButton.addEventListener("click", () => { state.offset += state.limit; loadRecords(); window.scrollTo(0, 0); });
$("drawerClose").addEventListener("click", closeDrawer);
drawerBackdrop.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
window.addEventListener("popstate", () => {
  const sid = new URLSearchParams(location.search).get("source");
  if (!sid) backToSources();
});

// ---------- inicio ----------
async function init() {
  await loadSources();
  const sid = new URLSearchParams(location.search).get("source");
  if (sid && allSources.some((s) => s.id === sid)) openSource(sid);
}
init();
