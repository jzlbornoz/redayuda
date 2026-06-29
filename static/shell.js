/* shell.js — Red Humanitaria de Datos (v2)
 * Inyecta nav + footer, cablea el menú móvil y el pulso de salud, y expone
 * window.RH con helpers compartidos por todas las páginas.
 * Carga con `defer`, después de ui.js (Drawer) y antes del script de cada página. */
(function (window, document) {
  "use strict";

  // ---------------------------------------------------------------- helpers
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function compactNumber(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
    return new Intl.NumberFormat("es-VE").format(Number(value));
  }

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeStyle: "short" }).format(d);
  }

  // "hace 3 h" / "hace 2 d" / "nunca"
  function relativeTime(value) {
    if (!value) return "nunca";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const sec = Math.round((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return "hace segundos";
    const min = Math.round(sec / 60);
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    const days = Math.round(h / 24);
    if (days < 30) return `hace ${days} d`;
    return formatDate(value);
  }

  // Semáforo de frescura por last_sync → tono Tailwind
  function freshness(value) {
    if (!value) return { tone: "slate", label: "sin sincronizar" };
    const h = (Date.now() - new Date(value).getTime()) / 36e5;
    if (h < 24) return { tone: "emerald", label: "al día" };
    if (h < 24 * 7) return { tone: "amber", label: "rezagada" };
    return { tone: "rose", label: "obsoleta" };
  }

  // ---------------------------------------------------------------- iconos
  const ICONS = {
    persona: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.25"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0"/></svg>',
    centro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/></svg>',
    hospital: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16"/><path d="M9 12h6M12 9v6M2 21h20"/></svg>',
    lugar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z"/><circle cx="12" cy="11" r="2.25"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z"/><circle cx="12" cy="11" r="2.25"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/></svg>',
  };

  // Metadatos por record_type: etiqueta, icono, color (clases Tailwind) y hex para mapa.
  const TYPE_META = {
    persona_desaparecida: { label: "Persona desaparecida", icon: "persona", chip: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500", hex: "#f43f5e" },
    persona_localizada:   { label: "Persona localizada",   icon: "persona", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500", hex: "#10b981" },
    persona_hospitalizada:{ label: "Persona hospitalizada",icon: "hospital",chip: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500", hex: "#0ea5e9" },
    centro_acopio:        { label: "Centro de acopio",     icon: "centro",  chip: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500", hex: "#f59e0b" },
    centro_donacion:      { label: "Centro de donación",   icon: "centro",  chip: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500", hex: "#8b5cf6" },
    recurso:              { label: "Recurso",              icon: "lugar",   chip: "bg-teal-50 text-teal-700 ring-teal-200", dot: "bg-teal-500", hex: "#14b8a6" },
    otro:                 { label: "Otro",                 icon: "lugar",   chip: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400", hex: "#94a3b8" },
  };
  function typeMeta(t) { return TYPE_META[t] || { label: t || "—", icon: "lugar", chip: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400", hex: "#94a3b8" }; }
  function typeLabel(t) { return typeMeta(t).label; }

  // Chip de tipo
  function typeChip(t) {
    const m = typeMeta(t);
    return `<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${m.chip}"><span class="h-1.5 w-1.5 rounded-full ${m.dot}"></span>${escapeHtml(m.label)}</span>`;
  }

  // Miniatura: imagen o icono por tipo
  function thumb(record, size = "h-12 w-12") {
    const m = typeMeta(record.record_type);
    if (record.image_url) {
      return `<img src="${escapeHtml(record.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer"
        class="${size} flex-shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
        onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${size} flex-shrink-0 grid place-items-center rounded-lg bg-slate-100 text-slate-400 ring-1 ring-slate-200',innerHTML:RH.icons.${m.icon}}))">`;
    }
    return `<div class="${size} flex-shrink-0 grid place-items-center rounded-lg bg-slate-100 text-slate-400 ring-1 ring-slate-200"><span class="block h-6 w-6">${ICONS[m.icon]}</span></div>`;
  }

  // Acciones directas de un registro (tel / mapa / fuente)
  function actionLinks(record) {
    const out = [];
    if (record.contact) {
      const tel = String(record.contact).replace(/[^\d+]/g, "");
      if (tel.length >= 7) {
        out.push(`<a href="tel:${escapeHtml(tel)}" class="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"><span class="h-3.5 w-3.5">${ICONS.phone}</span>Llamar</a>`);
      } else {
        out.push(`<span class="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600">${escapeHtml(record.contact)}</span>`);
      }
    }
    if (record.latitude != null && record.longitude != null) {
      out.push(`<a href="https://www.openstreetmap.org/?mlat=${record.latitude}&mlon=${record.longitude}#map=16/${record.latitude}/${record.longitude}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"><span class="h-3.5 w-3.5">${ICONS.pin}</span>Mapa</a>`);
    }
    if (record.source_url) {
      out.push(`<a href="${escapeHtml(record.source_url)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-brand ring-1 ring-inset ring-slate-200 hover:bg-slate-50"><span class="h-3.5 w-3.5">${ICONS.link}</span>Fuente</a>`);
    }
    return out.join("");
  }

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
    if (!res.ok) {
      const err = new Error("http " + res.status);
      err.status = res.status; err.payload = data;
      throw err;
    }
    return data;
  }

  // ---------------------------------------------------------------- nav/footer
  const NAV = [
    { href: "/", label: "Buscar", key: "buscar" },
    { href: "/mapa", label: "Mapa", key: "mapa" },
    { href: "/fuentes", label: "Fuentes", key: "fuentes" },
    { href: "/desarrolladores", label: "Desarrolladores", key: "dev" },
    { href: "/contribuir", label: "Registrar fuente", key: "contribuir" },
  ];

  function isActive(href) {
    const p = location.pathname;
    if (href === "/") return p === "/";
    return p === href || p.startsWith(href + "/");
  }

  function renderShell() {
    const header = document.getElementById("rh-header");
    if (header) {
      const links = NAV.map((n) => {
        const active = isActive(n.href);
        const cls = active
          ? "text-slate-900 font-semibold"
          : "text-slate-500 hover:text-slate-900";
        return `<a href="${n.href}" data-nav="${n.key}" ${active ? 'aria-current="page"' : ""} class="rounded-md px-2.5 py-1.5 text-sm transition ${cls}">${n.label}</a>`;
      }).join("");

      header.className = "sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur";
      header.innerHTML = `
        <div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <a href="/" class="flex items-center gap-2.5">
            <span class="grid h-9 w-9 place-items-center rounded-lg bg-slate-900 text-sm font-bold tracking-tight text-white">RH</span>
            <span class="hidden sm:flex flex-col leading-tight">
              <span class="text-sm font-semibold text-slate-900">Red Humanitaria de Datos</span>
              <span class="text-xs text-slate-500">Índice común de ayuda · Venezuela</span>
            </span>
          </a>
          <nav class="ml-auto hidden items-center gap-1 md:flex" aria-label="Navegación principal">${links}
            <span id="rh-health" class="ml-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500"><span class="h-1.5 w-1.5 rounded-full bg-slate-300"></span>…</span>
          </nav>
          <button id="rh-menu-btn" type="button" class="ml-auto inline-grid h-9 w-9 place-items-center rounded-md text-slate-600 ring-1 ring-slate-200 md:hidden" aria-label="Abrir menú" aria-expanded="false">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
          </button>
        </div>
        <nav id="rh-menu" hidden class="border-t border-slate-200 bg-white px-4 py-2 md:hidden" aria-label="Navegación móvil">
          ${NAV.map((n) => `<a href="${n.href}" class="block rounded-md px-2 py-2 text-sm ${isActive(n.href) ? "font-semibold text-slate-900" : "text-slate-600"}">${n.label}</a>`).join("")}
        </nav>`;

      const btn = header.querySelector("#rh-menu-btn");
      const menu = header.querySelector("#rh-menu");
      btn.addEventListener("click", () => {
        const open = menu.hidden;
        menu.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
      });
    }

    const footer = document.getElementById("rh-footer");
    if (footer) {
      footer.className = "mt-16 border-t border-slate-200 bg-white";
      footer.innerHTML = `
        <div class="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Red Humanitaria de Datos — un índice común para las apps de ayuda, en vez de duplicar el esfuerzo.</span>
          <nav class="flex gap-4" aria-label="Enlaces del pie">
            <a class="hover:text-slate-900" href="/fuentes">Fuentes</a>
            <a class="hover:text-slate-900" href="/desarrolladores">Desarrolladores</a>
            <a class="hover:text-slate-900" href="/docs">API docs</a>
            <a class="hover:text-slate-900" href="/admin">Admin</a>
          </nav>
        </div>`;
    }
  }

  async function loadHealth() {
    const pill = document.getElementById("rh-health");
    if (!pill) return;
    try {
      const s = await fetchJSON("/api/network/stats");
      const ok = s.total_records > 0;
      pill.className = `ml-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`;
      pill.innerHTML = `<span class="h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}"></span>${compactNumber(s.total_records)} registros`;
      window.RH._stats = s;
      document.dispatchEvent(new CustomEvent("rh:stats", { detail: s }));
    } catch (_) {
      pill.className = "ml-2 inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600";
      pill.innerHTML = `<span class="h-1.5 w-1.5 rounded-full bg-rose-500"></span>sin conexión`;
    }
  }

  function openDrawer(el) {
    return window.Drawer ? window.Drawer.getOrCreateInstance(el) : null;
  }

  // ---------------------------------------------------------------- export
  window.RH = {
    escapeHtml, compactNumber, formatDate, relativeTime, freshness,
    typeMeta, typeLabel, typeChip, thumb, actionLinks, fetchJSON,
    openDrawer, icons: ICONS, TYPE_META,
    onStats(cb) { if (window.RH._stats) cb(window.RH._stats); document.addEventListener("rh:stats", (e) => cb(e.detail)); },
    _stats: null,
  };

  function boot() { renderShell(); loadHealth(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window, document);
