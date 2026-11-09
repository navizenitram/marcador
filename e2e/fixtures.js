import { test as base, expect } from '@playwright/test';

export { expect };

export const test = base.extend({
  // Los tests no dependen de internet: se corta cualquier petición fuera del servidor local.
  // La web y la app no cargan nada externo; el marcador sí (Chart.js y Google Fonts), y funciona sin ellos
  // salvo la pantalla de estadísticas, que por eso no se abre en estos tests.
  context: async ({ context, baseURL }, use) => {
    const origin = new URL(baseURL).origin;
    await context.route((url) => url.origin !== origin, (route) => route.abort());
    await use(context);
  },

  // Un error de JavaScript en la página hace fallar el test, aunque sus comprobaciones pasen
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(page);
    expect(errors, 'errores de JavaScript en la página').toEqual([]);
  },
});

/**
 * Guarda datos en la app antes de que cargue (solo la primera vez: las recargas conservan lo que haya cambiado).
 * @param {import('@playwright/test').Page} page
 */
export async function seed(page, data) {
  await page.addInitScript((json) => {
    if (!localStorage.getItem('mbstats.v1')) localStorage.setItem('mbstats.v1', json);
  }, JSON.stringify(data));
}
