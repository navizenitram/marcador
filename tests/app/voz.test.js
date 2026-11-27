// Dictado por voz sobre el DOM real: botón 🎤, permiso, jugada apuntada y errores. El reconocimiento de voz es un doble.
import { describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { makeData, makeGame, makeTeam } from '../helpers/fixtures.js';

const FIVE = ['p4', 'p7', 'p10', 'p12', 'p15'];

/** Reconocimiento de voz falso: al soltar el botón entrega lo que se haya programado en window.__said */
function fakeSpeech(window) {
  window.__said = [];
  window.SpeechRecognition = class {
    start() { this.started = true; }
    stop() {
      if (this.__failed) this.onerror && this.onerror({ error: this.__failed });
      else if (window.__said.length) this.onresult({ results: [window.__said.map((transcript) => ({ transcript }))] });
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

/** Mantiene pulsado el micro, "dice" la frase y lo suelta */
async function speak(app, ...alternatives) {
  app.window.__said = alternatives;
  const btn = app.$('[data-voice]');
  btn.dispatchEvent(new app.window.Event('pointerdown', { bubbles: true, cancelable: true }));
  await app.settle();
  btn.dispatchEvent(new app.window.Event('pointerup', { bubbles: true }));
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
