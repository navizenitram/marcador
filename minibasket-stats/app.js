'use strict';

/* ════════════════════════════════════════════════════════════════
   MiniBasket Stats — SPA sin dependencias. Datos en localStorage.
   ════════════════════════════════════════════════════════════════ */

const STORE_KEY = 'mbstats.v1';
const MAX_ON_COURT = 5;
const MAX_FOULS = 5;
const KOFI_URL = 'https://ko-fi.com/navizenitram';

/* Acciones que se pueden registrar para un jugador */
const EV = {
  t1_ok: { label: '1', sub: '✓', cls: 'made', text: 'Tiro libre anotado', pts: 1 },
  t1_ko: { label: '1', sub: '✗', cls: 'miss', text: 'Tiro libre fallado' },
  t2_ok: { label: '2', sub: '✓', cls: 'made', text: 'Canasta de 2', pts: 2 },
  t2_ko: { label: '2', sub: '✗', cls: 'miss', text: 'Tiro de 2 fallado' },
  t3_ok: { label: '3', sub: '✓', cls: 'made', text: 'Triple', pts: 3 },
  t3_ko: { label: '3', sub: '✗', cls: 'miss', text: 'Triple fallado' },
  rec:   { label: 'REC', sub: 'Recup.', cls: 'pos', text: 'Balón recuperado' },
  lost:  { label: 'PÉR', sub: 'Pierde', cls: 'neg', text: 'Balón perdido' },
  ro:    { label: 'RO', sub: 'Ataque', cls: 'reb', text: 'Rebote de ataque' },
  rd:    { label: 'RD', sub: 'Defen.', cls: 'reb', text: 'Rebote defensivo' },
  fc:    { label: 'FC', sub: 'Comete', cls: 'foul', text: 'Falta cometida' },
  fr:    { label: 'FR', sub: 'Recibe', cls: 'pos', text: 'Falta recibida' },
  ast:   { label: 'AS', sub: 'Asiste', cls: 'ast', text: 'Asistencia' },
  blk:   { label: 'TAP', sub: 'Pone', cls: 'blk', text: 'Tapón' },
  blkr:  { label: 'TR', sub: 'Recibe', cls: 'neg', text: 'Tapón recibido' },
};
const SHOT_ACTIONS = ['t1_ok', 't1_ko', 't2_ok', 't2_ko', 't3_ok', 't3_ko'];
const OTHER_ACTIONS = ['rec', 'lost', 'ro', 'rd', 'ast', 'blk', 'blkr', 'fc', 'fr'];

/* Botones que cada entrenador puede activar o desactivar (vista Ajustes).
   Los tiros van por parejas (anotado + fallado) para que los porcentajes tengan sentido. */
const OPTIONS = [
  { id: 't1', acts: ['t1_ok', 't1_ko'], name: 'Tiros libres', desc: 'Anotado y fallado' },
  { id: 't2', acts: ['t2_ok', 't2_ko'], name: 'Tiros de 2', desc: 'Anotado y fallado' },
  { id: 't3', acts: ['t3_ok', 't3_ko'], name: 'Triples', desc: 'Anotado y fallado' },
  { id: 'rec', acts: ['rec'], name: 'Balón recuperado', desc: 'Robo' },
  { id: 'lost', acts: ['lost'], name: 'Balón perdido', desc: 'Pérdida' },
  { id: 'ro', acts: ['ro'], name: 'Rebote de ataque', desc: 'Rebote ofensivo' },
  { id: 'rd', acts: ['rd'], name: 'Rebote defensivo', desc: 'Rebote en defensa' },
  { id: 'ast', acts: ['ast'], name: 'Asistencia', desc: 'Pase de canasta' },
  { id: 'blk', acts: ['blk'], name: 'Tapón', desc: 'Tapón puesto' },
  { id: 'blkr', acts: ['blkr'], name: 'Tapón recibido', desc: 'Le ponen un tapón' },
  { id: 'fc', acts: ['fc'], name: 'Falta cometida', desc: 'Cuenta para las 5 faltas' },
  { id: 'fr', acts: ['fr'], name: 'Falta recibida', desc: 'Le hacen falta' },
];

function optEnabled(id) { return !db.settings.hidden.includes(id); }
function actEnabled(type) { const o = OPTIONS.find(o => o.acts.includes(type)); return !o || optEnabled(o.id); }
function enabledShots() { return SHOT_ACTIONS.filter(actEnabled); }
function enabledOthers() { return OTHER_ACTIONS.filter(actEnabled); }

/* ─────────────────────────── Datos ─────────────────────────── */

let db = load();

const ui = {
  editId: null,          // jugador en edición (vista Equipo)
  modal: null,           // { kind, ... } modal abierto
  sort: { key: 'number', dir: 1 },
  avg: false,            // estadísticas de temporada: promedio por partido
  flash: null,           // { pid, type } botón a resaltar tras pulsar
  focus: null,           // selector a enfocar tras renderizar
  pendingModal: null,    // modal a abrir tras la próxima navegación
};

function normalize(d) {
  d = d && typeof d === 'object' ? d : {};
  d.team = d.team && typeof d.team === 'object' ? d.team : {};
  d.team.name = d.team.name || 'Mi equipo';
  d.team.email = d.team.email || '';
  d.team.players = Array.isArray(d.team.players) ? d.team.players : [];
  d.games = Array.isArray(d.games) ? d.games : [];
  for (const g of d.games) {
    g.events = Array.isArray(g.events) ? g.events : [];
    g.onCourt = Array.isArray(g.onCourt) ? g.onCourt : [];
    g.roster = Array.isArray(g.roster) ? g.roster : [];
    g.played = g.played && typeof g.played === 'object' ? g.played : {};
    g.periods = +g.periods || 8;
    g.period = Math.min(Math.max(+g.period || 1, 1), g.periods);
    g.teamName = g.teamName || d.team.name;
  }
  d.settings = d.settings && typeof d.settings === 'object' ? d.settings : {};
  d.settings.hidden = Array.isArray(d.settings.hidden) ? d.settings.hidden : [];
  d.version = 1;
  return d;
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { console.warn('No se pudieron leer los datos', e); }
  return normalize({});
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch (e) { toast('⚠️ No se pudo guardar en este navegador'); }
}

/* ────────────────────────── Utilidades ────────────────────────── */

const $ = (s, r = document) => r.querySelector(s);
const appEl = $('#app');
const modalEl = $('#modal');
const toastEl = $('#toast');

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID().slice(0, 12);
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso, short) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return short ? `${d}/${m}` : `${d}/${m}/${y}`;
}

function numVal(n) { const v = parseInt(n, 10); return isNaN(v) ? 999 : v; }

function byNumber(a, b) { return numVal(a.number) - numVal(b.number) || String(a.number).localeCompare(String(b.number)) || a.name.localeCompare(b.name); }

function sortedPlayers(list) { return [...list].sort(byNumber); }

function sortedGames() {
  return [...db.games].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
}

function getGame(id) { return db.games.find(g => g.id === id); }

/* Partidos a 4 cuartos: "Q1" / "Cuarto"; el resto: "P1" / "Periodo" */
function perAbbr(g, n) { return (g.periods === 4 ? 'Q' : 'P') + n; }
function perName(g) { return g.periods === 4 ? 'Cuarto' : 'Periodo'; }
function perCount(g) { return g.periods === 4 ? '4 cuartos' : `${g.periods} periodos`; }

function pLabel(p) { return p ? `#${p.number} ${p.name}` : '¿?'; }

function vibrate(ms = 12) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* noop */ } }

function pct(m, a) { return a ? Math.round((m / a) * 100) + '%' : '–'; }

function round1(n) { return Math.round(n * 10) / 10; }

/* ───────────────────────── Estadísticas ───────────────────────── */

