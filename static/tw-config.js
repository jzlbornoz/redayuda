/* tw-config.js — Sistema monocromático minimalista (Space Grotesk).
 * Remapea TODAS las familias de color a un ramp de grises + un único rojo de
 * error, y pone todos los radios en 0. Así las utilidades existentes
 * (bg-slate-50, text-emerald-700, rounded-xl…) se vuelven monocromáticas y
 * rectas sin tocar el markup. */
window.tailwind = window.tailwind || {};

// Ramp monocromático (de la paleta del brief: #121212 / #292929 / #4a4a4a / #e0e0e0 / #fff)
var MONO = {
  DEFAULT: "#121212",
  50: "#f7f7f7", 100: "#ededed", 200: "#e0e0e0", 300: "#cfcfcf",
  400: "#767676", 500: "#4a4a4a", 600: "#292929", 700: "#292929",
  800: "#1c1c1c", 900: "#121212", 950: "#121212",
};
// Único color permitido fuera del gris: rojo de error/destructivo (#d32f2f)
var RED = {
  DEFAULT: "#d32f2f",
  50: "#fdecea", 100: "#f9d2cd", 200: "#f3b4ad", 300: "#e88a80",
  400: "#dd5c4e", 500: "#d32f2f", 600: "#c62828", 700: "#b71c1c",
  800: "#9f1717", 900: "#7f1414", 950: "#5f0f0f",
};

tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Space Grotesk'", "system-ui", "sans-serif"],
        mono: ["'Space Grotesk'", "ui-monospace", "monospace"],
      },
      letterSpacing: { tightest: "-0.03em", tighter: "-0.02em" },
      colors: {
        // todo a gris…
        brand: MONO, slate: MONO, gray: MONO, zinc: MONO, neutral: MONO, stone: MONO,
        emerald: MONO, teal: MONO, sky: MONO, blue: MONO, indigo: MONO,
        violet: MONO, purple: MONO, amber: MONO, yellow: MONO, orange: MONO, green: MONO,
        // …salvo el rojo de error/destructivo
        rose: RED, red: RED,
        ink: MONO,
      },
      borderRadius: {
        none: "0", sm: "0", DEFAULT: "0", md: "0", lg: "0",
        xl: "0", "2xl": "0", "3xl": "0", full: "0",
      },
    },
  },
};
