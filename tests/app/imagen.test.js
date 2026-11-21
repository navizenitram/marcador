// Tarjeta del partido como imagen: qué lleva (cardModel, los mismos datos que Estadísticas), cuándo se ofrece en «Enviar»
// y cómo se comparte o se descarga. El dibujo en sí se prueba en tests/card/card.test.js.
import { describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { plain } from '../helpers/core.js';
import { ev, makeData, makeGame, makeTeam, sampleGame } from '../helpers/fixtures.js';

const BOARD = '_equipo';

const open = (hash = '#/stats/g1', games = [sampleGame()], opts = {}) =>
  openApp({ data: makeData({ games }), hash, ...opts });

/** La imagen del modal «Enviar»: abre el modal de un partido y espera a que se prepare el PNG */
async function openShare(app, arg = 'g1') {
  await app.act('share', { arg });
  await app.settle();
}
const imageButton = (app) => app.$('.modal [data-action="share-image"]');

describe('qué lleva la tarjeta (cardModel)', () => {
  it('el resultado, los parciales y la fecha de un partido', async () => {
    const app = await open();
    const card = plain(app.fn.cardModel('g1'));
    expect(card).toMatchObject({
      date: '03/10/2026', meta: '', result: null,
      home: { name: 'Alevín A', score: 8, us: true },
      away: { name: 'Rival', score: 4, us: false },
    });
    expect(card.periods.labels).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
    // Los mismos parciales que el texto para compartir: «P1 6-2 | P2 0-2 | P3 2-0»
    expect(card.periods.home.slice(0, 3)).toEqual([6, 0, 2]);
    expect(card.periods.away.slice(0, 3)).toEqual([2, 2, 0]);
  });

  it('los líderes son los mismos que se ven en Estadísticas', async () => {
    const app = await open();
    const shown = app.$$('.leaders .leader').map((el) => ({
      label: el.querySelector('small').textContent,
      value: Number(el.querySelector('b').textContent),
      who: el.querySelector('span')?.textContent.replace(/\s+/g, ' ').trim(),
    }));
    const card = plain(app.fn.cardModel('g1'));
    expect(card.leaders.length).toBeGreaterThan(0);
    for (const l of card.leaders) expect(shown).toContainEqual(l);
    // Y solo los cuatro de la tarjeta, nunca los que no tienen datos
    expect(card.leaders.map((l) => l.label)).toEqual(['Máx. anotador', 'Mejor valoración', 'Más rebotes', 'Más asistencias']);
    expect(card.leaders.every((l) => l.value > 0)).toBe(true);
  });

  it('un partido finalizado dice si se ganó, se perdió o se empató', async () => {
    const result = async (events) => {
      const app = await open('#/stats/g1', [makeGame({ finished: true, played: { p4: [1] }, events })]);
      return app.fn.cardModel('g1').result;
    };
    expect(await result([ev('t2_ok', 'p4')])).toBe('win');
    expect(await result([])).toBe('tie');
    expect(await result([{ id: 'o1', ts: 1, period: 1, type: 'opp', pts: 2 }])).toBe('loss');
  });

  it('de visitante, el rival va primero (a la izquierda) como en el resumen', async () => {
    const app = await open('#/stats/g1', [sampleGame({ venue: 'away' })]);
    const card = plain(app.fn.cardModel('g1'));
    expect(card.meta).toBe('Visitante');
    expect([card.home, card.away]).toEqual([
      { name: 'Rival', score: 4, us: false },
      { name: 'Alevín A', score: 8, us: true },
    ]);
    expect(card.periods.home.slice(0, 3)).toEqual([2, 2, 0]);
  });

  it('a 4 cuartos, las columnas son Q1–Q4', async () => {
    const app = await open('#/stats/g1', [sampleGame({ periods: 4 })]);
    expect(plain(app.fn.cardModel('g1')).periods.labels).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
  });

  it('con la 2ª fase en juego, el campo lleva la fase', async () => {
    const team = makeTeam({ phase: 2 });
    const app = await openApp({ data: makeData({ teams: [team], games: [sampleGame({ venue: 'home', phase: 2 })] }), hash: '#/stats/g1' });
    expect(app.fn.cardModel('g1').meta).toBe('Local · 2ª fase');
  });

  it('en un partido de marcador no hay líderes: la estadística es de todo el equipo', async () => {
    const team = makeTeam({ players: [], board: true });
    const game = makeGame({ roster: [{ id: BOARD, number: '', name: 'Equipo (marcador)' }], played: { [BOARD]: [1] }, events: [ev('t2_ok', BOARD)] });
    const app = await openApp({ data: makeData({ teams: [team], games: [game] }), hash: '#/stats/g1' });
    const card = plain(app.fn.cardModel('g1'));
    expect(card.leaders).toEqual([]);
    expect(card.home.score).toBe(2);
  });

  it('la temporada, una fase o un partido que no existe no tienen tarjeta', async () => {
    const app = await open();
    expect(app.fn.cardModel('temporada')).toBeNull();
    expect(app.fn.cardModel('fase-1')).toBeNull();
    expect(app.fn.cardModel('no-existe')).toBeNull();
  });

  it('la web del pie es la de la dirección pública', async () => {
    expect((await open()).fn.cardModel('g1').host).toBe('myownbasketballstats.com');
    const app = await open('#/stats/g1', [sampleGame()], { siteUrl: 'https://stats.club.test' });
    expect(app.fn.cardModel('g1').host).toBe('stats.club.test');
  });
});

describe('el botón «Imagen» de Enviar', () => {
  it('sale en un partido y se activa cuando la imagen está lista', async () => {
    let finish;
    const app = await open('#/stats/g1', [sampleGame()], {
      setup(w) { w.HTMLCanvasElement.prototype.toBlob = (cb, type) => { finish = () => cb(new w.Blob(['png'], { type })); }; },
    });
    await app.act('share', { arg: 'g1' });
    expect(imageButton(app).disabled).toBe(true);
    // El resto del modal funciona mientras se dibuja
    expect(app.$('.modal [data-action="copy-text"]')).not.toBeNull();

    finish();
    await app.settle();
    expect(imageButton(app).disabled).toBe(false);
    expect(app.text('.modal')).toContain('Imagen');
  });

  it('dibuja la tarjeta con los datos del partido', async () => {
    const app = await open();
    await openShare(app);
    const texts = app.canvasTexts.map((t) => t.text);
    expect(texts).toEqual(expect.arrayContaining(['ALEVÍN A', 'RIVAL', '8', '4', 'EN JUEGO', 'PARCIALES', 'LÍDERES', 'myownbasketballstats.com']));
  });

  it('no sale en la temporada ni en una fase', async () => {
    const app = await open('#/stats/temporada');
    await openShare(app, 'temporada');
    expect(app.modal).not.toBeNull();
    expect(imageButton(app)).toBeNull();
    expect(app.canvasTexts).toEqual([]);
  });

  it('tampoco sale en el informe de un jugador', async () => {
    const app = await open('#/stats/temporada');
    await app.act('report', { pid: 'p4' });
    expect(app.modal).not.toBeNull();
    expect(imageButton(app)).toBeNull();
  });

  it('si no se puede dibujar, el botón no sale y el resto del modal sigue igual', async () => {
    const app = await open('#/stats/g1', [sampleGame()], {
      setup(w) { w.HTMLCanvasElement.prototype.toBlob = (cb) => cb(null); },
    });
    await openShare(app);
    expect(imageButton(app)).toBeNull();
    for (const action of ['copy-text', 'modal-close']) expect(app.$(`.modal [data-action="${action}"]`)).not.toBeNull();
    expect(app.$('.modal a[href^="mailto:"]')).not.toBeNull();
  });

  it('si se cierra el modal antes de que esté lista, no pasa nada', async () => {
    let finish;
    const app = await open('#/stats/g1', [sampleGame()], {
      setup(w) { w.HTMLCanvasElement.prototype.toBlob = (cb, type) => { finish = () => cb(new w.Blob(['png'], { type })); }; },
    });
    await app.act('share', { arg: 'g1' });
    await app.act('modal-close');
    finish();
    await app.settle();
    expect(app.modal).toBeNull();
  });
});

describe('compartir o descargar la imagen', () => {
  /** Un navegador que comparte archivos: apunta lo compartido o falla con el error indicado */
  function withShare(app, { error } = {}) {
    const shared = [];
    app.window.navigator.canShare = () => true;
    app.window.navigator.share = async (data) => {
      if (error) throw Object.assign(new Error('share'), { name: error });
      shared.push(data);
    };
    return shared;
  }

  it('con el menú de compartir del móvil, comparte el PNG con el asunto del partido', async () => {
    const app = await open();
    const shared = withShare(app);
    await openShare(app);
    await app.act('share-image');
    expect(shared).toHaveLength(1);
    const [file] = shared[0].files;
    expect(file.name).toBe('partido-Alevin_A-Rival-03_10_2026.png');
    expect(file.type).toBe('image/png');
    expect(shared[0].title).toBe('Estadísticas · Alevín A vs Rival · 03/10/2026');
    expect(app.downloads).toEqual([]);
  });

  it('si el navegador no comparte archivos (ordenador, Firefox), descarga el PNG', async () => {
    const app = await open();
    app.window.navigator.share = async () => { throw new Error('no debería usarse'); };
    await openShare(app);
    await app.act('share-image');
    expect(app.downloads.map((d) => d.name)).toEqual(['partido-Alevin_A-Rival-03_10_2026.png']);
    expect(app.downloads[0].blob.type).toBe('image/png');
    expect(app.toast).toContain('Imagen descargada');
  });

  it('si el navegador solo comparte texto (sin canShare de archivos), descarga', async () => {
    const app = await open();
    app.window.navigator.share = async () => { throw new Error('no debería usarse'); };
    app.window.navigator.canShare = () => false;
    await openShare(app);
    await app.act('share-image');
    expect(app.downloads).toHaveLength(1);
  });

  it('si el usuario cierra el menú de compartir, no se descarga nada', async () => {
    const app = await open();
    withShare(app, { error: 'AbortError' });
    await openShare(app);
    await app.act('share-image');
    expect(app.downloads).toEqual([]);
    expect(app.toast).toBeNull();
  });

  it('si el navegador rechaza compartir (por ejemplo, por tardar demasiado tras el toque), descarga', async () => {
    const app = await open();
    withShare(app, { error: 'NotAllowedError' });
    await openShare(app);
    await app.act('share-image');
    expect(app.downloads).toHaveLength(1);
    expect(app.toast).toContain('Imagen descargada');
  });

  it('puede repetirse: cada toque comparte la misma imagen otra vez', async () => {
    const app = await open();
    const shared = withShare(app);
    await openShare(app);
    await app.act('share-image');
    await app.act('share-image');
    expect(shared).toHaveLength(2);
    expect(shared[1].files[0].name).toBe(shared[0].files[0].name);
  });
});