function blankLine() {
  return { t1m: 0, t1a: 0, t2m: 0, t2a: 0, t3m: 0, t3a: 0, ro: 0, rd: 0, ast: 0, blk: 0, blkr: 0, rec: 0, lost: 0, fc: 0, fr: 0 };
}

function addEvent(l, type) {
  switch (type) {
    case 't1_ok': l.t1m++; l.t1a++; break;
    case 't1_ko': l.t1a++; break;
    case 't2_ok': l.t2m++; l.t2a++; break;
    case 't2_ko': l.t2a++; break;
    case 't3_ok': l.t3m++; l.t3a++; break;
    case 't3_ko': l.t3a++; break;
    default: if (type in l) l[type]++;
  }
}

function sumLines(target, src) {
  for (const k of Object.keys(blankLine())) target[k] += src[k] || 0;
  return target;
}

/* Valoración (fórmula ACB / Euroliga):
   (PTS + rebotes + asistencias + robos + tapones + faltas recibidas)
   − (tiros de campo fallados + tiros libres fallados + tapones recibidos + pérdidas + faltas cometidas)
   Cada tiro fallado resta 1, sea de 1, 2 o 3. */
function finish(l) {
  l.pts = l.t1m + 2 * l.t2m + 3 * l.t3m;
  l.reb = l.ro + l.rd;
  l.miss = (l.t1a - l.t1m) + (l.t2a - l.t2m) + (l.t3a - l.t3m);
  l.val = l.pts + l.reb + l.ast + l.blk + l.rec + l.fr - l.miss - l.blkr - l.lost - l.fc;
  return l;
}

function score(g) {
  let us = 0, them = 0;
  for (const e of g.events) {
    if (e.type === 'opp') them += e.pts;
    else us += (EV[e.type] && EV[e.type].pts) || 0;
  }
  return { us, them };
}

function periodScores(g) {
  const us = Array(g.periods).fill(0), them = Array(g.periods).fill(0);
  for (const e of g.events) {
    const i = Math.min(Math.max((e.period || 1) - 1, 0), g.periods - 1);
    if (e.type === 'opp') them[i] += e.pts;
    else us[i] += (EV[e.type] && EV[e.type].pts) || 0;
  }
  return { us, them };
}

function playerLines(g) {
  const map = {};
  for (const p of g.roster) map[p.id] = blankLine();
  for (const e of g.events) {
    if (!e.pid) continue;
    if (!map[e.pid]) map[e.pid] = blankLine();
    addEvent(map[e.pid], e.type);
  }
  for (const k in map) finish(map[k]);
  return map;
}

function gameRows(g) {
  const lines = playerLines(g);
  return sortedPlayers(g.roster).map(p => {
    const per = (g.played[p.id] || []).slice().sort((a, b) => a - b);
    const l = lines[p.id] || finish(blankLine());
    const hasEvents = g.events.some(e => e.pid === p.id);
    return { id: p.id, number: p.number, name: p.name, ...l, nper: per.length, perList: per, gp: (per.length || hasEvents) ? 1 : 0 };
  });
}

function seasonRows() {
  const games = [...db.games].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0));
  const map = {};
  const ensure = (p) => {
    if (!map[p.id]) map[p.id] = { id: p.id, number: p.number, name: p.name, line: blankLine(), gp: 0, nper: 0 };
    return map[p.id];
  };
  for (const g of games) {
    const lines = playerLines(g);
    for (const p of g.roster) {
      const r = ensure(p);
      r.number = p.number; r.name = p.name;
      const nper = (g.played[p.id] || []).length;
      const hasEvents = g.events.some(e => e.pid === p.id);
      if (nper || hasEvents) {
        r.gp++;
        r.nper += nper;
        sumLines(r.line, lines[p.id]);
      }
    }
  }
  // Nombres/dorsales actuales del equipo y jugadores sin partidos
  for (const p of db.team.players) {
    const r = ensure(p);
    r.number = p.number; r.name = p.name;
  }
  return Object.values(map)
    .filter(r => r.gp > 0 || db.team.players.some(p => p.id === r.id))
    .map(r => ({ id: r.id, number: r.number, name: r.name, gp: r.gp, nper: r.nper, ...finish({ ...r.line }) }));
}

function averageRow(r) {
  if (!r.gp) return r;
  const out = { ...r };
  for (const k of [...Object.keys(blankLine()), 'pts', 'reb', 'miss', 'val', 'nper']) out[k] = round1(r[k] / r.gp);
  return out;
}

function totalsRow(rows, gp) {
  const l = blankLine();
  let nper = 0;
  for (const r of rows) { sumLines(l, r); nper += r.nper || 0; }
  return { id: '_team', number: '', name: 'Equipo', gp, nper, ...finish(l) };
}

/* ─────────────────────────── Router ─────────────────────────── */

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  return { view: parts[0] || '', arg: parts[1] || '' };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function render() {
  const { view, arg } = parseRoute();
  let html;
  switch (view) {
    case 'equipo': html = viewTeam(); break;
    case 'partidos': html = viewGames(); break;
    case 'partido': {
      const g = getGame(arg);
      if (!g) { go('#/partidos'); return; }
      html = viewLive(g);
      break;
    }
    case 'stats': html = viewStats(arg); break;
    case 'ajustes': html = viewSettings(); break;
    default:
      go(db.team.players.length ? '#/partidos' : '#/equipo');
      return;
  }
  appEl.innerHTML = html;
  postRender();
  if (ui.pendingModal) { const m = ui.pendingModal; ui.pendingModal = null; openModal(m); }
}

function postRender() {
  if (ui.flash) {
    const b = appEl.querySelector(`[data-action="ev"][data-pid="${CSS.escape(ui.flash.pid)}"][data-type="${ui.flash.type}"]`);
    if (b) { b.classList.add('flash'); }
    ui.flash = null;
  }
  if (ui.focus) {
    const el = appEl.querySelector(ui.focus);
    if (el) el.focus();
    ui.focus = null;
  }
}

window.addEventListener('hashchange', () => { closeModal(true); toastEl.hidden = true; render(); });

// Si los datos o el tema cambian en otra pestaña (o en el marcador), aplicarlos
window.addEventListener('storage', (e) => {
  if (e.key === STORE_KEY) { db = load(); if (!ui.modal) render(); }
  if (e.key === THEME_KEY) { applyTheme(e.newValue === 'light'); if (!ui.modal) render(); }
});

/* ─────────────────────────── Vistas ─────────────────────────── */

/* ─────────────────────────── Tema ─────────────────────────── */
// Misma clave que el marcador (mismo dominio): el tema elegido vale para las dos apps.
const THEME_KEY = 'mb_theme';

function isLight() { return document.documentElement.dataset.theme === 'light'; }

function applyTheme(light) {
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = light ? '#f0f3f8' : '#06080a';
}

function toggleTheme() {
  const light = !isLight();
  applyTheme(light);
  try { localStorage.setItem(THEME_KEY, light ? 'light' : 'dark'); } catch (e) { /* noop */ }
  if (ui.modal && ui.modal.kind === 'menu') refreshModal();
  render();
}

function themeButton() {
  return `<button class="icon-btn" data-action="theme" title="${isLight() ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}">${isLight() ? '☀️' : '🌙'}</button>`;
}

function fsButton() {
  if (!document.fullscreenEnabled) return '';
  const on = !!document.fullscreenElement;
  return `<button class="icon-btn" data-action="fullscreen" title="${on ? 'Salir de pantalla completa' : 'Pantalla completa'}">${on ? '🗗' : '⛶'}</button>`;
}

