/* tw-config.js — configuración de Tailwind (CDN).
 * Se carga justo DESPUÉS de cdn.tailwindcss.com, sin defer, para que el JIT
 * la tome antes de pintar. */
window.tailwind = window.tailwind || {};
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        brand: {
          DEFAULT: '#2563eb',
          50: '#eff6ff', 100: '#dbeafe', 600: '#2563eb', 700: '#1d4ed8', 900: '#1e3a8a',
        },
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0, transform: 'translateY(4px)' }, '100%': { opacity: 1, transform: 'none' } },
      },
      animation: { 'fade-in': 'fade-in .2s ease both' },
    },
  },
};
