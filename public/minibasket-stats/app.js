'use strict';

/* ════════════════════════════════════════════════════════════════
   My Own Basketball Stats — SPA sin dependencias. Datos en localStorage.
   ════════════════════════════════════════════════════════════════ */

const STORE_KEY = 'mbstats.v1';
/* Versión del formato de los datos (y de la copia de seguridad). v3: registro de quintetos (seq, lineups, lineupFrom) */
const FORMAT_VERSION = 3;
const MAX_ON_COURT = 5;
const MAX_FOULS = 5;
const KOFI_URL = 'https://ko-fi.com/navizenitram';
/* Direcciones antiguas de la app. Ahí se ofrece llevar los datos a la dirección actual (ver «Mudanza») */
const OLD_HOSTS = ['marcador-kohl.vercel.app'];

/* Acciones que se pueden registrar para un jugador (los puntos de cada tiro están en MBCore.EV_PTS, core.js) */
const EV = {
  t1_ok: { label: '1', sub: '✓', cls: 'made', text: 'Tiro libre anotado' },
  t1_ko: { label: '1', sub: '✗', cls: 'miss', text: 'Tiro libre fallado' },
  t2_ok: { label: '2', sub: '✓', cls: 'made', text: 'Canasta de 2' },
  t2_ko: { label: '2', sub: '✗', cls: 'miss', text: 'Tiro de 2 fallado' },
  t3_ok: { label: '3', sub: '✓', cls: 'made', text: 'Triple' },
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

function optEnabled(id) { const t = team(); return !t || !t.hidden.includes(id); }
function actEnabled(type) { const o = OPTIONS.find(o => o.acts.includes(type)); return !o || optEnabled(o.id); }
function enabledShots() { return SHOT_ACTIONS.filter(actEnabled); }
function enabledOthers() { return OTHER_ACTIONS.filter(actEnabled); }

/* ─────────────────────────── Datos ─────────────────────────── */

/* normalize() solo corrige lo que podría romper la app o colar HTML en la página. Lo que esta versión no entiende
   pero es inofensivo (una jugada de un tipo nuevo, un periodo de prórroga, una fecha mal tecleada) se conserva.

   Los identificadores se pintan sin escapar en atributos HTML, en la ruta (#/partido/…) y en selectores CSS, y se
   usan como claves de objetos. Solo se aceptan letras, números, «-» y «_» (lo que genera uid()) y nunca el nombre de
   una propiedad de los objetos (__proto__, constructor, toString…). Otra cosa solo puede venir de una copia de
   seguridad manipulada: se cambia por un identificador nuevo, el mismo en todas sus referencias.
   (Van antes de load(), que los usa al arrancar.) */
const SAFE_ID = /^[\w-]{1,64}$/;
const safeKey = (s) => SAFE_ID.test(s) && !(s in Object.prototype);
const SAFE_DATE = /^[\d./-]{1,24}$/;   // la app guarda aaaa-mm-dd; basta con que sean dígitos y separadores
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;   // la que guarda la app y entiende un <input type=date>
const MAX_PERIODS = 12;

/* Fases de la temporada. En minibasket la temporada se divide en dos fases independientes: según la clasificación
   de la 1ª, en la 2ª se juega contra equipos nuevos y en un nivel superior, el mismo o inferior (para que los
   equipos estén más igualados). Cada equipo guarda la fase en la que está y el nivel de cada fase; cada partido,
   la fase en la que se jugó y si se jugó de local o de visitante. */
const PHASES = [1, 2];
const MOVES = Object.assign(Object.create(null), {
  up: { short: 'Sube', text: 'sube de nivel' },
  same: { short: 'Igual', text: 'mismo nivel' },
  down: { short: 'Baja', text: 'baja de nivel' },
});
const VENUES = Object.assign(Object.create(null), { home: 'Local', away: 'Visitante' });
/* Fase y campo válidos a partir de lo que venga (datos guardados, copia importada o formulario) */
const asPhase = (v) => (PHASES.includes(+v) ? +v : 1);
const asVenue = (v) => (typeof v === 'string' && v in VENUES ? v : '');

const objects = (v) => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
/* Entero entre min y max; si no es un número (o es 0), el valor por defecto */
const intIn = (v, min, max, def) => Math.min(Math.max(Math.round(+v) || def, min), max);

let db = load();

const ui = {
  editId: null,          // jugador en edición (vista Equipo)
  modal: null,           // { kind, ... } modal abierto
  sort: { key: 'number', dir: 1 },
  avg: false,            // estadísticas de temporada: promedio por partido
  flash: null,           // { pid, type } botón a resaltar tras pulsar
  focus: null,           // selector a enfocar tras renderizar
  pendingModal: null,    // modal a abrir tras la próxima navegación
  lastKey: null,         // pantalla pintada la última vez (para conservar el scroll)
};

/* Deja los datos (guardados o importados) en el formato actual. Los datos que crea la app pasan sin cambios. */
function normalize(d) {
  d = d && typeof d === 'object' ? d : {};
  d.games = objects(d.games);
  // v1 → v2: antes había un único equipo en d.team y los botones en d.settings.hidden
  if (!Array.isArray(d.teams)) {
    d.teams = [];
    const old = d.team && typeof d.team === 'object' ? d.team : null;
    if (old || d.games.length) {
      const t = {
        id: uid(),
        name: (old && old.name) || 'Mi equipo',
        email: (old && old.email) || '',
        players: old && Array.isArray(old.players) ? old.players : [],
        hidden: d.settings && Array.isArray(d.settings.hidden) ? d.settings.hidden : [],
      };
      d.teams.push(t);
      d.currentTeamId = t.id;
    }
  }
  delete d.team;
  delete d.settings;
  delete d.exportedAt;   // fecha de la copia de seguridad: no forma parte de los datos

  const newIds = new Map();
  const fixId = (v) => {
    if (v == null || v === '') return v;
    const s = String(v);
    if (safeKey(s)) return s;
    if (!newIds.has(s)) newIds.set(s, uid());
    return newIds.get(s);
  };
  const players = (list) => {
    list = objects(list);
    for (const p of list) {
      p.id = fixId(p.id) || uid();
      p.number = String(p.number ?? '');
      p.name = String(p.name ?? '');
    }
    return list;
  };

  d.teams = objects(d.teams);
  for (const t of d.teams) {
    t.id = fixId(t.id) || uid();
    t.name = String(t.name || 'Mi equipo');
    t.email = String(t.email || '');
    t.players = players(t.players);
    t.hidden = Array.isArray(t.hidden) ? t.hidden : [];
    // Fase de la temporada en la que está el equipo y nivel en el que juega cada fase
    t.phase = asPhase(t.phase);
    t.levels = PHASES.map((n, i) => String((Array.isArray(t.levels) && t.levels[i]) || '').slice(0, 24));
    t.move = t.move in MOVES ? t.move : '';
  }
  const teamIds = new Set(d.teams.map(t => t.id));
  for (const g of d.games) {
    g.id = fixId(g.id) || uid();
    g.teamId = fixId(g.teamId);
    if (!teamIds.has(g.teamId) && d.teams.length) g.teamId = d.teams[0].id;
    g.periods = intIn(g.periods, 1, MAX_PERIODS, 8);
    g.period = intIn(g.period, 1, g.periods, 1);
    if (typeof g.date !== 'string' || !SAFE_DATE.test(g.date)) g.date = '';
    g.phase = asPhase(g.phase);
    g.venue = asVenue(g.venue);
    g.roster = players(g.roster);
    g.onCourt = Array.isArray(g.onCourt) ? g.onCourt.filter(x => x != null && x !== '').map(fixId) : [];
    // Los periodos (de cada jugador y de cada jugada) tienen que ser números; no se recortan a g.periods
    const played = g.played && typeof g.played === 'object' ? Object.entries(g.played) : [];
    g.played = Object.fromEntries(played
      .filter(([, list]) => Array.isArray(list))
      .map(([pid, list]) => [fixId(pid), list.filter(n => Number.isInteger(n) && n >= 1)]));
    // Los tipos de jugada desconocidos se conservan (no cuentan en las estadísticas) si son un nombre simple;
    // los puntos del rival tienen que ser un número
    const events = [];
    for (const e of objects(g.events)) {
      if (e.type === 'opp') {
        e.pts = +e.pts;
        if (!Number.isFinite(e.pts)) continue;
      } else {
        if (typeof e.type !== 'string' || !safeKey(e.type)) continue;
        if (e.pid != null) e.pid = fixId(e.pid);
      }
      e.id = fixId(e.id) || uid();
      e.period = intIn(e.period, 1, 99, 1);
      events.push(e);
    }
    g.events = events;
    normalizeLineups(g, fixId);
    const t = d.teams.find(t => t.id === g.teamId);
    g.teamName = String(g.teamName || (t ? t.name : 'Mi equipo'));
  }
  d.currentTeamId = fixId(d.currentTeamId);
  if (!teamIds.has(d.currentTeamId)) d.currentTeamId = d.teams.length ? d.teams[0].id : null;
  d.version = FORMAT_VERSION;
  return d;
}

/* v3: orden de jugadas y quintetos. Cada jugada lleva un seq (las de datos anteriores lo reciben en el orden de la
   lista, después del mayor que ya haya) y g.seq es el mayor de todos. Los quintetos (g.lineups) se validan: como mucho
   MAX_ON_COURT jugadores distintos con identificadores seguros, periodo entero y seq entero; se ordenan por seq.
   Sin registro (partidos anteriores a la v3) no hay lineupFrom: su +/- y sus quintetos no están disponibles. */
function normalizeLineups(g, fixId) {
  const isSeq = (v) => Number.isInteger(v) && v >= 1;
  const lineups = [];
  for (const l of objects(g.lineups)) {
    if (!isSeq(l.seq) || !Array.isArray(l.on) || l.on.length > MAX_ON_COURT) continue;
    const on = l.on.filter(x => x != null && x !== '').map(x => fixId(String(x)));
    if (on.length !== l.on.length || new Set(on).size !== on.length) continue;
    lineups.push({ seq: l.seq, period: intIn(l.period, 1, 99, 1), on });
  }
  lineups.sort((a, b) => a.seq - b.seq);
  g.lineups = lineups;

  let top = Math.max(isSeq(g.seq) ? g.seq : 0, ...g.events.filter(e => isSeq(e.seq)).map(e => e.seq), ...lineups.map(l => l.seq));
  for (const e of g.events) if (!isSeq(e.seq)) e.seq = ++top;
  g.seq = top;

  if (!isSeq(g.lineupFrom)) {
    if (lineups.length) g.lineupFrom = lineups[0].seq;
    else delete g.lineupFrom;
  }
}

/* Equipo seleccionado y sus partidos */
function team() { return db.teams.find(t => t.id === db.currentTeamId) || null; }
function teamGames() { return db.games.filter(g => g.teamId === db.currentTeamId); }
function selectTeam(id) { if (db.currentTeamId !== id) { db.currentTeamId = id; ui.editId = null; save(); } }

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = normalize(JSON.parse(raw));
      // Si normalize ha cambiado algo (formato antiguo o datos saneados), se guarda ya el resultado para que los
      // identificadores nuevos no cambien entre cargas. save() escribe con JSON.stringify, así que basta con
      // comparar con el texto leído. Si no se puede guardar, se sigue con los datos leídos.
      const out = JSON.stringify(d);
      if (out !== raw) { try { localStorage.setItem(STORE_KEY, out); } catch (e) { /* se guardará en el próximo cambio */ } }
      return d;
    }
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
  return teamGames().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
}