function shell(active, content) {
  const live = sortedGames().find(g => !g.finished);
  const tab = (id, href, label) => `<a class="tab ${active === id ? 'on' : ''}" href="${href}">${label}</a>`;
  return `
  <div class="page">
    <nav class="nav">
      <div class="brand"><span class="ball">🏀</span><span>${esc(db.team.name)}</span></div>
      ${tab('equipo', '#/equipo', 'Equipo')}
      ${tab('partidos', '#/partidos', 'Partidos')}
      ${tab('stats', '#/stats', 'Estadísticas')}
      ${tab('ajustes', '#/ajustes', 'Ajustes')}
      <span class="grow"></span>
      ${live ? `<a class="btn live-link" href="#/partido/${live.id}"><span class="dot"></span>vs ${esc(live.opponent)}</a>` : ''}
      ${themeButton()}
      ${fsButton()}
    </nav>
    <main class="content">${content}</main>
  </div>`;
}

/* ── Equipo ── */
function viewTeam() {
  const players = sortedPlayers(db.team.players);
  const ed = ui.editId ? players.find(p => p.id === ui.editId) : null;
  return shell('equipo', `
  <div class="cols">
    <section class="card side">
      <h2>${ed ? 'Editar jugador' : 'Añadir jugador'}</h2>
      <form data-form="player" class="player-form" autocomplete="off">
        <label class="f-num">Dorsal<input name="number" inputmode="numeric" maxlength="3" required value="${ed ? esc(ed.number) : ''}"></label>
        <label class="f-name">Nombre<input name="name" maxlength="24" required value="${ed ? esc(ed.name) : ''}" autocapitalize="words"></label>
        <div class="form-actions">
          <button class="btn primary" type="submit">${ed ? 'Guardar' : '＋ Añadir'}</button>
          ${ed ? '<button type="button" class="btn" data-action="cancel-edit">Cancelar</button>' : ''}
        </div>
      </form>

      <h2>Equipo</h2>
      <div class="stack">
        <label>Nombre del equipo<input data-change="team-name" maxlength="24" value="${esc(db.team.name)}"></label>
        <label>Email para enviar estadísticas <span class="muted">(opcional)</span><input data-change="team-email" type="email" placeholder="entrenador@club.com" value="${esc(db.team.email)}"></label>
      </div>
      <p class="muted small">Los botones del partido y la copia de seguridad están en <a href="#/ajustes">Ajustes</a>.</p>
    </section>

    <section class="card grow">
      <h2>Plantilla <span class="muted">(${players.length})</span></h2>
      ${players.length ? `
      <ul class="roster">
        ${players.map(p => `
          <li class="${ed && ed.id === p.id ? 'editing' : ''}">
            <span class="num">${esc(p.number)}</span>
            <span class="name">${esc(p.name)}</span>
            <button class="icon-btn" data-action="edit-player" data-id="${p.id}" title="Editar">✎</button>
            <button class="icon-btn danger" data-action="del-player" data-id="${p.id}" title="Eliminar">🗑</button>
          </li>`).join('')}
      </ul>` : `<p class="empty">Aún no hay jugadores.<br>Añade dorsal y nombre de cada jugador.</p>`}
    </section>
  </div>`);
}

