/* admin.js — panel admin con clave (x-admin-key) en sessionStorage. */
(function () {
  "use strict";
  const { escapeHtml, compactNumber, relativeTime, freshness, typeMeta, fetchJSON } = window.RH;
  const $ = (s) => document.querySelector(s);
  const KEY = "rh_admin_key";

  const gate = $("#gate"), panel = $("#panel"), gateMsg = $("#gateMsg");
  const adminMsg = $("#adminMsg");
  let adminKey = sessionStorage.getItem(KEY) || "";

  const hdr = () => ({ "x-admin-key": adminKey, "Content-Type": "application/json" });

  function msg(kind, text) {
    const tone = kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : kind === "warn" ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-rose-200 bg-rose-50 text-rose-800";
    adminMsg.innerHTML = `<div class="rounded-lg border ${tone} px-4 py-3 text-sm">${escapeHtml(text)}</div>`;
    setTimeout(() => { if (adminMsg.textContent === text) adminMsg.innerHTML = ""; }, 5000);
  }

  // ---------------------------------------------------------------- gate
  async function tryEnter(key) {
    try {
      await fetchJSON("/api/connectors/proposals?status=pending", { headers: { "x-admin-key": key } });
      adminKey = key; sessionStorage.setItem(KEY, key);
      gate.hidden = true; panel.hidden = false;
      selectTab("proposals");
      return true;
    } catch (err) {
      gateMsg.textContent = err.status === 401 || err.status === 403 ? "Clave incorrecta." : "No se pudo validar la clave.";
      return false;
    }
  }

  $("#keyForm").addEventListener("submit", (e) => { e.preventDefault(); const k = $("#keyInput").value.trim(); if (k) tryEnter(k); });
  $("#logoutBtn").addEventListener("click", () => { sessionStorage.removeItem(KEY); location.reload(); });

  // ---------------------------------------------------------------- tabs
  function selectTab(name) {
    document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    document.querySelectorAll("[data-pane]").forEach((p) => { p.hidden = p.dataset.pane !== name; });
    if (name === "proposals") loadProposals();
    if (name === "sources") loadSources();
    if (name === "peers") loadPeers();
  }
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.tab)));

  // ---------------------------------------------------------------- propuestas
  async function loadProposals() {
    const pane = $('[data-pane="proposals"]');
    pane.innerHTML = `<div class="h-24 rounded-xl shimmer"></div>`;
    try {
      const list = await fetchJSON("/api/connectors/proposals?status=pending", { headers: hdr() });
      $("#badgeProposals").textContent = list.length || "";
      if (!list.length) { pane.innerHTML = `<p class="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">Sin propuestas pendientes.</p>`; return; }
      pane.innerHTML = list.map(proposalCard).join("");
    } catch (_) { pane.innerHTML = ""; msg("err", "No se pudieron cargar las propuestas."); }
  }

  function proposalCard(p) {
    return `<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-pid="${escapeHtml(p.id)}">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="font-semibold text-slate-900">${escapeHtml(p.source_name)}</div>
          <div class="mt-0.5 text-xs text-slate-500">${escapeHtml(typeMeta(p.kind).label)} · ${escapeHtml(p.contact_email || "sin email")} · ${relativeTime(p.created_at)}</div>
          <a href="${escapeHtml(p.endpoint_url)}" target="_blank" rel="noopener" class="mt-1 block truncate text-xs text-brand hover:underline">${escapeHtml(p.endpoint_url)}</a>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <input class="rev-notes flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand" placeholder="Notas de revisión (opcional)">
        <label class="inline-flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" class="rev-enabled h-4 w-4 rounded border-slate-300 text-brand"> activar al aprobar</label>
        <button class="rev-approve rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">Aprobar</button>
        <button class="rev-reject rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50">Rechazar</button>
      </div>
    </div>`;
  }

  async function review(pid, action, card) {
    const notes = card.querySelector(".rev-notes").value.trim();
    const enabled = card.querySelector(".rev-enabled").checked;
    card.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      await fetchJSON(`/api/connectors/proposals/${encodeURIComponent(pid)}/review`, {
        method: "POST", headers: hdr(),
        body: JSON.stringify({ action, review_notes: notes || null, enabled }),
      });
      msg("ok", action === "approve" ? "Propuesta aprobada." : "Propuesta rechazada.");
      card.remove();
      const left = document.querySelectorAll('[data-pane="proposals"] [data-pid]').length;
      $("#badgeProposals").textContent = left || "";
      if (!left) loadProposals();
    } catch (_) { msg("err", "No se pudo procesar la revisión."); card.querySelectorAll("button").forEach((b) => (b.disabled = false)); }
  }

  $('[data-pane="proposals"]').addEventListener("click", (e) => {
    const card = e.target.closest("[data-pid]"); if (!card) return;
    if (e.target.closest(".rev-approve")) review(card.dataset.pid, "approve", card);
    if (e.target.closest(".rev-reject")) review(card.dataset.pid, "reject", card);
  });

  // ---------------------------------------------------------------- fuentes
  async function loadSources() {
    const pane = $('[data-pane="sources"]');
    pane.innerHTML = `<div class="h-24 rounded-xl shimmer"></div>`;
    try {
      const data = await fetchJSON("/api/network/stats");
      const sources = (data.sources || []).sort((a, b) => (a.last_sync || "").localeCompare(b.last_sync || ""));
      pane.innerHTML = `
        <div class="mb-3 flex items-center gap-2">
          <button id="syncAll" class="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700">Sincronizar todo</button>
          <span class="text-sm text-slate-500">${compactNumber(sources.length)} fuentes</span>
        </div>
        <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <th class="px-3 py-2 font-medium">Fuente</th><th class="px-3 py-2 font-medium">Registros</th><th class="px-3 py-2 font-medium">Última sync</th><th class="px-3 py-2"></th></tr></thead>
            <tbody>${sources.map(sourceRow).join("")}</tbody>
          </table></div>`;
      $("#syncAll").addEventListener("click", syncAll);
    } catch (_) { pane.innerHTML = ""; msg("err", "No se pudieron cargar las fuentes."); }
  }

  function sourceRow(s) {
    const f = freshness(s.last_sync);
    const dot = { emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500", slate: "bg-slate-300" }[f.tone];
    return `<tr class="border-b border-slate-100 last:border-0" data-sid="${escapeHtml(s.id)}">
      <td class="px-3 py-2"><div class="font-medium text-slate-800">${escapeHtml(s.name)}</div><div class="text-xs text-slate-400">${escapeHtml(s.id)}</div></td>
      <td class="px-3 py-2 tabular-nums">${compactNumber(s.record_count)}</td>
      <td class="px-3 py-2"><span class="inline-flex items-center gap-1.5 text-xs text-slate-500"><span class="h-1.5 w-1.5 rounded-full ${dot}"></span>${relativeTime(s.last_sync)}</span></td>
      <td class="px-3 py-2 text-right"><button class="sync-one rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Sync</button></td></tr>`;
  }

  async function syncOne(id, btn) {
    btn.disabled = true; btn.textContent = "…";
    try {
      const r = await fetchJSON(`/api/sources/${encodeURIComponent(id)}/sync`, { method: "POST", headers: hdr() });
      msg("ok", `${id}: ${r.imported} importados.`); loadSources();
    } catch (err) {
      msg(err.status === 404 ? "warn" : "err", err.status === 404 ? `${id}: sin conector local (no sincronizable).` : `Error al sincronizar ${id}.`);
      btn.disabled = false; btn.textContent = "Sync";
    }
  }
  async function syncAll() {
    const btn = $("#syncAll"); btn.disabled = true; btn.textContent = "Sincronizando…";
    try { const r = await fetchJSON("/api/sources/sync-all", { method: "POST", headers: hdr() }); msg("ok", `Sync completo (${(r.results || []).length} fuentes).`); loadSources(); }
    catch (_) { msg("err", "Falló la sincronización global."); btn.disabled = false; btn.textContent = "Sincronizar todo"; }
  }
  $('[data-pane="sources"]').addEventListener("click", (e) => {
    const b = e.target.closest(".sync-one"); if (!b) return;
    syncOne(e.target.closest("[data-sid]").dataset.sid, b);
  });

  // ---------------------------------------------------------------- peers
  async function loadPeers() {
    const pane = $('[data-pane="peers"]');
    pane.innerHTML = `<div class="h-24 rounded-xl shimmer"></div>`;
    try {
      const peers = await fetchJSON("/api/peers", { headers: hdr() });
      pane.innerHTML = `
        <form id="peerForm" class="mb-4 grid gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
          <input name="id" required placeholder="id (p.ej. nodo_oriente)" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
          <input name="name" required placeholder="Nombre" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
          <input name="base_url" required type="url" placeholder="https://otro-nodo.org" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm sm:col-span-2">
          <input name="api_key" placeholder="api_key del peer (opcional)" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm sm:col-span-2">
          <button class="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 sm:col-span-2 sm:justify-self-start">Añadir peer</button>
        </form>
        ${peers.length ? `<div class="space-y-2">${peers.map(peerCard).join("")}</div>` : `<p class="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">Sin peers configurados.</p>`}`;
      $("#peerForm").addEventListener("submit", addPeer);
    } catch (_) { pane.innerHTML = ""; msg("err", "No se pudieron cargar los peers."); }
  }

  function peerCard(p) {
    return `<div class="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm" data-peer="${escapeHtml(p.id)}">
      <div class="min-w-0 flex-1"><div class="font-semibold text-slate-900">${escapeHtml(p.name)}</div>
        <div class="truncate text-xs text-slate-400">${escapeHtml(p.base_url)} · cursor ${compactNumber(p.last_cursor)} · ${relativeTime(p.last_pull_at)}</div></div>
      <button class="peer-pull rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">Pull</button>
      <button class="peer-del rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">Eliminar</button></div>`;
  }

  async function addPeer(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = { id: fd.get("id"), name: fd.get("name"), base_url: fd.get("base_url"), api_key: fd.get("api_key") || null };
    try { await fetchJSON("/api/peers", { method: "POST", headers: hdr(), body: JSON.stringify(body) }); msg("ok", "Peer añadido."); loadPeers(); }
    catch (_) { msg("err", "No se pudo añadir el peer."); }
  }
  $('[data-pane="peers"]').addEventListener("click", async (e) => {
    const card = e.target.closest("[data-peer]"); if (!card) return;
    const id = card.dataset.peer;
    if (e.target.closest(".peer-pull")) {
      const b = e.target.closest(".peer-pull"); b.disabled = true; b.textContent = "…";
      try { const r = await fetchJSON(`/api/peers/${encodeURIComponent(id)}/pull`, { method: "POST", headers: hdr() }); msg("ok", `Pull de ${id}: ${r.imported} importados.`); loadPeers(); }
      catch (_) { msg("err", `Falló el pull de ${id}.`); b.disabled = false; b.textContent = "Pull"; }
    }
    if (e.target.closest(".peer-del")) {
      try { await fetchJSON(`/api/peers/${encodeURIComponent(id)}`, { method: "DELETE", headers: hdr() }); msg("ok", "Peer eliminado."); loadPeers(); }
      catch (_) { msg("err", "No se pudo eliminar."); }
    }
  });

  // ---------------------------------------------------------------- init
  if (adminKey) tryEnter(adminKey); else { $("#keyInput").focus(); }
})();
