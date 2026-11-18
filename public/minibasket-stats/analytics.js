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
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const ENDPOINT = 'https://cloud.umami.is/api/send';
  const OFF_KEY = 'mbstats.uso';          // 'off': desactivado en Ajustes
  const QUEUE_KEY = 'mbstats.uso.cola';   // eventos pendientes de enviar
  const MAX_QUEUE = 30;
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

  /* Envía la cola por orden; si falla uno (sin conexión), se para y se reintenta más tarde */
  async function flush() {
    if (flushing || !enabled() || typeof fetch !== 'function') return;
    if (navigator.onLine === false) return;
    flushing = true;
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
        q = readQueue().slice(1);
        writeQueue(q);
      }
    } catch (e) { /* sin conexión: se queda en la cola */ }
    flushing = false;
  }

  /* Solo textos, números y booleanos: así no se cuela nada de los datos por error */
  function clean(data) {
    const out = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 40)) out[k] = v;
    }
    return out;
  }

  function track(name, data) {
    if (!enabled()) return;
    const q = readQueue();
    q.push({ name, data: clean(data) });
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
    track, flush, setEnabled, enabled, available, browserOptOut,
    userOn: () => !userOff(),
    queue: readQueue,
  };
})();