/* ── Partidos ── */
function viewGames() {
  const games = sortedGames();
  const hasPlayers = db.team.players.length > 0;
  const lastPeriods = (games[0] && games[0].periods) || 8;
  return shell('partidos', `
  <div class="cols">
    <section class="card side">
      <h2>Nuevo partido</h2>
      ${hasPlayers ? '' : `<p class="warn">Primero da de alta a los jugadores en <a href="#/equipo">Equipo</a>.</p>`}
      <form data-form="game" class="stack" autocomplete="off">
        <label>Rival<input name="opponent" maxlength="24" required placeholder="Nombre del rival"></label>
        <label>Fecha<input name="date" type="date" required value="${todayISO()}"></label>
        <div class="field">
          <span class="field-label">Duración</span>
          <div class="seg-radio">
            ${[[8, '8 periodos', 'Minibasket'], [4, '4 cuartos', 'Categorías superiores']].map(([n, t, d]) => `
              <label><input type="radio" name="periods" value="${n}" ${n === (lastPeriods === 4 ? 4 : 8) ? 'checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`).join('')}
          </div>
        </div>
        <button class="btn primary big" type="submit" ${hasPlayers ? '' : 'disabled'}>▶ Empezar partido</button>
      </form>
    </section>

    <section class="card grow">
      <h2>Partidos <span class="muted">(${games.length})</span></h2>
      ${games.length ? `<ul class="games">${games.map(g => {
        const s = score(g);
        const res = s.us > s.them ? 'win' : s.us < s.them ? 'loss' : 'tie';
        return `
        <li>
          <span class="g-date">${fmtDate(g.date, true)}</span>
          <span class="g-main"><b>vs ${esc(g.opponent)}</b><small>${g.finished ? 'Finalizado' : `<span class="dot"></span>En juego · ${perAbbr(g, g.period)}`} · ${perCount(g)}</small></span>
          <span class="g-score ${g.finished ? res : ''}">${s.us}<i>–</i>${s.them}</span>
          <a class="btn" href="#/partido/${g.id}">${g.finished ? 'Abrir' : 'Continuar'}</a>
          <a class="btn" href="#/stats/${g.id}" title="Estadísticas">📊</a>
          <button class="icon-btn danger" data-action="del-game" data-id="${g.id}" title="Borrar">🗑</button>
        </li>`;
      }).join('')}</ul>` : `<p class="empty">Todavía no hay partidos.</p>`}
    </section>
  </div>`);
}

/* ── Partido en directo ── */
function viewLive(g) {
  const s = score(g);
  const lines = playerLines(g);
  const rosterById = Object.fromEntries(g.roster.map(p => [p.id, p]));
  const rows = [];
  for (let i = 0; i < MAX_ON_COURT; i++) {
    const pid = g.onCourt[i];
    const p = pid && rosterById[pid];
    if (!p) {
      rows.push(`<div class="prow empty-row"><button class="add-player" data-action="swap" data-pid="">＋ Añadir jugador a pista</button></div>`);
      continue;
    }
    const l = lines[pid] || finish(blankLine());
    const fouls = l.fc;
    const fcls = fouls >= MAX_FOULS ? 'f-out' : fouls === MAX_FOULS - 1 ? 'f-warn' : '';
    const btn = (t) => `<button class="act ${EV[t].cls}" data-action="ev" data-type="${t}" data-pid="${pid}"><b>${EV[t].label}</b><i>${EV[t].sub}</i></button>`;
    rows.push(`
      <div class="prow ${fcls}">
        <button class="pid" data-action="swap" data-pid="${pid}" title="Cambiar jugador">
          <span class="num">${esc(p.number)}</span>
          <span class="pinfo"><span class="pname">${esc(p.name)}</span>
          <span class="pline"><b>${l.pts}</b> pts · <span class="fouls">${fouls} F</span>${fouls >= MAX_FOULS ? ' · ELIM.' : ''}</span></span>
        </button>
        ${actsHTML(btn)}
      </div>`);
  }
  return `
  <div class="live">
    <header class="live-top">
      <button class="icon-btn" data-action="menu" title="Menú">☰</button>
      <div class="period">
        <button data-action="period" data-d="-1" ${g.period <= 1 ? 'disabled' : ''}>‹</button>
        <div><b>${perAbbr(g, g.period)}</b><small>de ${g.periods}</small></div>
        <button data-action="period" data-d="1">›</button>
      </div>
      <div class="board">
        <span class="tname us">${esc(g.teamName)}</span>
        <span class="score us">${s.us}</span>
        <span class="dash">–</span>
        <span class="score them">${s.them}</span>
        <span class="tname them">${esc(g.opponent)}</span>
      </div>
      <div class="opp-btns" title="Puntos del rival">
        <button data-action="opp" data-pts="1">+1</button>
        <button data-action="opp" data-pts="2">+2</button>
        <button data-action="opp" data-pts="3">+3</button>
        <button data-action="opp" data-pts="-1" class="minus">−1</button>
      </div>
      <button class="icon-btn" data-action="undo" title="Deshacer última acción">↶</button>
      <button class="icon-btn" data-action="lineup" title="Quinteto en pista">⇄</button>
      <a class="icon-btn" href="#/stats/${g.id}" title="Estadísticas">📊</a>
    </header>
    <main class="court">${rows.join('')}</main>
  </div>`;
}

/* Botones de acción de una fila, según los ajustes */
function actsHTML(btn) {
  const shots = enabledShots(), others = enabledOthers();
  const cols = [];
  if (shots.length) cols.push(`repeat(${shots.length}, minmax(0, 1fr))`);
  if (shots.length && others.length) cols.push('3px');
  if (others.length) cols.push(`repeat(${others.length}, minmax(0, 1fr))`);
  return `<div class="acts" style="grid-template-columns: ${cols.join(' ')}">
    ${shots.map(btn).join('')}
    ${shots.length && others.length ? '<span class="sep"></span>' : ''}
    ${others.map(btn).join('')}
  </div>`;
}

/* ── Ajustes ── */
function viewSettings() {
  const sample = (t) => `<span class="act ${EV[t].cls}"><b>${EV[t].label}</b><i>${EV[t].sub}</i></span>`;
  const item = (o) => {
    const on = optEnabled(o.id);
    return `
    <button class="opt ${on ? 'on' : ''}" data-action="toggle-opt" data-id="${o.id}" role="switch" aria-checked="${on}">
      <span class="opt-btns">${o.acts.map(sample).join('')}</span>
      <span class="opt-txt"><b>${o.name}</b><small>${o.desc}</small></span>
      <span class="switch"><i></i></span>
    </button>`;
  };
  const shots = OPTIONS.filter(o => o.id[0] === 't');
  const others = OPTIONS.filter(o => o.id[0] !== 't');
  const n = OPTIONS.filter(o => optEnabled(o.id)).length;
  return shell('ajustes', `
  <section class="card preview-card">
    <h2>Vista previa de un jugador en pista</h2>
    <div class="preview">
      <div class="prow">
        <span class="pid"><span class="num">7</span><span class="pinfo"><span class="pname">Jugador</span><span class="pline"><b>0</b> pts · 0 F</span></span></span>
        ${actsHTML(sample)}
      </div>
    </div>
  </section>
  <div class="cols">
    <section class="card grow">
      <div class="card-head">
        <h2>Botones del partido <span class="muted">(${n}/${OPTIONS.length})</span></h2>
        ${db.settings.hidden.length ? '<button class="btn" data-action="opts-all">Activar todos</button>' : ''}
      </div>
      <p class="muted small">Elige qué acciones quieres apuntar durante el partido. Las desactivadas no aparecen en la pista ni en las estadísticas
      (salvo que haya datos de partidos anteriores) y no cuentan en la valoración. Con menos botones, cada uno es más grande.</p>
      <h3 class="sub">Tiros</h3>
      <div class="opts">${shots.map(item).join('')}</div>
      <h3 class="sub">Otras acciones</h3>
      <div class="opts">${others.map(item).join('')}</div>
    </section>

    <section class="card side">
      <h2>Copia de seguridad</h2>
      <p class="muted small">Los datos se guardan solo en este navegador. Exporta una copia de vez en cuando o para pasarlos a otro dispositivo.</p>
      <div class="row">
        <button class="btn" data-action="export-json">⬇ Exportar</button>
        <label class="btn">⬆ Importar<input type="file" accept="application/json,.json" data-change="import-json" hidden></label>
      </div>

      <h2>Apoya el proyecto</h2>
      <p class="muted small">La app es gratuita, sin anuncios y sin registro. Si te resulta útil en tus partidos, puedes invitarme a un café para que siga mejorando.</p>
      <a class="btn kofi" href="${KOFI_URL}" target="_blank" rel="noopener">☕ Invítame a un café</a>
    </section>
  </div>`);
}

/* ── Estadísticas ── */
const COLS = [
  { k: 'number', h: '#', cls: 'c-num' },
  { k: 'name', h: 'Jugador', cls: 'c-name' },
  { k: 'gp', h: 'PJ', t: 'Partidos jugados', season: true },
  { k: 'nper', h: 'PER', t: 'Periodos jugados' },
  { k: 'pts', h: 'PTS', t: 'Puntos', cls: 'hl' },
  { k: 't1', h: 'T1', t: 'Tiros libres (anotados/intentados)', shot: 1, sortKey: 't1m' },
  { k: 't2', h: 'T2', t: 'Tiros de 2 (anotados/intentados)', shot: 2, sortKey: 't2m' },
  { k: 't3', h: 'T3', t: 'Triples (anotados/intentados)', shot: 3, sortKey: 't3m' },
  { k: 'ro', h: 'RO', t: 'Rebotes de ataque' },
  { k: 'rd', h: 'RD', t: 'Rebotes de defensa' },
  { k: 'reb', h: 'RT', t: 'Rebotes totales' },
  { k: 'ast', h: 'AS', t: 'Asistencias' },
  { k: 'blk', h: 'TAP', t: 'Tapones puestos' },
  { k: 'blkr', h: 'TR', t: 'Tapones recibidos' },
  { k: 'rec', h: 'REC', t: 'Balones recuperados' },
  { k: 'lost', h: 'PÉR', t: 'Balones perdidos' },
  { k: 'fc', h: 'FC', t: 'Faltas cometidas' },
  { k: 'fr', h: 'FR', t: 'Faltas recibidas' },
  { k: 'val', h: 'VAL', t: 'Valoración', cls: 'hl' },
];

function statsData(arg) {
  const games = sortedGames();
  if (arg === 'temporada') {
    let rows = seasonRows();
    const total = totalsRow(rows, db.games.length);
    if (ui.avg) rows = rows.map(averageRow);
    return { season: true, rows, total: ui.avg ? averageRow(total) : total, games };
  }
  const g = getGame(arg);
  if (!g) return null;
  const rows = gameRows(g);
  return { season: false, game: g, rows, total: totalsRow(rows, 1), games };
}

function viewStats(arg) {
  const games = sortedGames();
  if (!games.length) {
    return shell('stats', `<section class="card"><p class="empty">Aún no hay partidos registrados.<br><a href="#/partidos">Crea el primero</a>.</p></section>`);
  }
  if (!arg) { arg = games[0].id; history.replaceState(null, '', `#/stats/${arg}`); }
  const data = statsData(arg);
  if (!data) { history.replaceState(null, '', '#/stats/temporada'); return viewStats('temporada'); }

  const options = `<option value="temporada" ${data.season ? 'selected' : ''}>Temporada · ${games.length} partido${games.length === 1 ? '' : 's'}</option>` +
    games.map(g => { const s = score(g); return `<option value="${g.id}" ${!data.season && data.game.id === g.id ? 'selected' : ''}>${fmtDate(g.date, true)} · vs ${esc(g.opponent)} (${s.us}-${s.them})</option>`; }).join('');

  const head = `
    <div class="stats-head">
      <select data-change="stats-select" class="stats-select">${options}</select>
      ${data.season ? `
        <div class="seg">
          <button class="${ui.avg ? '' : 'on'}" data-action="avg" data-v="0">Totales</button>
          <button class="${ui.avg ? 'on' : ''}" data-action="avg" data-v="1">Por partido</button>
        </div>` : ''}
      <span class="grow"></span>
      ${!data.season ? `<a class="btn" href="#/partido/${data.game.id}">${data.game.finished ? 'Abrir partido' : '▶ Volver al partido'}</a>` : ''}
      <button class="btn" data-action="share" data-arg="${esc(arg)}">✉ Enviar</button>
      <button class="btn" data-action="csv" data-arg="${esc(arg)}">⬇ CSV</button>
    </div>`;

  return shell('stats', `
    ${head}
    ${data.season ? seasonSummary() : gameSummary(data.game)}
    ${leaders(data)}
    <section class="card table-card">${statsTable(data)}</section>
    <p class="muted small formula"><b>VAL</b> (valoración ACB) = puntos + rebotes + asistencias + recuperaciones + tapones + faltas recibidas − tiros fallados (cada uno resta 1) − tapones recibidos − pérdidas − faltas cometidas.
    Toca la cabecera de una columna para ordenar.</p>
    <p class="support">¿Te es útil la app? <a href="${KOFI_URL}" target="_blank" rel="noopener">☕ Invítame a un café</a></p>
  `);
}

function gameSummary(g) {
  const s = score(g);
  const ps = periodScores(g);
  const res = s.us > s.them ? 'win' : s.us < s.them ? 'loss' : 'tie';
  return `
  <section class="card summary">
    <div class="final">
      <div class="ft us"><small>${esc(g.teamName)}</small><b>${s.us}</b></div>
      <div class="ft-mid"><span class="badge ${res}">${g.finished ? (res === 'win' ? 'Victoria' : res === 'loss' ? 'Derrota' : 'Empate') : 'En juego'}</span><small>${fmtDate(g.date)}</small></div>
      <div class="ft them"><small>${esc(g.opponent)}</small><b>${s.them}</b></div>
    </div>
    <div class="ptable-wrap">
      <table class="ptable">
        <tr><th></th>${ps.us.map((_, i) => `<th>${perAbbr(g, i + 1)}</th>`).join('')}<th>Total</th></tr>
        <tr><td class="l us">${esc(g.teamName)}</td>${ps.us.map((v, i) => `<td class="${v > ps.them[i] ? 'w' : ''}">${v}</td>`).join('')}<td class="t">${s.us}</td></tr>
        <tr><td class="l them">${esc(g.opponent)}</td>${ps.them.map((v, i) => `<td class="${v > ps.us[i] ? 'w' : ''}">${v}</td>`).join('')}<td class="t">${s.them}</td></tr>
      </table>
    </div>
    ${g.finished ? '' : `<button class="btn" data-action="finish" data-id="${g.id}">🏁 Finalizar partido</button>`}
  </section>`;
}

function seasonSummary() {
  let w = 0, l = 0, t = 0, pf = 0, pc = 0;
  for (const g of db.games) {
    const s = score(g);
    pf += s.us; pc += s.them;
    if (s.us > s.them) w++; else if (s.us < s.them) l++; else t++;
  }
  const n = db.games.length || 1;
  const box = (v, lbl, cls = '') => `<div class="kpi ${cls}"><b>${v}</b><small>${lbl}</small></div>`;
  return `
  <section class="card summary kpis">
    ${box(db.games.length, 'Partidos')}
    ${box(w, 'Victorias', 'win')}
    ${box(l, 'Derrotas', 'loss')}
    ${t ? box(t, 'Empates') : ''}
    ${box(round1(pf / n), 'Puntos a favor / partido')}
    ${box(round1(pc / n), 'Puntos en contra / partido')}
  </section>`;
}

function leaders(data) {
  const rows = data.rows.filter(r => r.gp > 0);
  if (!rows.length) return '';
  const best = (k) => rows.reduce((a, b) => (b[k] > a[k] ? b : a), rows[0]);
  const card = (k, lbl) => {
    if (!colVisible(k, data)) return '';
    const r = best(k);
    if (!r || r[k] <= 0) return `<div class="leader"><small>${lbl}</small><b>–</b></div>`;
    return `<div class="leader"><small>${lbl}</small><b>${r[k]}</b><span>#${esc(r.number)} ${esc(r.name)}</span></div>`;
  };
  return `<section class="leaders">
    ${card('val', 'Mejor valoración')}${card('pts', 'Máx. anotador')}${card('reb', 'Más rebotes')}${card('ast', 'Más asistencias')}${card('rec', 'Más recuperaciones')}${card('blk', 'Más tapones')}
  </section>`;
}

function cellValue(r, c) {
  if (c.shot) {
    const m = r[`t${c.shot}m`], a = r[`t${c.shot}a`];
    return `${m}/${a}<small>${pct(m, a)}</small>`;
  }
  if (c.k === 'name') return esc(r.name);
  if (c.k === 'number') return esc(r.number);
  if (c.k === 'nper' && r.perList && r.perList.length) return `<span title="Periodos: ${r.perList.join(', ')}">${r.nper}</span>`;
  return r[c.k];
}

/* Una columna se oculta si su acción está desactivada y no hay datos que mostrar */
const COL_OPTS = { t1: ['t1'], t2: ['t2'], t3: ['t3'], ro: ['ro'], rd: ['rd'], reb: ['ro', 'rd'], ast: ['ast'], blk: ['blk'], blkr: ['blkr'], rec: ['rec'], lost: ['lost'], fc: ['fc'], fr: ['fr'] };
function colVisible(k, data) {
  const opts = COL_OPTS[k];
  if (!opts || opts.some(optEnabled)) return true;
  const t = data.total;
  const v = k[0] === 't' && k.length === 2 ? t[`${k}a`] : t[k];
  return v !== 0;
}

function statsTable(data) {
  const cols = COLS.filter(c => (!c.season || data.season) && colVisible(c.k, data));
  const { key, dir } = ui.sort;
  const sk = (r) => {
    const c = cols.find(c => c.k === key) || cols[0];
    const k = c.sortKey || c.k;
    if (k === 'number') return numVal(r.number);
    return r[k];
  };
  const rows = [...data.rows].sort((a, b) => {
    const va = sk(a), vb = sk(b);
    if (typeof va === 'string') return dir * va.localeCompare(vb);
    return dir * (va - vb) || byNumber(a, b);
  });
  return `
  <div class="table-wrap">
    <table class="stats">
      <thead><tr>${cols.map(c => `<th class="${c.cls || ''} ${key === c.k ? 'sorted' : ''}" data-action="sort" data-k="${c.k}" title="${c.t || ''}">${c.h}${key === c.k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map(r => `<tr class="${r.gp ? '' : 'dnp'}">${cols.map(c => `<td class="${c.cls || ''} ${c.k === 'val' ? (r.val > 0 ? 'pos' : r.val < 0 ? 'neg' : '') : ''} ${c.k === 'fc' && !data.season && r.fc >= MAX_FOULS ? 'neg' : ''}">${cellValue(r, c)}</td>`).join('')}</tr>`).join('')}
      </tbody>
      <tfoot><tr>${cols.map(c => `<td class="${c.cls || ''}">${c.k === 'number' ? '' : cellValue(data.total, c)}</td>`).join('')}</tr></tfoot>
    </table>
  </div>`;
}

/* ─────────────────────────── Modales ─────────────────────────── */

function openModal(m) { ui.modal = m; refreshModal(); }

function refreshModal() {
  const m = ui.modal;
  if (!m) { modalEl.hidden = true; modalEl.innerHTML = ''; return; }
  let html = '';
  if (m.kind === 'lineup') html = renderLineup(m);
  else if (m.kind === 'swap') html = renderSwap(m);
  else if (m.kind === 'menu') html = renderMenu(m);
  else if (m.kind === 'log') html = renderLog(m);
  else if (m.kind === 'confirm') html = renderConfirm(m);
  else if (m.kind === 'share') html = renderShare(m);
  modalEl.innerHTML = `<div class="modal-back"><div class="modal ${m.kind}">${html}</div></div>`;
  modalEl.hidden = false;
}

function closeModal(silent) {
  const m = ui.modal;
  if (!m) return;
  ui.modal = null;
  refreshModal();
  if (m.kind === 'confirm' && m.resolve) m.resolve(false);
  if (m.kind === 'lineup') {
    const g = getGame(m.gid);
    if (g) { markPlayed(g); save(); }
    if (!silent) render();
  }
}

function confirmBox(msg, ok = 'Aceptar', danger = false) {
  return new Promise(resolve => openModal({ kind: 'confirm', msg, ok, danger, resolve }));
}

function renderConfirm(m) {
  return `<p class="confirm-msg">${m.msg}</p>
  <div class="modal-actions">
    <button class="btn" data-action="confirm-no">Cancelar</button>
    <button class="btn ${m.danger ? 'danger-fill' : 'primary'}" data-action="confirm-yes">${m.ok}</button>
  </div>`;
}

function chip(g, p, lines, action, extraCls = '') {
  const f = (lines[p.id] && lines[p.id].fc) || 0;
  const np = (g.played[p.id] || []).length;
  const pts = (lines[p.id] && lines[p.id].pts) || 0;
  return `<button class="chip ${extraCls} ${f >= MAX_FOULS ? 'out' : ''}" data-action="${action}" data-id="${p.id}">
    <span class="num">${esc(p.number)}</span>
    <span class="cinfo"><span class="name">${esc(p.name)}</span><small>${np} per · ${pts} pts · ${f} F</small></span>
  </button>`;
}

function renderLineup(m) {
  const g = getGame(m.gid);
  const lines = playerLines(g);
  const n = g.onCourt.length;
  return `
  <div class="modal-head">
    <h3>${esc(m.title || 'Jugadores en pista')}</h3>
    <span class="count ${n === MAX_ON_COURT ? 'ok' : ''}">${n}/${MAX_ON_COURT} en pista</span>
  </div>
  <div class="chips">${sortedPlayers(g.roster).map(p => chip(g, p, lines, 'toggle-court', g.onCourt.includes(p.id) ? 'on' : '')).join('')}</div>
  <div class="modal-actions">
    ${n ? '<button class="btn" data-action="clear-court">Vaciar pista</button>' : ''}
    <button class="btn primary" data-action="lineup-done">Listo</button>
  </div>`;
}

function renderSwap(m) {
  const g = getGame(m.gid);
  const lines = playerLines(g);
  const out = g.roster.find(p => p.id === m.outId);
  const bench = sortedPlayers(g.roster.filter(p => !g.onCourt.includes(p.id)));
  return `
  <div class="modal-head">
    <h3>${out ? `Cambio · sale <span class="hl">${esc(pLabel(out))}</span>` : 'Añadir jugador a pista'}</h3>
  </div>
  ${bench.length ? `<div class="chips">${bench.map(p => chip(g, p, lines, 'swap-in')).join('')}</div>` : '<p class="empty">No hay jugadores en el banquillo.</p>'}
  <div class="modal-actions">
    ${out ? '<button class="btn" data-action="bench-out">Sentar sin cambio</button>' : ''}
    <button class="btn" data-action="modal-close">Cancelar</button>
  </div>`;
}

function renderMenu(m) {
  const g = getGame(m.gid);
  return `
  <div class="modal-head"><h3>vs ${esc(g.opponent)} · ${fmtDate(g.date)}</h3></div>
  <div class="menu-list">
    <button class="btn" data-action="lineup">⇄ Jugadores en pista</button>
    <button class="btn" data-action="log">📝 Jugadas registradas (${g.events.length})</button>
    <a class="btn" href="#/stats/${g.id}">📊 Estadísticas del partido</a>
    <button class="btn" data-action="theme">${isLight() ? '🌙 Modo oscuro' : '☀️ Modo claro'}</button>
    ${document.fullscreenEnabled ? `<button class="btn" data-action="fullscreen">⛶ Pantalla completa</button>` : ''}
    ${g.finished
      ? `<button class="btn" data-action="reopen" data-id="${g.id}">↺ Reabrir partido</button>`
      : `<button class="btn" data-action="finish" data-id="${g.id}">🏁 Finalizar partido</button>`}
    <a class="btn" href="#/partidos">⌂ Salir a partidos</a>
  </div>`;
}

function eventText(g, e) {
  if (e.type === 'opp') return `<span class="them">${esc(g.opponent)}</span> ${e.pts > 0 ? '+' + e.pts : e.pts}`;
  const p = g.roster.find(x => x.id === e.pid);
  return `<b>${esc(pLabel(p))}</b> · ${EV[e.type] ? EV[e.type].text : e.type}`;
}

function renderLog(m) {
  const g = getGame(m.gid);
  const evs = [...g.events].reverse();
  return `
  <div class="modal-head"><h3>Jugadas registradas</h3><span class="muted">${evs.length}</span></div>
  <div class="log">
    ${evs.length ? evs.map(e => `
      <div class="log-row ${e.type === 'opp' ? 'opp' : (EV[e.type] && EV[e.type].cls) || ''}">
        <span class="lp">${perAbbr(g, e.period)}</span>
        <span class="lt">${eventText(g, e)}</span>
        <button class="icon-btn danger" data-action="del-event" data-id="${e.id}" title="Eliminar">✕</button>
      </div>`).join('') : '<p class="empty">Aún no hay jugadas.</p>'}
  </div>
  <div class="modal-actions"><button class="btn primary" data-action="modal-close">Cerrar</button></div>`;
}

/* ─────────────────────────── Toast ─────────────────────────── */

let toastTimer = null;
function toast(msg, undoId) {
  // En el partido el aviso es solo informativo (deshacer está en la cabecera, ↶)
  // y deja pasar los toques para no bloquear los botones de debajo.
  const live = parseRoute().view === 'partido' && !ui.modal;
  const withUndo = undoId && !live;
  toastEl.innerHTML = `<span>${msg}</span>${withUndo ? `<button data-action="undo-event" data-id="${undoId}">Deshacer</button>` : ''}`;
  toastEl.classList.toggle('top', live);
  toastEl.hidden = false;
  toastEl.classList.remove('show');
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, live ? 1600 : withUndo ? 3000 : 2200);
}

/* ─────────────────────────── Partido ─────────────────────────── */

function currentGame() {
  const { view, arg } = parseRoute();
  if (view === 'partido') return getGame(arg);
  if (ui.modal && ui.modal.gid) return getGame(ui.modal.gid);
  return null;
}

function markPlayed(g) {
  for (const pid of g.onCourt) {
    const arr = g.played[pid] || (g.played[pid] = []);
    if (!arr.includes(g.period)) arr.push(g.period);
  }
}

/* Añade al roster del partido jugadores nuevos del equipo y actualiza nombres
   (solo en partidos no finalizados). */
function syncRoster(g) {
  if (g.finished) return;
  for (const p of db.team.players) {
    const r = g.roster.find(x => x.id === p.id);
    if (r) { r.number = p.number; r.name = p.name; }
    else g.roster.push({ id: p.id, number: p.number, name: p.name });
  }
}

function record(g, type, pid) {
  const e = { id: uid(), ts: Date.now(), period: g.period, type, pid };
  g.events.push(e);
  markPlayed(g);
  save();
  vibrate();
  ui.flash = { pid, type };
  render();
  const p = g.roster.find(x => x.id === pid);
  let msg = `<b>${esc(pLabel(p))}</b> · ${EV[type].text}`;
  if (type === 'fc') {
    const f = g.events.filter(x => x.pid === pid && x.type === 'fc').length;
    if (f >= MAX_FOULS) msg = `⛔ <b>${esc(pLabel(p))}</b> · ${f} faltas: eliminado/a`;
    else if (f === MAX_FOULS - 1) msg = `⚠️ <b>${esc(pLabel(p))}</b> · ${f} faltas`;
  }
  toast(msg, e.id);
}

function recordOpp(g, pts) {
  if (pts < 0 && score(g).them + pts < 0) { toast('El rival tiene 0 puntos'); return; }
  const e = { id: uid(), ts: Date.now(), period: g.period, type: 'opp', pts };
  g.events.push(e);
  markPlayed(g);
  save();
  vibrate();
  render();
  toast(`${esc(g.opponent)} ${pts > 0 ? '+' + pts : pts}`, e.id);
}

function removeEvent(g, id) {
  const i = g.events.findIndex(e => e.id === id);
  if (i < 0) return null;
  const [e] = g.events.splice(i, 1);
  save();
  return e;
}

/* ─────────────────────────── Acciones ─────────────────────────── */

const actions = {
  /* Equipo */
  'edit-player'(el) { ui.editId = el.dataset.id; ui.focus = 'input[name=name]'; render(); },
  'cancel-edit'() { ui.editId = null; render(); },
  async 'del-player'(el) {
    const p = db.team.players.find(x => x.id === el.dataset.id);
    if (!p) return;
    if (!await confirmBox(`¿Eliminar a <b>${esc(pLabel(p))}</b> del equipo?<br><small class="muted">Sus estadísticas en partidos ya jugados se conservan.</small>`, 'Eliminar', true)) return;
    db.team.players = db.team.players.filter(x => x.id !== p.id);
    if (ui.editId === p.id) ui.editId = null;
    save(); render();
  },
  'export-json'() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    download(blob, `minibasket-stats-${todayISO()}.json`);
  },

  /* Partidos */
  async 'del-game'(el) {
    const g = getGame(el.dataset.id);
    if (!g) return;
    if (!await confirmBox(`¿Borrar el partido contra <b>${esc(g.opponent)}</b> (${fmtDate(g.date)})?<br><small class="muted">Se perderán todas sus estadísticas.</small>`, 'Borrar', true)) return;
    db.games = db.games.filter(x => x.id !== g.id);
    save(); render();
  },

  /* Partido en directo */
  ev(el) {
    const g = currentGame();
    if (g) record(g, el.dataset.type, el.dataset.pid);
  },
  opp(el) {
    const g = currentGame();
    if (g) recordOpp(g, parseInt(el.dataset.pts, 10));
  },
  undo() {
    const g = currentGame();
    if (!g || !g.events.length) { toast('Nada que deshacer'); return; }
    const last = g.events.reduce((a, b) => (b.ts >= a.ts ? b : a));
    removeEvent(g, last.id);
    render();
    toast(`↶ Deshecho: ${eventText(g, last)}`);
  },
  'undo-event'(el) {
    const g = currentGame() || db.games.find(x => x.events.some(e => e.id === el.dataset.id));
    if (!g) return;
    const e = removeEvent(g, el.dataset.id);
    toastEl.hidden = true;
    if (e) { render(); toast(`↶ Deshecho: ${eventText(g, e)}`); }
  },
  async period(el) {
    const g = currentGame();
    if (!g) return;
    const d = parseInt(el.dataset.d, 10);
    if (d > 0 && g.period >= g.periods) {
      if (g.finished) { toast('El partido está finalizado'); return; }
      if (await confirmBox(`Es el último periodo. ¿Finalizar el partido?`, '🏁 Finalizar')) finishGame(g);
      return;
    }
    g.period = Math.min(Math.max(g.period + d, 1), g.periods);
    save();
    render();
    if (d > 0) {
      syncRoster(g);
      openModal({ kind: 'lineup', gid: g.id, title: `Quinteto · ${perName(g)} ${g.period}` });
    }
  },
  lineup() {
    const g = currentGame();
    if (!g) return;
    syncRoster(g);
    openModal({ kind: 'lineup', gid: g.id, title: `Jugadores en pista · ${perAbbr(g, g.period)}` });
  },
  'toggle-court'(el) {
    const g = getGame(ui.modal.gid);
    const id = el.dataset.id;
    if (g.onCourt.includes(id)) g.onCourt = g.onCourt.filter(x => x !== id);
    else if (g.onCourt.length >= MAX_ON_COURT) { toast(`Máximo ${MAX_ON_COURT} jugadores en pista`); vibrate(40); return; }
    else g.onCourt.push(id);
    save(); vibrate(8); refreshModal();
  },
  'clear-court'() {
    const g = getGame(ui.modal.gid);
    g.onCourt = [];
    save(); refreshModal();
  },
  'lineup-done'() { closeModal(); },
  swap(el) {
    const g = currentGame();
    if (!g) return;
    syncRoster(g);
    openModal({ kind: 'swap', gid: g.id, outId: el.dataset.pid || null });
  },
  'swap-in'(el) {
    const m = ui.modal;
    const g = getGame(m.gid);
    const inId = el.dataset.id;
    if (m.outId) {
      const idx = g.onCourt.indexOf(m.outId);
      if (idx >= 0) g.onCourt[idx] = inId; else if (g.onCourt.length < MAX_ON_COURT) g.onCourt.push(inId);
    } else if (g.onCourt.length < MAX_ON_COURT) g.onCourt.push(inId);
    markPlayed(g);
    save(); vibrate(); closeModal(true); render();
  },
  'bench-out'() {
    const m = ui.modal;
    const g = getGame(m.gid);
    g.onCourt = g.onCourt.filter(x => x !== m.outId);
    save(); closeModal(true); render();
  },
  menu() {
    const g = currentGame();
    if (g) openModal({ kind: 'menu', gid: g.id });
  },
  log() {
    const g = currentGame();
    if (g) openModal({ kind: 'log', gid: g.id });
  },
  'del-event'(el) {
    const g = getGame(ui.modal.gid);
    removeEvent(g, el.dataset.id);
    refreshModal(); render();
  },
  async finish(el) {
    const g = getGame(el.dataset.id);
    if (!g) return;
    if (ui.modal) closeModal(true);
    if (await confirmBox(`¿Finalizar el partido contra <b>${esc(g.opponent)}</b>?<br><small class="muted">Podrás reabrirlo desde el menú del partido.</small>`, '🏁 Finalizar')) finishGame(g);
  },
  reopen(el) {
    const g = getGame(el.dataset.id);
    if (!g) return;
    g.finished = false;
    save(); closeModal(true); render();
    toast('Partido reabierto');
  },

  /* Estadísticas */
  sort(el) {
    const k = el.dataset.k;
    if (ui.sort.key === k) ui.sort.dir *= -1;
    else ui.sort = { key: k, dir: (k === 'number' || k === 'name') ? 1 : -1 };
    render();
  },
  avg(el) { ui.avg = el.dataset.v === '1'; render(); },
  share(el) { shareStats(el.dataset.arg); },
  csv(el) { downloadCSV(el.dataset.arg); },
  async 'copy-text'() {
    try { await navigator.clipboard.writeText(ui.modal.text); toast('📋 Copiado'); }
    catch (e) { toast('No se pudo copiar'); }
  },
  async 'native-share'() {
    const m = ui.modal;
    try { await navigator.share({ title: m.subject, text: m.text }); } catch (e) { /* cancelado */ }
  },

  /* General */
  fullscreen() { toggleFullscreen(); },
  'toggle-opt'(el) {
    const id = el.dataset.id;
    const hidden = db.settings.hidden;
    if (hidden.includes(id)) db.settings.hidden = hidden.filter(x => x !== id);
    else if (OPTIONS.length - hidden.length <= 1) { toast('Tiene que quedar al menos un botón'); return; }
    else hidden.push(id);
    save(); vibrate(8); render();
  },
  'opts-all'() { db.settings.hidden = []; save(); render(); toast('Todos los botones activados'); },
  theme() { toggleTheme(); },
  'modal-close'() { closeModal(); },
  'confirm-yes'() { const m = ui.modal; ui.modal = null; refreshModal(); m.resolve(true); },
  'confirm-no'() { closeModal(); },
};

function finishGame(g) {
  g.finished = true;
  save();
  go(`#/stats/${g.id}`);
  toast('🏁 Partido finalizado');
}

document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-back')) { closeModal(); return; }
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, e); }
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  const kind = form.dataset.form;
  if (!kind) return;
  e.preventDefault();
  const fd = new FormData(form);

  if (kind === 'player') {
    const number = String(fd.get('number') || '').trim();
    const name = String(fd.get('name') || '').trim();
    if (!number || !name) return;
    const dup = db.team.players.find(p => p.number === number && p.id !== ui.editId);
    if (dup) { toast(`⚠️ El dorsal ${esc(number)} ya es de ${esc(dup.name)}`); return; }
    if (ui.editId) {
      const p = db.team.players.find(x => x.id === ui.editId);
      if (p) { p.number = number; p.name = name; }
      ui.editId = null;
      toast(`Guardado ${esc(pLabel({ number, name }))}`);
    } else {
      db.team.players.push({ id: uid(), number, name });
      toast(`Añadido ${esc(pLabel({ number, name }))}`);
    }
    save();
    ui.focus = 'input[name=number]';
    render();
  }

  if (kind === 'game') {
    if (!db.team.players.length) return;
    const opponent = String(fd.get('opponent') || '').trim() || 'Rival';
    const g = {
      id: uid(),
      createdAt: Date.now(),
      date: String(fd.get('date') || todayISO()),
      opponent,
      teamName: db.team.name,
      periods: parseInt(fd.get('periods'), 10) || 8,
      period: 1,
      roster: sortedPlayers(db.team.players).map(p => ({ id: p.id, number: p.number, name: p.name })),
      onCourt: [],
      played: {},
      events: [],
      finished: false,
    };
    db.games.push(g);
    save();
    ui.pendingModal = { kind: 'lineup', gid: g.id, title: `Quinteto inicial · ${perName(g)} 1` };
    go(`#/partido/${g.id}`);
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  const k = el.dataset && el.dataset.change;
  if (!k) return;
  if (k === 'team-name') {
    db.team.name = el.value.trim() || 'Mi equipo';
    for (const g of db.games) if (!g.finished) g.teamName = db.team.name;
    save(); render();
  } else if (k === 'team-email') {
    db.team.email = el.value.trim();
    save();
    toast('Email guardado');
  } else if (k === 'stats-select') {
    go(`#/stats/${el.value}`);
  } else if (k === 'import-json') {
    importJSON(el.files && el.files[0]);
    el.value = '';
  }
});

