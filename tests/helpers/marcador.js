// Carga el marcador real (public/marcador/index.html) con jsdom. Su script va en línea en el HTML y se ejecuta tal cual.
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { onTestFinished } from 'vitest';

const HTML = readFileSync(new URL('../../public/marcador/index.html', import.meta.url), 'utf8');

/**
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.storage] claves de localStorage antes de cargar (p. ej. el tema)
 */
export function openScoreboard({ storage = {} } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(e));
  const charts = [];

  const dom = new JSDOM(HTML, {
    url: 'https://marcador.test/marcador/',
    runScripts: 'dangerously',  // ejecuta el <script> en línea y los onclick="…" del HTML
    pretendToBeVisual: true,    // requestAnimationFrame
    virtualConsole,
    // Los recursos externos (Chart.js y Google Fonts) no se descargan: se prepara el entorno antes de ejecutar el script
    beforeParse(window) {
      for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v);
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.Chart = class FakeChart {
        constructor(canvas, config) { this.canvas = canvas; this.config = config; this.destroyed = false; charts.push(this); }
        destroy() { this.destroyed = true; }
      };
    },
  });

  const { window } = dom;
  const sb = {
    window,
    document: window.document,
    charts,
    /** Estado del partido (variable `game` del script) */
    get game() { return window.eval('game'); },
    $: (sel) => window.document.querySelector(sel),
    $$: (sel) => [...window.document.querySelectorAll(sel)],
    text: (sel) => window.document.querySelector(sel).textContent.trim(),
    /** Pantalla visible: setup, scoreboard o stats */
    get screen() { return sb.$$('.screen').filter((s) => s.style.display !== 'none').map((s) => s.id).join(','); },
    /** Pulsa el botón cuyo onclick coincide exactamente, p. ej. press("addScore('A',2)") */
    press(onclick, times = 1) {
      const el = sb.$(`[onclick="${onclick}"]`);
      if (!el) throw new Error(`No hay ningún botón con onclick="${onclick}"`);
      for (let i = 0; i < times; i++) el.click();
    },
    start({ nameA = '', nameB = '', quarters } = {}) {
      if (quarters) sb.press(`selectQuarters(${quarters})`);
      sb.$('#nameA').value = nameA;
      sb.$('#nameB').value = nameB;
      sb.press('startGame()');
    },
    close() {
      window.close();
      if (errors.length) throw new Error(`El marcador lanzó errores no capturados:\n${errors.map((e) => e.cause?.stack || e.message).join('\n')}`);
    },
  };
  onTestFinished(() => sb.close());
  return sb;
}
