/* detail.js — render del detalle de un registro en el drawer.
 * Expone RH.openRecord(id) y RH.renderDetail(record). Requiere en el DOM:
 *   #recordDrawer, #drawerTitle, #drawerType, #drawerBody  */
(function () {
  "use strict";
  const R = window.RH;
  const { escapeHtml, formatDate, typeChip, actionLinks, fetchJSON, openDrawer } = R;

  function detailRow(label, value, isHtml) {
    const v = value == null || value === "" ? "—" : value;
    return `<div class="grid grid-cols-[7rem_1fr] gap-3 border-b border-slate-100 py-2 last:border-0">
      <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">${escapeHtml(label)}</dt>
      <dd class="text-sm text-slate-800">${isHtml ? v : escapeHtml(v)}</dd></div>`;
  }

  function renderDetail(r) {
    const drawerType = document.getElementById("drawerType");
    const drawerTitle = document.getElementById("drawerTitle");
    const drawerBody = document.getElementById("drawerBody");
    const loc = [r.location_name, r.city, r.state, r.country].filter(Boolean).join(" · ");
    const tags = (r.tags || []).length
      ? r.tags.map((t) => `<span class="mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">${escapeHtml(t)}</span>`).join("")
      : "—";
    let src = escapeHtml(r.source_name || "—");
    if (r.source_url) src = `<a class="text-brand hover:underline" href="${escapeHtml(r.source_url)}" target="_blank" rel="noopener">${escapeHtml(r.source_name || r.source_url)} →</a>`;
    const also = r.entity_id
      ? `<a href="/entidad?id=${encodeURIComponent(r.entity_id)}" class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">Ver en todas las fuentes →</a>` : "";

    if (drawerType) drawerType.innerHTML = typeChip(r.record_type);
    if (drawerTitle) drawerTitle.textContent = r.title || r.person_name || "Detalle";
    if (drawerBody) drawerBody.innerHTML = `
      ${r.image_url ? `<img src="${escapeHtml(r.image_url)}" alt="" referrerpolicy="no-referrer" class="mb-4 max-h-56 w-full rounded-lg object-cover ring-1 ring-slate-200" onerror="this.remove()">` : ""}
      ${actionLinks(r) ? `<div class="mb-4 flex flex-wrap gap-2">${actionLinks(r)}</div>` : ""}
      ${r.summary ? `<p class="mb-4 text-sm text-slate-600">${escapeHtml(r.summary)}</p>` : ""}
      <dl>
        ${detailRow("Persona", r.person_name)}
        ${detailRow("Cédula", r.cedula)}
        ${detailRow("Edad", r.age)}
        ${detailRow("Organización", r.organization)}
        ${detailRow("Ubicación", loc)}
        ${detailRow("Contacto", r.contact)}
        ${detailRow("Estado", r.status)}
        ${detailRow("Etiquetas", tags, true)}
        ${detailRow("Fuente", src, true)}
        ${detailRow("Observado", formatDate(r.observed_at))}
        ${detailRow("Actualizado", formatDate(r.updated_at))}
      </dl>${also}`;
  }

  async function openRecord(id) {
    const el = document.getElementById("recordDrawer");
    const dr = openDrawer(el);
    document.getElementById("drawerTitle").textContent = "Cargando…";
    document.getElementById("drawerType").innerHTML = "";
    document.getElementById("drawerBody").innerHTML = `<div class="space-y-2"><div class="h-4 w-2/3 rounded shimmer"></div><div class="h-4 w-1/2 rounded shimmer"></div><div class="h-4 w-5/6 rounded shimmer"></div></div>`;
    dr && dr.show();
    try { renderDetail(await fetchJSON(`/api/records/${encodeURIComponent(id)}`)); }
    catch (_) {
      document.getElementById("drawerTitle").textContent = "Error";
      document.getElementById("drawerBody").innerHTML = `<div class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">No se pudo cargar el registro.</div>`;
    }
  }

  R.renderDetail = renderDetail;
  R.openRecord = openRecord;
})();
