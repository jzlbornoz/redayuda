"use strict";

const sourcesView = document.getElementById("sourcesView");
const recordsView = document.getElementById("recordsView");
const sourcesList = document.getElementById("sourcesList");
const sourcesCount = document.getElementById("sourcesCount");
const sourcesMessage = document.getElementById("sourcesMessage");

const recordsList = document.getElementById("recordsList");
const recordsMessage = document.getElementById("recordsMessage");
const recordsTitle = document.getElementById("recordsTitle");
const recordsKind = document.getElementById("recordsKind");
const recordsMeta = document.getElementById("recordsMeta");

const qInput = document.getElementById("qInput");
const typeInput = document.getElementById("typeInput");
const limitInput = document.getElementById("limitInput");
const pager = document.getElementById("pager");
const pagerLabel = document.getElementById("pagerLabel");
const prevButton = document.getElementById("prevButton");
const nextButton = document.getElementById("nextButton");

const state = { sourceId: null, sourceName: "", q: "", recordType: "", limit: 20, offset: 0, total: 0 };
const detailCache = new Map();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function num(value) {
  if (value === null || value === undefined) return "0";
  return new Intl.NumberFormat("es-VE").format(value);
}

function msg(el, type, title, body = "") {
  el.innerHTML = `<div class="message ${type === "error" ? "error" : ""}">
    <strong>${escapeHtml(title)}</strong>${body ? `<p>${escapeHtml(body)}</p>` : ""}</div>`;
}

// ---------- Listado de fuentes ----------

async function loadSources() {
  sourcesMessage.innerHTML = "";
  sourcesList.innerHTML = `<div class="skeleton"></div>`;
  try {
    const res = await fetch("/api/sources");
    const sources = await res.json();
    sourcesCount.textContent = `${sources.length} fuente${sources.length === 1 ? "" : "s"}`;
    if (!sources.length) {
      sourcesList.innerHTML = "";
      msg(sourcesMessage, "info", "Sin fuentes registradas todavía.");
      return;
    }
    sourcesList.innerHTML = sources.map(sourceCard).join("");
    sourcesList.querySelectorAll("[data-source]").forEach((el) => {
      el.addEventListener("click", () => openSource(el.dataset.source, el.dataset.name, el.dataset.kind));
    });
  } catch (err) {
    sourcesList.innerHTML = "";
    msg(sourcesMessage, "error", "No se pudieron cargar las fuentes", String(err));
  }
}

function sourceCard(s) {
  const enabled = s.enabled
    ? ""
    : `<span class="badge warning">deshabilitada</span>`;
  return `
    <button class="source-card" data-source="${escapeHtml(s.id)}" data-name="${escapeHtml(s.name)}" data-kind="${escapeHtml(s.kind)}">
      <div class="source-card-head">
        <h2 class="source-card-name">${escapeHtml(s.name)}</h2>
        <span class="source-card-count">${num(s.record_count)}<small>registros</small></span>
      </div>
      <div class="source-card-tags">
        <span class="badge">${escapeHtml(s.kind)}</span>${enabled}
      </div>
      ${s.description ? `<p class="source-card-desc">${escapeHtml(s.description)}</p>` : ""}
      <div class="source-card-foot">
        <span>Últ. sync: ${fmtDate(s.last_sync)}</span>
        <span class="source-card-go">Ver registros →</span>
      </div>
    </button>`;
}

// ---------- Detalle de una fuente (sus registros) ----------

function openSource(id, name, kind) {
  state.sourceId = id;
  state.sourceName = name;
  state.q = "";
  state.recordType = "";
  state.offset = 0;
  qInput.value = "";
  typeInput.innerHTML = `<option value="">Todos los tipos</option>`;
  recordsTitle.textContent = name;
  recordsKind.textContent = (kind || "fuente").toUpperCase();
  sourcesView.hidden = true;
  recordsView.hidden = false;
  history.pushState({ source: id }, "", `/fuentes?source=${encodeURIComponent(id)}`);
  loadRecords();
}

function backToSources() {
  recordsView.hidden = true;
  sourcesView.hidden = false;
  history.pushState({}, "", "/fuentes");
}

async function loadRecords() {
  recordsMessage.innerHTML = "";
  recordsList.innerHTML = `<div class="skeleton"></div>`;
  pager.hidden = true;
  state.limit = Number(limitInput.value) || 20;

  const params = new URLSearchParams({
    source_id: state.sourceId,
    q: state.q,
    limit: String(state.limit),
    offset: String(state.offset),
  });
  if (state.recordType) params.set("record_type", state.recordType);

  try {
    const res = await fetch(`/api/records/search?${params.toString()}`);
    const data = await res.json();
    state.total = data.total_matches;

    populateTypes(data.record_types);
    recordsMeta.textContent =
      `${num(data.total_matches)} registros · ${data.elapsed_ms} ms`;

    if (!data.results.length) {
      recordsList.innerHTML = "";
      msg(recordsMessage, "info", "Sin registros para esta búsqueda.");
      return;
    }

    recordsList.innerHTML = data.results.map((r) => recordRow(r.record)).join("");
    recordsList.querySelectorAll("[data-record]").forEach((el) => {
      el.addEventListener("click", () => toggleDetail(el));
    });
    renderPager(data);
  } catch (err) {
    recordsList.innerHTML = "";
    msg(recordsMessage, "error", "No se pudieron cargar los registros", String(err));
  }
}

