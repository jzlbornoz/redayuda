/* ui.js — Red Humanitaria de Datos
 * Utilidades de UI en JavaScript vanilla (sin dependencias, script clásico con defer).
 * Expone window.Drawer y window.initCollapse.
 *
 * Drawer.getOrCreateInstance(el) imita la forma de bootstrap.Offcanvas.getOrCreateInstance:
 * devuelve un objeto con show() y hide(). La instancia se cachea en el._rhd.
 *
 * initCollapse(root=document) cablea cada [data-toggle="collapse"][data-target="#id"]
 * para alternar la clase is-open en el objetivo y mantener aria-expanded.
 * Se autoejecuta en DOMContentLoaded.
 */
(function (window, document) {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Helpers defensivos                                                  */
  /* ------------------------------------------------------------------ */

  function qsa(selector, root) {
    try {
      return Array.prototype.slice.call((root || document).querySelectorAll(selector));
    } catch (e) {
      return [];
    }
  }

  // Selector de elementos potencialmente enfocables dentro de un contenedor.
  var FOCUSABLE =
    'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]),' +
    ' select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]),' +
    ' [contenteditable="true"]';

  function focusableWithin(el) {
    if (!el) return [];
    return qsa(FOCUSABLE, el).filter(function (node) {
      // Descartar elementos ocultos.
      return !node.hasAttribute("disabled") &&
        node.getAttribute("aria-hidden") !== "true" &&
        (node.offsetWidth > 0 || node.offsetHeight > 0 || node === document.activeElement);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Bloqueo de scroll del body (contado, para múltiples drawers)        */
  /* ------------------------------------------------------------------ */

  var _scrollLocks = 0;
  var _prevBodyOverflow = "";

  function lockScroll() {
    if (_scrollLocks === 0 && document.body) {
      _prevBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    _scrollLocks++;
  }

  function unlockScroll() {
    _scrollLocks = Math.max(0, _scrollLocks - 1);
    if (_scrollLocks === 0 && document.body) {
      document.body.style.overflow = _prevBodyOverflow;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Backdrop compartido                                                 */
  /* ------------------------------------------------------------------ */

  function getBackdrop() {
    var bd = document.querySelector(".drawer__backdrop");
    if (!bd) {
      bd = document.createElement("div");
      bd.className = "drawer__backdrop";
      bd.setAttribute("data-drawer-close", "");
      bd.setAttribute("aria-hidden", "true");
      if (document.body) document.body.appendChild(bd);
    }
    return bd;
  }

  /* ------------------------------------------------------------------ */
  /* Drawer                                                              */
  /* ------------------------------------------------------------------ */

  function DrawerInstance(el) {
    this.el = el;
    this.panel = el.querySelector(".drawer__panel") || el;
    this._open = false;
    this._lastFocus = null;
    this._onKeydown = this._onKeydown.bind(this);
    this._onClick = this._onClick.bind(this);
    this._bindCloseTargets();
  }

  DrawerInstance.prototype._bindCloseTargets = function () {
    // Delegamos el click al propio contenedor del drawer para [data-drawer-close]
    // y enganchamos el backdrop por separado (vive fuera de .drawer).
    this.el.addEventListener("click", this._onClick);
  };

  DrawerInstance.prototype._onClick = function (ev) {
    var target = ev.target;
    if (!target || !target.closest) return;
    if (target.closest("[data-drawer-close]")) {
      ev.preventDefault();
      this.hide();
    }
  };

  DrawerInstance.prototype._onKeydown = function (ev) {
    if (!this._open) return;
    if (ev.key === "Escape" || ev.key === "Esc" || ev.keyCode === 27) {
      ev.preventDefault();
      this.hide();
      return;
    }
    if (ev.key === "Tab" || ev.keyCode === 9) {
      this._trapTab(ev);
    }
  };

  // Trampa de foco básica con Tab dentro de .drawer__panel.
  DrawerInstance.prototype._trapTab = function (ev) {
    var nodes = focusableWithin(this.panel);
    if (nodes.length === 0) {
      // Mantener el foco en el panel si no hay nada enfocable dentro.
      ev.preventDefault();
      if (this.panel.focus) this.panel.focus();
      return;
    }
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    var active = document.activeElement;

    if (ev.shiftKey) {
      if (active === first || active === this.panel || !this.panel.contains(active)) {
        ev.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !this.panel.contains(active)) {
        ev.preventDefault();
        first.focus();
      }
    }
  };

  DrawerInstance.prototype.show = function () {
    if (this._open) return;
    this._open = true;
    this._lastFocus = document.activeElement;

    var backdrop = getBackdrop();
    backdrop._rhdOwner = this;
    if (!this._onBackdrop) {
      this._onBackdrop = this.hide.bind(this);
    }
    backdrop.addEventListener("click", this._onBackdrop);

    this.el.classList.add("is-open");
    backdrop.classList.add("is-open");
    this.el.setAttribute("aria-hidden", "false");
    backdrop.setAttribute("aria-hidden", "false");

    // Semántica de diálogo modal + inertizar el fondo para lectores de pantalla.
    if (this.panel) {
      this.panel.setAttribute("role", "dialog");
      this.panel.setAttribute("aria-modal", "true");
    }
    qsa("#main, #rh-header, #rh-footer").forEach(function (n) { n.setAttribute("inert", ""); });

    lockScroll();
    document.addEventListener("keydown", this._onKeydown, true);

    // Mover el foco al panel (o al primer enfocable dentro).
    var nodes = focusableWithin(this.panel);
    var toFocus = nodes.length ? nodes[0] : this.panel;
    if (toFocus) {
      if (toFocus === this.panel && !this.panel.hasAttribute("tabindex")) {
        this.panel.setAttribute("tabindex", "-1");
      }
      try { toFocus.focus(); } catch (e) {}
    }
  };

  DrawerInstance.prototype.hide = function () {
    if (!this._open) return;
    this._open = false;

    var backdrop = document.querySelector(".drawer__backdrop");

    this.el.classList.remove("is-open");
    this.el.setAttribute("aria-hidden", "true");
    qsa("#main, #rh-header, #rh-footer").forEach(function (n) { n.removeAttribute("inert"); });

    if (backdrop) {
      // Solo apagar el backdrop si nos pertenece (sin otros drawers abiertos).
      backdrop.classList.remove("is-open");
      backdrop.setAttribute("aria-hidden", "true");
      if (this._onBackdrop) {
        backdrop.removeEventListener("click", this._onBackdrop);
      }
    }

    document.removeEventListener("keydown", this._onKeydown, true);
    unlockScroll();

    // Devolver el foco al disparador.
    if (this._lastFocus && this._lastFocus.focus) {
      try { this._lastFocus.focus(); } catch (e) {}
    }
    this._lastFocus = null;
  };

  DrawerInstance.prototype.toggle = function () {
    if (this._open) this.hide();
    else this.show();
  };

  var Drawer = {
    // Misma forma que bootstrap.Offcanvas.getOrCreateInstance.
    getOrCreateInstance: function (el) {
      if (!el) return null;
      if (el._rhd) return el._rhd;
      var inst = new DrawerInstance(el);
      el._rhd = inst;
      return inst;
    },
    getInstance: function (el) {
      return el && el._rhd ? el._rhd : null;
    }
  };

  /* ------------------------------------------------------------------ */
  /* Collapse                                                            */
  /* ------------------------------------------------------------------ */

  function toggleCollapse(toggle) {
    var sel = toggle.getAttribute("data-target");
    if (!sel) return;
    var target;
    try {
      target = document.querySelector(sel);
    } catch (e) {
      return;
    }
    if (!target) return;

    var willOpen = !target.classList.contains("is-open");
    target.classList.toggle("is-open", willOpen);
    toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
    if (target.id) {
      toggle.setAttribute("aria-controls", target.id);
    }
  }

  function initCollapse(root) {
    var toggles = qsa('[data-toggle="collapse"][data-target]', root || document);
    toggles.forEach(function (toggle) {
      if (toggle._rhdCollapse) return; // idempotente
      toggle._rhdCollapse = true;

      var sel = toggle.getAttribute("data-target");
      var target = null;
      if (sel) {
        try { target = document.querySelector(sel); } catch (e) { target = null; }
      }
      // Estado inicial de aria-expanded reflejando el objetivo.
      var isOpen = !!(target && target.classList.contains("is-open"));
      if (!toggle.hasAttribute("aria-expanded")) {
        toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      }
      if (target && target.id) {
        toggle.setAttribute("aria-controls", target.id);
      }

      toggle.addEventListener("click", function (ev) {
        ev.preventDefault();
        toggleCollapse(toggle);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Exponer + autoarranque                                              */
  /* ------------------------------------------------------------------ */

  window.Drawer = Drawer;
  window.initCollapse = initCollapse;

  function boot() {
    initCollapse(document);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window, document);