function getGame(id) { return db.games.find(g => g.id === id); }

/* Partidos a 4 cuartos: "Q1" / "Cuarto"; el resto: "P1" / "Periodo" */
function perAbbr(g, n) { return (g.periods === 4 ? 'Q' : 'P') + n; }
function perName(g) { return g.periods === 4 ? 'Cuarto' : 'Periodo'; }
function perCount(g) { return g.periods === 4 ? '4 cuartos' : `${g.periods} periodos`; }

/* Fases: «2ª fase»; el nivel y si se sube o se baja respecto a la 1ª: «Nivel B · sube de nivel» */
function phaseName(n) { return `${n}ª fase`; }
function phaseLevel(t, n) {
  const parts = [(t && t.levels[n - 1]) || ''];
  if (n === 2 && t && MOVES[t.move]) parts.push(MOVES[t.move].text);
  return parts.filter(Boolean).join(' · ');
}
function phaseLabel(t, n) { return [phaseName(n), phaseLevel(t, n)].filter(Boolean).join(' · '); }
/* Las fases solo se muestran en listas y estadísticas cuando el equipo ha llegado a la 2ª */
function phasesUsed(t) { return !!t && (t.phase === 2 || db.games.some(g => g.teamId === t.id && g.phase === 2)); }

/* Campo y fase de un partido, para los textos: «Local · 2ª fase» (la fase, solo si el equipo usa fases) */
function gameMeta(g) {
  const t = db.teams.find(t => t.id === g.teamId);
  return [VENUES[g.venue] || '', phasesUsed(t) ? phaseName(g.phase) : ''].filter(Boolean).join(' · ');
}

/* Victorias, derrotas y empates de una lista de partidos (los sin finalizar aún no tienen resultado) */
function winLoss(games) {
  const r = { w: 0, l: 0, t: 0, done: 0, pf: 0, pc: 0 };
  for (const g of games) {
    if (!g.finished) continue;
    const s = score(g);
    r.done++; r.pf += s.us; r.pc += s.them;
    if (s.us > s.them) r.w++; else if (s.us < s.them) r.l++; else r.t++;
  }
  return r;
}

function nGames(n) { return `${n} partido${n === 1 ? '' : 's'}`; }

function pLabel(p) { return p ? `#${p.number} ${p.name}` : '¿?'; }

function vibrate(ms = 12) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* noop */ } }

function pct(m, a) { return a ? Math.round((m / a) * 100) + '%' : '–'; }

function round1(n) { return Math.round(n * 10) / 10; }

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/* Día y mes abreviado de una fecha aaaa-mm-dd, para el calendario de la lista de partidos */
function dateParts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m && MONTHS[m[2] - 1] ? { day: String(+m[3]), month: MONTHS[m[2] - 1] } : { day: '–', month: '' };
}

/* ─────────────────────────── Iconos ─────────────────────────── */

/* Iconos de trazo dibujados para la app (rejilla de 24, heredan el color del texto). Van en línea para que
   se vean igual en todos los dispositivos y la app siga sin cargar nada de terceros. */
const ICONS = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  updown: '<path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>',
  undo: '<path d="M8 4L3 9l5 5"/><path d="M3 9h11a5.5 5.5 0 0 1 0 11h-4"/>',
  swap: '<path d="M4 8h14M14 4l4 4-4 4"/><path d="M20 16H6M10 12l-4 4 4 4"/>',
  chart: '<path d="M4 20h16"/><path d="M7 16v-5M12 16V5M17 16v-8"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z"/><path d="M14.5 6.5l3 3"/>',
  moon: '<path d="M20 13.5A8 8 0 1 1 10.5 4a7 7 0 0 0 9.5 9.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  compress: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7.5l8.5 6 8.5-6"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14"/>',
  share: '<path d="M12 15V4M8 7.5l4-4 4 4"/><path d="M7 11H6a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2h-1"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  flag: '<path d="M5 21V4M5 4h13l-2.5 4.5L18 13H5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M8 5.5l10.5 6.5L8 18.5z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  exit: '<path d="M10 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M15 8l4 4-4 4M19 12H9"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  reopen: '<path d="M4 5v5h5"/><path d="M4.5 10a8 8 0 1 1 1.5 7.5"/>',
  coffee: '<path d="M5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v2M12 3v2"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>',
};

function icon(name, cls = '') {
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* El balón de la marca (el mismo dibujo que el icono de la app) */
const BALL = '<svg class="ball" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="#ff8a00"/><circle cx="37" cy="33" r="30" fill="#fff" opacity=".16"/>'
  + '<g fill="none" stroke="#2a1300" stroke-width="4.4" stroke-linecap="round"><circle cx="50" cy="50" r="46"/><path d="M4 50h92M50 4v92"/><path d="M18 18c14 14 14 50 0 64M82 18c-14 14-14 50 0 64"/></g></svg>';

/* Escudo de un equipo: sus iniciales sobre un color que sale del nombre (siempre el mismo para el mismo nombre) */
function crest(name) {
  // [...palabra] separa por caracteres completos (una letra con acento compuesto o un emoji no se parten)
  const words = String(name).trim().split(/\s+/).filter(Boolean).map(w => [...w]);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || ['?']).slice(0, 2).join('')).toUpperCase();
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return `<span class="crest" style="--h:${h}" aria-hidden="true">${esc(initials)}</span>`;
}

/* ───────────────────────── Estadísticas ───────────────────────── */

/* El cálculo vive en core.js (MBCore). Estas funciones lo exponen con los nombres de siempre. */
function blankLine() { return MBCore.blankLine(); }
function addEvent(l, type) { MBCore.addEvent(l, type); }
function sumLines(target, src) { return MBCore.sumLines(target, src); }
function finish(l) { return MBCore.finish(l); }
function score(g) { return MBCore.score(g); }
function periodScores(g) { return MBCore.periodScores(g); }
function playerLines(g) { return MBCore.playerLines(g); }

function gameRows(g) {
  const lines = playerLines(g);
  return sortedPlayers(g.roster).map(p => {
    const per = (g.played[p.id] || []).slice().sort((a, b) => a - b);
    const l = lines[p.id] || finish(blankLine());
    const hasEvents = g.events.some(e => e.pid === p.id);
    return { id: p.id, number: p.number, name: p.name, ...l, nper: per.length, perList: per, gp: (per.length || hasEvents) ? 1 : 0 };
  });
}

/* Filas de la temporada (o de una fase): la suma de los partidos indicados */
function seasonRows(list) {
  const games = [...list].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0));
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
  for (const p of team().players) {
    const r = ensure(p);
    r.number = p.number; r.name = p.name;
  }
  return Object.values(map)
    .filter(r => r.gp > 0 || team().players.some(p => p.id === r.id))
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

/* Pantalla al abrir la app: con varios equipos (o ninguno) se elige primero el equipo */
function startRoute() {
  if (db.teams.length !== 1) return '#/equipos';
  return team().players.length ? '#/partidos' : '#/equipo';
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function render() {
  const { view, arg } = parseRoute();
  let html;
  switch (view) {
    case 'equipos': html = viewTeams(); break;
    case 'privacidad': html = viewPrivacy(); break;
    case 'partido': {
      const g = getGame(arg);
      if (!g) { go('#/partidos'); return; }
      selectTeam(g.teamId);
      html = viewLive(g);
      break;
    }
    case 'equipo':
    case 'partidos':
    case 'stats':
    case 'ajustes': {
      if (view === 'stats' && arg && getGame(arg)) selectTeam(getGame(arg).teamId);
      if (!team()) { go('#/equipos'); return; }
      html = view === 'equipo' ? viewTeam() : view === 'partidos' ? viewGames() : view === 'stats' ? viewStats(arg) : viewSettings();
      break;
    }
    default:
      go(startRoute());
      return;
  }
  // Al repintar la misma pantalla (p. ej. activar un botón en Ajustes u ordenar la tabla)
  // se conserva la posición del scroll para que no salte arriba.
  const key = view + '/' + arg;
  const prev = appEl.querySelector('.content');
  const scroll = key === ui.lastKey && prev ? prev.scrollTop : 0;
  appEl.innerHTML = html;
  ui.lastKey = key;
  const next = appEl.querySelector('.content');
  if (next && scroll) next.scrollTop = scroll;
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
  fitTable();
}

/* Si la tabla de estadísticas cabe a lo ancho no necesita desplazamiento horizontal, y entonces su cabecera
   puede quedarse fija al bajar por la página (ver .table-wrap.fits en los estilos) */
function fitTable() {
  const wrap = appEl.querySelector('.table-wrap');
  if (!wrap) return;
  wrap.classList.remove('fits');
  wrap.classList.toggle('fits', wrap.scrollWidth <= wrap.clientWidth + 1);
}
window.addEventListener('resize', fitTable);


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
  const title = isLight() ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
  return `<button class="icon-btn" data-action="theme" title="${title}" aria-label="${title}">${icon(isLight() ? 'sun' : 'moon')}</button>`;
}

function fsButton() {
  if (!document.fullscreenEnabled) return '';
  const on = !!document.fullscreenElement;
  const title = on ? 'Salir de pantalla completa' : 'Pantalla completa';
  return `<button class="icon-btn" data-action="fullscreen" title="${title}" aria-label="${title}">${icon(on ? 'compress' : 'expand')}</button>`;
}

function shell(active, content) {
  const t = team();
  const live = t ? sortedGames().find(g => !g.finished) : null;
  const tab = (id, href, label) => `<a class="tab ${active === id ? 'on' : ''}" href="${href}">${label}</a>`;
  return `
  <div class="page">
    <nav class="nav">
      <a class="brand ${active === 'equipos' ? 'on' : ''}" href="#/equipos" title="Cambiar de equipo">
        ${BALL}<span class="brand-name">${t ? esc(t.name) : 'My Own Basketball Stats'}</span>${t ? `<span class="brand-swap">${icon('updown')}</span>` : ''}
      </a>
      ${t ? `
      <div class="tabs">
        ${tab('equipo', '#/equipo', 'Equipo')}
        ${tab('partidos', '#/partidos', 'Partidos')}
        ${tab('stats', '#/stats', 'Estadísticas')}
        ${tab('ajustes', '#/ajustes', 'Ajustes')}
      </div>` : ''}
      <span class="grow"></span>
      ${live ? `<a class="btn live-link" href="#/partido/${live.id}"><span class="dot"></span>vs ${esc(live.opponent)}</a>` : ''}
      ${themeButton()}
      ${fsButton()}
    </nav>
    <main class="content">${moveBar()}${content}</main>
  </div>`;
}

