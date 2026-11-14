// Equipo de ejemplo de la app (public/minibasket-stats/demo.js): el Joventut Badalona con su plantilla y los partidos
// de Liga Endesa que ha jugado, sacados del jugada a jugada de acb.com. Se rehace para añadir jornadas:
//
//   node scripts/demo.mjs <carpeta>
//
// En la carpeta se guardan las páginas descargadas (plantilla.html, partidos.html y <partido>.jugadas.html); las que
// ya estén no se vuelven a pedir, así que también vale dejarlas ahí a mano. Las jugadas de cada partido se comprueban
// contra las estadísticas que da la propia ACB: si algo no cuadra, no se escribe nada.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLUB = { id: 8, slug: 'asisa-joventut-8', name: 'Joventut Badalona', season: '2026-27' };
const OUT = fileURLToPath(new URL('../public/minibasket-stats/demo.js', import.meta.url));
const dir = process.argv[2];
if (!dir) {
  console.error('Uso: node scripts/demo.mjs <carpeta con las páginas descargadas>');
  process.exit(1);
}

/* ── Páginas de acb.com ── */

async function page(name, url) {
  const file = join(dir, name);
  if (existsSync(file)) return readFile(file, 'utf8');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const html = await res.text();
  await mkdir(dir, { recursive: true });
  await writeFile(file, html);
  return html;
}

/* Las páginas son de Next.js: los datos van en trozos self.__next_f.push([1,"…"]) que, unidos, llevan el JSON */
function payload(html) {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map((m) => JSON.parse(m[1])).join('');
}