document.addEventListener('fullscreenchange', () => {
  // Actualiza el icono del botón de pantalla completa
  if (!ui.modal) render();
});

/* ─────────────────── Exportar / compartir ─────────────────── */

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importJSON(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !data.team || !Array.isArray(data.games)) throw new Error('Formato no válido');
    const ok = await confirmBox(`¿Importar <b>${esc(file.name)}</b>?<br><small class="muted">Se reemplazarán el equipo y los ${db.games.length} partidos actuales por ${data.games.length} partidos del archivo.</small>`, 'Importar', true);
    if (!ok) return;
    db = normalize(data);
    save(); render();
    toast('✅ Datos importados');
  } catch (err) {
    toast('⚠️ No se pudo importar: archivo no válido');
  }
}

function shotTxt(r, n) { return `${r[`t${n}m`]}/${r[`t${n}a`]}`; }

function buildText(arg) {
  const data = statsData(arg);
  if (!data) return '';
  const out = [];
  if (data.season) {
    out.push(`${db.team.name} · Estadísticas de temporada (${db.games.length} partidos)${ui.avg ? ' · promedio por partido' : ''}`);
    for (const g of sortedGames()) { const s = score(g); out.push(`  ${fmtDate(g.date)} vs ${g.opponent}: ${s.us}-${s.them}`); }
  } else {
    const g = data.game, s = score(g), ps = periodScores(g);
    out.push(`${g.teamName} ${s.us} - ${s.them} ${g.opponent}`);
    out.push(`Fecha: ${fmtDate(g.date)}`);
    out.push(`Parciales: ${ps.us.map((v, i) => `${perAbbr(g, i + 1)} ${v}-${ps.them[i]}`).join(' | ')}`);
  }
  out.push('');
  const rows = [...data.rows].filter(r => r.gp > 0).sort((a, b) => b.val - a.val || byNumber(a, b));
  for (const r of rows) {
    out.push(`#${r.number} ${r.name}${data.season ? ` (${r.gp} PJ)` : ''}`);
    out.push(`   ${r.pts} pts · T1 ${shotTxt(r, 1)} · T2 ${shotTxt(r, 2)} · T3 ${shotTxt(r, 3)}`);
    out.push(`   Reb ${r.reb} (${r.ro} of + ${r.rd} def) · As ${r.ast} · Tap ${r.blk} · TapRec ${r.blkr} · Rec ${r.rec} · Pér ${r.lost} · FC ${r.fc} · FR ${r.fr} · VAL ${r.val}`);
  }
  const t = data.total;
  out.push('');
  out.push(`EQUIPO: ${t.pts} pts · T1 ${shotTxt(t, 1)} · T2 ${shotTxt(t, 2)} · T3 ${shotTxt(t, 3)} · Reb ${t.reb} · As ${t.ast} · Tap ${t.blk} · TapRec ${t.blkr} · Rec ${t.rec} · Pér ${t.lost} · FC ${t.fc} · FR ${t.fr} · VAL ${t.val}`);
  out.push('');
  out.push('VAL = puntos + rebotes + asistencias + recuperaciones + tapones + faltas recibidas − tiros fallados − tapones recibidos − pérdidas − faltas cometidas');
  return out.join('\n');
}