/* ── Equipos (selección) ── */
function viewTeams() {
  const cards = db.teams.map(t => {
    const games = db.games.filter(g => g.teamId === t.id);
    // Como en la temporada: un partido sin finalizar aún no tiene resultado
    const { w, l } = winLoss(games);
    const live = games.some(g => !g.finished);
    // Fase y nivel actuales (sin «sube / baja de nivel», que no cabe en la tarjeta)
    const phase = phasesUsed(t) || t.levels[0] ? [phaseName(t.phase), t.levels[t.phase - 1]].filter(Boolean).join(' · ') : '';
    return `
    <li class="team-card ${t.id === db.currentTeamId ? 'current' : ''}">
      <button class="team-pick" data-action="pick-team" data-id="${t.id}">
        ${crest(t.name)}
        <span class="team-info">
          <span class="team-name">${esc(t.name)}</span>
          <small>${t.players.length} jugador${t.players.length === 1 ? '' : 'es'} · ${nGames(games.length)}${games.length ? ` · ${w}V ${l}D` : ''}</small>
          ${phase ? `<small class="team-phase">${esc(phase)}</small>` : ''}
          ${live ? '<span class="team-live"><span class="dot"></span>Partido en juego</span>' : ''}
        </span>
      </button>
      <button class="icon-btn danger" data-action="del-team" data-id="${t.id}" title="Eliminar equipo" aria-label="Eliminar equipo ${esc(t.name)}">${icon('trash')}</button>
    </li>`;
  }).join('');
  return shell('equipos', `
  <div class="cols">
    <section class="card grow">
      <h2>${db.teams.length ? '¿Con qué equipo vas a recoger estadísticas?' : 'Bienvenido/a 👋'}</h2>
      ${db.teams.length ? `<ul class="teams">${cards}</ul>` : `<p class="empty">${BALL}Crea tu primer equipo para empezar.<br>Después podrás añadir más (por ejemplo, uno por categoría).</p>`}
    </section>
    <section class="card side">
      <h2>Nuevo equipo</h2>
      <form data-form="team-new" class="stack" autocomplete="off">
        <label>Nombre del equipo<input name="name" maxlength="24" required placeholder="Ej.: Alevín A" autocapitalize="words"></label>
        <button class="btn primary big" type="submit">${icon('plus')} Crear equipo</button>
      </form>
      <p class="muted small">Cada equipo tiene su propia plantilla, partidos, estadísticas y botones del partido.</p>
      <p class="privacy-note">${icon('lock')}<span>Sin registro ni seguimiento: todo se guarda solo en este dispositivo. <a href="#/privacidad">Privacidad</a></span></p>
    </section>
  </div>`);
}

/* ── Privacidad ── */
function viewPrivacy() {
  return shell('privacidad', `
  <section class="card privacy">
    <button class="btn" data-action="back">${icon('back')} Volver</button>
    <h1>${icon('lock')} Tu privacidad</h1>
    <p class="lead">My Own Basketball Stats no recoge, no envía y no rastrea ningún dato. Lo que apuntas es tuyo y se queda en tu dispositivo.</p>

    <h2>Qué no hace la app</h2>
    <ul>
      <li>No tiene cuentas ni registro: no te pide email, contraseña ni ningún dato personal.</li>
      <li>No usa cookies, publicidad, analítica ni herramientas de seguimiento.</li>
      <li>No envía a ningún servidor los equipos, jugadores, partidos ni estadísticas que introduces.</li>
      <li>No carga recursos de terceros: las fuentes y los iconos van incluidos en la propia app.</li>
    </ul>

    <h2>Dónde se guardan tus datos</h2>
    <p>Todo se guarda únicamente en el almacenamiento local del navegador de este dispositivo. Nadie más tiene acceso a ello, ni siquiera yo.
    Solo sale de tu móvil si tú decides compartirlo: al enviar las estadísticas por email, compartirlas, descargar un CSV o exportar una copia de seguridad.</p>
    <p>Por eso mismo, si borras los datos del navegador, desinstalas la app o cambias de dispositivo, los datos se pierden.
    Te recomiendo exportar una copia de seguridad de vez en cuando desde <a href="#/ajustes">Ajustes</a>.</p>
    <p>Como la app trabaja con datos de menores, una buena práctica es usar solo el nombre de pila o un apodo de cada jugador.</p>

    <h2>Lo que queda fuera de la app</h2>
    <p>Como cualquier página web, el servicio que la aloja (Vercel) puede registrar datos técnicos de las visitas, como la dirección IP,
    para su funcionamiento y seguridad. La app no utiliza ni consulta esos datos.
    El enlace "Invítame a un café" lleva a Ko-fi, una web externa con su propia política de privacidad; solo se abre si lo pulsas.</p>

    <h2>Por qué existe My Own Basketball Stats</h2>
    <p>La construí como una herramienta para mi propio uso, porque en el baloncesto formativo hay mucho más que los puntos
    y quería una forma sencilla de seguir lo que hace cada jugador en la pista. Funcionaba tan bien que decidí compartirla de forma gratuita
    con la comunidad: entrenadores, familias y clubes.</p>
    <p>Es un proyecto personal, sin ánimo de lucro, sin anuncios y sin intereses detrás. Si te resulta útil y quieres apoyarlo,
    puedes <a href="${KOFI_URL}" target="_blank" rel="noopener">invitarme a un café</a>.</p>
    <button class="btn" data-action="back">${icon('back')} Volver</button>
  </section>`);
}

/* ── Equipo ── */
function viewTeam() {
  const players = sortedPlayers(team().players);
  const ed = ui.editId ? players.find(p => p.id === ui.editId) : null;
  return shell('equipo', `
  <div class="cols">
    <section class="card side">
      <h2>${ed ? 'Editar jugador' : 'Añadir jugador'}</h2>
      <form data-form="player" class="player-form" autocomplete="off">
        <label class="f-num">Dorsal<input name="number" inputmode="numeric" maxlength="3" required value="${ed ? esc(ed.number) : ''}"></label>
        <label class="f-name">Nombre<input name="name" maxlength="24" required value="${ed ? esc(ed.name) : ''}" autocapitalize="words"></label>
        <div class="form-actions">
          <button class="btn primary" type="submit">${ed ? `${icon('check')} Guardar` : `${icon('plus')} Añadir`}</button>
          ${ed ? '<button type="button" class="btn" data-action="cancel-edit">Cancelar</button>' : ''}
        </div>
      </form>

      <h2>Equipo</h2>
      <div class="stack">
        <label>Nombre del equipo<input data-change="team-name" maxlength="24" value="${esc(team().name)}"></label>
        <label>Email para enviar estadísticas <span class="muted">(opcional)</span><input data-change="team-email" type="email" placeholder="entrenador@club.com" value="${esc(team().email)}"></label>
      </div>
      <p class="muted small">Los botones del partido y la copia de seguridad están en <a href="#/ajustes">Ajustes</a>.</p>

      ${seasonForm(team())}
    </section>

    <section class="card grow">
      <h2>Plantilla <span class="muted">(${players.length})</span></h2>
      ${players.length ? `
      <ul class="roster">
        ${players.map(p => `
          <li class="${ed && ed.id === p.id ? 'editing' : ''}">
            <span class="num">${esc(p.number)}</span>
            <span class="name">${esc(p.name)}</span>
            <button class="icon-btn" data-action="edit-player" data-id="${p.id}" title="Editar" aria-label="Editar a ${esc(p.name)}">${icon('edit')}</button>
            <button class="icon-btn danger" data-action="del-player" data-id="${p.id}" title="Eliminar" aria-label="Eliminar a ${esc(p.name)}">${icon('trash')}</button>
          </li>`).join('')}
      </ul>` : `<p class="empty">Aún no hay jugadores.<br>Añade dorsal y nombre de cada jugador.</p>`}
    </section>
  </div>`);
}

/* Fase de la temporada en la que está el equipo y nivel en el que juega cada fase */
function seasonForm(t) {
  return `
      <h2>Temporada</h2>
      <div class="stack season-form">
        <div class="field">
          <span class="field-label">¿En qué fase estáis?</span>
          <div class="seg wide" role="group" aria-label="Fase actual">
            ${PHASES.map(n => `<button class="${t.phase === n ? 'on' : ''}" data-action="team-phase" data-v="${n}" aria-pressed="${t.phase === n}">${phaseName(n)}</button>`).join('')}
          </div>
        </div>
        ${PHASES.filter(n => n <= t.phase).map(n => `
        <label>Nivel en la ${phaseName(n)} <span class="muted">(opcional)</span><input data-change="team-level" data-phase="${n}" maxlength="24" placeholder="Ej.: Nivel B, Grupo 3…" value="${esc(t.levels[n - 1])}"></label>`).join('')}
        ${t.phase === 2 ? `
        <div class="field">
          <span class="field-label">Nivel de la 2ª fase respecto a la 1ª</span>
          <div class="seg wide" role="group" aria-label="Nivel respecto a la 1ª fase">
            ${Object.entries(MOVES).map(([k, m]) => `<button class="${t.move === k ? 'on' : ''}" data-action="team-move" data-v="${k}" aria-pressed="${t.move === k}">${m.short}</button>`).join('')}
          </div>
        </div>` : ''}
      </div>
      <p class="muted small">En minibasket la temporada suele tener dos fases independientes: según la clasificación de la 1ª, en la 2ª se juega contra equipos nuevos de un nivel superior, igual o inferior.
      Los partidos nuevos se apuntan en la fase actual y las estadísticas se pueden ver por fase.</p>`;
}

/* Botones de local / visitante de los formularios de partido. En un partido nuevo no hay ninguno marcado:
   hay que elegirlo (si no, se apuntarían como local partidos de fuera y el balance saldría mal). */
function venueField(cur) {
  return `
        <div class="field venue-field">
          <span class="field-label">Campo</span>
          <div class="seg-radio">
            ${[['home', 'En casa'], ['away', 'Fuera']].map(([v, d]) => `
              <label><input type="radio" name="venue" value="${v}" ${cur === v ? 'checked' : ''}><span><b>${VENUES[v]}</b><small>${d}</small></span></label>`).join('')}
          </div>
        </div>`;
}

/* ── Partidos ── */
const RESULT = { win: 'Victoria', loss: 'Derrota', tie: 'Empate' };

