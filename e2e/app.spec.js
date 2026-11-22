// App de estadísticas en un navegador real: toques, recargas, service worker y diseño en horizontal.
import { ev, makeData, makeGame, makeTeam, opp, sampleGame, trackedGame } from '../tests/helpers/fixtures.js';
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
  await page.locator('label', { hasText: 'Con jugadores' }).click();
  await page.getByRole('button', { name: /Crear equipo/ }).click();
  for (const [number, name] of [['4', 'Ana'], ['7', 'Bruno'], ['10', 'Carla'], ['12', 'Dani'], ['15', 'Eva'], ['21', 'Fran']]) {
    await page.getByLabel('Dorsal').fill(number);
    await page.getByLabel('Nombre', { exact: true }).fill(name);
    await page.getByRole('button', { name: /Añadir/ }).click();
  }
  await expect(page.locator('.roster li')).toHaveCount(6);

  await page.getByRole('link', { name: 'Partidos' }).click();
  await page.getByPlaceholder('Nombre del rival').fill('Lakers');
  // Sin elegir local o visitante no empieza
  await page.getByRole('button', { name: /Empezar partido/ }).click();
  await expect(page.locator('#toast')).toContainText('Elige si jugáis de local o de visitante');
  await page.locator('.venue-field label', { hasText: 'Visitante' }).click();
  await page.getByRole('button', { name: /Empezar partido/ }).click();

  const lineup = page.locator('.modal.lineup');
  await expect(lineup).toContainText('Quinteto inicial');
  for (const name of ['Ana', 'Bruno', 'Carla', 'Dani', 'Eva']) await lineup.getByRole('button', { name: new RegExp(name) }).tap();
  await expect(lineup.locator('.count')).toHaveText('5/5 en pista');
  await lineup.getByRole('button', { name: 'Listo' }).tap();

  const row = (name) => page.locator('.court .prow', { hasText: name });
  await row('Ana').locator('[data-type="t2_ok"]').tap();
  await row('Bruno').locator('[data-type="t3_ok"]').tap();
  await row('Carla').locator('[data-type="reb"]').tap();   // un equipo nuevo empieza en pre-mini: rebote con un solo botón
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

