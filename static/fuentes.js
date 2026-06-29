/* fuentes.js — directorio operativo de fuentes + detalle de registros. */
(function () {
  "use strict";
  const R = window.RH;
  const { escapeHtml, compactNumber, relativeTime, freshness, typeMeta, typeChip, thumb, actionLinks, fetchJSON } = R;
  const $ = (s) => document.querySelector(s);

  const sourcesView = $("#sourcesView"), recordsView = $("#recordsView");
  const sourcesList = $("#sourcesList"), sourcesMessage = $("#sourcesMessage");
  const filterInput = $("#sourceFilter"), sortSelect = $("#sourceSort");
  const kSources = $("#kSources"), kRecords = $("#kRecords"), kFresh = $("#kFresh"), kStale = $("#kStale");

  const sdTitle = $("#sdTitle"), sdMeta = $("#sdMeta");
  const recordsSearch = $("#recordsSearch"), qInput = $("#qInput"), typeInput = $("#typeInput");
  const recordsList = $("#recordsList"), recordsCount = $("#recordsCount"), recordsMessage = $("#recordsMessage");
  const prevButton = $("#prevButton"), nextButton = $("#nextButton"), pagerLabel = $("#pagerLabel");
  const backButton = $("#backButton");

  let allSources = [];
  const det = { source: null, offset: 0, limit: 25, total: 0 };

  // ---------------------------------------------------------------- lista
  function freshDot(tone) {
    const map = { emerald: "bg-ink-900", amber: "bg-ink-400", rose: "bg-red-600", slate: "bg-ink-200" };
    return map[tone] || "bg-ink-200";
  }

  function sourceCard(s) {
    const f = freshness(s.last_sync);
    const m = typeMeta(s.kind);
    return `<button type="button" data-id="${escapeHtml(s.id)}" class="rh-plain group flex flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow">
      <div class="flex items-start justify-between gap-2">
        <span class="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><span class="block h-5 w-5">${R.icons[m.icon]}</span></span>
        <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-slate-500"><span class="h-1.5 w-1.5 rounded-full ${freshDot(f.tone)}"></span>${f.label}</span>
      </div>
      <span class="mt-2 truncate font-semibold text-slate-900 group-hover:underline">${escapeHtml(s.name)}</span>
      <span class="mt-0.5 text-xs text-slate-400">${escapeHtml(typeMeta(s.kind).label)}${s.enabled ? "" : " · deshabilitada"}</span>
      <div class="mt-3 flex items-center justify-between text-sm">
        <span class="tabular-nums font-semibold text-slate-900">${compactNumber(s.record_count)} <span class="font-normal text-slate-400">registros</span></span>
        <span class="text-xs text-slate-400">${relativeTime(s.last_sync)}</span>
      </div>
    </button>`;
  }

  function renderSources() {
    const term = filterInput.value.trim().toLowerCase();
    let list = allSources.filter((s) => !term || `${s.name} ${s.kind}`.toLowerCase().includes(term));
    const sort = sortSelect.value;
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "recent") return (b.last_sync || "").localeCompare(a.last_sync || "");
      if (sort === "stale") return (a.last_sync || "").localeCompare(b.last_sync || "");
      return b.record_count - a.record_count;
    });
    sourcesList.innerHTML = list.length
      ? list.map(sourceCard).join("")
      : `<p class="text-sm text-slate-400">Sin fuentes que coincidan.</p>`;
  }

  async function loadSources() {
    sourcesMessage.innerHTML = "";
    sourcesList.innerHTML = Array.from({ length: 6 }).map(() => `<div class="h-32 rounded-xl shimmer"></div>`).join("");
    try {
      const data = await fetchJSON("/api/network/stats");
      allSources = data.sources || [];
      kSources.textContent = compactNumber(data.total_sources);
      kRecords.textContent = compactNumber(data.total_records);
      kFresh.textContent = compactNumber(allSources.filter((s) => freshness(s.last_sync).tone === "emerald").length);
      kStale.textContent = compactNumber(allSources.filter((s) => freshness(s.last_sync).tone === "rose").length);
      renderSources();
    } catch (_) {
      sourcesMessage.innerHTML = `<div class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">No se pudieron cargar las fuentes.</div>`;
      sourcesList.innerHTML = "";
    }
  }

  // ---------------------------------------------------------------- detalle
  function recordRow(r) {
    const loc = [r.city, r.state].filter(Boolean).join(", ");
    return `<article class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div class="flex gap-3">${thumb(r)}
        <div class="min-w-0 flex-1">
          <button type="button" data-id="${escapeHtml(r.id)}" class="rh-plain block truncate text-left font-semibold text-slate-900 hover:underline">${escapeHtml(r.title || r.person_name || "Registro")}</button>
          <div class="mt-1 flex flex-wrap items-center gap-1.5">${typeChip(r.record_type)}${loc ? `<span class="text-xs text-slate-500">${escapeHtml(loc)}</span>` : ""}</div>
          ${actionLinks(r) ? `<div class="mt-2 flex flex-wrap gap-1.5">${actionLinks(r)}</div>` : ""}
        </div></div></article>`;
  }

  async function loadRecords() {
    recordsMessage.innerHTML = "";
    recordsList.innerHTML = Array.from({ length: 4 }).map(() => `<div class="h-16 rounded-xl shimmer"></div>`).join("");
    const p = new URLSearchParams({ source_id: det.source.id, limit: String(det.limit), offset: String(det.offset) });
    if (qInput.value.trim()) p.set("q", qInput.value.trim());
    if (typeInput.value) p.set("record_type", typeInput.value);
    try {
      const data = await fetchJSON(`/api/records/search?${p}`);
      det.total = data.total_matches;
      recordsCount.textContent = `${compactNumber(data.total_matches)} registros`;
      recordsList.innerHTML = data.results.length
        ? data.results.map((x) => recordRow(x.record)).join("")
        : `<p class="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">Sin registros con estos filtros.</p>`;
      const from = det.offset + 1, to = Math.min(det.offset + det.limit, det.total);
      pagerLabel.textContent = det.total ? `${from}–${to} de ${compactNumber(det.total)}` : "—";
      prevButton.disabled = det.offset === 0;
      nextButton.disabled = det.offset + det.limit >= det.total;
    } catch (_) {
      recordsMessage.innerHTML = `<div class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">No se pudieron cargar los registros.</div>`;
      recordsList.innerHTML = "";
    }
  }

  function openSource(s) {
    det.source = s; det.offset = 0;
    sourcesView.hidden = true; recordsView.hidden = false;
    window.scrollTo(0, 0);
    const f = freshness(s.last_sync);
    sdTitle.textContent = s.name;
    sdMeta.innerHTML = `${typeChip(s.kind)}
      <span>${compactNumber(s.record_count)} registros</span>
      <span class="inline-flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-full ${freshDot(f.tone)}"></span>${f.label} · ${relativeTime(s.last_sync)}</span>
      ${s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" class="text-ink-900 underline">sitio →</a>` : ""}`;
    qInput.value = "";
    typeInput.innerHTML = '<option value="">Todos los tipos</option>' +
      Object.entries(R.TYPE_META).map(([k, m]) => `<option value="${k}">${escapeHtml(m.label)}</option>`).join("");
    loadRecords();
  }

  function backToList() { recordsView.hidden = true; sourcesView.hidden = false; window.scrollTo(0, 0); }

  // ---------------------------------------------------------------- eventos
  filterInput.addEventListener("input", renderSources);
  sortSelect.addEventListener("change", renderSources);
  sourcesList.addEventListener("click", (e) => {
    const b = e.target.closest("[data-id]"); if (!b) return;
    const s = allSources.find((x) => x.id === b.dataset.id); if (s) openSource(s);
  });
  backButton.addEventListener("click", backToList);
  recordsSearch.addEventListener("submit", (e) => { e.preventDefault(); det.offset = 0; loadRecords(); });
  prevButton.addEventListener("click", () => { if (det.offset > 0) { det.offset -= det.limit; loadRecords(); window.scrollTo(0, 0); } });
  nextButton.addEventListener("click", () => { if (det.offset + det.limit < det.total) { det.offset += det.limit; loadRecords(); window.scrollTo(0, 0); } });
  recordsList.addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b && R.openRecord) R.openRecord(b.dataset.id); });

  loadSources();
})();