function populateTypes(types) {
  if (!types || !types.length) return;
  const current = state.recordType;
  const opts = ['<option value="">Todos los tipos</option>']
    .concat(types.map((t) => `<option value="${escapeHtml(t)}"${t === current ? " selected" : ""}>${escapeHtml(t)}</option>`));
  typeInput.innerHTML = opts.join("");
}

function recordRow(rec) {
  const bits = [];
  if (rec.person_name) bits.push(escapeHtml(rec.person_name));
  if (rec.cedula) bits.push("CI " + escapeHtml(rec.cedula));
  if (rec.organization && rec.organization !== rec.person_name) bits.push(escapeHtml(rec.organization));
  if (rec.city) bits.push(escapeHtml(rec.city));
  return `
    <div class="record-item" data-record="${escapeHtml(rec.id)}">
      <div class="record-row">
        <div>
          <h3 class="record-title">${escapeHtml(rec.title || "Sin título")}</h3>
          <p class="record-sub">${bits.join(" · ") || "&nbsp;"}</p>
        </div>
        <div class="record-aside">
          <span class="badge">${escapeHtml(rec.record_type)}</span>
          <span class="record-date">${fmtDate(rec.updated_at)}</span>
        </div>
      </div>
      <div class="record-detail" hidden></div>
    </div>`;
}

async function toggleDetail(item) {
  const id = item.dataset.record;
  const box = item.querySelector(".record-detail");
  if (!box.hidden) { box.hidden = true; item.classList.remove("open"); return; }

  item.classList.add("open");
  box.hidden = false;
  if (detailCache.has(id)) { box.innerHTML = detailCache.get(id); return; }

  box.innerHTML = `<p class="hint">Cargando…</p>`;
  try {
    const res = await fetch(`/api/records/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const rec = await res.json();
    const html = renderDetail(rec);
    detailCache.set(id, html);
    box.innerHTML = html;
  } catch (err) {
    box.innerHTML = `<p class="hint">No se pudo cargar el detalle: ${escapeHtml(String(err))}</p>`;
  }
}

const DETAIL_FIELDS = [
  ["record_type", "Tipo"], ["person_name", "Persona"], ["cedula", "Cédula"],
  ["age", "Edad"], ["organization", "Organización"], ["location_name", "Ubicación"],
  ["city", "Ciudad"], ["state", "Estado"], ["country", "País"],
  ["latitude", "Lat"], ["longitude", "Lng"], ["contact", "Contacto"],
  ["status", "Estatus"], ["verified", "Verificado"], ["summary", "Resumen"],
  ["source_id", "Fuente"], ["source_url", "URL fuente"], ["source_record_id", "ID en fuente"],
  ["origin_node", "Nodo origen"], ["entity_id", "Entidad"],
  ["observed_at", "Observado"], ["updated_at", "Actualizado"],
];

function renderDetail(rec) {
  const rows = DETAIL_FIELDS
    .filter(([k]) => rec[k] !== null && rec[k] !== undefined && rec[k] !== "")
    .map(([k, label]) => {
      let v = rec[k];
      if (k === "observed_at" || k === "updated_at") v = fmtDate(v);
      if (typeof v === "boolean") v = v ? "sí" : "no";
      return `<div class="kv"><span>${escapeHtml(label)}</span><strong>${escapeHtml(v)}</strong></div>`;
    }).join("");
  const tags = (rec.tags || []).map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join("");
  const raw = escapeHtml(JSON.stringify(rec.raw || {}, null, 2));
  return `
    <div class="detail-grid">${rows}</div>
    ${tags ? `<div class="detail-tags">${tags}</div>` : ""}
    ${Object.keys(rec.raw || {}).length ? `<details class="detail-raw"><summary>raw (origen)</summary><pre class="doc-block">${raw}</pre></details>` : ""}`;
}

function renderPager(data) {
  const from = data.returned_offset + 1;
  const to = data.returned_offset + data.count;
  pagerLabel.textContent = `${num(from)}–${num(to)} de ${num(data.total_matches)}`;
  prevButton.disabled = state.offset <= 0;
  nextButton.disabled = to >= data.total_matches;
  pager.hidden = data.total_matches <= state.limit && state.offset === 0;
}

// ---------- Eventos ----------

document.getElementById("backButton").addEventListener("click", backToSources);
document.getElementById("recordsSearch").addEventListener("submit", (e) => {
  e.preventDefault();
  state.q = qInput.value.trim();
  state.recordType = typeInput.value;
  state.offset = 0;
  loadRecords();
});
typeInput.addEventListener("change", () => {
  state.recordType = typeInput.value;
  state.offset = 0;
  loadRecords();
});
prevButton.addEventListener("click", () => {
  state.offset = Math.max(0, state.offset - state.limit);
  loadRecords();
});
nextButton.addEventListener("click", () => {
  state.offset += state.limit;
  loadRecords();
});
window.addEventListener("popstate", () => {
  const sid = new URLSearchParams(location.search).get("source");
  if (sid) { /* mantener vista actual */ } else { backToSources(); }
});

// ---------- Inicio (con deep-link ?source=) ----------

async function init() {
  await loadSources();
  const sid = new URLSearchParams(location.search).get("source");
  if (sid) {
    // Buscar nombre/kind en las tarjetas ya renderizadas
    const card = sourcesList.querySelector(`[data-source="${CSS.escape(sid)}"]`);
    openSource(sid, card ? card.dataset.name : sid, card ? card.dataset.kind : "fuente");
  }
}

init();
