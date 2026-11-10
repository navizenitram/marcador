// App de estadísticas en un navegador real: toques, recargas, service worker y diseño en horizontal.
import { ev, makeData, makeGame, makeTeam, opp, sampleGame } from '../tests/helpers/fixtures.js';
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

test('el service worker toma el control y guarda lo necesario para usarla sin conexión', async ({ page }) => {
  await page.goto(APP);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cached = await page.evaluate(async () => {
    const name = (await caches.keys()).find((n) => n.startsWith('mbstats-'));
    return (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
  });
  const base = '/minibasket-stats/';
  expect(cached).toEqual(expect.arrayContaining(
    ['', 'index.html', 'app.js', 'styles.css', 'manifest.webmanifest', 'fonts/rajdhani-latin-700-normal.woff2'].map((f) => base + f),
  ));
});

test('funciona sin conexión una vez abierta', async ({ page, context, browserName }) => {
  // En WebKit, Playwright no consigue recargar con la conexión cortada aunque el service worker controle la página
  // («WebKit encountered an internal error»). El test anterior comprueba allí que la app queda guardada.
  test.skip(browserName === 'webkit', 'La recarga sin conexión con service worker no funciona en el WebKit de Playwright');
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

test('la evolución del marcador comparte columnas con los parciales y se puede recorrer', async ({ page }) => {
  await seed(page, makeData({ games: [sampleGame({ finished: true })] }));
  await page.goto(`${APP}#/stats/g1`);
  const flow = page.locator('.ptable .flow');
  await expect(flow).toBeVisible();
  const box = await flow.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(36);

  // El gráfico empieza donde empieza la columna del P1 y acaba donde acaba la del P8
  const columns = await page.evaluate(() => {
    const th = [...document.querySelectorAll('.ptable th')].map((el) => el.getBoundingClientRect());
    return { left: th[1].left, right: th[8].right };
  });
  expect(Math.abs(box.x - columns.left)).toBeLessThan(1.5);
  expect(Math.abs(box.x + box.width - columns.right)).toBeLessThan(1.5);

  // A mitad del P2 el rival acaba de anotar su +3 (ver sampleGame)
  await page.mouse.move(box.x + box.width * (1.5 / 8), box.y + box.height / 2);
  await expect(page.locator('.flow-label')).toHaveText('P2 · 6–5');
  await expect(page.locator('.flow-diff')).toHaveText('+1');
  await expect(page.locator('.flow-cross')).toBeVisible();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 60);
  await expect(page.locator('.flow-label')).toHaveText('Diferencia');
  await expect(page.locator('.flow-diff')).toHaveText('+4');
});

test('en la temporada, cada columna del gráfico lleva a las estadísticas de su partido', async ({ page }) => {
  const games = [
    sampleGame({ finished: true }),
    makeGame({ id: 'g2', date: '2026-10-10', opponent: 'Celtics', finished: true, events: [opp(2), opp(3), ev('t2_ok', 'p4')] }),
  ];
  await seed(page, makeData({ games }));
  await page.goto(`${APP}#/stats/temporada`);
  const columns = page.locator('.trend .tcol');
  await expect(columns).toHaveCount(2);
  await expect(columns.locator('.tval')).toHaveText(['+4', '−3']);
  // Las barras salen de la línea central: la victoria hacia arriba y la derrota hacia abajo
  const [win, loss] = await columns.locator('.tbar').evaluateAll((bars) => bars.map((b) => b.getBoundingClientRect()));
  expect(win.height).toBeGreaterThan(8);
  expect(loss.height).toBeGreaterThan(8);
  expect(Math.abs(win.bottom - loss.top)).toBeLessThan(1.5);

  await columns.nth(1).tap();
  await expect(page).toHaveURL(/#\/stats\/g2$/);
  await expect(page.locator('.badge')).toHaveText('Derrota');
});

test.describe('en una tablet', () => {
  test.use({ viewport: { width: 1180, height: 600 } });

  test('la tabla de estadísticas cabe a lo ancho y su cabecera se queda fija al bajar', async ({ page }) => {
    const players = Array.from({ length: 14 }, (_, i) => ({ id: `j${i}`, number: String(i + 4), name: `Jugador ${i + 4}` }));
    const game = makeGame({ roster: players, finished: true, played: { j0: [1] }, events: [ev('t2_ok', 'j0'), ev('rd', 'j0'), opp(2)] });
    await seed(page, makeData({ teams: [makeTeam({ players })], games: [game] }));
    await page.goto(`${APP}#/stats/g1`);
    await expect(page.locator('table.stats tbody tr')).toHaveCount(14);

    const layout = await page.evaluate(() => {
      const content = document.querySelector('.content');
      const wrap = document.querySelector('.table-wrap');
      content.scrollTop = content.scrollHeight;
      const head = document.querySelector('table.stats th').getBoundingClientRect();
      return {
        overflow: wrap.scrollWidth - wrap.clientWidth,
        scrolled: content.scrollTop,
        headTop: head.top - content.getBoundingClientRect().top,
        firstRowTop: document.querySelector('table.stats tbody tr').getBoundingClientRect().top - content.getBoundingClientRect().top,
      };
    });
    expect(layout.overflow).toBeLessThanOrEqual(0);
    expect(layout.scrolled).toBeGreaterThan(300);           // la página se ha desplazado más allá de la cabecera…
    expect(layout.firstRowTop).toBeLessThan(0);              // …la primera fila ya ha salido por arriba…
    expect(Math.abs(layout.headTop)).toBeLessThan(1.5);      // …y la cabecera sigue pegada al borde superior
  });
});

test.describe('en vertical', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('pide girar el móvil', async ({ page }) => {
    await page.goto(APP);
    await expect(page.locator('#rotate')).toBeVisible();
    await expect(page.locator('#rotate')).toContainText('Gira el dispositivo');
  });

  test('los textos de la bienvenida quedan centrados', async ({ page }) => {
    await page.goto(APP);
    await expect(page.locator('.splash-privacy')).toBeVisible();
    // Se mide lo que se ve (el icono y cada línea de texto), no la caja: una caja centrada con el texto
    // alineado a la izquierda dentro se ve descentrada
    const centers = await page.evaluate(() => {
      const ink = (el) => {
        const rects = [];
        for (const icon of el.querySelectorAll('svg')) rects.push(icon.getBoundingClientRect());
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          rects.push(...range.getClientRects());
        }
        const visible = rects.filter((r) => r.width > 0);
        return (Math.min(...visible.map((r) => r.left)) + Math.max(...visible.map((r) => r.right))) / 2;
      };
      return Object.fromEntries(['.splash-name', '.splash-tag', '.splash-privacy', '.rotate-hint p', '.rotate-hint small']
        .map((sel) => [sel, Math.round(ink(document.querySelector(sel)) - innerWidth / 2)]));
    });
    for (const [selector, offset] of Object.entries(centers)) expect(Math.abs(offset), `${selector} se desvía ${offset}px del centro`).toBeLessThanOrEqual(3);
  });
});