/* Valor JSON (objeto o lista) que sigue a "clave": dentro del texto */
function extract(text, key) {
  const at = text.indexOf(`"${key}":`);
  if (at < 0) throw new Error(`No se encuentra ${key}`);
  const start = at + key.length + 3;
  let depth = 0, inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if ((c === '}' || c === ']') && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error(`${key} no termina`);
}

/* Texto de la página sin etiquetas, con «|» entre elementos */
const cells = (html) => html.replace(/<script.*?<\/script>|<style.*?<\/style>/gs, '').replace(/<[^>]+>/g, '|').replace(/&amp;/g, '&').split('|').map((s) => s.trim()).filter(Boolean);

/* ── Plantilla ── */

const base = `https://acb.com/es/liga/equipos/${CLUB.slug}`;
const rosterCells = cells(await page('plantilla.html', `${base}/plantilla`));
// Cada jugador: # · dorsal · nombre · altura · tipo de licencia · apellido
const players = [];
rosterCells.forEach((c, i) => {
  const [number, first, height, , last] = rosterCells.slice(i + 1, i + 6);
  if (c === '#' && /^\d+$/.test(number) && / m$/.test(height) && !players.some((p) => p.number === number)) players.push({ id: `demo-p${number}`, number, name: `${first} ${last}` });
});
if (players.length < 10) throw new Error(`Plantilla: solo ${players.length} jugadores`);

/* ── Partidos ── */

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// Tipos de jugada de la ACB que se apuntan en la app. El resto (cambios, tiempos muertos, saltos…) no son jugadas
const PLAY = {
  92: 't1_ok', 96: 't1_ko', 93: 't2_ok', 100: 't2_ok', 97: 't2_ko', 533: 't2_ko', 94: 't3_ok', 98: 't3_ko',
  101: 'ro', 104: 'rd', 103: 'rec', 106: 'lost', 107: 'ast', 108: 'ast', 119: 'ast', 102: 'blk', 105: 'blkr',
  110: 'fr',
  // Faltas: personales, en ataque, antideportivas, técnicas… todas cuentan como falta del jugador
  109: 'fc', 159: 'fc', 160: 'fc', 161: 'fc', 162: 'fc', 756: 'fc', 761: 'fc', 762: 'fc', 763: 'fc', 778: 'fc', 783: 'fc',
};
const POINTS = { t1_ok: 1, t2_ok: 2, t3_ok: 3 };
const STARTER = 599, SUB_IN = 112, SUB_OUT = 115;
// Estadísticas acumuladas que da la ACB en cada jugada y la jugada de la app que las cuenta
const CHECK = {
  points: (l) => (l.t1_ok || 0) + 2 * (l.t2_ok || 0) + 3 * (l.t3_ok || 0),
  freeThrowsAttempted: (l) => (l.t1_ok || 0) + (l.t1_ko || 0),
  twoPointersAttempted: (l) => (l.t2_ok || 0) + (l.t2_ko || 0),
  threePointersAttempted: (l) => (l.t3_ok || 0) + (l.t3_ko || 0),
  offRebounds: (l) => l.ro || 0, defRebounds: (l) => l.rd || 0, assists: (l) => l.ast || 0, steals: (l) => l.rec || 0,
  turnovers: (l) => l.lost || 0, blocks: (l) => l.blk || 0, personalFouls: (l) => l.fc || 0, foulsDrawn: (l) => l.fr || 0,
};

const index = (name, number) => {
  let i = players.findIndex((p) => p.name === name);
  if (i < 0 && number != null) i = players.findIndex((p) => p.number === String(number));
  if (i < 0) {
    // Alguien que ya no está en la plantilla: sigue en los partidos que jugó
    if (number == null) throw new Error(`Jugador sin dorsal fuera de la plantilla: ${name}`);
    i = players.push({ id: `demo-p${number}`, number: String(number), name }) - 1;
  }
  return i;
};

function convert(slug, html) {
  const title = html.match(/<title>(.*?)<\/title>/)[1];
  const [, day, month, year] = title.match(/(\d{1,2}) (\p{L}{3})\p{L}* (\d{4})/u);
  const date = `${year}-${String(MONTHS.indexOf(month.toLowerCase()) + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
  const pbp = extract(payload(html), 'initialMatchPlayByPlay');
  if (!pbp.matchFinished) return null;
  const home = pbp.homeTeam.clubId === CLUB.id;
  const opponent = (home ? pbp.awayTeam : pbp.homeTeam).fullName;
  const list = [...pbp.plays].sort((a, b) => a.order - b.order);

  const plays = [], lines = {}, official = {};
  let on = [], shown = '', score = [0, 0];
  // Quinteto en pista antes de la siguiente jugada, si ha cambiado (o ha cambiado el cuarto)
  const snapshot = (period) => {
    const key = `${period}:${[...on].sort((a, b) => a - b)}`;
    if (key === shown) return;
    if (on.length !== 5) throw new Error(`${slug}: ${on.length} jugadores en pista en el cuarto ${period}`);
    plays.push([period, [...on]]);
    shown = key;
  };
  for (const p of list) {
    const ours = p.local === home;
    if (p.playType === STARTER || p.playType === SUB_IN || p.playType === SUB_OUT) {
      if (!ours) continue;
      const i = index(p.playerName, p.playerNumber);
      if (p.playType === SUB_OUT) on = on.filter((x) => x !== i);
      else if (!on.includes(i)) on.push(i);
      continue;
    }
    const type = PLAY[p.playType];
    if (!type || !p.playerName) continue;
    if (ours) {
      const i = index(p.playerName, p.playerNumber);
      snapshot(p.quarter);
      plays.push([p.quarter, type, i]);
      (lines[i] ||= {})[type] = (lines[i][type] || 0) + 1;
      if (p.playerStats) official[i] = p.playerStats;
      score[0] += POINTS[type] || 0;
    } else if (POINTS[type]) {
      snapshot(p.quarter);
      plays.push([p.quarter, POINTS[type]]);
      score[1] += POINTS[type];
    }
  }

  // Comprobaciones: el marcador final y la línea de cada jugador son los de la ACB
  const end = list.at(-1);
  const final = home ? [end.scoreHome, end.scoreAway] : [end.scoreAway, end.scoreHome];
  if (String(score) !== String(final)) throw new Error(`${slug}: sale ${score.join('-')} y fue ${final.join('-')}`);
  for (const [i, stats] of Object.entries(official)) {
    for (const [key, count] of Object.entries(CHECK)) {
      if (count(lines[i]) !== stats[key]) throw new Error(`${slug}: ${players[i].name}, ${key} sale ${count(lines[i])} y es ${stats[key]}`);
    }
  }
  return { id: `demo-${slug.match(/\d+$/)[0]}`, date, opponent, venue: home ? 'home' : 'away', periods: 4, result: score, plays };
}

const matches = await page('partidos.html', `${base}/partidos`);
const slugs = [...new Set([...matches.matchAll(/live\.acb\.com\/partidos\/([a-z0-9-]+-\d+)\//g)].map((m) => m[1]))];
const games = [];
for (const slug of slugs) {
  const g = convert(slug, await page(`${slug}.jugadas.html`, `https://live.acb.com/es/partidos/${slug}/jugadas`));
  if (g) games.push(g);
}
games.sort((a, b) => a.date.localeCompare(b.date));

/* ── demo.js ── */

const demo = {
  team: { id: 'demo-joventut', name: CLUB.name, level: `Liga Endesa ${CLUB.season}`, players },
  note: `Liga Endesa ${CLUB.season} · datos de acb.com`,
  games,
};
const line = (v) => JSON.stringify(v);
const js = `'use strict';

/* Equipo de ejemplo de la app: ${CLUB.name}, Liga Endesa ${CLUB.season}. Plantilla y jugada a jugada de acb.com.
   Archivo generado por scripts/demo.mjs: no se edita a mano. El formato está explicado en app.js («Equipo de ejemplo»). */
globalThis.MBDemo = {
  team: { id: ${line(demo.team.id)}, name: ${line(demo.team.name)}, level: ${line(demo.team.level)}, players: [
${players.map((p) => `    ${line(p)},`).join('\n')}
  ] },
  note: ${line(demo.note)},
  games: [
${games.map((g) => `    ${line(g)},`).join('\n')}
  ],
};
`;
await writeFile(OUT, js);
for (const g of games) console.log(`${g.date}  ${g.venue === 'home' ? 'local    ' : 'visitante'}  ${g.result.join('-').padEnd(7)}  ${g.opponent}  (${g.plays.length} jugadas)`);
console.log(`${OUT}: ${players.length} jugadores, ${games.length} partidos, ${Math.round(js.length / 1024)} KB`);
