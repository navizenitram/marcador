// Carga la app de estadísticas real (public/minibasket-stats) en un DOM simulado con jsdom, sin modificar su código.
//
// core.js y app.js son scripts clásicos, no módulos: se ejecutan en el orden de index.html y sus funciones quedan como
// globales de la ventana (app.fn.score…, app.window.MBCore)
// y sus variables `let`/`const` (db, ui) se leen evaluando código en el mismo contexto (app.db, app.ui).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';
import { onTestFinished } from 'vitest';

export const APP_DIR = fileURLToPath(new URL('../../public/minibasket-stats/', import.meta.url));
export const STORE_KEY = 'mbstats.v1';
export const THEME_KEY = 'mb_theme';

const HTML = readFileSync(APP_DIR + 'index.html', 'utf8');
// Los scripts locales de index.html (core.js, app.js…), en el orden en que los carga el navegador
const SCRIPTS = [...HTML.matchAll(/<script src="([^"]+)"><\/script>/g)]
  .map(([, src]) => new vm.Script(readFileSync(APP_DIR + src, 'utf8'), { filename: APP_DIR + src }));

/**
 * Abre la app con los datos indicados en localStorage y espera a que termine de navegar.
 * Dentro de un test se cierra sola al acabar; en beforeAll hay que cerrarla con app.close() en afterAll.
 *
 * @param {object} [opts]
 * @param {object|string} [opts.data] contenido de localStorage[mbstats.v1] (objeto o texto tal cual)
 * @param {string} [opts.hash] ruta inicial, p. ej. '#/partidos'
 * @param {Record<string,string>} [opts.storage] otras claves de localStorage
 * @param {string} [opts.origin] dirección donde se abre la app, p. ej. 'https://marcador-kohl.vercel.app'
 * @param {string} [opts.siteUrl] valor de %SITE_URL% (la canonical); sin él queda el marcador tal cual
 * @param {boolean} [opts.compression] da a la ventana CompressionStream y DecompressionStream (jsdom no los tiene)
 * @param {string} [opts.search] parámetros de la URL, p. ej. '?origen=android'
 * @param {string} [opts.referrer] document.referrer, p. ej. 'android-app://com.myownbasketballstats.app/'
 * @param {Record<string,string>} [opts.session] claves de sessionStorage
 */
export async function openApp({ data, hash = '', storage = {}, origin = 'https://app.test', siteUrl, compression = false, search = '', referrer, session = {} } = {}) {
  const errors = [];
  const logs = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(e));
  for (const level of ['log', 'info', 'warn', 'error']) virtualConsole.on(level, (...args) => logs.push({ level, args }));

  const dom = new JSDOM(siteUrl ? HTML.replaceAll('%SITE_URL%', siteUrl) : HTML, {
    url: `${origin}/minibasket-stats/${search}${hash}`,
    referrer,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  const downloads = [];
  stubBrowserApis(window, downloads);
  if (compression) Object.assign(window, { CompressionStream, DecompressionStream });
  if (data !== undefined) window.localStorage.setItem(STORE_KEY, typeof data === 'string' ? data : JSON.stringify(data));
  for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v);
  for (const [k, v] of Object.entries(session)) window.sessionStorage.setItem(k, v);

  for (const script of SCRIPTS) script.runInContext(dom.getInternalVMContext());
  const app = new App(dom, errors, logs, downloads);
  try {
    onTestFinished(() => app.close());
  } catch {
    /* fuera de un test (beforeAll): la cierra quien la abre */
  }
  await app.settle();
  return app;
}

/* APIs del navegador que jsdom no implementa y la app usa */
function stubBrowserApis(window, downloads) {
  window.matchMedia = (media) => ({ media, matches: false, addEventListener() {}, removeEventListener() {} });
  window.HTMLElement.prototype.scrollIntoView = () => {};

  // Descargas (CSV y copia de seguridad): se guardan en app.downloads en vez de navegar a la URL blob:
  const blobs = new Map();
  let n = 0;
  window.URL.createObjectURL = (blob) => {
    const url = `blob:https://app.test/${++n}`;
    blobs.set(url, blob);
    return url;
  };
  window.URL.revokeObjectURL = (url) => blobs.delete(url);
  const click = window.HTMLElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download')) downloads.push({ name: this.download, blob: blobs.get(this.href) });
    else click.call(this);
  };
}

