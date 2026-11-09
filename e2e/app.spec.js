// App de estadísticas en un navegador real: toques, recargas, service worker y diseño en horizontal.
import { makeData, makeGame, sampleGame } from '../tests/helpers/fixtures.js';
import { expect, seed, test } from './fixtures.js';

const APP = '/minibasket-stats/';
const FIVE = ['p4', 'p7', 'p10', 'p12', 'p15'];
const liveGame = () => makeData({ games: [makeGame({ onCourt: [...FIVE] })] });

const scoreUs = (page) => page.locator('.board .score.us');
const scoreThem = (page) => page.locator('.board .score.them');

test('un partido completo: equipo, plantilla, quinteto, jugadas y estadísticas', async ({ page }) => {
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: /Bienvenido/ })).toBeVisible();

  await page.getByLabel('Nombre del equipo').fill('Alevín A');
  await page.getByRole('button', { name: /Crear equipo/ }).click();
  for (const [number, name] of [['4', 'Ana'], ['7', 'Bruno'], ['10', 'Carla'], ['12', 'Dani'], ['15', 'Eva'], ['21', 'Fran']]) {
    await page.getByLabel('Dorsal').fill(number);
    await page.getByLabel('Nombre', { exact: true }).fill(name);
    await page.getByRole('button', { name: /Añadir/ }).click();
  }
  await expect(page.locator('.roster li')).toHaveCount(6);

  await page.getByRole('link', { name: 'Partidos' }).click();
  await page.getByPlaceholder('Nombre del rival').fill('Lakers');
  await page.getByRole('button', { name: /Empezar partido/ }).click();

  const lineup = page.locator('.modal.lineup');
  await expect(lineup).toContainText('Quinteto inicial');
  for (const name of ['Ana', 'Bruno', 'Carla', 'Dani', 'Eva']) await lineup.getByRole('button', { name: new RegExp(name) }).tap();
  await expect(lineup.locator('.count')).toHaveText('5/5 en pista');
  await lineup.getByRole('button', { name: 'Listo' }).tap();

  const row = (name) => page.locator('.court .prow', { hasText: name });
  await row('Ana').locator('[data-type="t2_ok"]').tap();
  await row('Bruno').locator('[data-type="t3_ok"]').tap();
  await row('Carla').locator('[data-type="rd"]').tap();
  await page.locator('[data-action="opp"][data-pts="2"]').tap();
  await expect(scoreUs(page)).toHaveText('5');
  await expect(scoreThem(page)).toHaveText('2');

  // Si se cierra la app a mitad de partido, al volver sigue todo ahí
  await page.reload();
  await expect(scoreUs(page)).toHaveText('5');

  // Al pasar de periodo pide el quinteto
  await page.locator('[data-action="period"][data-d="1"]').tap();
  await expect(page.locator('.modal.lineup')).toContainText('Periodo 2');
  await page.getByRole('button', { name: 'Listo' }).tap();
  await expect(page.locator('.period b')).toHaveText('P2');

  await page.locator('[data-action="menu"]').tap();
  await page.getByRole('button', { name: /Finalizar partido/ }).tap();
  await page.locator('[data-action="confirm-yes"]').tap();
  await expect(page).toHaveURL(/#\/stats\//);
  await expect(page.locator('.badge')).toHaveText('Victoria');
  await expect(page.locator('table.stats tbody tr', { hasText: 'Bruno' }).locator('td.hl').first()).toHaveText('3');
});

test('en el partido caben los 5 jugadores con sus 15 botones, sin scroll y fáciles de tocar', async ({ page }) => {
  await seed(page, liveGame());
  await page.goto(`${APP}#/partido/g1`);
  await expect(page.locator('.court button.act')).toHaveCount(75);
  const layout = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.court button.act')].map((b) => b.getBoundingClientRect());
    return {
      scroll: document.documentElement.scrollHeight - innerHeight,
      offscreen: buttons.filter((r) => r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5).length,
      minHeight: Math.min(...buttons.map((r) => r.height)),
    };
  });
  expect(layout.scroll).toBeLessThanOrEqual(0);
  expect(layout.offscreen).toBe(0);
  expect(layout.minHeight).toBeGreaterThanOrEqual(44);  // tamaño mínimo recomendado para tocar con el dedo
});

test('funciona sin conexión una vez abierta', async ({ page, context }) => {
  await seed(page, liveGame());
  await page.goto(`${APP}#/partido/g1`);
  // La primera visita instala el service worker, que guarda la app y toma el control de la página
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  await context.setOffline(true);
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.locator('.court .prow').first().locator('[data-type="t2_ok"]').tap();
  await expect(scoreUs(page)).toHaveText('2');
  await context.setOffline(false);
});

test('descarga las estadísticas en CSV', async ({ page }) => {
  await seed(page, makeData({ games: [sampleGame({ finished: true })] }));
  await page.goto(`${APP}#/stats/g1`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSV/ }).click()]);
  expect(download.suggestedFilename()).toBe('estadisticas-2026-10-03-vs-Rival.csv');
  const csv = await (await download.createReadStream()).toArray();
  const lines = Buffer.concat(csv).toString('utf8').replace(/^﻿/, '').split('\r\n');
  expect(lines[0]).toMatch(/^Dorsal;Jugador;/);
  expect(lines.at(-1)).toBe(';Equipo;4;8;1;2;2;3;1;2;1;1;2;1;0;1;1;1;1;0;6');
});

test.describe('en vertical', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('pide girar el móvil', async ({ page }) => {
    await page.goto(APP);
    await expect(page.locator('#rotate')).toBeVisible();
    await expect(page.locator('#rotate')).toContainText('Gira el dispositivo');
  });
});
