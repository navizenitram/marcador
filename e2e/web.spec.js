// Web (Astro) y marcador, tal como quedan tras el build.
import { expect, test } from './fixtures.js';

test('la portada abre la app', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Apunta lo que hace cada jugador');
  await page.getByRole('link', { name: 'Abrir la app gratis' }).first().click();
  await expect(page).toHaveURL(/\/minibasket-stats\/#\/equipos$/);
  await expect(page.getByRole('heading', { name: /Bienvenido/ })).toBeVisible();
});

test('la portada en catalán', async ({ page }) => {
  await page.goto('/ca/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ca');
  await expect(page.locator('h1')).toContainText('Apunta el que fa cada jugador');
});

for (const [path, title] of [
  ['/guias/', 'Guías para entrenadores y familias'],
  ['/guias/estadisticas-minibasket/', 'Estadísticas en minibasket'],
  ['/guias/valoracion-baloncesto/', 'Valoración en baloncesto'],
  ['/plantilla-estadisticas-baloncesto/', 'Plantilla de estadísticas de baloncesto'],
  ['/privacidad/', 'Privacidad'],
]) {
  test(`carga ${path}`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response.ok()).toBe(true);
    await expect(page.locator('h1')).toContainText(title);
  });
}

test('la plantilla en PDF se descarga', async ({ request }) => {
  const response = await request.get('/descargas/plantilla-estadisticas-baloncesto.pdf');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('pdf');
});

test('las etiquetas canonical llevan la URL del sitio (postbuild)', async ({ page }) => {
  for (const path of ['/minibasket-stats/', '/marcador/']) {
    await page.goto(path);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', new RegExp(`^https://[^%]+${path}$`));
  }
});

test('marcador: puntos, faltas y periodos', async ({ page }) => {
  await page.goto('/marcador/');
  await page.locator('#nameA').fill('Osos');
  await page.locator('#nameB').fill('Linces');
  await page.getByRole('button', { name: '4', exact: true }).tap();
  await page.getByRole('button', { name: /INICIAR/ }).tap();
  await expect(page.locator('#qSub')).toHaveText('de 4');

  const teamA = page.locator('.score-btn[onclick^="addScore(\'A\'"]');
  await teamA.filter({ hasText: '+2' }).tap();
  await teamA.filter({ hasText: '+3' }).tap();
  await page.locator('[onclick="addFoul(\'B\',1)"]').tap();
  await expect(page.locator('#totalA')).toHaveText('5');
  await expect(page.locator('#foulsB .foul-dot.on')).toHaveCount(1);

  await page.locator('#btnNext').tap();
  await expect(page.locator('#qLabel')).toHaveText('Q2');
  await expect(page.locator('#qScoreA')).toHaveText('0');
  await expect(page.locator('#totalA')).toHaveText('5');
});

test('el pie muestra la versión de la app y el sitemap lleva su fecha', async ({ page, request }) => {
  await page.goto('/');
  const released = await page.locator('.footer-version time').getAttribute('datetime');
  expect(released).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.locator('.footer-version')).toContainText(/Última versión de la app: \d+ · \d{1,2} de \S+ de \d{4}/);

  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toMatch(/^Sitemap: https:\/\/\S+\/sitemap-index\.xml$/m);
  const sitemap = await (await request.get('/sitemap-0.xml')).text();
  const urls = [...sitemap.matchAll(/<url><loc>https:\/\/[^/]+([^<]*)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)].map((m) => [m[1], m[2]?.slice(0, 10)]);
  expect(Object.fromEntries(urls)).toMatchObject({ '/': released, '/ca/': released, '/minibasket-stats/': released, '/marcador/': undefined });
  expect(urls.map(([path]) => path)).not.toContain('/404/');
  expect(urls).toHaveLength(9);
});