export class App {
  constructor(dom, errors, logs, downloads) {
    this.dom = dom;
    this.window = dom.window;
    this.ctx = dom.getInternalVMContext();
    /** Funciones globales de app.js (score, finish, normalize…) */
    this.fn = dom.window;
    this.errors = errors;
    this.logs = logs;
    this.downloads = downloads;
    this.closed = false;
  }

  get document() { return this.window.document; }
  /** Estado en memoria de la app (variable `db` de app.js) */
  get db() { return vm.runInContext('db', this.ctx); }
  /** Estado de la interfaz (variable `ui` de app.js) */
  get ui() { return vm.runInContext('ui', this.ctx); }
  get hash() { return this.window.location.hash; }
  /** Lo que hay guardado en localStorage */
  stored() {
    const raw = this.window.localStorage.getItem(STORE_KEY);
    return raw == null ? null : JSON.parse(raw);
  }

  $(sel) { return this.document.querySelector(sel); }
  $$(sel) { return [...this.document.querySelectorAll(sel)]; }
  /** Texto visible de un elemento, con los espacios normalizados ('' si no existe) */
  text(sel = '#app') {
    const el = typeof sel === 'string' ? this.$(sel) : sel;
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }
  /** Texto del aviso flotante, o null si está oculto */
  get toast() { const t = this.$('#toast'); return t.hidden ? null : this.text(t); }
  /** Modal abierto (elemento .modal), o null */
  get modal() { return this.$('#modal').hidden ? null : this.$('#modal .modal'); }

  /** Espera a que se procesen los hashchange y promesas pendientes */
  async settle() {
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  }

  async go(hash) {
    this.window.location.hash = hash;
    await this.settle();
  }

  /** Pulsa un elemento (selector o elemento). Falla si no existe. */
  async click(target) {
    const el = typeof target === 'string' ? this.$(target) : target;
    if (!el) throw new Error(`No existe el elemento ${target}`);
    el.click();
    await this.settle();
  }

  /** Selector de un botón con data-action y sus data-*: act('ev', { pid: 'p4', type: 't2_ok' }) */
  actionSelector(action, data = {}) {
    return `[data-action="${action}"]` + Object.entries(data).map(([k, v]) => `[data-${k}="${v}"]`).join('');
  }

  /** Pulsa el botón con ese data-action (y data-*) */
  act(action, data) { return this.click(this.actionSelector(action, data)); }

  /** Rellena un formulario [data-form=…] y lo envía como lo haría el navegador */
  async submit(kind, values = {}) {
    const form = this.$(`form[data-form="${kind}"]`);
    if (!form) throw new Error(`No existe el formulario ${kind}`);
    for (const [name, value] of Object.entries(values)) {
      const fields = [...form.querySelectorAll(`[name="${name}"]`)];
      if (!fields.length) throw new Error(`El formulario ${kind} no tiene el campo ${name}`);
      for (const f of fields) {
        if (f.type === 'radio') f.checked = f.value === String(value);
        else f.value = String(value);
      }
    }
    form.requestSubmit();
    await this.settle();
  }

  /** Cambia el valor de un campo [data-change=…] y lanza el evento change */
  async change(key, value) {
    const el = this.$(`[data-change="${key}"]`);
    if (!el) throw new Error(`No existe el campo ${key}`);
    el.value = value;
    el.dispatchEvent(new this.window.Event('change', { bubbles: true }));
    await this.settle();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.window.close();
    if (this.errors.length) {
      throw new Error(`La app lanzó errores no capturados:\n${this.errors.map((e) => e.cause?.stack || e.stack || e.message).join('\n')}`);
    }
  }
}