function statsTitle(arg) {
  const g = getGame(arg);
  return g ? `${g.teamName} vs ${g.opponent} · ${fmtDate(g.date)}` : `${db.team.name} · Temporada`;
}

function shareStats(arg) {
  const text = buildText(arg);
  const subject = `Estadísticas · ${statsTitle(arg)}`;
  const mailto = `mailto:${encodeURIComponent(db.team.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  openModal({ kind: 'share', text, subject, mailto });
}

function renderShare(m) {
  return `
  <div class="modal-head"><h3>Enviar estadísticas</h3></div>
  <pre class="share-preview">${esc(m.text)}</pre>
  <div class="modal-actions">
    <button class="btn" data-action="copy-text">📋 Copiar</button>
    ${navigator.share ? '<button class="btn" data-action="native-share">↗ Compartir</button>' : ''}
    <a class="btn primary" href="${esc(m.mailto)}">✉ Email${db.team.email ? ` a ${esc(db.team.email)}` : ''}</a>
    <button class="btn" data-action="modal-close">Cerrar</button>
  </div>`;
}

function downloadCSV(arg) {
  const data = statsData(arg);
  if (!data) return;
  const head = ['Dorsal', 'Jugador', ...(data.season ? ['PJ'] : []), 'Periodos', 'PTS', 'T1A', 'T1I', 'T2A', 'T2I', 'T3A', 'T3I', 'RO', 'RD', 'RT', 'AS', 'TAP', 'TR', 'REC', 'PER', 'FC', 'FR', 'VAL'];
  const line = (r) => [r.number, r.name, ...(data.season ? [r.gp] : []), r.nper, r.pts, r.t1m, r.t1a, r.t2m, r.t2a, r.t3m, r.t3a, r.ro, r.rd, r.reb, r.ast, r.blk, r.blkr, r.rec, r.lost, r.fc, r.fr, r.val];
  const rows = [head, ...sortedPlayers(data.rows).map(line), line(data.total)];
  const csv = rows.map(r => r.map(v => {
    const s = String(v ?? '').replace('.', ',');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\r\n');
  const g = getGame(arg);
  const name = g ? `estadisticas-${g.date}-vs-${g.opponent}` : `estadisticas-temporada-${todayISO()}`;
  download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), name.replace(/[^\w\-áéíóúñü]+/gi, '_') + '.csv');
}

/* ─────────────────────── Pantalla completa ─────────────────────── */

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      try { await screen.orientation.lock('landscape'); } catch (e) { /* no soportado */ }
    } else {
      await document.exitFullscreen();
    }
  } catch (e) {
    toast('Pantalla completa no disponible');
  }
  if (ui.modal && ui.modal.kind === 'menu') { closeModal(true); render(); }
}

/* ─────────────────────────── Inicio ─────────────────────────── */

render();
