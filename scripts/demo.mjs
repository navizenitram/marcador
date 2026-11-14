// Equipo de ejemplo de la app (public/minibasket-stats/demo.js): el Joventut Badalona con su plantilla y los partidos
// de Liga Endesa que ha jugado, sacados del jugada a jugada de acb.com. Se rehace para añadir jornadas:
//
//   node scripts/demo.mjs <carpeta>
//
// En la carpeta se guardan las páginas descargadas (plantilla.html, partidos.html y <partido>.jugadas.html). La
// plantilla y la lista de partidos se piden siempre, porque cambian con cada jornada; el jugada a jugada de un partido
// terminado ya no cambia y no se vuelve a pedir. Si una página no se puede descargar, se usa la que haya en la carpeta
// (también vale dejarlas ahí a mano) y se avisa. Las jugadas de cada partido se comprueban contra las estadísticas
// que da la propia ACB: si algo no cuadra, no se escribe nada.
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

/* Una página, de la carpeta o descargada. fresh: se pide aunque esté en la carpeta (y si falla, vale la guardada) */
async function page(name, url, fresh = false) {
  const file = join(dir, name);
  const saved = existsSync(file);
  if (saved && !fresh) return readFile(file, 'utf8');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    await mkdir(dir, { recursive: true });
    await writeFile(file, html);
    return html;
  } catch (e) {
    if (!saved) throw new Error(`No se pudo descargar ${url} (${e.message}) y no está en la carpeta como ${name}`);
    console.warn(`⚠️  No se pudo descargar ${url} (${e.message}): se usa ${name} de la carpeta, que puede estar anticuada`);
    return readFile(file, 'utf8');
  }
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
const rosterCells = cells(await page('plantilla.html', `${base}/plantilla`, true));
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
const PERIODS = 4;
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

/* Jugador de una jugada, por su nombre (sin tildes ni mayúsculas). Nunca por el dorsal: si alguien deja el equipo y
   otro hereda su número, sus jugadas no pueden acabar en el nuevo. Quien no está en la plantilla (ya se fue) se añade
   con su licencia como identificador; si su dorsal es el de alguien de la plantilla, puede ser la misma persona con
   el nombre escrito de otra forma, y eso hay que mirarlo a mano. */
const plain = (name) => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const index = (p, numbers) => {
  let i = players.findIndex((x) => plain(x.name) === plain(p.playerName));
  if (i >= 0) return i;
  const number = numbers.get(p.playerLicenseId);
  if (number == null) throw new Error(`${p.playerName} no está en la plantilla y no tiene dorsal en las jugadas`);
  const same = players.find((x) => x.number === number);
  if (same) throw new Error(`${p.playerName} lleva el dorsal ${number}, que en la plantilla es de ${same.name}: si es la misma persona, hay que igualar el nombre; si no, cambiar aquí cómo se distinguen`);
  return players.push({ id: `demo-l${p.playerLicenseId}`, number, name: p.playerName }) - 1;
};