test('el equipo de ejemplo se abre desde la bienvenida con sus partidos y sus estadísticas', async ({ page }) => {
  await page.goto(APP);
  const card = page.locator('.demo-card');
  await expect(card).toContainText('Equipo de ejemplo');
  await card.locator('[data-action="demo-open"]').tap();
  await expect(page.locator('.brand-name')).toHaveText('Penya Verdinegra');
  await expect(page.getByText('vs Barcino')).toBeVisible();

  // Sigue ahí al recargar y sus estadísticas de temporada se pintan
  await page.reload();
  await page.getByRole('link', { name: 'Estadísticas', exact: true }).click();
  await expect(page.locator('.summary')).toBeVisible();
  await page.goto(`${APP}#/equipos`);
  await expect(page.locator('.demo-card')).toHaveCount(0);
  await expect(page.locator('.team-card')).toHaveCount(1);
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

test('solo marcador: un equipo sin jugadores lleva el partido como un marcador', async ({ page }) => {
  await page.goto(APP);
  await page.getByLabel('Nombre del equipo').fill('Mis peques');
  // Es la opción por defecto
  await expect(page.locator('input[name=mode][value=board]')).toBeChecked();
  await page.getByRole('button', { name: /Crear equipo/ }).click();
  await expect(page).toHaveURL(/#\/partidos$/);

  await page.getByPlaceholder('Nombre del rival').fill('Lakers');
  await page.locator('.venue-field label', { hasText: 'Local' }).click();
  await page.getByRole('button', { name: /Empezar marcador/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  // Perfil Marcador: los botones verdes de anotado y la falta de cada equipo, grandes y sin scroll
  const us = page.locator('.sb-side.us');
  const them = page.locator('.sb-side.them');
  await expect(us.locator('button.act')).toHaveCount(4);
  await expect(us.locator('[data-type="t2_ko"]')).toHaveCount(0);
  await us.locator('[data-type="t2_ok"]').tap();
  await us.locator('[data-type="t3_ok"]').tap();
  await them.locator('[data-pts="2"]').tap();
  await expect(page.locator('.sb-score.us span')).toHaveText('5');
  await expect(page.locator('.sb-score.them span')).toHaveText('2');
  const layout = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.sb button')].map((b) => b.getBoundingClientRect());
    // Los de apuntar, del tamaño recomendado para tocar con el dedo; el −1 (corregir) puede ser algo más bajo
    const main = [...document.querySelectorAll('.sb button:not(.sb-minus)')].map((b) => b.getBoundingClientRect());
    return {
      scroll: document.documentElement.scrollHeight - innerHeight,
      offscreen: buttons.filter((r) => r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5).length,
      minMain: Math.min(...main.map((r) => r.height)),
      minAll: Math.min(...buttons.map((r) => r.height)),
    };
  });
  expect(layout.scroll).toBeLessThanOrEqual(0);
  expect(layout.offscreen).toBe(0);
  expect(layout.minMain).toBeGreaterThanOrEqual(44);
  expect(layout.minAll).toBeGreaterThanOrEqual(36);

  // Faltas de equipo: con la 4ª del periodo, el rival entra en bonus
  for (let i = 0; i < 4; i++) await them.locator('[data-type="fr"]').tap();
  await expect(them.locator('.sb-sub')).toContainText('Faltas 4');
  await expect(them.locator('.bonus-tag')).toBeVisible();
  await us.locator('[data-type="fc"]').tap();
  await expect(us.locator('.sb-sub')).toContainText('Faltas 1');

  // Pasar de periodo no pide quinteto; en minibasket el periodo empieza en 0 y el total sigue a la vista
  // (y las faltas de equipo vuelven a 0)
  await page.locator('[data-action="period"][data-d="1"]').tap();
  await expect(page.locator('.period b')).toHaveText('P2');
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(them.locator('.sb-sub')).toContainText('Faltas 0');
  await expect(them.locator('.bonus-tag')).toHaveCount(0);
  await expect(page.locator('.sb-score.us span')).toHaveText('0');
  await expect(page.locator('.sb-totalbar b.us')).toHaveText('5');
  // Volviendo al periodo anterior se corrigen sus puntos con el −1 del propio equipo
  await page.locator('[data-action="period"][data-d="-1"]').tap();
  await page.locator('.sb-side.us [data-action="adj"]').tap();
  await expect(page.locator('.sb-score.us span')).toHaveText('4');
  await page.reload();
  await expect(page.locator('.sb-totalbar b.us')).toHaveText('4');

  await page.locator('[data-action="menu"]').tap();
  await page.getByRole('button', { name: /Finalizar partido/ }).tap();
  await page.locator('[data-action="confirm-yes"]').tap();
  await expect(page.locator('.badge')).toHaveText('Victoria');
  await expect(page.locator('table.stats tfoot td[data-k="pts"]')).toHaveText('4');
});

test('en el móvil más estrecho, el marcador con todos los botones cabe sin recortar el resultado', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  const roster = [{ id: '_equipo', number: '', name: 'Equipo (marcador)' }];
  const events = [...Array(50)].map((_, i) => ({ id: `e${i}`, seq: i + 1, period: 1, type: 't2_ok', pid: '_equipo' }));
  const opps = [...Array(44)].map((_, i) => ({ id: `o${i}`, seq: i + 51, period: 1, type: 'opp', pts: 2 }));
  await seed(page, makeData({ teams: [makeTeam({ players: [], hidden: ['reb'] })], games: [makeGame({ roster, events: [...events, ...opps] })] }));
  await page.goto(`${APP}#/partido/g1`);
  // La falta recibida (la del rival) va debajo de los puntos del rival
  await expect(page.locator('.sb-side.us button.act')).toHaveCount(14);
  await expect(page.locator('.sb-side.them button.act')).toHaveCount(1);
  const layout = await page.evaluate(() => {
    const box = (el) => el.getBoundingClientRect();
    const buttons = [...document.querySelectorAll('.sb button')].map(box);
    const scores = [...document.querySelectorAll('.sb-score')];
    return {
      scroll: Math.max(document.documentElement.scrollHeight - innerHeight, document.documentElement.scrollWidth - innerWidth),
      offscreen: buttons.filter((r) => r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5).length,
      clipped: scores.filter((s) => { const n = box(s.querySelector('span')), b = box(s); return n.width > b.width + 0.5 || n.height > b.height + 0.5; }).length,
      texts: scores.map((s) => s.querySelector('span').textContent),
    };
  });
  expect(layout.texts).toEqual(['100', '88']);
  expect(layout.scroll).toBeLessThanOrEqual(0);
  expect(layout.offscreen).toBe(0);
  expect(layout.clipped).toBe(0);
});

test('en el móvil más estrecho, el marcador cabe junto a la valoración, el +/- del quinteto y las faltas de equipo', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  // Con registro de quintetos, para que salga también el +/- del quinteto; 88-88 es el marcador más ancho habitual
  const events = [...Array(44)].map((_, i) => ({ id: `e${i}`, seq: i + 2, period: 1, type: 't2_ok', pid: 'p4' }));
  const opps = [...Array(44)].map((_, i) => ({ id: `o${i}`, seq: i + 46, period: 1, type: 'opp', pts: 2 }));
  await seed(page, makeData({ games: [makeGame({ onCourt: [...FIVE], lineupFrom: 1, lineups: [{ seq: 1, period: 1, on: [...FIVE] }], events: [...events, ...opps] })] }));
  await page.goto(`${APP}#/partido/g1`);
  await expect(page.locator('.live-perf b')).toHaveCount(2);
  await expect(page.locator('.board .tfouls')).toHaveCount(2);
  const layout = await page.evaluate(() => {
    const box = (el) => el.getBoundingClientRect();
    const board = box(document.querySelector('.board'));
    const scores = [...document.querySelectorAll('.board .score, .board .tfouls')];
    return {
      scroll: document.documentElement.scrollWidth - innerWidth,
      // Cada marcador entero dentro de su caja y sin recortar sus cifras
      inside: scores.every((s) => box(s).left >= board.left - 0.5 && box(s).right <= board.right + 0.5),
      clipped: scores.filter((s) => s.scrollWidth > s.clientWidth + 1).length,
      texts: scores.map((s) => s.textContent),
    };
  });
  expect(layout.texts).toEqual(['Faltas0', '88', '88', 'Faltas0']);
  expect(layout.scroll).toBeLessThanOrEqual(0);
  expect(layout.inside).toBe(true);
  expect(layout.clipped).toBe(0);
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
  // Columnas de siempre, las avanzadas (eFG%, TS%, %PÉR, TL/TC) y el +/- (vacío: partido sin registro de quintetos)
  expect(lines.at(-1)).toBe(';Equipo;4;8;1;2;2;3;1;2;1;1;2;1;0;1;1;1;1;0;6;70;68;15;0,4;;0');
});

test('descarga la imagen del partido: un PNG de 1080 × 1350 dibujado de verdad', async ({ page, browserName }) => {
  // Sin conexión a fuentes externas ni a Umami: la tarjeta usa las fuentes que lleva la app
  await seed(page, makeData({ games: [sampleGame({ finished: true })] }));
  await page.goto(`${APP}#/stats/g1`);
  await page.getByRole('button', { name: /Enviar/ }).click();
  const button = page.getByRole('button', { name: /Imagen/ });
  await expect(button).toBeEnabled();
  // En los navegadores que comparten archivos se abre el menú nativo, que Playwright no ve: se prueba la descarga
  await page.evaluate(() => { navigator.canShare = () => false; });
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  expect(download.suggestedFilename()).toBe('partido-Alevin_A-Rival-03_10_2026.png');
  const png = Buffer.concat(await (await download.createReadStream()).toArray());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1350]);
  expect(png.length, `${browserName}: una tarjeta con texto pesa más que un lienzo vacío`).toBeGreaterThan(20_000);
});

