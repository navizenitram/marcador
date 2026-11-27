// Dictado por voz sobre el DOM real: botón 🎤, permiso, jugada apuntada y errores. El reconocimiento de voz es un doble.
import { describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { makeData, makeGame, makeTeam } from '../helpers/fixtures.js';

const FIVE = ['p4', 'p7', 'p10', 'p12', 'p15'];

/** Reconocimiento de voz falso. Como el real: tras start() se abre el micrófono (onaudiostart) y se cierra solo con lo que
 * se haya programado en window.__said / __error / __noAudio; stop() lo cierra ya. Anota en window.__calls lo que se le pide. */
function fakeSpeech(window) {
  window.__said = [];
  window.__calls = [];
  window.SpeechRecognition = class {
    start() {
      window.__calls.push('start');
      if (!window.__noAudio) this.ta = setTimeout(() => this.audio(), 10);
      this.t = setTimeout(() => this.finish(), window.__autoMs ?? 60);
    }
    audio() { if (!this.opened) { this.opened = true; this.onaudiostart && this.onaudiostart(); } }
    stop() { window.__calls.push('stop'); clearTimeout(this.t); this.finish(); }
    finish() {
      if (this.done) return;
      this.done = true;
      clearTimeout(this.ta);
      if (!window.__noAudio) this.audio();
      if (window.__said.length) this.onresult({ results: [window.__said.map((transcript) => ({ transcript }))] });
      if (window.__error) this.onerror({ error: window.__error });
      this.onend();
    }
  };
}

const live = (opts = {}, game = {}) => openApp({
  data: makeData({ teams: [makeTeam()], games: [makeGame({ onCourt: [...FIVE], ...game })] }),
  hash: '#/partido/g1',
  setup: fakeSpeech,
  storage: { mb_voz: '1' },   // dictado ya activado: el botón solo sale tras activarlo en Ajustes
  ...opts,
});

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (app, type) => app.$('[data-voice]').dispatchEvent(new app.window.Event(type, { bubbles: true, cancelable: true }));

/** Un toque corto en el micro: el reconocimiento se cierra solo y la jugada se apunta */
async function speak(app, ...alternatives) {
  app.window.__said = alternatives;
  press(app, 'pointerdown');
  press(app, 'pointerup');
  await pause(150);
  await app.settle();
}

/** Mantiene pulsado el micro un rato y lo suelta */
async function hold(app, ms, ...alternatives) {
  app.window.__said = alternatives;
  press(app, 'pointerdown');
  await pause(ms);
  press(app, 'pointerup');
  await pause(30);
  await app.settle();
}
const types = (app) => app.db.games[0].events.map((e) => `${e.type}:${e.pid || e.pts}`);

describe('dictado por voz', () => {
  it('sin Web Speech API no hay botón ni interruptor', async () => {
    const app = await live({ setup: () => {} });
    expect(app.$('[data-voice]')).toBeNull();
    expect(app.text()).not.toContain('Dictado por voz');
  });

  it('sin activar el dictado en Ajustes no hay botón: la cabecera queda como siempre', async () => {
    const app = await live({ storage: {} });
    expect(app.$('[data-voice]')).toBeNull();
    expect(app.$$('.live-top .icon-btn').length).toBe(4);
  });

  it('con el dictado activado, una frase apunta la jugada del jugador en pista', async () => {
    const app = await live();
    await speak(app, 'siete triple');
    expect(types(app)).toEqual(['t3_ok:p7']);
  });

  it('puntos del rival y tiro fallado', async () => {
    const app = await live();
    await speak(app, 'rival dos');
    await speak(app, 'diez falla canasta');
    expect(types(app)).toEqual(['opp:2', 't2_ko:p10']);
  });

  it('elige la primera alternativa que se entiende', async () => {
    const app = await live();
    await speak(app, 'cinco triple', 'siete triple');   // el 5 no está en pista
    expect(types(app)).toEqual(['t3_ok:p7']);
  });

  it('un dorsal que no está en pista no apunta nada y lo dice', async () => {
    const app = await live();
    await speak(app, 'veintiuno triple');   // Fran (21) está en el banquillo
    expect(types(app)).toEqual([]);
    expect(app.toast).toContain('no está en pista');
  });

  it('no apunta acciones que el equipo tiene desactivadas', async () => {
    const app = await openApp({
      data: makeData({ teams: [makeTeam({ hidden: ['ast'] })], games: [makeGame({ onCourt: [...FIVE] })] }),
      hash: '#/partido/g1', setup: fakeSpeech, storage: { mb_voz: '1' },
    });
    await speak(app, 'siete asistencia');
    expect(types(app)).toEqual([]);
    expect(app.toast).toContain('desactivado');
  });

  it('sin conexión o sin permiso de micrófono lo explica', async () => {
    const app = await live();
    app.window.__error = 'network';
    await speak(app, 'siete triple');
    expect(app.toast).toContain('Sin conexión');
    app.window.__error = 'not-allowed';
    await speak(app);
    expect(app.toast).toContain('micrófono');
    expect(types(app)).toEqual([]);
  });

  it('se deshace con ↶ como cualquier jugada', async () => {
    const app = await live();
    await speak(app, 'siete triple');
    await app.act('undo');
    expect(types(app)).toEqual([]);
  });

  it('en un partido finalizado el botón está desactivado', async () => {
    const app = await live({}, { finished: true });
    expect(app.$('[data-voice]').disabled).toBe(true);
  });

  it('un toque corto deja el micrófono abierto hasta que el reconocimiento cierra solo', async () => {
    const app = await live();
    app.window.__said = ['siete triple'];
    press(app, 'pointerdown');
    press(app, 'pointerup');
    await app.settle();
    expect(app.window.__calls).toEqual(['start']);   // soltar enseguida no lo cierra
    expect(app.$('[data-voice]').classList.contains('listening')).toBe(true);
    await pause(150);
    expect(types(app)).toEqual(['t3_ok:p7']);
    expect(app.$('[data-voice]').classList.contains('listening')).toBe(false);
  });

  it('al abrirse el micrófono avisa con «Habla ahora» y marca el botón', async () => {
    const app = await live();
    app.window.__autoMs = 5000;   // sigue abierto: aún no ha acabado de hablar
    press(app, 'pointerdown');
    press(app, 'pointerup');
    expect(app.toast).toBeNull();   // el micrófono aún se está abriendo: nada que avisar
    await pause(40);
    expect(app.toast).toContain('Habla ahora');
    expect(app.$('[data-voice]').classList.contains('ready')).toBe(true);
    press(app, 'pointerdown');   // segundo toque: cierra (sin nada dicho)
    await pause(20);
    expect(app.$('[data-voice]').classList.contains('ready')).toBe(false);
  });

  it('mantener pulsado cierra el micrófono al soltar', async () => {
    const app = await live();
    app.window.__autoMs = 5000;   // mientras se habla, el reconocimiento no cierra solo
    await hold(app, 400, 'diez rebote defensivo');
    expect(app.window.__calls).toEqual(['start', 'stop']);
    expect(types(app)).toEqual(['rd:p10']);
  });

  it('otro toque mientras escucha lo cierra y apunta lo oído', async () => {
    const app = await live();
    app.window.__said = ['rival dos'];
    press(app, 'pointerdown');
    press(app, 'pointerup');
    press(app, 'pointerdown');   // segundo toque, antes de que cierre solo
    await pause(30);
    expect(app.window.__calls).toEqual(['start', 'stop']);
    expect(types(app)).toEqual(['opp:2']);
  });

  it('si el micrófono no llega a abrirse lo dice (y con qué error)', async () => {
    const app = await live();
    app.window.__noAudio = true;
    app.window.__error = 'audio-capture';
    await speak(app);
    expect(app.toast).toContain('no se ha llegado a abrir');
    expect(app.toast).toContain('audio-capture');
    expect(types(app)).toEqual([]);
  });

  it('si el micrófono se abre pero no se oye nada, lo dice distinto', async () => {
    const app = await live();
    await speak(app);
    expect(app.toast).toContain('No he oído nada');
    expect(app.toast).not.toContain('no se ha llegado a abrir');
  });

  it('el micro se cierra a los 4 s de abrirse, aunque el reconocimiento siga', { timeout: 10000 }, async () => {
    const app = await live();
    app.window.__autoMs = 20000;   // el reconocimiento no cierra solo (ruido en el pabellón)
    app.window.__said = ['siete triple'];
    press(app, 'pointerdown');
    press(app, 'pointerup');
    await pause(3500);
    expect(app.window.__calls).toEqual(['start']);   // a los 3,5 s todavía escucha
    await pause(900);
    expect(app.window.__calls).toEqual(['start', 'stop']);   // a los ~4 s desde que se abrió, se cierra
    expect(types(app)).toEqual(['t3_ok:p7']);
  });

  it('si el micrófono no llega a abrirse, se deja de esperar a los 6 s', { timeout: 10000 }, async () => {
    const app = await live();
    app.window.__noAudio = true;
    app.window.__autoMs = 20000;
    press(app, 'pointerdown');
    press(app, 'pointerup');
    await pause(5500);
    expect(app.window.__calls).toEqual(['start']);
    await pause(900);
    expect(app.window.__calls).toEqual(['start', 'stop']);
    expect(app.toast).toContain('no se ha llegado a abrir');
  });

  it('guarda lo que ha oído y se ve en Ajustes; se puede borrar', async () => {
    const app = await live();
    await speak(app, 'nueve canastas', 'nueve canasta');   // el 9 no está en pista: no apunta, pero queda en el registro
    await speak(app, 'siete triple');
    const log = JSON.parse(app.window.localStorage.getItem('mb_voz_log'));
    expect(log.map((e) => [e.ok, e.heard[0]])).toEqual([[true, 'siete triple'], [false, 'nueve canastas']]);
    app.window.location.hash = '#/ajustes';
    await app.settle();
    const text = app.text('.voice-log');
    expect(text).toContain('«siete triple»');
    expect(text).toContain('«nueve canastas»');
    expect(text).toContain('no está en pista');
    await app.act('voz-log-clear');
    expect(app.$('.voice-log')).toBeNull();
    expect(app.window.localStorage.getItem('mb_voz_log')).toBeNull();
  });

  it('el registro tiene como máximo 15 frases y desactivar el dictado lo borra', async () => {
    const app = await live();
    for (let i = 0; i < 17; i++) await speak(app, 'siete triple');
    expect(JSON.parse(app.window.localStorage.getItem('mb_voz_log')).length).toBe(15);
    app.window.location.hash = '#/ajustes';
    await app.settle();
    await app.act('toggle-voz');
    expect(app.window.localStorage.getItem('mb_voz_log')).toBeNull();
  });

  it('el interruptor de Ajustes pide permiso con el aviso, activa el botón en el partido y se puede desactivar', async () => {
    const app = await live({ hash: '#/ajustes', storage: {} });
    await app.act('toggle-voz');
    expect(app.modal).not.toBeNull();
    expect(app.text(app.modal)).toContain('Google o Apple');
    expect(app.window.localStorage.getItem('mb_voz')).toBeNull();   // sin aceptar no se activa
    await app.click('#modal [data-ok], #modal .primary');
    expect(app.window.localStorage.getItem('mb_voz')).toBe('1');
    app.window.location.hash = '#/partido/g1';
    await app.settle();
    expect(app.$('[data-voice]')).not.toBeNull();
    app.window.location.hash = '#/ajustes';
    await app.settle();
    await app.act('toggle-voz');
    expect(app.window.localStorage.getItem('mb_voz')).toBeNull();
  });
});