function viewGames() {
  const games = sortedGames();
  const hasPlayers = team().players.length > 0;
  const lastPeriods = (games[0] && games[0].periods) || 8;
  return shell('partidos', `
  <div class="cols">
    <section class="card side">
      <h2>Nuevo partido</h2>
      ${hasPlayers ? '' : `<p class="warn">Primero da de alta a los jugadores en <a href="#/equipo">Equipo</a>.</p>`}
      <form data-form="game" class="stack" autocomplete="off">
        <label>Rival<input name="opponent" maxlength="24" required placeholder="Nombre del rival"></label>
        <label>Fecha<input name="date" type="date" required value="${todayISO()}"></label>
        ${venueField('')}
        <div class="field">
          <span class="field-label">Duración</span>
          <div class="seg-radio">
            ${[[8, '8 periodos', 'Minibasket'], [4, '4 cuartos', 'Categorías superiores']].map(([n, t, d]) => `
              <label><input type="radio" name="periods" value="${n}" ${n === (lastPeriods === 4 ? 4 : 8) ? 'checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`).join('')}
          </div>
        </div>
        <p class="muted small phase-line">Se apunta en la <b>${esc(phaseLabel(team(), team().phase))}</b> · <a href="#/equipo">Cambiar</a></p>
        <button class="btn primary big" type="submit" ${hasPlayers ? '' : 'disabled'}>${icon('play', 'solid')} Empezar partido</button>
      </form>
    </section>

    <section class="card grow">
      <h2>Partidos <span class="muted">(${games.length})</span></h2>
      ${games.length ? gameList(games) : `<p class="empty">Todavía no hay partidos.</p>`}
    </section>
  </div>`);
}

/* Lista de partidos. Si el equipo ha llegado a la 2ª fase, se agrupan por fase (la más reciente arriba),
   cada una con su nivel y su balance de victorias y derrotas. */
function gameList(games) {
  const t = team();
  if (!phasesUsed(t)) return gameItems(games);
  return [...PHASES].reverse().map(n => {
    const list = games.filter(g => g.phase === n);
    if (!list.length) return '';
    const r = winLoss(list);
    return `
      <h3 class="sub phase-head"><span>${esc(phaseLabel(t, n))}</span><span class="phase-rec">${r.w}V ${r.l}D${r.t ? ` ${r.t}E` : ''}</span></h3>
      ${gameItems(list)}`;
  }).join('');
}

function gameItems(games) {
  return `<ul class="games">${games.map(g => {
    const s = score(g);
    const res = s.us > s.them ? 'win' : s.us < s.them ? 'loss' : 'tie';
    const d = dateParts(g.date);
    const mark = g.finished
      ? `<span class="g-res ${res}" title="${RESULT[res]}">${RESULT[res][0]}</span>`
      : '<span class="g-res now" title="En juego"><span class="dot"></span></span>';
    return `
    <li>
      <span class="g-date" title="${fmtDate(g.date)}"><b>${d.day}</b><small>${d.month}</small></span>
      <span class="g-main"><b>vs ${esc(g.opponent)}</b><small>${g.finished ? 'Finalizado' : `En juego · ${perAbbr(g, g.period)}`}${g.venue ? ` · ${VENUES[g.venue]}` : ''} · ${perCount(g)}</small></span>
      ${mark}
      <span class="g-score ${g.finished ? res : ''}">${s.us}<i>–</i>${s.them}</span>
      <a class="btn" href="#/partido/${g.id}">${g.finished ? 'Abrir' : 'Continuar'}</a>
      <a class="icon-btn" href="#/stats/${g.id}" title="Estadísticas" aria-label="Estadísticas del partido contra ${esc(g.opponent)}">${icon('chart')}</a>
      <button class="icon-btn" data-action="edit-game" data-id="${g.id}" title="Editar" aria-label="Editar el partido contra ${esc(g.opponent)}">${icon('edit')}</button>
      <button class="icon-btn danger" data-action="del-game" data-id="${g.id}" title="Borrar" aria-label="Borrar el partido contra ${esc(g.opponent)}">${icon('trash')}</button>
    </li>`;
  }).join('')}</ul>`;
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
      rows.push(`<div class="prow empty-row"><button class="add-player" data-action="swap" data-pid="">${icon('plus')} Añadir jugador a pista</button></div>`);
      continue;
    }
    const l = lines[pid] || finish(blankLine());
    const fouls = l.fc;
    const fcls = fouls >= MAX_FOULS ? 'f-out' : fouls === MAX_FOULS - 1 ? 'f-warn' : '';
    const btn = (t) => `<button class="act ${EV[t].cls}" data-action="ev" data-type="${t}" data-pid="${pid}" aria-label="${EV[t].text}">${actLabel(t)}</button>`;
    rows.push(`
      <div class="prow ${fcls}">
        <button class="pid" data-action="swap" data-pid="${pid}" title="Cambiar jugador">
          <span class="num">${esc(p.number)}${foulDots(fouls)}</span>
          <span class="pinfo"><span class="pname">${esc(p.name)}</span>
          <span class="pline"><b>${l.pts}</b> pts · <span class="fouls">${fouls} F</span>${fouls >= MAX_FOULS ? ' · ELIM.' : ''}</span></span>
        </button>
        ${actsHTML(btn)}
      </div>`);
  }
  return `
  <div class="live">
    <header class="live-top">
      <button class="icon-btn" data-action="menu" title="Menú" aria-label="Menú">${icon('menu')}</button>
      <div class="period" style="--p:${round1(g.period / g.periods * 100) / 100}">
        <button data-action="period" data-d="-1" aria-label="${perName(g)} anterior" ${g.period <= 1 ? 'disabled' : ''}>${icon('left')}</button>
        <div><b>${perAbbr(g, g.period)}</b><small>de ${g.periods}</small></div>
        <button data-action="period" data-d="1" aria-label="${perName(g)} siguiente">${icon('right')}</button>
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
      <button class="icon-btn" data-action="undo" title="Deshacer última acción" aria-label="Deshacer última acción">${icon('undo')}</button>
      <button class="icon-btn" data-action="lineup" title="Quinteto en pista" aria-label="Quinteto en pista">${icon('swap')}</button>
      <a class="icon-btn" href="#/stats/${g.id}" title="Estadísticas" aria-label="Estadísticas">${icon('chart')}</a>
    </header>
    <main class="court">${rows.join('')}</main>
  </div>`;
}

/* Contenido de un botón de acción: en los tiros, la marca de anotado o fallado es un icono */
function actLabel(t) {
  const { label, sub, cls } = EV[t];
  return `<b>${label}</b><i>${cls === 'made' ? icon('check') : cls === 'miss' ? icon('x') : sub}</i>`;
}

/* Faltas de un jugador como puntos bajo su dorsal (uno por falta, hasta las 5 de la eliminación) */
function foulDots(n) {
  return `<span class="fouls-dots" aria-hidden="true">${Array.from({ length: MAX_FOULS }, (_, i) => `<i${i < n ? ' class="on"' : ''}></i>`).join('')}</span>`;
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
  const sample = (t) => `<span class="act ${EV[t].cls}">${actLabel(t)}</span>`;
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
        <span class="pid"><span class="num">7${foulDots(0)}</span><span class="pinfo"><span class="pname">Jugador</span><span class="pline"><b>0</b> pts · 0 F</span></span></span>
        ${actsHTML(sample)}
      </div>
    </div>
  </section>
  <div class="cols">
    <section class="card grow">
      <div class="card-head">
        <h2>Botones del partido · ${esc(team().name)} <span class="muted">(${n}/${OPTIONS.length})</span></h2>
        ${team().hidden.length ? '<button class="btn" data-action="opts-all">Activar todos</button>' : ''}
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
        <button class="btn" data-action="export-json">${icon('download')} Exportar</button>
        <label class="btn">${icon('upload')} Importar<input type="file" accept="application/json,.json" data-change="import-json" hidden></label>
      </div>

      <h2>Privacidad</h2>
      <p class="muted small">My Own Basketball Stats no recoge ni envía tus datos: no hay registro, ni publicidad, ni seguimiento. Todo se guarda solo en este dispositivo.</p>
      <a class="btn" href="#/privacidad">${icon('lock')} Leer la política de privacidad</a>

      <h2>Apoya el proyecto</h2>
      <p class="muted small">La app es gratuita, sin anuncios y sin registro. Si te resulta útil en tus partidos, puedes invitarme a un café para que siga mejorando.</p>
      <a class="btn kofi" href="${KOFI_URL}" target="_blank" rel="noopener">${icon('coffee')} Invítame a un café</a>
    </section>
  </div>`);
}

/* ── Estadísticas ── */
/* g: grupo de la columna; entre un grupo y el siguiente la tabla pinta una línea de separación */
const COLS = [
  { k: 'number', h: '#', cls: 'c-num', g: 'id' },
  { k: 'name', h: 'Jugador', cls: 'c-name', g: 'id' },
  { k: 'gp', h: 'PJ', t: 'Partidos jugados', season: true, g: 'played' },
  { k: 'nper', h: 'PER', t: 'Periodos jugados', g: 'played' },
  { k: 'pts', h: 'PTS', t: 'Puntos', cls: 'hl', g: 'shots' },
  { k: 't1', h: 'T1', t: 'Tiros libres (anotados/intentados)', shot: 1, sortKey: 't1m', g: 'shots' },
  { k: 't2', h: 'T2', t: 'Tiros de 2 (anotados/intentados)', shot: 2, sortKey: 't2m', g: 'shots' },
  { k: 't3', h: 'T3', t: 'Triples (anotados/intentados)', shot: 3, sortKey: 't3m', g: 'shots' },
  { k: 'ro', h: 'RO', t: 'Rebotes de ataque', g: 'reb' },
  { k: 'rd', h: 'RD', t: 'Rebotes de defensa', g: 'reb' },
  { k: 'reb', h: 'RT', t: 'Rebotes totales', g: 'reb' },
  { k: 'ast', h: 'AS', t: 'Asistencias', g: 'ball' },
  { k: 'blk', h: 'TAP', t: 'Tapones puestos', g: 'ball' },
  { k: 'blkr', h: 'TR', t: 'Tapones recibidos', g: 'ball' },
  { k: 'rec', h: 'REC', t: 'Balones recuperados', g: 'ball' },
  { k: 'lost', h: 'PÉR', t: 'Balones perdidos', g: 'ball' },
  { k: 'fc', h: 'FC', t: 'Faltas cometidas', g: 'fouls' },
  { k: 'fr', h: 'FR', t: 'Faltas recibidas', g: 'fouls' },
  { k: 'val', h: 'VAL', t: 'Valoración', cls: 'hl c-val', g: 'val' },
];

/* Estadísticas de varios partidos: toda la temporada ('temporada') o una de sus fases ('fase-1', 'fase-2').
   Devuelve la fase (0 para la temporada completa) y sus partidos, o null si arg es otra cosa (un partido). */
function seasonScope(arg) {
  if (arg === 'temporada') return { phase: 0, games: sortedGames() };
  const m = /^fase-(\d)$/.exec(arg || '');
  if (!m || !PHASES.includes(+m[1])) return null;
  return { phase: +m[1], games: sortedGames().filter(g => g.phase === +m[1]) };
}

function statsData(arg) {
  const games = sortedGames();
  const scope = seasonScope(arg);
  if (scope) {
    let rows = seasonRows(scope.games);
    const total = totalsRow(rows, scope.games.length);
    if (ui.avg) rows = rows.map(averageRow);
    return { season: true, phase: scope.phase, scopeGames: scope.games, rows, total: ui.avg ? averageRow(total) : total, games };  // scopeGames: del más reciente al más antiguo
  }
  const g = getGame(arg);
  if (!g) return null;
  const rows = gameRows(g);
  return { season: false, game: g, rows, total: totalsRow(rows, 1), games };
}

function viewStats(arg) {
  const games = sortedGames();
  if (!games.length) {
    return shell('stats', `<section class="card"><p class="empty">${BALL}Aún no hay partidos registrados.<br><a href="#/partidos">Crea el primero</a>.</p></section>`);
  }
  if (!arg) { arg = games[0].id; history.replaceState(null, '', `#/stats/${arg}`); }
  const data = statsData(arg);
  // Un partido que no existe, o una fase cuando el equipo no usa fases (no está en el selector): la temporada
  if (!data || (data.phase && !phasesUsed(team()))) { history.replaceState(null, '', '#/stats/temporada'); return viewStats('temporada'); }

  // Temporada completa, cada fase (si el equipo ha llegado a la 2ª) y cada partido, agrupados por fase
  const used = phasesUsed(team());
  const scopes = [['temporada', `Temporada · ${nGames(games.length)}`]];
  if (used) for (const n of PHASES) scopes.push([`fase-${n}`, `${phaseName(n)} · ${nGames(games.filter(g => g.phase === n).length)}`]);
  const gameOpt = (g) => { const s = score(g); return `<option value="${g.id}" ${!data.season && data.game.id === g.id ? 'selected' : ''}>${fmtDate(g.date, true)} · vs ${esc(g.opponent)} (${s.us}-${s.them})</option>`; };
  const options = scopes.map(([v, label]) => `<option value="${v}" ${data.season && arg === v ? 'selected' : ''}>${label}</option>`).join('') +
    (used
      ? [...PHASES].reverse().map(n => { const list = games.filter(g => g.phase === n); return list.length ? `<optgroup label="${phaseName(n)}">${list.map(gameOpt).join('')}</optgroup>` : ''; }).join('')
      : games.map(gameOpt).join(''));
  const g = data.game;
  const level = data.phase ? phaseLevel(team(), data.phase) : '';

  const head = `
    <div class="stats-head">
      <select data-change="stats-select" class="stats-select" aria-label="Partido, fase o temporada">${options}</select>
      ${level ? `<span class="phase-info">${esc(level)}</span>` : ''}
      ${data.season ? `
        <div class="seg">
          <button class="${ui.avg ? '' : 'on'}" data-action="avg" data-v="0">Totales</button>
          <button class="${ui.avg ? 'on' : ''}" data-action="avg" data-v="1">Por partido</button>
        </div>` : ''}
      <span class="grow"></span>
      ${!data.season && !g.finished ? `<button class="btn" data-action="finish" data-id="${g.id}" title="Finalizar partido">${icon('flag')} Finalizar</button>` : ''}
      ${!data.season ? `<a class="btn" href="#/partido/${g.id}">${g.finished ? 'Abrir partido' : `${icon('play', 'solid')} Volver al partido`}</a>` : ''}
      <button class="btn" data-action="share" data-arg="${esc(arg)}">${icon('mail')} Enviar</button>
      <button class="btn" data-action="csv" data-arg="${esc(arg)}">${icon('download')} CSV</button>
    </div>`;

  return shell('stats', `
    ${head}
    ${data.season ? seasonSummary(data.scopeGames) : gameSummary(g)}
    ${leaders(data)}
    <section class="card table-card">${statsTable(data)}</section>
    <p class="muted small formula"><b>VAL</b> (valoración ACB) = puntos + rebotes + asistencias + recuperaciones + tapones + faltas recibidas − tiros fallados (cada uno resta 1) − tapones recibidos − pérdidas − faltas cometidas.
    Toca la cabecera de una columna para ordenar.</p>
    <p class="support">¿Te es útil la app? <a href="${KOFI_URL}" target="_blank" rel="noopener">${icon('coffee')} Invítame a un café</a></p>
  `);
}

function gameSummary(g) {
  const s = score(g);
  const meta = gameMeta(g);
  const ps = periodScores(g);
  const res = s.us > s.them ? 'win' : s.us < s.them ? 'loss' : 'tie';
  return `
  <section class="card summary">
    <div class="final">
      <div class="ft us"><small>${esc(g.teamName)}</small><b>${s.us}</b></div>
      <div class="ft-mid">${g.finished ? `<span class="badge ${res}">${RESULT[res]}</span>` : '<span class="badge"><span class="dot"></span>En juego</span>'}<small>${fmtDate(g.date)}</small>${meta ? `<small class="g-meta">${meta}</small>` : ''}</div>
      <div class="ft them"><small>${esc(g.opponent)}</small><b>${s.them}</b></div>
    </div>
    <div class="ptable-wrap">
      <table class="ptable">
        <tr><th></th>${ps.us.map((_, i) => `<th>${perAbbr(g, i + 1)}</th>`).join('')}<th class="t">Total</th></tr>
        <tr><td class="l us">${esc(g.teamName)}</td>${ps.us.map((v, i) => `<td class="${v > ps.them[i] ? 'w' : ''}">${v}</td>`).join('')}<td class="t">${s.us}</td></tr>
        <tr><td class="l them">${esc(g.opponent)}</td>${ps.them.map((v, i) => `<td class="${v > ps.us[i] ? 'w' : ''}">${v}</td>`).join('')}<td class="t">${s.them}</td></tr>
        ${flowRow(g)}
      </table>
    </div>
  </section>`;
}

/* Evolución del marcador (core.js): un punto por anotación, { period, x, us, them } */
function scoreFlow(g) { return MBCore.scoreFlow(g); }

/* Hasta dónde llega la línea: el final del partido si está finalizado; si no, la última anotación
   (o el inicio del periodo en curso, si aún no se ha anotado en él) */
function flowEnd(g, flow) {
  if (g.finished) return g.periods;
  const last = flow.length ? flow[flow.length - 1].x : 0;
  return Math.max(last, Math.min(g.period, g.periods) - 1);
}

/* Escala vertical del gráfico: siempre incluye el cero y deja un margen mínimo a cada lado */
function flowScale(flow) {
  const diffs = flow.map(p => p.us - p.them);
  const hi = Math.max(2, ...diffs), lo = Math.min(-2, ...diffs);
  return { hi, lo, y: (d) => round1((hi - d) / (hi - lo) * 100) };
}

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const sideOf = (n) => (n > 0 ? 'us' : n < 0 ? 'them' : '');

/* Fila de la tabla de parciales con la diferencia de puntos a lo largo del partido: por encima de la línea
   central vamos por delante (verde); por debajo, el rival (azul). Es una línea escalonada: la diferencia
   solo cambia cuando alguien anota. */
function flowRow(g) {
  const flow = scoreFlow(g);
  if (!flow.length) return '';
  const { hi, lo, y } = flowScale(flow);
  const end = flowEnd(g, flow);
  const X = (x) => round1(x * 100);
  const steps = flow.map(p => [X(p.x), p.us - p.them]);
  const last = steps[steps.length - 1][1];

  // Área y contorno de un lado (side = 1 nosotros, −1 rival): la misma escalera recortada en el cero
  const half = (side) => {
    const clamp = (d) => (side > 0 ? Math.max(d, 0) : Math.min(d, 0));
    let area = `M0 ${y(0)}`, line = '', px = 0, pd = 0;
    for (const [x, d] of [...steps, [X(end), last]]) {
      area += `H${x}V${y(clamp(d))}`;
      if (clamp(pd) !== 0) line += `M${px} ${y(pd)}H${x}`;
      if (clamp(pd) !== clamp(d)) line += `M${x} ${y(clamp(pd))}V${y(clamp(d))}`;
      px = x; pd = d;
    }
    return { area: `${area}V${y(0)}Z`, line };
  };
  const us = half(1), them = half(-1);
  const grid = Array.from({ length: g.periods - 1 }, (_, i) => `M${(i + 1) * 100} 0V100`).join('');
  const diffs = steps.map(([, d]) => d);
  const best = Math.max(0, ...diffs), worst = Math.min(0, ...diffs);
  const label = `Diferencia de puntos a lo largo del partido. Máxima ventaja de ${g.teamName}: ${best}. Máxima ventaja de ${g.opponent}: ${-worst}. ${g.finished ? 'Final' : 'Ahora'}: ${signed(last)}.`;
  return `
        <tr class="flow-row">
          <td class="l flow-label" data-label="Diferencia">Diferencia</td>
          <td class="flow-cell" colspan="${g.periods}">
            <div class="flow" data-flow="${g.id}" role="img" aria-label="${esc(label)}">
              <svg viewBox="0 0 ${g.periods * 100} 100" preserveAspectRatio="none" aria-hidden="true">
                <path class="grid" d="${grid}"/>
                <path class="area us" d="${us.area}"/><path class="area them" d="${them.area}"/>
                <path class="base" d="M0 ${y(0)}H${g.periods * 100}"/>
                <path class="line us" d="${us.line}"/><path class="line them" d="${them.line}"/>
              </svg>
              <i class="flow-cross" hidden></i>
              <i class="flow-end ${sideOf(last)}" style="left:${round1(end / g.periods * 100)}%;top:${y(last)}%"></i>
              <i class="flow-dot" hidden></i>
            </div>
          </td>
          <td class="t flow-diff ${sideOf(last)}">${signed(last)}</td>
        </tr>`;
}

/* Al pasar el dedo o el ratón por la evolución del marcador se ve cómo iba el partido en ese momento */
function flowScrub(e) {
  const el = e.target instanceof Element ? e.target.closest('.flow') : null;
  for (const other of document.querySelectorAll('.flow.scrub')) if (other !== el || e.type === 'pointerup' || e.type === 'pointercancel') flowReset(other);
  if (!el || e.type === 'pointerup' || e.type === 'pointercancel') return;
  const g = getGame(el.dataset.flow);
  const box = el.getBoundingClientRect();
  if (!g || !box.width) return;
  const flow = scoreFlow(g);
  const end = flowEnd(g, flow);
  const x = Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1) * g.periods;
  const at = Math.min(x, end);
  let p = { us: 0, them: 0 };
  for (const q of flow) { if (q.x > at) break; p = q; }
  const period = Math.min(Math.floor(at) + 1, g.periods);
  const d = p.us - p.them;
  const left = `${round1(at / g.periods * 100)}%`;
  const cross = el.querySelector('.flow-cross'), dot = el.querySelector('.flow-dot');
  cross.hidden = dot.hidden = false;
  cross.style.left = dot.style.left = left;
  dot.style.top = `${flowScale(flow).y(d)}%`;
  dot.className = `flow-dot ${sideOf(d)}`;
  el.classList.add('scrub');
  const row = el.closest('tr');
  row.querySelector('.flow-label').innerHTML = `<b>${perAbbr(g, period)} · ${p.us}–${p.them}</b>`;
  const diff = row.querySelector('.flow-diff');
  diff.textContent = signed(d);
  diff.className = `t flow-diff ${sideOf(d)}`;
}