test('descarga la tabla completa en PNG: se dibuja de verdad y las avanzadas, con menos columnas, salen más estrechas', async ({ page }) => {
  await seed(page, makeData({ games: [sampleGame({ finished: true }), makeGame({ id: 'g2', date: '2026-10-10', finished: true, played: { p4: [1] }, events: [ev('t2_ok', 'p4')] })] }));
  await page.goto(`${APP}#/stats/temporada`);
  const size = async () => {
    await page.getByRole('button', { name: /Enviar/ }).click();
    await page.evaluate(() => { navigator.canShare = () => false; });
    const button = page.getByRole('button', { name: /Tabla PNG/ });
    await expect(button).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
    expect(download.suggestedFilename()).toMatch(/^estadisticas-temporada-\d{4}-\d{2}-\d{2}\.png$/);
    const png = Buffer.concat(await (await download.createReadStream()).toArray());
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    await page.getByRole('button', { name: 'Cerrar' }).click();
    return { w: png.readUInt32BE(16), h: png.readUInt32BE(20), bytes: png.length };
  };
  const basic = await size();
  // Más ancha que alta, con las 18 columnas de las básicas, y con mucho dibujo (no un lienzo vacío)
  expect(basic.w).toBeGreaterThan(1500);
  expect(basic.bytes).toBeGreaterThan(30_000);
  // Las avanzadas tienen menos columnas, así que la imagen es más estrecha
  await page.getByRole('button', { name: 'Avanzadas' }).click();
  const advanced = await size();
  expect(advanced.w).toBeLessThan(basic.w);
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

test('los mejores quintetos de la temporada caben a lo ancho en el móvil y muestran sus partidos', async ({ page }) => {
  const Q1 = ['p4', 'p7', 'p10', 'p12', 'p15'], Q2 = ['p4', 'p7', 'p10', 'p12', 'p21'];
  const games = ['g1', 'g2'].map((id, i) => trackedGame(id, [[1, Q1, 5, 1], [2, Q2, 1, 4], [3, Q1, 3, 1], [4, Q2, 2, 2]], { date: `2026-10-0${i + 3}` }));
  await seed(page, makeData({ games }));
  await page.goto(`${APP}#/stats/temporada`);
  const units = page.locator('.units .unit');
  await expect(units).toHaveCount(2);
  await expect(units.first()).toContainText('+12');   // Q1: (5−1 + 3−1) en cada uno de los dos partidos
  const overflow = await page.evaluate(() => {
    const card = document.querySelector('.units');
    return card.scrollWidth - card.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
  await units.first().locator('summary').click();
  await expect(units.first().locator('.unit-games')).toContainText('vs Rival');
  await expect(page.locator('table.stats th[data-k="pm"]')).toBeVisible();
});

test('las estadísticas avanzadas de la temporada caben a lo ancho en el móvil y explican cada métrica', async ({ page }) => {
  const shots = (pid) => [ev('t2_ok', pid), ev('t2_ko', pid), ev('t3_ok', pid), ev('t1_ok', pid), ev('t1_ko', pid), ev('lost', pid)];
  const games = ['g1', 'g2'].map((id) => makeGame({ id, finished: true, played: { p4: [1], p7: [1] }, events: [...shots('p4'), ...shots('p7'), opp(2)] }));
  await seed(page, makeData({ games }));
  await page.goto(`${APP}#/stats/temporada`);
  await page.locator('[data-action="adv"][data-v="1"]').click();
  await expect(page.locator('table.stats thead th[data-k="ts"]')).toBeVisible();

  const layout = await page.evaluate(() => {
    const wrap = document.querySelector('.table-wrap');
    const head = document.querySelector('.stats-head');
    const control = head.querySelector('.btn').getBoundingClientRect().height;
    return { overflow: wrap.scrollWidth - wrap.clientWidth, headRows: Math.round(head.getBoundingClientRect().height / control) };
  });
  expect(layout.overflow).toBeLessThanOrEqual(0);
  expect(layout.headRows).toBeLessThanOrEqual(2);   // la cabecera puede ocupar dos filas, nunca más
  await expect(page.locator('.glossary')).toContainText('Acierto real en el tiro');
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

test('Ajustes enlaza al perfil de X para pedir ayuda y proponer mejoras', async ({ page }) => {
  await seed(page, makeData());
  await page.goto(`${APP}#/ajustes`);
  await expect(page.getByRole('heading', { name: 'Ayuda y sugerencias' })).toBeVisible();
  const link = page.getByRole('link', { name: /Escríbeme en X \(@myownbbstats\)/ });
  await expect(link).toHaveAttribute('href', 'https://x.com/myownbbstats');
  await expect(link).toHaveAttribute('target', '_blank');
});
