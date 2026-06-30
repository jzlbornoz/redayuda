/* tw-config.js — Sistema de marca Curalink Red Ayuda (Roboto).
 * Remapea TODAS las familias de color a la paleta Curalink (teals de marca +
 * neutrales cool-tinted + rojo de error) y pone bordes redondeados amigables.
 * Así las utilidades existentes (bg-slate-50, text-emerald-700, rounded-xl…)
 * se vuelven on-brand sin tocar el markup. */
window.tailwind = window.tailwind || {};

// Ramp de marca: teals Curalink (pacific blue como primario, dark teal al fondo).
var BRAND = {
  DEFAULT: "#3DB9CF",
  50: "#F2FAFB", 100: "#DDF0F4", 200: "#9DDDE7", 300: "#6FCEDD",
  400: "#52C5D7", 500: "#3DB9CF", 600: "#34A6BB", 700: "#2C8FA1",
  800: "#107D98", 900: "#0D3C48", 950: "#082B33",
};
// Neutrales cool-tinted de Curalink (reemplazan a todos los grises).
var NEUTRAL = {
  DEFAULT: "#1F2A30",
  50: "#F8FAFB", 100: "#EEF3F5", 200: "#DDE6EA", 300: "#C5D2D8",
  400: "#94A4AB", 500: "#647780", 600: "#4A5A62", 700: "#334149",
  800: "#1F2A30", 900: "#0F171B", 950: "#080C0E",
};
// Único color semántico fuera del teal/neutral: rojo de error/destructivo.
var RED = {
  DEFAULT: "#D14343",
  50: "#FDECEC", 100: "#FBD4D4", 200: "#F6B0B0", 300: "#EE8585",
  400: "#E65C5C", 500: "#D14343", 600: "#B93838", 700: "#972D2D",
  800: "#7A2424", 900: "#5F1C1C", 950: "#3A1010",
};

tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Roboto'", "system-ui", "sans-serif"],
        mono: ["'Roboto'", "ui-monospace", "monospace"],
      },
      letterSpacing: { tightest: "-0.03em", tighter: "-0.02em" },
      colors: {
        // Marca y alias coloridos → teals de Curalink.
        brand: BRAND,
        teal: BRAND, cyan: BRAND, sky: BRAND, blue: BRAND, indigo: BRAND,
        violet: BRAND, purple: BRAND, fuchsia: BRAND, pink: BRAND,
        // Verdes (success/positivo) → teal de marca (pacific blue es el acento positivo).
        emerald: BRAND, green: BRAND, lime: BRAND,
        // Grises y cálidos de aviso (amber/orange/yellow) → neutrales cool-tinted:
        // la paleta no tiene warm fuera del rojo de error, así el semáforo de
        // frescura queda teal (al día) → neutral (rezagada) → rojo (obsoleta).
        slate: NEUTRAL, gray: NEUTRAL, zinc: NEUTRAL, neutral: NEUTRAL, stone: NEUTRAL,
        amber: NEUTRAL, orange: NEUTRAL, yellow: NEUTRAL,
        // Tono de tinta del shell → teals de marca (nunca negro).
        ink: BRAND,
        // …salvo el rojo de error/destructivo.
        rose: RED, red: RED,
      },
      borderRadius: {
        none: "0", sm: "6px", DEFAULT: "8px", md: "8px", lg: "12px",
        xl: "16px", "2xl": "16px", "3xl": "16px", full: "9999px",
      },
    },
  },
};
