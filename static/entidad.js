/* entidad.js — "la misma persona/recurso entre fuentes" (/api/entities/{id}). */
(function () {
  "use strict";
  const R = window.RH;
  const { escapeHtml, compactNumber, formatDate, typeChip, typeMeta, thumb, actionLinks, fetchJSON } = R;
  const root = document.getElementById("entityRoot");

  const id = new URLSearchParams(location.search).get("id");

  function fieldCell(value, conflict) {
    const v = value == null || value === "" ? "—" : escapeHtml(value);
    return `<td class="px-3 py-2 align-top text-sm ${conflict ? "bg-amber-50 font-medium text-amber-900" : "text-slate-700"}">${v}</td>`;
  }

  // Campos a comparar entre versiones; resaltamos los que difieren.
  const COMPARE = [
    ["status", "Estado"], ["person_name", "Persona"], ["cedula", "Cédula"],
    ["age", "Edad"], ["city", "Ciudad"], ["contact", "Contacto"], ["verified", "Verificado"],
  ];

  function render(data) {
    const e = data.entity || {};
    const members = (data.members || []).map((m) => m.record);
    const title = e.canonical_title || (members[0] && (members[0].title || members[0].person_name)) || "Entidad";

    // ¿qué campos están en conflicto entre fuentes?
    const conflicts = {};
    COMPARE.forEach(([k]) => {
      const vals = new Set(members.map((r) => (r[k] == null ? "" : String(r[k]))).filter((x) => x !== ""));
      conflicts[k] = vals.size > 1;
    });

    // timeline por observed_at
    const timeline = members
      .filter((r) => r.observed_at)
      .sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at));

    const headRecord = members[0] || {};

    root.innerHTML = `
      <header class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex items-start gap-4">
          ${thumb(headRecord, "h-16 w-16")}
          <div class="min-w-0 flex-1">
            <div class="mb-1.5 flex flex-wrap items-center gap-2">
              ${typeChip(headRecord.record_type)}
              <span class="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">aparece en ${compactNumber(members.length)} fuentes</span>
            </div>
            <h1 class="text-2xl font-bold tracking-tight">${escapeHtml(title)}</h1>
            ${e.canonical_cedula ? `<p class="mt-0.5 text-sm text-slate-500">Cédula ${escapeHtml(e.canonical_cedula)}</p>` : ""}
            ${e.strongest_signal ? `<p class="mt-1 text-xs text-slate-400">Enlace por: ${escapeHtml(e.strongest_signal)}</p>` : ""}
          </div>
        </div>
        ${actionLinks(headRecord) ? `<div class="mt-4 flex flex-wrap gap-2">${actionLinks(headRecord)}</div>` : ""}
      </header>

      ${Object.values(conflicts).some(Boolean) ? `<div class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">⚠ Hay campos que <strong>no coinciden</strong> entre fuentes (resaltados abajo). Verifica antes de actuar.</div>` : ""}

      <h2 class="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Comparación entre fuentes</h2>
      <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <th class="px-3 py-2 font-medium">Campo</th>
              ${members.map((r) => `<th class="px-3 py-2 font-medium text-slate-600">${escapeHtml(r.source_name || r.source_id)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${COMPARE.map(([k, label]) => `<tr class="border-b border-slate-100 last:border-0">
              <td class="px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">${label}${conflicts[k] ? ' <span class="text-amber-500">≠</span>' : ""}</td>
              ${members.map((r) => fieldCell(fmt(k, r[k]), conflicts[k])).join("")}
            </tr>`).join("")}
            <tr>
              <td class="px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">Observado</td>
              ${members.map((r) => fieldCell(formatDate(r.observed_at), false)).join("")}
            </tr>
          </tbody>
        </table>
      </div>

      ${timeline.length > 1 ? `
        <h2 class="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Línea de tiempo</h2>
        <ol class="relative ml-3 border-l border-slate-200">
          ${timeline.map((r) => `<li class="mb-4 ml-4">
            <span class="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ${typeMeta(r.record_type).dot} ring-2 ring-white"></span>
            <div class="text-xs text-slate-400">${formatDate(r.observed_at)}</div>
            <div class="text-sm text-slate-700"><span class="font-medium">${escapeHtml(r.source_name || r.source_id)}</span>${r.status ? " · " + escapeHtml(r.status) : ""}</div>
          </li>`).join("")}
        </ol>` : ""}

      <h2 class="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Versiones completas</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        ${members.map((r) => `<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div class="mb-2 flex items-center justify-between">
            <span class="font-semibold text-slate-900">${escapeHtml(r.source_name || r.source_id)}</span>
            ${r.verified === true ? '<span class="text-xs font-medium text-emerald-600">✓ verificado</span>' : ""}
          </div>
          ${r.summary ? `<p class="mb-2 text-sm text-slate-500">${escapeHtml(r.summary)}</p>` : ""}
          ${r.source_url ? `<a href="${escapeHtml(r.source_url)}" target="_blank" rel="noopener" class="text-sm font-medium text-brand hover:underline">Ir a la fuente →</a>` : ""}
        </div>`).join("")}
      </div>`;
  }

  function fmt(k, v) {
    if (k === "verified") return v === true ? "sí" : v === false ? "no" : "";
    return v;
  }

  function renderError(msg) {
    root.innerHTML = `<div class="rounded-xl border border-rose-200 bg-rose-50 px-5 py-8 text-center">
      <p class="font-semibold text-rose-800">${escapeHtml(msg)}</p>
      <a href="/" class="mt-2 inline-block text-sm font-medium text-brand hover:underline">Volver a la búsqueda</a></div>`;
  }

  async function init() {
    if (!id) { renderError("Falta el identificador de la entidad."); return; }
    root.innerHTML = `<div class="space-y-3"><div class="h-24 rounded-xl shimmer"></div><div class="h-40 rounded-xl shimmer"></div></div>`;
    try {
      const data = await fetchJSON(`/api/entities/${encodeURIComponent(id)}`);
      if (!data || !(data.members || []).length) { renderError("No se encontró esta entidad."); return; }
      render(data);
    } catch (err) {
      renderError(err.status === 404 ? "Esta entidad no existe o ya no está disponible." : "No se pudo cargar la entidad.");
    }
  }

  init();
})();
