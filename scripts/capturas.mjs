// Capturas de la app para la web (public/img/app-*.webp): la app real con datos de ejemplo, en un móvil en horizontal
// (844×390 a 2x) y en modo oscuro. Se rehacen después de cambiar algo que se vea en ellas:
//
//   node scripts/capturas.mjs
//
// Usa el Chromium de Playwright (devDependencies). Los datos se generan aquí con un azar con semilla, así que salen
// siempre las mismas capturas. El WebP lo codifica el propio navegador (canvas.toDataURL), sin dependencias.
// Si la app falla o no llega a la pantalla esperada, no se escribe ninguna imagen.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { makeData, makeGame, makeTeam } from '../tests/helpers/fixtures.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const APP_DIR = join(ROOT, 'public/minibasket-stats');
const OUT = join(ROOT, 'public/img');
const VIEWPORT = { width: 844, height: 390 };
const QUALITY = 0.85;

/* ── Datos de ejemplo ── */

// Azar con semilla (mulberry32): mismas jugadas en cada ejecución
let state = 20261114;
const rand = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const shuffle = (list) => list.map((x) => [rand(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

const PLAYERS = [
  ['p4', '4', 'Leo'], ['p5', '5', 'Martina'], ['p7', '7', 'Pau'], ['p8', '8', 'Lucía'], ['p9', '9', 'Jana'],
  ['p11', '11', 'Marc'], ['p12', '12', 'Biel'], ['p14', '14', 'Álex'], ['p15', '15', 'Carla'], ['p21', '21', 'Nora'],
].map(([id, number, name]) => ({ id, number, name }));

// Perfil Mini: tiros, rebote con un solo botón, recuperación, pérdida, asistencia y faltas
const TEAM = makeTeam({ id: 'mini-a', name: 'Mini A', players: PLAYERS, hidden: ['ro', 'rd', 'blk', 'blkr'], rebOne: true, levels: ['Nivel B', ''] });

/* Un partido con registro de quintetos (formato de makeGame). quarters: por periodo, [puntos propios, puntos del
   rival, quintetos], donde cada quinteto es una lista de dorsales y, si hay más de uno, el periodo se reparte. */
function buildGame({ id, date, opponent, finished, upTo, quarters, createdAt }) {
  const byNumber = Object.fromEntries(PLAYERS.map((p) => [p.number, p.id]));
  const events = [], lineups = [], played = {};
  let seq = 0, onCourt = [];
  const push = (e) => { seq++; events.push({ id: `${id}-e${seq}`, seq, ts: Date.parse(date) + seq * 20_000, ...e }); };
  quarters.slice(0, upTo).forEach(([us, them, fives], i) => {
    const period = i + 1;
    fives.forEach((numbers, k) => {
      const on = numbers.map((n) => byNumber[n]);
      lineups.push({ seq: ++seq, period, on });
      for (const pid of on) (played[pid] ||= []).includes(period) || played[pid].push(period);
      // Cada quinteto juega su parte del periodo (reparto acumulado: las partes siempre suman el total)
      const share = (n) => Math.round(n * (k + 1) / fives.length) - Math.round(n * k / fives.length);
      const plays = [];
      let mine = share(us), theirs = share(them);
      while (mine > 0) {
        const shooter = pick(on.concat(byNumber['9'], byNumber['15']).filter((p) => on.includes(p)));
        const type = mine >= 3 && rand() < 0.1 ? 't3_ok' : mine >= 2 && rand() < 0.8 ? 't2_ok' : 't1_ok';
        mine -= { t1_ok: 1, t2_ok: 2, t3_ok: 3 }[type];
        plays.push({ type, pid: shooter });
        if (rand() < 0.3) plays.push({ type: 'ast', pid: pick(on.filter((p) => p !== shooter)) });
      }
      while (theirs > 0) {
        const pts = theirs >= 2 && rand() < 0.8 ? 2 : 1;
        theirs -= pts;
        plays.push({ type: 'opp', pts });
      }
      // Jugadas que no suman (media por periodo): fallos, rebotes, recuperaciones, pérdidas y faltas
      const extra = { t2_ko: 3, t1_ko: 1, t3_ko: 0.5, reb: 4, rec: 1, lost: 1, fc: 1, fr: 1 };
      for (const [type, n] of Object.entries(extra)) {
        const times = Math.round(n / fives.length + rand() * 1.2 - 0.4);
        for (let t = 0; t < times; t++) plays.push({ type, pid: pick(on) });
      }
      for (const p of shuffle(plays)) push({ period, ...p });
    });
    onCourt = fives.at(-1).map((n) => byNumber[n]);
  });
  return makeGame({
    id, createdAt, date, opponent, teamId: TEAM.id, teamName: TEAM.name, periods: 8, period: upTo, roster: PLAYERS,
    onCourt, played, events, finished, venue: 'home', lineups, seq, lineupFrom: 1,
  });
}

// Partido finalizado: victoria 57-47 contra Escola Bàsquet Riu (statsAlt en src/i18n/home.ts)
const finished = buildGame({
  id: 'g-riu', date: '2026-10-31', opponent: 'Escola Bàsquet Riu', finished: true, upTo: 8, createdAt: 1,
  quarters: [
    [9, 4, [['4', '5', '9', '11', '15']]], [2, 8, [['7', '8', '12', '14', '21']]],
    [4, 7, [['5', '9', '11', '14', '21']]], [2, 4, [['4', '7', '8', '12', '15']]],
    [12, 6, [['5', '9', '11', '12', '15']]], [9, 7, [['4', '7', '8', '14', '21']]],
    [6, 5, [['8', '9', '11', '14', '15']]], [13, 6, [['4', '5', '7', '12', '21']]],
  ],
});

// Partido en juego: 38-33 contra CB Montalt en el periodo 6, con un cambio a mitad de periodo (heroAlt)
const live = buildGame({
  id: 'g-montalt', date: '2026-11-14', opponent: 'CB Montalt', finished: false, upTo: 6, createdAt: 2,
  quarters: [
    [8, 6, [['5', '8', '11', '14', '15']]], [4, 7, [['4', '7', '9', '12', '21']]],
    [9, 4, [['5', '8', '9', '11', '15']]], [6, 8, [['4', '7', '12', '14', '21']]],
    [5, 6, [['8', '9', '11', '14', '15']]], [6, 2, [['5', '8', '9', '11', '15'], ['5', '8', '11', '14', '15']]],
  ],
});

/* Equipo de solo marcador (sin jugadores, perfil Escuela) con un partido en juego en el periodo 5: 6-4 en el periodo
   y 27-22 en total (growAlt en src/i18n/home.ts). Las jugadas van al jugador interno del marcador (_equipo). Los botones
   ocultos son todos menos los de Escuela (t1, t2 y t3): la app no los lee de aquí, pero si cambian sus botones, el test
   tests/app/modo-marcador.test.js (ESCUELA_HIDDEN) lo detecta y hay que cambiar también esta lista. */
const BOARD_TEAM = makeTeam({ id: 'peques', name: 'Peques', players: [], board: true, hidden: ['ro', 'rd', 'reb', 'rec', 'lost', 'ast', 'blk', 'blkr', 'fc', 'fr'] });
function buildBoard() {
  const events = [];
  let seq = 0;
  const push = (period, e) => { seq++; events.push({ id: `pq-e${seq}`, seq, ts: Date.parse('2026-11-15') + seq * 20_000, period, ...e }); };
  // Por periodo: puntos propios, puntos del rival y tiros fallados propios
  [[6, 4, 3], [4, 6, 2], [7, 4, 3], [4, 4, 4], [6, 4, 2]].forEach(([us, them, missed], i) => {
    const period = i + 1, plays = [];
    for (let left = us; left > 0;) {
      const type = left >= 3 && rand() < 0.12 ? 't3_ok' : left >= 2 && rand() < 0.75 ? 't2_ok' : 't1_ok';
      left -= { t1_ok: 1, t2_ok: 2, t3_ok: 3 }[type];
      plays.push({ type, pid: '_equipo' });
    }
    for (let k = 0; k < missed; k++) plays.push({ type: pick(['t2_ko', 't2_ko', 't1_ko', 't3_ko']), pid: '_equipo' });
    for (let left = them; left > 0;) { const pts = left >= 2 && rand() < 0.8 ? 2 : 1; left -= pts; plays.push({ type: 'opp', pts }); }
    for (const p of shuffle(plays)) push(period, p);
  });
  return makeGame({
    id: 'g-peques', createdAt: 3, date: '2026-11-15', opponent: 'CB Montalt', teamId: BOARD_TEAM.id, teamName: BOARD_TEAM.name,
    periods: 8, period: 5, roster: [{ id: '_equipo', number: '', name: 'Equipo (marcador)' }], events, venue: 'home', seq,
  });
}
const board = buildBoard();

const DATA = makeData({ teams: [TEAM, BOARD_TEAM], games: [finished, live, board], currentTeamId: TEAM.id });

/* ── Servidor estático de la app ── */

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    // Rutas de URL (siempre con «/», también en Windows), sin salir de la carpeta de la app
    const path = posix.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.\/)+/, '');
    const file = join(APP_DIR, path.endsWith('/') ? `${path}index.html` : path);
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}/`;

/* ── Capturas ── */

const browser = await chromium.launch();
// Un móvil táctil (sin estilos de ratón) con el tamaño de las capturas
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await context.addInitScript((json) => {
  localStorage.setItem('mbstats.v1', json);
  localStorage.setItem('mb_theme', 'dark');
}, JSON.stringify(DATA));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

/* Captura de una pantalla, en memoria. expect: un elemento que solo está en la pantalla buscada (la app cambia de
   ruta sin error si, por ejemplo, el partido no existe) */
async function shot(name, hash, expect, prepare) {
  await page.goto(`${BASE}${hash}`);
  await page.evaluate(() => document.fonts.ready);
  const where = await page.evaluate(() => location.hash);
  if (where !== hash || !(await page.locator(expect).count())) throw new Error(`${name}: se esperaba ${hash} con ${expect} y la app está en ${where}`);
  if (prepare) await prepare();
  await page.waitForTimeout(300);
  if (errors.length) throw new Error(`${name}: errores de JavaScript en la app: ${errors.join(' · ')}`);
  const png = await page.screenshot();
  // PNG → WebP con el codificador del navegador (si no sabe, devuelve PNG: entonces se para)
  const url = await page.evaluate(async ({ src, quality }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: img.naturalWidth, height: img.naturalHeight });
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/webp', quality);
  }, { src: `data:image/png;base64,${png.toString('base64')}`, quality: QUALITY });
  if (!url.startsWith('data:image/webp;')) throw new Error(`${name}: este navegador no codifica WebP`);
  return { file: join(OUT, `${name}.webp`), data: Buffer.from(url.split(',')[1], 'base64') };
}

try {
  const shots = [
    await shot('app-partido', `#/partido/${live.id}`, '.live .live-perf'),
    // Ajustes: la tarjeta de botones del partido, con los perfiles (el del equipo, Mini, marcado)
    await shot('app-ajustes', '#/ajustes', '.profile.on', () => page.evaluate(() => {
      document.querySelector('.profiles').closest('.card').scrollIntoView({ block: 'start' });
    })),
    await shot('app-estadisticas', `#/stats/${finished.id}`, '.summary .final'),
    await shot('app-marcador', `#/partido/${board.id}`, '.board-live .sb-totalbar'),
  ];
  // Solo se escriben si han salido todas
  for (const { file, data } of shots) {
    await writeFile(file, data);
    console.log(`${file} (${Math.round(data.length / 1024)} KB)`);
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