function flowReset(el) {
  el.classList.remove('scrub');
  el.querySelector('.flow-cross').hidden = el.querySelector('.flow-dot').hidden = true;
  const g = getGame(el.dataset.flow);
  const row = el.closest('tr');
  const label = row.querySelector('.flow-label');
  label.textContent = label.dataset.label;
  if (!g) return;
  const flow = scoreFlow(g);
  const last = flow.length ? flow[flow.length - 1].us - flow[flow.length - 1].them : 0;
  const diff = row.querySelector('.flow-diff');
  diff.textContent = signed(last);
  diff.className = `t flow-diff ${sideOf(last)}`;
}

for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) document.addEventListener(type, flowScrub);
document.documentElement.addEventListener('pointerleave', () => document.querySelectorAll('.flow.scrub').forEach(flowReset));

function seasonSummary(games) {
  // Un partido sin finalizar aún no tiene resultado: no cuenta como victoria, derrota ni empate,
  // ni entra en los promedios de puntos (un marcador a medias los rebajaría).
  const { w, l, t, done, pf, pc } = winLoss(games);
  const open = games.length - done;
  const avg = (v) => (done ? round1(v / done) : '–');
  const box = (v, lbl, cls = '') => `<div class="kpi ${cls}"><b>${v}</b><small>${lbl}</small></div>`;
  // Balance de local y de visitante, si algún partido finalizado lo tiene apuntado
  const venues = Object.keys(VENUES).map(v => [v, winLoss(games.filter(g => g.venue === v))]).filter(([, r]) => r.done);
  const venueBox = ([v, r]) => { return box(`${r.w}–${r.l}${r.t ? `–${r.t}` : ''}`, `${VENUES[v]} (V–D${r.t ? '–E' : ''})`); };
  return `
  <section class="card summary">
    <div class="kpis">
      <div class="kpi-row">
        ${box(games.length, 'Partidos')}
        ${box(w, 'Victorias', 'win')}
        ${box(l, 'Derrotas', 'loss')}
        ${t ? box(t, 'Empates') : ''}
        ${open ? box(open, 'En juego') : ''}
      </div>
      <div class="kpi-row">
        ${box(avg(pf), 'Puntos a favor / partido')}
        ${box(avg(pc), 'Puntos en contra / partido')}
      </div>
      ${venues.length ? `<div class="kpi-row">${venues.map(venueBox).join('')}</div>` : ''}
    </div>
    ${seasonTrend(games)}
  </section>`;
}