function convert(slug, html) {
  const pbp = extract(payload(html), 'initialMatchPlayByPlay');
  if (!pbp.matchFinished) return null;
  // La fecha va en el título: «Asisa Joventut vs Barça 18 oct 2026 | …»
  const title = (html.match(/<title>(.*?)<\/title>/) || [])[1] || '';
  const [, day, month, year] = title.match(/(\d{1,2}) (\p{L}{3})\p{L}* (\d{4})/u) || [];
  const monthNumber = MONTHS.indexOf((month || '').toLowerCase()) + 1;
  if (!monthNumber) throw new Error(`${slug}: no se entiende la fecha del título «${title}»`);
  const date = `${year}-${String(monthNumber).padStart(2, '0')}-${day.padStart(2, '0')}`;
  const home = pbp.homeTeam.clubId === CLUB.id;
  const opponent = (home ? pbp.awayTeam : pbp.homeTeam).fullName;
  // En el orden en que se apuntaron (el reloj no sirve para ordenar: a veces está mal tecleado)
  const list = [...pbp.plays].sort((a, b) => a.order - b.order);
  const numbers = new Map(list.filter((p) => p.playerNumber != null).map((p) => [p.playerLicenseId, String(p.playerNumber)]));
  // La app guarda el partido en 4 cuartos: una prórroga cuenta en el último
  const quarter = (p) => Math.min(p.quarter, PERIODS);

  const plays = [], lines = {}, official = {};
  let on = [], shown = { key: '', on: [] }, score = [0, 0];
  // Quinteto en pista antes de la siguiente jugada, si ha cambiado (o ha cambiado el cuarto)
  const snapshot = (period) => {
    const key = `${period}:${[...on].sort((a, b) => a - b)}`;
    if (key === shown.key) return;
    if (on.length !== 5) throw new Error(`${slug}: ${on.length} jugadores en pista en el cuarto ${period}`);
    plays.push([period, [...on]]);
    shown = { key, on: [...on] };
  };
  const isSub = (p) => p.playType === STARTER || p.playType === SUB_IN || p.playType === SUB_OUT;
  const done = new Set();   // cambios apuntados con retraso que ya se han aplicado
  const sub = (p) => {
    if (p.local !== home || done.has(p)) return;
    const i = index(p, numbers);
    if (p.playType === SUB_OUT) on = on.filter((x) => x !== i);
    else if (!on.includes(i)) on.push(i);
    done.add(p);
  };
  /* Cambio apuntado con retraso: hay una jugada de alguien que aún no figura en pista. Se adelanta su entrada, con
     el resto de cambios apuntados junto a ella (quién sale por él) */
  const enterLate = (i, from) => {
    const at = list.findIndex((p, n) => n > from && p.local === home && p.playType === SUB_IN && !done.has(p) && index(p, numbers) === i);
    if (at < 0 || list[at].quarter !== list[from].quarter) return;
    let a = at, b = at;
    while (isSub(list[a - 1])) a--;
    while (list[b + 1] && isSub(list[b + 1])) b++;
    list.slice(a, b + 1).forEach(sub);
  };
  list.forEach((p, n) => {
    const ours = p.local === home;
    if (isSub(p)) return sub(p);
    const type = PLAY[p.playType];
    if (!type || !p.playerName) return;
    const period = quarter(p);
    if (ours) {
      const i = index(p, numbers);
      // Una jugada de quien acaba de ser sustituido (la ACB apunta el cambio antes, en la misma parada) va con el
      // quinteto en el que estaba, que sigue siendo el último apuntado
      const leaving = !on.includes(i) && shown.on.includes(i) && shown.key.startsWith(`${period}:`);
      if (!leaving && !on.includes(i)) enterLate(i, n);
      if (!leaving) snapshot(period);
      // Cualquier otra jugada de alguien que no está en pista es un error en los datos
      if (!leaving && !on.includes(i)) throw new Error(`${slug}: jugada de ${players[i].name} sin estar en pista (cuarto ${p.quarter}, ${p.minute}:${String(p.second).padStart(2, '0')})`);
      plays.push([period, type, i]);
      (lines[i] ||= {})[type] = (lines[i][type] || 0) + 1;
      if (p.playerStats) official[i] = p.playerStats;
      score[0] += POINTS[type] || 0;
    } else if (POINTS[type]) {
      snapshot(period);
      plays.push([period, POINTS[type]]);
      score[1] += POINTS[type];
    }
  });

  // Comprobaciones: el marcador final y la línea de cada jugador son los de la ACB
  const end = pbp.plays.reduce((a, b) => (b.order > a.order ? b : a));
  const final = home ? [end.scoreHome, end.scoreAway] : [end.scoreAway, end.scoreHome];
  if (String(score) !== String(final)) throw new Error(`${slug}: sale ${score.join('-')} y fue ${final.join('-')}`);
  for (const [i, stats] of Object.entries(official)) {
    for (const [key, count] of Object.entries(CHECK)) {
      if (count(lines[i]) !== stats[key]) throw new Error(`${slug}: ${players[i].name}, ${key} sale ${count(lines[i])} y es ${stats[key]}`);
    }
  }
  return { id: `demo-${slug.match(/\d+$/)[0]}`, date, opponent, venue: home ? 'home' : 'away', periods: PERIODS, result: score, plays };
}

const matches = await page('partidos.html', `${base}/partidos`, true);
const slugs = [...new Set([...matches.matchAll(/live\.acb\.com\/partidos\/([a-z0-9-]+-\d+)\//g)].map((m) => m[1]))];
if (!slugs.length) throw new Error('No se encuentra ningún partido en la lista de partidos');
const games = [];
for (const slug of slugs) {
  const name = `${slug}.jugadas.html`, url = `https://live.acb.com/es/partidos/${slug}/jugadas`;
  // Si la página guardada es de un partido que no había terminado, se vuelve a pedir
  const g = convert(slug, await page(name, url)) || convert(slug, await page(name, url, true));
  if (g) games.push(g);
  else console.warn(`⚠️  ${slug}: sin terminar, no se incluye`);
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
