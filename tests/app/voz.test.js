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
const accept = (app) => app.window.localStorage.setItem('mb_voz', '1');
const types = (app) => app.db.games[0].events.map((e) => `${e.type}:${e.pid || e.pts}`);

describe('dictado por voz', () => {
  it('sin Web Speech API no hay botón ni interruptor', async () => {
    const app = await live({ setup: () => {} });
    expect(app.$('[data-voice]')).toBeNull();
    expect(app.text()).not.toContain('Dictado por voz');
  });

  it('la primera vez pide permiso y avisa de que el audio sale del dispositivo', async () => {
    const app = await live();
    app.window.__said = ['siete triple'];
    app.$('[data-voice]').dispatchEvent(new app.window.Event('pointerdown', { bubbles: true, cancelable: true }));
    await app.settle();
    expect(app.modal).not.toBeNull();
    expect(app.text(app.modal)).toContain('Google o Apple');
    expect(types(app)).toEqual([]);
  });

  it('aceptado el permiso, una frase apunta la jugada del jugador en pista', async () => {
    const app = await live();
    accept(app);
    await speak(app, 'siete triple');
    expect(types(app)).toEqual(['t3_ok:p7']);
  });

  it('puntos del rival y tiro fallado', async () => {
    const app = await live();
    accept(app);
    await speak(app, 'rival dos');
    await speak(app, 'diez falla canasta');
    expect(types(app)).toEqual(['opp:2', 't2_ko:p10']);
  });

  it('elige la primera alternativa que se entiende', async () => {
    const app = await live();
    accept(app);
    await speak(app, 'cinco triple', 'siete triple');   // el 5 no está en pista
    expect(types(app)).toEqual(['t3_ok:p7']);
  });

  it('un dorsal que no está en pista no apunta nada y lo dice', async () => {
    const app = await live();
    accept(app);
    await speak(app, 'veintiuno triple');   // Fran (21) está en el banquillo
    expect(types(app)).toEqual([]);
    expect(app.toast).toContain('no está en pista');
  });

  it('no apunta acciones que el equipo tiene desactivadas', async () => {
    const app = await openApp({
      data: makeData({ teams: [makeTeam({ hidden: ['ast'] })], games: [makeGame({ onCourt: [...FIVE] })] }),
      hash: '#/partido/g1', setup: fakeSpeech,
    });
    accept(app);
    await speak(app, 'siete asistencia');
    expect(types(app)).toEqual([]);
    expect(app.toast).toContain('desactivado');
  });

  it('sin conexión o sin permiso de micrófono lo explica', async () => {
    const app = await live();
    accept(app);
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
    accept(app);
    await speak(app, 'siete triple');
    await app.act('undo');
    expect(types(app)).toEqual([]);
  });

  it('en un partido finalizado el botón está desactivado', async () => {
    const app = await live({}, { finished: true });
    expect(app.$('[data-voice]').disabled).toBe(true);
  });

  it('el interruptor de Ajustes activa (con el aviso) y desactiva el dictado', async () => {
    const app = await live({ hash: '#/ajustes' });
    await app.act('toggle-voz');
    expect(app.modal).not.toBeNull();
    await app.click('#modal [data-ok], #modal .primary');
    expect(app.window.localStorage.getItem('mb_voz')).toBe('1');
    await app.act('toggle-voz');
    expect(app.window.localStorage.getItem('mb_voz')).toBeNull();
  });
});
