/* mapa.js — mapa Leaflet de registros con coordenadas. */
(function () {
  "use strict";
  const R = window.RH;
  const { escapeHtml, compactNumber, typeMeta, fetchJSON } = R;

  const TYPES = [
    { v: "", label: "Todo" },
    { v: "centro_acopio", label: "Acopio" },
    { v: "centro_donacion", label: "Donación" },
    { v: "persona_hospitalizada", label: "Hospitales" },
    { v: "recurso", label: "Recursos" },
    { v: "persona_desaparecida", label: "Desaparecidos" },
  ];

  const form = document.getElementById("mapForm");
  const queryInput = document.getElementById("mapQuery");
  const chipsEl = document.getElementById("mapChips");
  const countEl = document.getElementById("mapCount");
  const messageEl = document.getElementById("mapMessage");

  let map, layer, state = { type: "", q: "" };

  // chips
  chipsEl.innerHTML = TYPES.map((t) =>
    `<button type="button" data-type="${t.v}" aria-pressed="${t.v === "" ? "true" : "false"}"
      class="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 aria-pressed:border-slate-900 aria-pressed:bg-slate-900 aria-pressed:text-white">${t.label}</button>`
  ).join("");

  function setChips() {
    chipsEl.querySelectorAll("[data-type]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.type === state.type)));
  }

  function initMap() {
    map = L.map("map", { scrollWheelZoom: true }).setView([8.0, -66.0], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap",
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }

  function popupHtml(r) {
    const m = typeMeta(r.record_type);
    const loc = [r.city, r.state].filter(Boolean).join(", ");
    return `<div style="min-width:180px">
      <div style="font-weight:600;margin-bottom:2px">${escapeHtml(r.title || r.person_name || "Registro")}</div>
      <div style="font-size:12px;color:#64748b">${escapeHtml(m.label)}${loc ? " · " + escapeHtml(loc) : ""}</div>
      <button type="button" data-detail="${escapeHtml(r.id)}" style="margin-top:6px;font-size:12px;font-weight:600;color:#2563eb;background:none;border:0;cursor:pointer;padding:0">Ver detalle →</button>
    </div>`;
  }

  async function load() {
    messageEl.innerHTML = "";
    const p = new URLSearchParams({ limit: "100", offset: "0" });
    if (state.q) p.set(state.q.match(/^\d{5,}$/) ? "cedula" : "q", state.q);
    if (state.type) p.set("record_type", state.type);
    try {
      const data = await fetchJSON(`/api/records/search?${p}`);
      const withGeo = data.results.map((x) => x.record).filter((r) => r.latitude != null && r.longitude != null);
      layer.clearLayers();
      countEl.textContent = `${compactNumber(withGeo.length)} con ubicación · ${compactNumber(data.total_matches)} en total`;
      if (!withGeo.length) {
        messageEl.innerHTML = `<div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Ningún resultado tiene coordenadas. Prueba otro filtro o usa la <a href="/" class="font-semibold underline">búsqueda</a>.</div>`;
        return;
      }
      const pts = [];
      withGeo.forEach((r) => {
        const m = typeMeta(r.record_type);
        const marker = L.circleMarker([r.latitude, r.longitude], {
          radius: 8, color: "#fff", weight: 2, fillColor: m.hex, fillOpacity: 0.95,
        }).bindPopup(popupHtml(r));
        layer.addLayer(marker);
        pts.push([r.latitude, r.longitude]);
      });
      if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
    } catch (_) {
      messageEl.innerHTML = `<div class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">No se pudo cargar el mapa.</div>`;
    }
  }

  // eventos
  form.addEventListener("submit", (e) => { e.preventDefault(); state.q = queryInput.value.trim(); load(); });
  queryInput.addEventListener("search", () => { state.q = queryInput.value.trim(); load(); });
  chipsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]"); if (!b) return;
    state.type = b.dataset.type; setChips(); load();
  });
  // delegación del botón "ver detalle" dentro de los popups de Leaflet
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-detail]");
    if (b && R.openRecord) R.openRecord(b.dataset.detail);
  });

  initMap();
  load();
})();
