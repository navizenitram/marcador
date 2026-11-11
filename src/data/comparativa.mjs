// Datos de la comparativa con otras apps de estadísticas de baloncesto
// (src/pages/comparativa-apps-estadisticas-baloncesto.astro).
//
// CÓMO RELLENARLA
// - Las celdas de la competencia están en TODO. Cada una lleva { valor, fuente, consultado }:
//     valor       lo que dice la fuente, con palabras neutras («De pago (desde X €/mes)», «Sí», «No», «Solo iOS»…)
//     fuente      URL oficial de la app (web, tienda de apps o documentación), no de terceros
//     consultado  fecha en la que se miró, aaaa-mm-dd
// - Si no se puede verificar un dato, se deja en TODO: es mejor una celda pendiente que un dato inventado.
// - `better` (en qué es mejor que nosotros) y `fit` (para quién encaja) se escriben solo con lo que diga la fuente.
// - REVIEWED es la fecha de la última revisión completa (se muestra en la página).
// Mientras quede algún TODO, la página es un borrador: noindex, fuera del sitemap y sin enlaces (tests/web).

export const COMPARISON_PATH = '/comparativa-apps-estadisticas-baloncesto/';

/** Fecha de la última revisión completa de los datos de la competencia (aaaa-mm-dd) */
export const REVIEWED = 'TODO';

export const META = {
  title: 'Apps de estadísticas de baloncesto: comparativa 2026',
  description:
    'My Own Basketball Stats frente a GameChanger, Easy Stats, Breakthrough Stats y otras apps: precio, cuenta, privacidad y funciones, con sus fuentes.',
  h1: 'Apps de estadísticas de baloncesto: comparativa honesta',
  lead:
    'Si buscas una app para apuntar estadísticas de minibasket o baloncesto formativo, aquí tienes en qué se diferencian las más usadas. La escribe el autor de My Own Basketball Stats, así que cada dato de las demás apps enlaza a su fuente oficial y te decimos también cuándo te conviene otra.',
};

/** Filas de la tabla, en orden */
export const ROWS = [
  { key: 'price', label: 'Precio' },
  { key: 'account', label: 'Cuenta obligatoria' },
  { key: 'install', label: 'Instalar o usar en el navegador' },
  { key: 'platforms', label: 'Dispositivos' },
  { key: 'offline', label: 'Funciona sin conexión' },
  { key: 'storage', label: 'Dónde se guardan los datos' },
  { key: 'sync', label: 'Sincronización entre dispositivos' },
  { key: 'analytics', label: 'Analítica y publicidad' },
  { key: 'languages', label: 'Idiomas' },
  { key: 'playerStats', label: 'Estadísticas por jugador' },
  { key: 'lineups', label: '+/- y quintetos' },
  { key: 'opponent', label: 'Estadísticas del rival' },
  { key: 'video', label: 'Vídeo o retransmisión' },
  { key: 'teams', label: 'Varios equipos' },
  { key: 'export', label: 'Exportar y compartir' },
  { key: 'minibasket', label: 'Formato de minibasket' },
];

