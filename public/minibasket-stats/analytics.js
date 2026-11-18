/* ──────────────────────────────────────────────────────────────
   Estadísticas de uso anónimas (Umami)

   La app cuenta unos pocos hitos (equipo creado, partido empezado, partido finalizado…) para saber si la gente llega
   a usarla de verdad. Nunca envía nombres, rivales, resultados ni nada de lo que se apunta: solo el nombre del hito y
   una o dos propiedades de una lista cerrada (ver EVENTS en app.js y la pantalla de Privacidad).

   - No se carga ningún script de terceros: los eventos se mandan con fetch a la API de Umami (/api/send).
   - Solo se envía en el dominio publicado (el de la etiqueta canonical) y si al compilar hay ID de sitio
     (%UMAMI_WEBSITE_ID%, que scripts/postbuild.mjs sustituye por PUBLIC_UMAMI_WEBSITE_ID).
   - Se puede desactivar en Ajustes. Tampoco se envía nada si el navegador pide no ser rastreado (Global Privacy
     Control o Do Not Track).
   - Sin conexión (en el pabellón), los eventos esperan en una cola pequeña en localStorage y se envían al volver.
   - Hitos que solo cuentan una vez (un partido finalizado, el primer jugador de un equipo): track(..., once) con una
     clave; las claves ya contadas se guardan en localStorage.
   - Modo de depuración para revisar sin enviar nada (vistas previas, local): abrir la app con ?uso=debug escribe en la
     consola cada evento y si se enviaría o por qué no; ?uso=normal lo quita.
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const ENDPOINT = 'https://cloud.umami.is/api/send';
  const OFF_KEY = 'mbstats.uso';          // 'off': desactivado en Ajustes
  const QUEUE_KEY = 'mbstats.uso.cola';   // eventos pendientes de enviar
  const ONCE_KEY = 'mbstats.uso.hitos';   // claves de los hitos que ya se han contado
  const DEBUG_KEY = 'mbstats.uso.debug';  // '1': modo de depuración
  const MAX_QUEUE = 30;
  const MAX_ONCE = 300;
  const URL_PATH = '/minibasket-stats/';  // siempre la misma: las rutas llevan identificadores de partidos

  function websiteId() {
    const meta = document.querySelector('meta[name="mbs-analytics"]');
    const id = meta ? meta.getAttribute('content') || '' : '';
    return /^[\w-]{8,}$/.test(id) ? id : '';   // vacío o sin sustituir (%UMAMI_WEBSITE_ID%): sin analítica
  }

  /* Solo en el dominio de la canonical: ni en local, ni en las vistas previas, ni en la dirección antigua */
  function publishedHost() {
    const link = document.querySelector('link[rel="canonical"]');
    try { return new URL(link.getAttribute('href')).hostname; } catch (e) { return ''; }
  }

  function browserOptOut() {
    return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  }

  function userOff() {
    try { return localStorage.getItem(OFF_KEY) === 'off'; } catch (e) { return false; }
  }

  /* Configurada en esta compilación y en este dominio (con independencia de lo que elija la persona) */
  function available() {
    return !!websiteId() && publishedHost() !== '' && location.hostname === publishedHost();
  }

  function enabled() { return available() && !browserOptOut() && !userOff(); }

  /* Por qué no se envía (para el modo de depuración), o '' si se envía */
  function reason() {
    if (!websiteId()) return 'sin ID de Umami en esta compilación';
    if (!available()) return `no es el dominio publicado (${publishedHost() || 'sin canonical'})`;
    if (browserOptOut()) return 'el navegador pide no ser rastreado (GPC/DNT)';
    if (userOff()) return 'desactivadas en Ajustes';
    return '';
  }

  function store(key, value) {
    try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (e) { /* noop */ }
  }
  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  // ?uso=debug activa el modo de depuración en este navegador; ?uso=normal lo quita
  try {
    const mode = new URLSearchParams(location.search).get('uso');
    if (mode === 'debug') store(DEBUG_KEY, '1');
    else if (mode === 'normal') store(DEBUG_KEY, null);
  } catch (e) { /* noop */ }
  const debug = () => read(DEBUG_KEY) === '1';

  function readOnce() {
    try {
      const list = JSON.parse(read(ONCE_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function readQueue() {
    try {
      const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      return Array.isArray(q) ? q : [];
    } catch (e) { return []; }
  }

  function writeQueue(q) {
    try {
      if (q.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)));
      else localStorage.removeItem(QUEUE_KEY);
    } catch (e) { /* sin almacenamiento: se pierden, no pasa nada */ }
  }

  function payload(ev) {
    return {
      type: 'event',
      payload: {
        website: websiteId(),
        hostname: location.hostname,
        url: URL_PATH,
        title: 'App',
        language: navigator.language || '',
        screen: `${screen.width}x${screen.height}`,
        referrer: '',
        name: ev.name,
        data: ev.data,
      },
    };
  }

  let flushing = false;
  let again = false;   // se ha pedido otro envío mientras había uno en marcha (p. ej. volvió la conexión)

  /* Envía la cola por orden; si falla uno (sin conexión), se para y se reintenta más tarde */
  async function flush() {
    if (!enabled() || typeof fetch !== 'function') return;
    if (flushing) { again = true; return; }
    if (navigator.onLine === false) return;
    flushing = true;
    again = false;
    try {
      let q = readQueue();
      while (q.length) {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload(q[0])),
        });
        // 4xx (evento rechazado): se descarta para no reintentarlo siempre. 5xx: se reintenta más tarde.
        if (!res || res.status >= 500) break;
        // Se quita por su id: mientras se enviaba, track() ha podido añadir eventos (y recortar la cola si estaba llena)
        const sent = q[0].id;
        q = readQueue().filter((e) => e.id !== sent);
        writeQueue(q);
      }
    } catch (e) { /* sin conexión: se queda en la cola */ }
    flushing = false;
    // Una sola repetición: si vuelve a fallar, no se pide otra y se espera al siguiente evento o a abrir la app
    if (again) { again = false; flush(); }
  }

  /* Solo textos, números y booleanos: así no se cuela nada de los datos por error */
  function clean(data) {
    const out = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 40)) out[k] = v;
    }
    return out;
  }

  let seq = 0;

  /* once: clave del hito si solo debe contarse una vez (p. ej. 'fin:<id del partido>') */
  function track(name, data, once) {
    const ev = { id: `${Date.now().toString(36)}-${++seq}`, name, data: clean(data) };
    const done = once ? readOnce() : null;
    const repeated = !!once && done.includes(once);
    if (debug()) {
      const why = repeated ? `ya contado (${once})` : reason();
      console.info(`[uso] ${name}`, ev.data, why ? `· no se envía: ${why}` : '· se envía');
    }
    if (!enabled() || repeated) return;
    if (once) { done.push(once); store(ONCE_KEY, JSON.stringify(done.slice(-MAX_ONCE))); }
    const q = readQueue();
    q.push(ev);
    writeQueue(q);
    flush();
  }

  function setEnabled(on) {
    try {
      if (on) localStorage.removeItem(OFF_KEY);
      else { localStorage.setItem(OFF_KEY, 'off'); localStorage.removeItem(QUEUE_KEY); }
    } catch (e) { /* noop */ }
    if (on) flush();
  }

  window.addEventListener('online', flush);

  window.MBAnalytics = {
    track, flush, setEnabled, enabled, available, browserOptOut, debug,
    userOn: () => !userOff(),
    queue: readQueue,
  };
})();
