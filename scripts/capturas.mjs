// Capturas de la app para la web (public/img/app-*.webp): la app real con datos de ejemplo, en un móvil en horizontal
// (844×390 a 2x) y en modo oscuro. Se rehacen después de cambiar algo que se vea en ellas:
//
//   node scripts/capturas.mjs
//
// Usa el Chromium de Playwright (devDependencies). Los datos se generan aquí con un azar con semilla, así que salen
// siempre las mismas capturas. El WebP lo codifica el propio navegador (canvas.toDataURL), sin dependencias.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

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
const TEAM = {
  id: 'mini-a', name: 'Mini A', email: '', players: PLAYERS, hidden: ['ro', 'rd', 'blk', 'blkr'], rebOne: true,
  phase: 1, levels: ['Nivel B', ''], move: '', minUnit: 4,
};

/* Un partido con registro de quintetos. quarters: por periodo, [puntos propios, puntos del rival, quintetos], donde
   cada quinteto es una lista de dorsales y, si hay más de uno, el periodo se reparte entre ellos. */
function buildGame({ id, date, opponent, venue, periods, finished, upTo, quarters, createdAt }) {
  const byNumber = Object.fromEntries(PLAYERS.map((p) => [p.number, p.id]));
  const g = {
    id, createdAt, date, opponent, teamId: TEAM.id, teamName: TEAM.name, periods, period: upTo, roster: PLAYERS,
    onCourt: [], played: {}, events: [], finished, phase: 1, venue, lineups: [], seq: 0, lineupFrom: 1,
  };
  const push = (e) => g.events.push({ id: `${id}-e${++g.seq}`, seq: g.seq, ts: Date.parse(date) + g.seq * 20_000, ...e });
  quarters.slice(0, upTo).forEach(([us, them, fives], i) => {
    const period = i + 1;
    fives.forEach((numbers, k) => {
      const on = numbers.map((n) => byNumber[n]);
      g.lineups.push({ seq: ++g.seq, period, on });
      for (const pid of on) (g.played[pid] ||= []).includes(period) || g.played[pid].push(period);
      // Cada quinteto juega su parte del periodo: sus puntos, los del rival y el resto de jugadas, mezclados
      const share = (n) => (k === fives.length - 1 ? n - Math.round(n * k / fives.length) : Math.round(n / fives.length));
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
      const extra = { t2_ko: 3, t1_ko: 1, reb: 4, rec: 1, lost: 1, fc: 1, fr: 1 };
      for (const [type, n] of Object.entries(extra)) {
        const times = Math.round(n / fives.length + rand() * 1.2 - 0.4);
        for (let t = 0; t < times; t++) plays.push({ type, pid: pick(on) });
      }
      for (const p of shuffle(plays)) push({ period, ...p });
    });
    g.onCourt = fives.at(-1).map((n) => byNumber[n]);
  });
  return g;
}

// Partido finalizado: victoria 57-47 contra Escola Bàsquet Riu (parciales de la captura de estadísticas)
const finished = buildGame({
  id: 'g-riu', date: '2026-10-31', opponent: 'Escola Bàsquet Riu', venue: 'home', periods: 8, finished: true, upTo: 8,
  createdAt: 1,
  quarters: [
    [9, 4, [['4', '5', '9', '11', '15']]], [2, 8, [['7', '8', '12', '14', '21']]],
    [4, 7, [['5', '9', '11', '14', '21']]], [2, 4, [['4', '7', '8', '12', '15']]],
    [12, 6, [['5', '9', '11', '12', '15']]], [9, 7, [['4', '7', '8', '14', '21']]],
    [6, 5, [['8', '9', '11', '14', '15']]], [13, 6, [['4', '5', '7', '12', '21']]],
  ],
});

// Partido en juego: 38-33 contra CB Montalt en el periodo 6, con un cambio a mitad de periodo
const live = buildGame({
  id: 'g-montalt', date: '2026-11-14', opponent: 'CB Montalt', venue: 'home', periods: 8, finished: false, upTo: 6,
  createdAt: 2,
  quarters: [
    [8, 6, [['5', '8', '11', '14', '15']]], [4, 7, [['4', '7', '9', '12', '21']]],
    [9, 4, [['5', '8', '9', '11', '15']]], [6, 8, [['4', '7', '12', '14', '21']]],
    [5, 6, [['8', '9', '11', '14', '15']]], [6, 2, [['5', '8', '9', '11', '15'], ['5', '8', '11', '14', '15']]],
  ],
});

const DATA = { version: 3, teams: [TEAM], games: [finished, live], currentTeamId: TEAM.id };

/* ── Servidor estático de la app ── */

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(APP_DIR, path.endsWith('/') ? `${path}index.html` : path);
  try {
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
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, serviceWorkers: 'block' });
await context.addInitScript((json) => {
  localStorage.setItem('mbstats.v1', json);
  localStorage.setItem('mb_theme', 'dark');
}, JSON.stringify(DATA));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

async function shot(name, hash, prepare) {
  await page.goto(`${BASE}${hash}`);
  await page.evaluate(() => document.fonts.ready);
  if (prepare) await prepare();
  await page.waitForTimeout(300);
  const png = await page.screenshot();
  // PNG → WebP con el codificador del navegador
  const webp = await page.evaluate(async ({ src, quality }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: img.naturalWidth, height: img.naturalHeight });
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/webp', quality).split(',')[1];
  }, { src: `data:image/png;base64,${png.toString('base64')}`, quality: QUALITY });
  const file = join(OUT, `${name}.webp`);
  await writeFile(file, Buffer.from(webp, 'base64'));
  console.log(`${file} (${Math.round(Buffer.byteLength(webp, 'base64') / 1024)} KB)`);
}

await shot('app-partido', `#/partido/${live.id}`);
// Ajustes: la tarjeta de botones del partido, con los perfiles (el del equipo, Mini, marcado)
await shot('app-ajustes', '#/ajustes', () => page.evaluate(() => {
  document.querySelector('.profiles').closest('.card').scrollIntoView({ block: 'start' });
}));
await shot('app-estadisticas', `#/stats/${finished.id}`);

await browser.close();
server.close();
if (errors.length) {
  console.error('Errores de JavaScript en la app:', errors);
  process.exit(1);
}