/* Temporada de un vistazo: la diferencia de puntos de cada partido, del más antiguo al más reciente. Las victorias
   suben desde la línea central y las derrotas bajan; cada columna lleva a las estadísticas de su partido.
   Los partidos sin finalizar se dibujan solo con el contorno, y los que no tienen ninguna jugada no salen. */
const TREND_MAX = 24;

function seasonTrend(games) {
  const all = games
    .filter(g => g.finished || g.events.length)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0));
  const items = all.slice(-TREND_MAX).map(g => { const s = score(g); return { g, s, d: s.us - s.them }; });
  if (!items.length) return '';
  const hi = Math.max(0, ...items.map(i => i.d)), lo = Math.min(0, ...items.map(i => i.d));
  const range = hi - lo || 1;
  const n = items.length;
  const every = Math.ceil(n / 8);   // con muchos partidos, la fecha solo cada varios
  const cols = items.map(({ g, s, d }, i) => {
    const dir = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
    const state = !g.finished ? 'open' : d > 0 ? 'win' : d < 0 ? 'loss' : 'tie';
    // Con pocos partidos se rotulan todos; con muchos, solo el mejor, el peor y el último
    const labelled = n <= 10 || i === n - 1 || d === hi || d === lo;
    const title = `${fmtDate(g.date, true)} · vs ${g.opponent}: ${s.us}–${s.them}${g.finished ? '' : ' (en juego)'}`;
    return `<a class="tcol ${dir} ${state}" href="#/stats/${g.id}" style="--h:${round1(Math.abs(d) / range * 100)}%" title="${esc(title)}" aria-label="${esc(title)}">`
      + `<i class="tbar"></i>${labelled ? `<b class="tval">${signed(d)}</b>` : ''}${(n - 1 - i) % every === 0 ? `<small class="tx">${fmtDate(g.date, true)}</small>` : ''}</a>`;
  }).join('');
  return `
    <figure class="trend">
      <figcaption>Diferencia de puntos por partido${all.length > n ? ` · últimos ${n}` : ''}</figcaption>
      <div class="trend-plot ${lo < 0 ? 'has-neg' : ''}" style="--base:${round1(hi / range * 100)}%">${cols}</div>
    </figure>`;
}

function leaders(data) {
  const rows = data.rows.filter(r => r.gp > 0);
  if (!rows.length) return '';
  const best = (k) => rows.reduce((a, b) => (b[k] > a[k] ? b : a), rows[0]);
  const card = (k, lbl) => {
    if (!colVisible(k, data)) return '';
    const r = best(k);
    if (!r || r[k] <= 0) return `<div class="leader"><small>${lbl}</small><b>–</b></div>`;
    return `<div class="leader"><small>${lbl}</small><b>${r[k]}</b><span><i>#${esc(r.number)}</i> ${esc(r.name)}</span></div>`;
  };
  return `<section class="leaders">
    ${card('val', 'Mejor valoración')}${card('pts', 'Máx. anotador')}${card('reb', 'Más rebotes')}${card('ast', 'Más asistencias')}${card('rec', 'Más recuperaciones')}${card('blk', 'Más tapones')}
  </section>`;
}

