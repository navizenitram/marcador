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

test('la comparativa con otras apps: mientras sea un borrador, no se indexa, no está en el sitemap ni se enlaza', async ({ page, request }) => {
  const response = await page.goto('/comparativa-apps-estadisticas-baloncesto/');
  expect(response.ok()).toBe(true);
  await expect(page.locator('h1')).toContainText('Apps de estadísticas de baloncesto');
  await expect(page.locator('table.compare thead th')).toHaveCount(7);   // qué, nosotros y las 5 apps
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('.draft-note')).toBeVisible();

  const sitemap = await (await request.get('/sitemap-0.xml')).text();
  expect(sitemap).toContain('/guias/');
  expect(sitemap).not.toContain('comparativa-apps-estadisticas-baloncesto');

  await page.goto('/guias/');
  await expect(page.locator('a[href="/comparativa-apps-estadisticas-baloncesto/"]')).toHaveCount(0);
});

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
