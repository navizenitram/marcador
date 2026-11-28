// Dictado por voz sobre el DOM real: botón 🎤, permiso, jugada apuntada, errores y cancelaciones. El reconocimiento de voz es un doble.
import { describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { makeData, makeGame, makeTeam } from '../helpers/fixtures.js';

const FIVE = ['p4', 'p7', 'p10', 'p12', 'p15'];

/**
 * Reconocimiento de voz falso. Como el real: tras start() se abre el micrófono (onaudiostart) y se cierra solo con lo que se
 * haya programado en window.__said / __error / __noAudio; stop() lo cierra ya; abort() lo cancela. Ajustes de cada test:
 * __autoMs (cuándo cierra solo, 60 por defecto), __audioMs (cuándo se abre el micrófono, 10), __stopSilent (stop() no avisa
 * del final: el navegador atascado). Anota en window.__calls lo que se le pide.
 */
function fakeSpeech(window) {
  window.__said = [];
  window.__calls = [];
  window.SpeechRecognition = class {
    start() {
      window.__calls.push('start');
      if (!window.__noAudio) this.ta = setTimeout(() => this.audio(), window.__audioMs ?? 10);
      this.t = setTimeout(() => this.finish(), window.__autoMs ?? 60);
    }
    audio() { if (!this.opened && !this.done) { this.opened = true; this.onaudiostart && this.onaudiostart(); } }
    stop() {
      window.__calls.push('stop');
      if (window.__stopSilent) return;
      clearTimeout(this.t);
      this.finish();
    }
    abort() {
      window.__calls.push('abort');
      clearTimeout(this.t); clearTimeout(this.ta);
      if (this.done) return;
      this.done = true;
      this.onend && this.onend();
    }
    finish() {
      if (this.done) return;
      this.done = true;
      clearTimeout(this.ta);
      if (!window.__noAudio) { this.done = false; this.audio(); this.done = true; }
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
/** Espera a que se cumpla algo (sin depender de pausas fijas, que dan falsos fallos con la máquina cargada) */
async function until(cond, ms = 3000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('Se agotó la espera');
    await pause(10);
  }
}
const press = (app, type) => app.$('[data-voice]').dispatchEvent(new app.window.Event(type, { bubbles: true, cancelable: true }));
const listening = (app) => !!app.$('[data-voice]') && app.$('[data-voice]').classList.contains('listening');
const types = (app, i = 0) => app.db.games[i].events.map((e) => `${e.type}:${e.pid || e.pts}`);

/** Un toque corto en el micro: el reconocimiento se cierra solo y la jugada se apunta */
async function speak(app, ...alternatives) {
  app.window.__said = alternatives;
  press(app, 'pointerdown');
  press(app, 'pointerup');
  await until(() => !listening(app));
  await app.settle();
}

/** Mantiene pulsado el micro un rato (con el micrófono ya abierto) y lo suelta */
async function hold(app, ms, ...alternatives) {
  app.window.__said = alternatives;
  press(app, 'pointerdown');
  await pause(ms);
  press(app, 'pointerup');
  await until(() => !listening(app));
  await app.settle();
}

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

  it('una frase con negación no apunta nada: ni «triple no ha entrado» como anotado', async () => {
    const app = await live();
    await speak(app, 'siete triple no ha entrado');
    expect(types(app)).toEqual([]);
    expect(app.toast).toContain('No he entendido');
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

  it('el aviso de acción desactivada habla de «triple», no del código interno', async () => {
    const app = await openApp({
      data: makeData({ teams: [makeTeam({ hidden: ['t3'] })], games: [makeGame({ onCourt: [...FIVE] })] }),
      hash: '#/partido/g1', setup: fakeSpeech, storage: { mb_voz: '1' },
    });
    await speak(app, 'siete triple');
    expect(types(app)).toEqual([]);
    expect(app.toast).toContain('triple');
    expect(app.toast).not.toContain('t3_');
  });

  it('sin conexión o sin permiso de micrófono lo explica', async () => {
    const app = await live();
    app.window.__error = 'network';
    await speak(app, 'siete triple');
    expect(app.toast).toContain('Sin conexión');
    app.window.__error = 'not-allowed';
    await speak(app);
    expect(app.toast).toContain('micrófono');
    app.window.__error = 'service-not-allowed';
    await speak(app);
    expect(app.toast).toContain('no permite el dictado');
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
    expect(listening(app)).toBe(true);
    await until(() => types(app).length === 1);
    expect(types(app)).toEqual(['t3_ok:p7']);
    expect(listening(app)).toBe(false);
  });

  it('al abrirse el micrófono avisa con «Habla ahora» y marca el botón', async () => {
    const app = await live();
    app.window.__autoMs = 5000;   // sigue abierto: aún no ha acabado de hablar
    press(app, 'pointerdown');
    press(app, 'pointerup');
    expect(app.toast).toBeNull();   // el micrófono aún se está abriendo: nada que avisar
    await until(() => app.toast && app.toast.includes('Habla ahora'));
    expect(app.$('[data-voice]').classList.contains('ready')).toBe(true);
    press(app, 'pointerdown');   // segundo toque: cierra (sin nada dicho)
    await until(() => !listening(app));
    expect(app.$('[data-voice]').classList.contains('ready')).toBe(false);
  });

  it('mantener pulsado, con el micrófono abierto, cierra al soltar', async () => {
    const app = await live();
    app.window.__autoMs = 5000;   // mientras se habla, el reconocimiento no cierra solo
    await hold(app, 400, 'diez rebote defensivo');
    expect(app.window.__calls).toEqual(['start', 'stop']);
    expect(types(app)).toEqual(['rd:p10']);
  });

  it('una pulsación lenta antes de que el micrófono se abra no lo cierra', async () => {
    const app = await live();
    app.window.__autoMs = 5000;
    app.window.__audioMs = 600;   // el navegador tarda en abrirlo (aviso de permiso, arranque lento)
    press(app, 'pointerdown');
    await pause(400);
    press(app, 'pointerup');
    await app.settle();
    expect(app.window.__calls).toEqual(['start']);   // aún no se oía nada: sigue esperando
    expect(listening(app)).toBe(true);
  });

  it('otro toque mientras escucha lo cierra y apunta lo oído', async () => {
    const app = await live();
    app.window.__autoMs = 5000;
    app.window.__said = ['rival dos'];
    press(app, 'pointerdown');
    press(app, 'pointerup');
    press(app, 'pointerdown');   // segundo toque, antes de que cierre solo
    await until(() => types(app).length === 1);
    expect(app.window.__calls).toEqual(['start', 'stop']);
    expect(types(app)).toEqual(['opp:2']);
  });

  it('con teclado o lector de pantalla, un clic sin puntero hace de toque', async () => {
    const app = await live();
    app.window.__said = ['siete triple'];
    app.$('[data-voice]').click();   // jsdom lo envía con detail 0, como Enter o Espacio
    await until(() => types(app).length === 1);
    expect(types(app)).toEqual(['t3_ok:p7']);
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
    await until(() => app.window.__calls.includes('stop'), 2000);   // a los ~4 s desde que se abrió, se cierra
    await until(() => types(app).length === 1);
    expect(types(app)).toEqual(['t3_ok:p7']);
  });

  describe('cancelaciones y estados raros', () => {
    const twoGames = () => openApp({
      data: makeData({ teams: [makeTeam()], games: [makeGame({ onCourt: [...FIVE] }), makeGame({ id: 'g2', opponent: 'Otro', onCourt: [...FIVE] })] }),
      hash: '#/partido/g1', setup: fakeSpeech, storage: { mb_voz: '1' },
    });

    it('cambiar de partido mientras escucha lo cancela: no se apunta en ninguno', async () => {
      const app = await twoGames();
      app.window.__autoMs = 300;
      app.window.__said = ['siete triple'];
      press(app, 'pointerdown');
      press(app, 'pointerup');
      await until(() => listening(app));
      await app.go('#/partido/g2');
      expect(app.window.__calls).toEqual(['start', 'abort']);
      await pause(400);   // lo que habría tardado en llegar el resultado
      expect(types(app, 0)).toEqual([]);
      expect(types(app, 1)).toEqual([]);
      expect(app.window.localStorage.getItem('mb_voz_log')).toBeNull();
    });

    it('desactivar el dictado mientras escucha no apunta nada ni escribe en el registro', async () => {
      const app = await live();
      app.window.__autoMs = 300;
      app.window.__said = ['siete triple'];
      press(app, 'pointerdown');
      press(app, 'pointerup');
      await until(() => listening(app));
      await app.go('#/ajustes');
      await app.act('toggle-voz');
      await pause(400);
      expect(types(app)).toEqual([]);
      expect(app.window.localStorage.getItem('mb_voz')).toBeNull();
      expect(app.window.localStorage.getItem('mb_voz_log')).toBeNull();
    });

    it('si el navegador no avisa del final tras parar, no se queda atascado', { timeout: 8000 }, async () => {
      const app = await live();
      app.window.__stopSilent = true;
      app.window.__autoMs = 20000;
      press(app, 'pointerdown');
      press(app, 'pointerup');
      await until(() => listening(app));
      press(app, 'pointerdown');   // segundo toque: pide parar, pero el navegador no contesta
      await app.settle();
      expect(listening(app)).toBe(true);
      await until(() => !listening(app), 3000);   // a los ~1,5 s se da por terminado
      expect(app.window.__calls).toContain('abort');
      app.window.__stopSilent = false;
      press(app, 'pointerdown');   // y se puede volver a usar
      await app.settle();
      expect(app.window.__calls.filter((c) => c === 'start').length).toBe(2);
    });

    it('un repintado de la cabecera no pierde el estado del botón', async () => {
      const app = await live();
      app.window.__autoMs = 5000;
      press(app, 'pointerdown');
      press(app, 'pointerup');
      await until(() => app.$('[data-voice]').classList.contains('ready'));
      await app.act('opp', { pts: '2' });   // apuntar algo repinta la pantalla
      expect(app.$('[data-voice]').classList.contains('listening')).toBe(true);
      expect(app.$('[data-voice]').classList.contains('ready')).toBe(true);
    });
  });

  describe('registro de lo oído y permiso', () => {
    it('guarda lo que ha oído y se ve en Ajustes; se puede borrar', async () => {
      const app = await live();
      await speak(app, 'nueve canastas', 'nueve canasta');   // el 9 no está en pista: no apunta, pero queda en el registro
      await speak(app, 'siete triple');
      const log = JSON.parse(app.window.localStorage.getItem('mb_voz_log'));
      expect(log.map((e) => [e.ok, e.heard[0]])).toEqual([[true, 'siete triple'], [false, 'nueve canastas']]);
      await app.go('#/ajustes');
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
      await app.go('#/ajustes');
      await app.act('toggle-voz');
      expect(app.window.localStorage.getItem('mb_voz_log')).toBeNull();
    });

    it('un registro manipulado no rompe Ajustes y el texto se escapa', async () => {
      const bad = JSON.stringify([{ heard: 'x' }, null, 5, { heard: ['<img src=x onerror=alert(1)>'], ok: true, what: '<b>hola</b>' }]);
      const app = await live({ hash: '#/ajustes', storage: { mb_voz: '1', mb_voz_log: bad } });
      expect(app.$$('.voice-log li').length).toBe(1);   // solo la entrada con la forma esperada
      expect(app.$('.voice-log img')).toBeNull();
      expect(app.$('.voice-log b')).toBeNull();
      expect(app.text('.voice-log')).toContain('<img src=x onerror=alert(1)>');
    });

    it('el interruptor de Ajustes pide permiso con el aviso, activa el botón en el partido y se puede desactivar', async () => {
      const app = await live({ hash: '#/ajustes', storage: {} });
      await app.act('toggle-voz');
      expect(app.modal).not.toBeNull();
      expect(app.text(app.modal)).toContain('Google o Apple');
      expect(app.window.localStorage.getItem('mb_voz')).toBeNull();   // sin aceptar no se activa
      await app.click('#modal [data-action="confirm-yes"]');
      expect(app.window.localStorage.getItem('mb_voz')).toBe('1');
      await app.go('#/partido/g1');
      expect(app.$('[data-voice]')).not.toBeNull();
      await app.go('#/ajustes');
      await app.act('toggle-voz');
      expect(app.window.localStorage.getItem('mb_voz')).toBeNull();
    });

    it('cancelar el aviso de permiso no activa nada', async () => {
      const app = await live({ hash: '#/ajustes', storage: {} });
      await app.act('toggle-voz');
      await app.click('#modal [data-action="confirm-no"]');
      expect(app.window.localStorage.getItem('mb_voz')).toBeNull();
      await app.go('#/partido/g1');
      expect(app.$('[data-voice]')).toBeNull();
    });
  });
});
