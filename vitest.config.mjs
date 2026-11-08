import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,ts}'],
    // Cada test de las apps crea su propio DOM con jsdom (tests/helpers), así que el entorno global es Node.
    environment: 'node',
    coverage: {
      provider: 'v8',
      // El marcador lleva el script dentro del HTML y no se puede medir; postbuild.mjs se prueba en un proceso aparte.
      include: ['public/minibasket-stats/app.js', 'site.config.mjs'],
      reporter: ['text', 'html'],
    },
  },
});