/** My Own Basketball Stats: cada dato con la evidencia en este repositorio */
export const OURS = {
  price: { valor: 'Gratis, sin anuncios ni versión de pago', evidencia: 'Sin pagos en la app; solo un enlace opcional a Ko-fi (KOFI_URL)' },
  account: { valor: 'No: sin registro ni inicio de sesión', evidencia: 'No hay pantalla de acceso ni backend' },
  install: { valor: 'Se usa en el navegador; se puede añadir a la pantalla de inicio (PWA)', evidencia: 'public/minibasket-stats/manifest.webmanifest' },
  platforms: { valor: 'Cualquier navegador actual: Android, iPhone, iPad y ordenador. Pensada para el móvil en horizontal', evidencia: 'e2e en Chrome Android y Safari iPhone' },
  offline: { valor: 'Sí, después de abrirla una vez', evidencia: 'Service worker (sw.js) y e2e «funciona sin conexión»' },
  storage: { valor: 'Solo en tu dispositivo; copia de seguridad en un archivo si la exportas', evidencia: 'localStorage (mbstats.v1) y Ajustes → Exportar/Importar' },
  sync: { valor: 'No: para cambiar de dispositivo, exportas e importas una copia', evidencia: 'Sin backend' },
  analytics: { valor: 'La app no tiene analítica, cookies ni publicidad. Esta web usa Umami, una analítica sin cookies, para contar visitas', evidencia: 'La app no carga nada de terceros; Base.astro carga Umami si PUBLIC_UMAMI_WEBSITE_ID' },
  languages: { valor: 'La app, en castellano. La web, también en catalán', evidencia: 'public/minibasket-stats, src/pages/ca' },
  playerStats: { valor: 'Sí: tiros de 1, 2 y 3, rebotes, asistencias, recuperaciones, pérdidas, tapones y faltas; valoración y estadísticas avanzadas', evidencia: 'EV en app.js, MBCore.advanced' },
  lineups: { valor: 'Sí: +/- de cada jugador y ranking de quintetos, parejas y tríos, sin toques extra', evidencia: 'MBCore.plusMinus, combos y rankCombos' },
  opponent: { valor: 'Solo sus puntos', evidencia: 'Botones +1/+2/+3 del rival' },
  video: { valor: 'No', evidencia: '—' },
  teams: { valor: 'Sí, varios equipos en el mismo dispositivo', evidencia: 'db.teams' },
  export: { valor: 'CSV, texto para email o WhatsApp e informe de cada jugador para su familia', evidencia: 'downloadCSV, shareStats, shareReport' },
  minibasket: { valor: 'Sí: 8 periodos o 4 cuartos, aviso a 4 faltas y eliminación a 5, temporada en dos fases', evidencia: 'Formulario de partido, MAX_FOULS, PHASES' },
};

const todo = () => ({ valor: 'TODO', fuente: 'TODO', consultado: 'TODO' });
const todoCells = () => Object.fromEntries(ROWS.map((r) => [r.key, todo()]));

/** Las demás apps. Todo en TODO hasta que se revise con su fuente oficial. */
export const APPS = [
  { name: 'Basketball Stats Assistant', url: 'TODO', better: ['TODO'], fit: 'TODO', cells: todoCells() },
  { name: 'GameChanger', url: 'TODO', better: ['TODO'], fit: 'TODO', cells: todoCells() },
  { name: 'Easy Stats', url: 'TODO', better: ['TODO'], fit: 'TODO', cells: todoCells() },
  { name: 'Breakthrough Stats', url: 'TODO', better: ['TODO'], fit: 'TODO', cells: todoCells() },
  // TODO: confirmar el nombre exacto («Hoopops», «SportEasy» o ambas) antes de publicar
  { name: 'Hoopops / SportEasy', url: 'TODO', better: ['TODO'], fit: 'TODO', cells: todoCells() },
];

const isTodo = (v) => typeof v === 'string' && v.includes('TODO');

/** Cuántos datos quedan por revisar (celdas, enlaces, textos y la fecha de revisión) */
export function pendingTodos() {
  let n = isTodo(REVIEWED) ? 1 : 0;
  for (const a of APPS) {
    n += [a.url, a.fit, ...a.better].filter(isTodo).length;
    for (const c of Object.values(a.cells)) if ([c.valor, c.fuente, c.consultado].some(isTodo)) n++;
  }
  return n;
}

/** Celdas de la competencia rellenas a medias: con valor pero sin fuente https o sin fecha aaaa-mm-dd */
export function invalidCells() {
  const bad = [];
  for (const a of APPS) {
    for (const [k, c] of Object.entries(a.cells)) {
      if (isTodo(c.valor)) continue;
      if (!/^https:\/\//.test(c.fuente) || !/^\d{4}-\d{2}-\d{2}$/.test(c.consultado)) bad.push(`${a.name} · ${k}`);
    }
    if (!isTodo(a.url) && !/^https:\/\//.test(a.url)) bad.push(`${a.name} · url`);
  }
  return bad;
}