function cellValue(r, c) {
  if (c.shot) {
    const m = r[`t${c.shot}m`], a = r[`t${c.shot}a`];
    const meter = a ? `<i class="meter" style="--p:${Math.min(round1(m / a * 100) / 100, 1)}"><i></i></i>` : '';
    return `<span class="shot">${m}/${a}<small>${meter}${pct(m, a)}</small></span>`;
  }
  if (c.k === 'name') return esc(r.name);
  if (c.k === 'number') return esc(r.number);
  if (c.k === 'nper' && r.perList && r.perList.length) return `<span title="Periodos: ${r.perList.join(', ')}">${r.nper}</span>`;
  if (c.k === 'val') return `<span class="val ${r.val > 0 ? 'pos' : r.val < 0 ? 'neg' : ''}">${r.val}</span>`;
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
  // Clases comunes a toda la columna: la suya, el inicio de un grupo de columnas y si es la ordenada
  const colCls = cols.map((c, i) => `${c.cls || ''}${i && cols[i - 1].g !== c.g && c.g !== 'played' ? ' gs' : ''}${key === c.k ? ' sorted' : ''}`);
  // Los ceros se atenúan para que destaque lo que sí ha pasado (en los tiros, no haber tirado)
  const isZero = (r, c) => (c.shot ? r[`t${c.shot}a`] === 0 : c.k !== 'val' && r[c.k] === 0);
  const cell = (r, c, i) => `<td class="${colCls[i]}${isZero(r, c) ? ' zero' : ''}${c.k === 'fc' && !data.season && r.fc >= MAX_FOULS ? ' neg' : ''}">${cellValue(r, c)}</td>`;
  return `
  <div class="table-wrap">
    <table class="stats">
      <thead><tr>${cols.map((c, i) => `<th class="${colCls[i]}" data-action="sort" data-k="${c.k}" title="${c.t || ''}"${key === c.k ? ` aria-sort="${dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c.h}${key === c.k ? `<i class="sort-ind ${dir > 0 ? 'asc' : 'desc'}"></i>` : ''}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map(r => `<tr class="${r.gp ? '' : 'dnp'}">${cols.map((c, i) => cell(r, c, i)).join('')}</tr>`).join('')}
      </tbody>
      <tfoot><tr>${cols.map((c, i) => (c.k === 'number' ? `<td class="${colCls[i]}"></td>` : cell(data.total, c, i))).join('')}</tr></tfoot>
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
  else if (m.kind === 'edit-game') html = renderEditGame(m);
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

function confirmBox(msg, ok = 'Aceptar', danger = false, cancel = 'Cancelar') {
  return new Promise(resolve => openModal({ kind: 'confirm', msg, ok, danger, cancel, resolve }));
}

function renderConfirm(m) {
  return `<p class="confirm-msg">${m.msg}</p>
  <div class="modal-actions">
    <button class="btn" data-action="confirm-no">${m.cancel || 'Cancelar'}</button>
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
  const meta = gameMeta(g);
  return `
  <div class="modal-head"><h3>vs ${esc(g.opponent)} · ${fmtDate(g.date)}${meta ? ` <small class="muted">· ${meta}</small>` : ''}</h3></div>
  <div class="menu-list">
    <button class="btn" data-action="lineup">${icon('swap')} Jugadores en pista</button>
    <button class="btn" data-action="log">${icon('list')} Jugadas registradas (${g.events.length})</button>
    <a class="btn" href="#/stats/${g.id}">${icon('chart')} Estadísticas del partido</a>
    <button class="btn" data-action="edit-game" data-id="${g.id}">${icon('edit')} Editar partido</button>
    <button class="btn" data-action="theme">${isLight() ? `${icon('moon')} Modo oscuro` : `${icon('sun')} Modo claro`}</button>
    ${document.fullscreenEnabled ? `<button class="btn" data-action="fullscreen">${icon(document.fullscreenElement ? 'compress' : 'expand')} Pantalla completa</button>` : ''}
    ${g.finished
      ? `<button class="btn" data-action="reopen" data-id="${g.id}">${icon('reopen')} Reabrir partido</button>`
      : `<button class="btn finish" data-action="finish" data-id="${g.id}">${icon('flag')} Finalizar partido</button>`}
    <a class="btn" href="#/partidos">${icon('exit')} Salir a partidos</a>
  </div>`;
}

/* Rival, fecha, campo y fase de un partido ya creado (la duración no se cambia: la usan sus jugadas) */
function renderEditGame(m) {
  const g = getGame(m.gid);
  const t = db.teams.find(t => t.id === g.teamId);
  return `
  <div class="modal-head"><h3>Editar partido</h3></div>
  <form data-form="game-edit" class="stack" autocomplete="off">
    <div class="form-pair">
      <label>Rival<input name="opponent" maxlength="24" required value="${esc(g.opponent)}"></label>
      <label>Fecha<input name="date" type="date" ${ISO_DATE.test(g.date) ? 'required ' : ''}value="${esc(g.date)}"></label>
    </div>
    ${venueField(g.venue)}
    <div class="field">
      <span class="field-label">Fase</span>
      <div class="seg-radio">
        ${PHASES.map(n => `
          <label><input type="radio" name="phase" value="${n}" ${g.phase === n ? 'checked' : ''}><span><b>${phaseName(n)}</b><small>${esc(phaseLevel(t, n)) || '&nbsp;'}</small></span></label>`).join('')}
      </div>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn" data-action="modal-close">Cancelar</button>
      <button class="btn primary" type="submit">${icon('check')} Guardar</button>
    </div>
  </form>`;
}

function eventText(g, e) {
  if (e.type === 'opp') return `<span class="them">${esc(g.opponent)}</span> ${e.pts > 0 ? '+' + e.pts : e.pts}`;
  const p = g.roster.find(x => x.id === e.pid);
  return `<b>${esc(pLabel(p))}</b> · ${EV[e.type] ? EV[e.type].text : esc(e.type)}`;
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
        <button class="icon-btn danger" data-action="del-event" data-id="${e.id}" title="Eliminar" aria-label="Eliminar jugada">${icon('x')}</button>
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
  const t = db.teams.find(t => t.id === g.teamId);
  if (g.finished || !t) return;
  for (const p of t.players) {
    const r = g.roster.find(x => x.id === p.id);
    if (r) { r.number = p.number; r.name = p.name; }
    else g.roster.push({ id: p.id, number: p.number, name: p.name });
  }
}

/* Registro de quintetos (formato v3): una foto de quién está en pista cada vez que cambia el quinteto o el periodo,
   con los toques de siempre. Si desde la última foto no se ha apuntado ninguna jugada, se corrige esa foto en vez de
   añadir otra: tocar varias veces en el selector de quinteto o pasar un periodo sin jugadas deja una sola entrada.
   Así, cada foto salvo la última tiene al menos una jugada. En un partido sin registro (anterior a la v3, o
   finalizado antes de actualizar y reabierto) el registro empieza aquí. */
function logLineup(g) {
  const on = [...g.onCourt];
  const last = g.lineups[g.lineups.length - 1];
  if (last && !g.events.some(e => e.seq > last.seq)) {
    last.period = g.period;
    last.on = on;
    return;
  }
  if (last && last.period === g.period && last.on.length === on.length && last.on.every(x => on.includes(x))) return;
  const seq = ++g.seq;
  g.lineups.push({ seq, period: g.period, on });
  if (!Number.isInteger(g.lineupFrom)) g.lineupFrom = seq;
}

function record(g, type, pid) {
  const e = { id: uid(), seq: ++g.seq, ts: Date.now(), period: g.period, type, pid };
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
  // Una corrección no puede dejar en negativo el parcial del periodo actual (como en el marcador).
  // Para quitar puntos de otro periodo se borra la jugada en el listado.
  if (pts < 0 && periodScores(g).them[g.period - 1] + pts < 0) {
    toast(`El rival no tiene puntos en ${perAbbr(g, g.period)} · para corregir otro periodo: ☰ › Jugadas`);
    return;
  }
  const e = { id: uid(), seq: ++g.seq, ts: Date.now(), period: g.period, type: 'opp', pts };
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
    const p = team().players.find(x => x.id === el.dataset.id);
    if (!p) return;
    if (!await confirmBox(`¿Eliminar a <b>${esc(pLabel(p))}</b> del equipo?<br><small class="muted">Sus estadísticas en partidos ya jugados se conservan.</small>`, 'Eliminar', true)) return;
    team().players = team().players.filter(x => x.id !== p.id);
    if (ui.editId === p.id) ui.editId = null;
    save(); render();
  },
  'export-json'() {
    const blob = new Blob([JSON.stringify({ ...db, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    download(blob, `minibasket-stats-${todayISO()}.json`);
  },

  /* Equipos */
  'pick-team'(el) {
    selectTeam(el.dataset.id);
    go(team().players.length ? '#/partidos' : '#/equipo');
  },
  async 'del-team'(el) {
    const t = db.teams.find(x => x.id === el.dataset.id);
    if (!t) return;
    const n = db.games.filter(g => g.teamId === t.id).length;
    if (!await confirmBox(`¿Eliminar el equipo <b>${esc(t.name)}</b>?<br><small class="muted">Se borrarán sus ${t.players.length} jugadores y ${n} partidos con todas sus estadísticas. No se puede deshacer.</small>`, 'Eliminar equipo', true)) return;
    db.teams = db.teams.filter(x => x.id !== t.id);
    db.games = db.games.filter(g => g.teamId !== t.id);
    if (db.currentTeamId === t.id) db.currentTeamId = db.teams.length ? db.teams[0].id : null;
    save(); render();
    toast(`Equipo ${esc(t.name)} eliminado`);
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
      if (await confirmBox(`Es el último periodo. ¿Finalizar el partido?`, `${icon('flag')} Finalizar`)) finishGame(g);
      return;
    }
    const was = g.period;
    g.period = Math.min(Math.max(g.period + d, 1), g.periods);
    if (g.period !== was) logLineup(g);
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
    logLineup(g);
    save(); vibrate(8); refreshModal();
  },
  'clear-court'() {
    const g = getGame(ui.modal.gid);
    g.onCourt = [];
    logLineup(g);
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
    logLineup(g);
    markPlayed(g);
    save(); vibrate(); closeModal(true); render();
  },
  'bench-out'() {
    const m = ui.modal;
    const g = getGame(m.gid);
    g.onCourt = g.onCourt.filter(x => x !== m.outId);
    logLineup(g);
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
    if (await confirmBox(`¿Finalizar el partido contra <b>${esc(g.opponent)}</b>?<br><small class="muted">Podrás reabrirlo desde el menú del partido.</small>`, `${icon('flag')} Finalizar`)) finishGame(g);
  },
  'edit-game'(el) {
    const g = getGame(el.dataset.id);
    if (g) openModal({ kind: 'edit-game', gid: g.id });
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
  back() { if (history.length > 1) history.back(); else go(team() ? '#/ajustes' : '#/equipos'); },
  'toggle-opt'(el) {
    const id = el.dataset.id;
    const hidden = team().hidden;
    if (hidden.includes(id)) team().hidden = hidden.filter(x => x !== id);
    else if (OPTIONS.length - hidden.length <= 1) { toast('Tiene que quedar al menos un botón'); return; }
    else hidden.push(id);
    save(); vibrate(8); render();
  },
  'team-phase'(el) {
    const n = +el.dataset.v;
    if (!PHASES.includes(n) || team().phase === n) return;
    team().phase = n;
    save(); vibrate(8); render();
    toast(`Los partidos nuevos se apuntarán en la ${phaseName(n)}`);
  },
  'team-move'(el) {
    const t = team();
    t.move = t.move === el.dataset.v ? '' : el.dataset.v;   // al tocar la opción elegida, se quita
    save(); vibrate(8); render();
  },
  'opts-all'() { team().hidden = []; save(); render(); toast('Todos los botones activados'); },
  theme() { toggleTheme(); },
  'modal-close'() { closeModal(); },
  'confirm-yes'() { const m = ui.modal; ui.modal = null; refreshModal(); m.resolve(true); },
  'confirm-no'() { closeModal(); },
};

/* Al empezar un partido nuevo se ofrece finalizar los del equipo que siguen abiertos: el caso típico es
   cerrar el móvil al acabar sin pulsar «Finalizar». Los partidos sin ninguna jugada se dejan como están,
   porque finalizarlos los convertiría en un empate 0-0. */
async function offerFinishPending() {
  const pending = teamGames().filter(g => !g.finished && g.events.length);
  if (!pending.length) return;
  const one = pending.length === 1;
  const label = (g) => { const s = score(g); return `contra <b>${esc(g.opponent)}</b> del ${fmtDate(g.date, true)} (${s.us}-${s.them})`; };
  const msg = one
    ? `El partido ${label(pending[0])} sigue sin finalizar. ¿Lo finalizas antes de empezar el nuevo?`
    : `Hay ${pending.length} partidos sin finalizar:<br>${pending.map(g => `· ${label(g)}`).join('<br>')}<br>¿Los finalizas antes de empezar el nuevo?`;
  const ok = await confirmBox(
    `${msg}<br><small class="muted">Solo los partidos finalizados cuentan como victoria, derrota o empate. Podrás reabrir${one ? 'lo' : 'los'} desde el menú del partido.</small>`,
    `${icon('flag')} ${one ? 'Finalizarlo' : 'Finalizarlos'}`, false, 'Dejar sin finalizar');
  if (!ok) return;
  for (const g of pending) g.finished = true;
  save();
  toast(one ? '🏁 Partido finalizado' : `🏁 ${pending.length} partidos finalizados`);
}

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

document.addEventListener('submit', async (e) => {
  const form = e.target;
  const kind = form.dataset.form;
  if (!kind) return;
  e.preventDefault();
  const fd = new FormData(form);

  if (kind === 'player') {
    const number = String(fd.get('number') || '').trim();
    const name = String(fd.get('name') || '').trim();
    if (!number || !name) return;
    const dup = team().players.find(p => p.number === number && p.id !== ui.editId);
    if (dup) { toast(`⚠️ El dorsal ${esc(number)} ya es de ${esc(dup.name)}`); return; }
    if (ui.editId) {
      const p = team().players.find(x => x.id === ui.editId);
      if (p) { p.number = number; p.name = name; }
      ui.editId = null;
      toast(`Guardado ${esc(pLabel({ number, name }))}`);
    } else {
      team().players.push({ id: uid(), number, name });
      toast(`Añadido ${esc(pLabel({ number, name }))}`);
    }
    save();
    ui.focus = 'input[name=number]';
    render();
  }

  if (kind === 'team-new') {
    const name = String(fd.get('name') || '').trim();
    if (!name) return;
    const cur = team();
    const t = { id: uid(), name, email: cur ? cur.email : '', players: [], hidden: [], phase: 1, levels: ['', ''], move: '' };
    db.teams.push(t);
    db.currentTeamId = t.id;
    ui.editId = null;
    save();
    ui.focus = 'input[name=number]';
    go('#/equipo');
    toast(`Equipo ${esc(name)} creado. Añade sus jugadores.`);
  }

  if (kind === 'game-edit') {
    const g = ui.modal && getGame(ui.modal.gid);
    if (!g) return;
    g.opponent = String(fd.get('opponent') || '').trim() || g.opponent;
    const date = String(fd.get('date') || '');
    if (ISO_DATE.test(date)) g.date = date;   // vacío: se conserva la fecha que tenía
    g.venue = asVenue(fd.get('venue'));
    g.phase = asPhase(fd.get('phase'));
    save(); closeModal(true); render();
    toast('Partido actualizado');
  }

  if (kind === 'game') {
    if (!team().players.length) return;
    if (!asVenue(fd.get('venue'))) {
      form.querySelector('.venue-field').classList.add('need');
      toast('Elige si jugáis de local o de visitante');
      vibrate(40);
      return;
    }
    const opponent = String(fd.get('opponent') || '').trim() || 'Rival';
    await offerFinishPending();
    const g = {
      id: uid(),
      createdAt: Date.now(),
      date: String(fd.get('date') || todayISO()),
      opponent,
      teamId: team().id,
      teamName: team().name,
      periods: parseInt(fd.get('periods'), 10) || 8,
      period: 1,
      roster: sortedPlayers(team().players).map(p => ({ id: p.id, number: p.number, name: p.name })),
      onCourt: [],
      played: {},
      events: [],
      finished: false,
      phase: team().phase,
      venue: asVenue(fd.get('venue')),
      seq: 0,
      lineups: [],
    };
    logLineup(g);   // el registro de quintetos empieza con el partido
    db.games.push(g);
    save();
    ui.pendingModal = { kind: 'lineup', gid: g.id, title: `Quinteto inicial · ${perName(g)} 1` };
    go(`#/partido/${g.id}`);
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.name === 'venue') { const f = el.closest('.venue-field'); if (f) f.classList.remove('need'); }
  const k = el.dataset && el.dataset.change;
  if (!k) return;
  if (k === 'team-name') {
    team().name = el.value.trim() || 'Mi equipo';
    for (const g of db.games) if (!g.finished && g.teamId === team().id) g.teamName = team().name;
    save(); render();
  } else if (k === 'team-level') {
    const n = +el.dataset.phase;
    if (!PHASES.includes(n)) return;
    team().levels[n - 1] = el.value.trim().slice(0, 24);
    save();
    toast(`Nivel de la ${phaseName(n)} guardado`);
  } else if (k === 'team-email') {
    team().email = el.value.trim();
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

/* Una copia de seguridad (actual o del formato v1, con un solo equipo) */
function isBackup(data) {
  return !!data && typeof data === 'object' && !!(data.team || Array.isArray(data.teams)) && Array.isArray(data.games);
}

async function importJSON(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!isBackup(data)) throw new Error('Formato no válido');
    // Una copia de una versión más nueva se puede importar, pero esta versión puede no entender todo lo que trae
    const newer = +data.version > FORMAT_VERSION
      ? '<br><small class="muted">⚠️ La copia se hizo con una versión más nueva de la app. Actualízala (recarga con conexión) antes de importarla para no perder datos.</small>'
      : '';
    const ok = await confirmBox(`¿Importar <b>${esc(file.name)}</b>?<br><small class="muted">Se reemplazarán todos los datos actuales (${db.teams.length} equipo${db.teams.length === 1 ? '' : 's'} y ${db.games.length} partidos) por los del archivo.</small>${newer}`, 'Importar', true);
    if (!ok) return;
    db = normalize(data);
    save(); render();
    toast('✅ Datos importados');
  } catch (err) {
    toast('⚠️ No se pudo importar: archivo no válido');
  }
}

/* ─────────────────────────── Mudanza ───────────────────────────
   localStorage va por dominio: quien use la app en una dirección antigua no ve sus datos en la nueva.
   En la antigua se ofrece un botón que abre la nueva con los datos en el fragmento de la URL
   (#traspaso=…). El fragmento no se envía nunca al servidor: los datos viajan de navegador a navegador. */

const TRANSFER_PREFIX = '#traspaso=';
/* Los navegadores aceptan URLs de unos 2 MB; por encima se pide exportar e importar la copia */
const MAX_TRANSFER = 1500000;

/* URL de la app en la dirección actual del sitio (la canonical, que se rellena al compilar) */
function newHome() {
  const link = document.querySelector('link[rel="canonical"]');
  try { return link ? new URL(link.getAttribute('href'), location.href).href : null; } catch (e) { return null; }
}

/* Se ofrece la mudanza solo en las direcciones antiguas y si la nueva es otra */
function moveTarget() {
  if (!OLD_HOSTS.includes(location.hostname)) return null;
  const home = newHome();
  return home && new URL(home).origin !== location.origin ? home : null;
}

function moveBar() {
  const target = moveTarget();
  if (!target) return '';
  const has = db.teams.length || db.games.length;
  return `<div class="move-bar">
    <span>La app se ha mudado a <b>${esc(new URL(target).host)}</b>.</span>
    <button class="btn primary" data-action="move">${has ? 'Llevar mis datos' : 'Ir a la nueva dirección'}</button>
  </div>`;
}

/* Bytes → texto con un carácter por byte (por trozos: apply() con demasiados argumentos desborda la pila) */
function binary(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return bin;
}

/* Texto en base64url, sin relleno: solo letras, números, - y _ */
function toBase64Url(bytes) {
  return btoa(binary(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const utf8 = (text) => Uint8Array.from(unescape(encodeURIComponent(text)), (c) => c.charCodeAt(0));
const fromUtf8 = (bytes) => decodeURIComponent(escape(binary(bytes)));

/* Pasa los bytes por un CompressionStream o DecompressionStream y devuelve el resultado */
async function pipeBytes(stream, bytes) {
  const writer = stream.writable.getWriter();
  // Si los datos están dañados, el error llega por reader.read(); aquí solo se evita el aviso de promesa sin capturar
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/* Datos → texto para la URL: «z» + JSON comprimido si el navegador sabe comprimir; si no, «j» + JSON */
async function encodeTransfer(data) {
  const bytes = utf8(JSON.stringify(data));
  if (typeof CompressionStream === 'function') {
    try { return 'z' + toBase64Url(await pipeBytes(new CompressionStream('deflate-raw'), bytes)); } catch (e) { /* sin comprimir */ }
  }
  return 'j' + toBase64Url(bytes);
}

async function decodeTransfer(code) {
  let bytes = fromBase64Url(code.slice(1));
  if (code[0] === 'z') bytes = await pipeBytes(new DecompressionStream('deflate-raw'), bytes);
  else if (code[0] !== 'j') throw new Error('Formato no válido');
  const data = JSON.parse(fromUtf8(bytes));
  if (!isBackup(data)) throw new Error('Formato no válido');
  return data;
}

/* Sale de la app hacia otra dirección (función aparte para poder sustituirla en los tests) */
function leaveTo(url) { location.href = url; }

actions.move = async () => {
  const target = moveTarget();
  if (!target) return;
  const host = esc(new URL(target).host);
  const has = db.teams.length || db.games.length;
  const msg = has
    ? `La app se abrirá en <b>${host}</b> con ${db.teams.length === 1 ? 'tu equipo' : `tus ${db.teams.length} equipos`}${db.games.length ? ` y ${nGames(db.games.length)}` : ''}.<br><small class="muted">Los datos viajan dentro del enlace, sin pasar por nuestros servidores. Aquí no se borra nada.</small>`
    : `La app se abrirá en <b>${host}</b>.`;
  if (!await confirmBox(msg, has ? 'Llevar mis datos' : 'Ir a la nueva dirección', false, 'Ahora no')) return;
  let url = target;
  if (has) {
    const code = await encodeTransfer(db);
    if (code.length > MAX_TRANSFER) {
      toast('⚠️ Hay demasiados datos para llevarlos así: exporta una copia en Ajustes e impórtala en la nueva dirección');
      return;
    }
    url += TRANSFER_PREFIX + code;
  }
  leaveTo(url);
};

/* Al abrir la app con #traspaso=…: se quita de la URL antes de nada (para que no quede en el historial
   ni se repita al recargar) y se devuelve el texto con los datos. En su lugar se pone ya la pantalla de
   inicio: así render() no navega, y el hashchange de esa navegación no cierra después la confirmación. */
function takeTransfer() {
  if (!location.hash.startsWith(TRANSFER_PREFIX)) return null;
  const code = location.hash.slice(TRANSFER_PREFIX.length);
  history.replaceState(null, '', location.pathname + location.search + startRoute());
  return code;
}

async function receiveTransfer(code) {
  let data;
  try { data = await decodeTransfer(code); }
  catch (e) {
    toast('⚠️ No se pudieron traer los datos: exporta una copia en la dirección antigua e impórtala aquí');
    return;
  }
  const incoming = normalize(data);
  const teams = incoming.teams.length;
  const what = `${teams} equipo${teams === 1 ? '' : 's'} y ${nGames(incoming.games.length)}`;
  const names = `<b>${incoming.teams.map(t => esc(t.name)).join(', ')}</b> (${nGames(incoming.games.length)})`;
  // Siempre se pide confirmación: cualquiera puede fabricar un enlace con #traspaso=…
  const ok = db.teams.length || db.games.length
    ? await confirmBox(`Traes de la dirección antigua ${names}, pero aquí ya hay datos (${db.teams.length} equipo${db.teams.length === 1 ? '' : 's'} y ${nGames(db.games.length)}).<br><small class="muted">¿Quieres reemplazarlos por los que traes? Si no, se quedan los de aquí y los otros siguen en la dirección antigua.</small>`, 'Reemplazar', true, 'Quedarme con los de aquí')
    : await confirmBox(`¿Guardar en este dispositivo los datos que traes de la dirección antigua?<br>${names}<br><small class="muted">Hazlo solo si acabas de pulsar «Llevar mis datos» en la app antigua.</small>`, 'Guardar', false, 'Cancelar');
  if (!ok) return;
  db = incoming;
  ui.editId = null;
  save();
  // replaceState no lanza hashchange, que ocultaría el aviso
  history.replaceState(null, '', location.pathname + location.search + startRoute());
  render();
  toast(`✅ Datos traspasados: ${what}`);
}

function shotTxt(r, n) { return `${r[`t${n}m`]}/${r[`t${n}a`]}`; }

function buildText(arg) {
  const data = statsData(arg);
  if (!data) return '';
  const out = [];
  if (data.season) {
    const what = data.phase ? `Estadísticas de la ${phaseLabel(team(), data.phase)}` : 'Estadísticas de temporada';
    out.push(`${team().name} · ${what} (${nGames(data.scopeGames.length)})${ui.avg ? ' · promedio por partido' : ''}`);
    for (const g of data.scopeGames) {
      const s = score(g);
      out.push(`  ${fmtDate(g.date)} vs ${g.opponent}${g.venue ? ` (${VENUES[g.venue].toLowerCase()})` : ''}: ${s.us}-${s.them}${g.finished ? '' : ' (en juego)'}`);
    }
  } else {
    const g = data.game, s = score(g), ps = periodScores(g);
    out.push(`${g.teamName} ${s.us} - ${s.them} ${g.opponent}`);
    const meta = gameMeta(g);
    out.push(`Fecha: ${fmtDate(g.date)}${meta ? ` · ${meta}` : ''}`);
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
  if (g) return `${g.teamName} vs ${g.opponent} · ${fmtDate(g.date)}`;
  const scope = seasonScope(arg);
  return `${team().name} · ${scope && scope.phase ? phaseName(scope.phase) : 'Temporada'}`;
}

function shareStats(arg) {
  const text = buildText(arg);
  const subject = `Estadísticas · ${statsTitle(arg)}`;
  const mailto = `mailto:${encodeURIComponent(team().email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  openModal({ kind: 'share', text, subject, mailto });
}

function renderShare(m) {
  return `
  <div class="modal-head"><h3>Enviar estadísticas</h3></div>
  <pre class="share-preview">${esc(m.text)}</pre>
  <div class="modal-actions">
    <button class="btn" data-action="copy-text">${icon('copy')} Copiar</button>
    ${navigator.share ? `<button class="btn" data-action="native-share">${icon('share')} Compartir</button>` : ''}
    <a class="btn primary" href="${esc(m.mailto)}">${icon('mail')} Email${team().email ? ` a ${esc(team().email)}` : ''}</a>
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
    // Coma decimal solo en los números (los promedios); los textos, como los nombres, van tal cual
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\r\n');
  const g = getGame(arg);
  const name = g ? `estadisticas-${g.date}-vs-${g.opponent}` : `estadisticas-${data.phase ? `fase-${data.phase}` : 'temporada'}-${todayISO()}`;
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

/* ─────────────── Añadir a la pantalla de inicio ─────────────── */
// Se muestra en la pantalla de "Gira el dispositivo" si la app no está instalada.
let installPrompt = null;   // evento beforeinstallprompt (Android / Chrome)

function isInstalled() {
  return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
}

function platform() {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

const SHARE_ICON = '<svg class="ios-share" viewBox="0 0 24 24" aria-label="Compartir"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function renderInstall() {
  const el = document.getElementById('install');
  if (!el) return;
  const plat = platform();
  if (isInstalled() || (plat === 'other' && !installPrompt)) { el.hidden = true; return; }
  let body;
  if (installPrompt) {
    body = `<button class="btn primary big install-btn" data-action="install">${icon('download')} Instalar la app</button>`;
  } else if (plat === 'ios') {
    body = `<ol>
      <li>Toca ${SHARE_ICON} <b>Compartir</b> en la barra de Safari</li>
      <li>Elige <b>“Añadir a pantalla de inicio”</b></li>
      <li>Ábrela desde el icono ${BALL}</li>
    </ol>`;
  } else {
    body = `<ol>
      <li>Abre el menú <b>⋮</b> del navegador</li>
      <li>Elige <b>“Instalar aplicación”</b> o <b>“Añadir a pantalla de inicio”</b></li>
      <li>Ábrela desde el icono ${BALL}</li>
    </ol>`;
  }
  el.innerHTML = `<h2>Añádela a tu pantalla de inicio</h2>${body}
    <small>Se abre a pantalla completa y funciona sin conexión en el pabellón.</small>`;
  el.hidden = false;
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  renderInstall();
});
window.addEventListener('appinstalled', () => { installPrompt = null; renderInstall(); });

actions.install = async () => {
  if (!installPrompt) return;
  const e = installPrompt;
  installPrompt = null;
  try {
    await e.prompt();
    const choice = await e.userChoice;
    if (choice && choice.outcome === 'accepted') { document.getElementById('install').hidden = true; return; }
  } catch (err) { /* cancelado */ }
  renderInstall();
};

/* ───────────────────── Pantalla siempre encendida ───────────────────── */

/* Mientras la app está abierta y visible se pide al sistema que no apague la pantalla
   (Screen Wake Lock API). El sistema libera el bloqueo al cambiar de app o apagar la
   pantalla, así que se vuelve a pedir al volver. Si el navegador no lo soporta o lo
   rechaza (batería baja, falta de gesto del usuario…), la app sigue funcionando igual. */
let wakeLock = null;

async function keepScreenOn() {
  if (!('wakeLock' in navigator) || wakeLock || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (err) { wakeLock = null; }
}

document.addEventListener('visibilitychange', keepScreenOn);
/* Algunos navegadores solo lo conceden tras un toque: se reintenta en cada uno si hace falta */
document.addEventListener('pointerdown', keepScreenOn, true);

/* ─────────────────────────── Inicio ─────────────────────────── */

const incoming = takeTransfer();
render();
renderInstall();
keepScreenOn();
if (incoming) receiveTransfer(incoming);
