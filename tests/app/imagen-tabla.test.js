// Tabla completa de estadísticas como imagen (tableModel, el botón «Tabla PNG» de Enviar y su compartir o descarga). El
// dibujo en sí se prueba en tests/card/card.test.js. Lo que más importa aquí: que la imagen lleve lo mismo que la tabla
// de la pantalla, celda a celda, con lo que se haya elegido (Totales o Por partido, Básicas o Avanzadas, el orden).
import { describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { plain } from '../helpers/core.js';
import { ev, makeData, makeGame, makeTeam, opp, sampleGame, trackedGame } from '../helpers/fixtures.js';

const BOARD = '_equipo';

/** sampleGame (8-4, finalizado) + un segundo partido finalizado con más tiros, para que haya avanzadas y promedios */
const games = () => [
  sampleGame({ finished: true, venue: 'home' }),
  makeGame({
    id: 'g2', date: '2026-10-10', finished: true, played: { p4: [1], p7: [1] },
    events: [ev('t2_ok', 'p4'), ev('t2_ok', 'p4'), ev('t3_ok', 'p7'), ev('t2_ko', 'p7'), ev('t3_ko', 'p7'), ev('t3_ko', 'p4'), ev('t1_ok', 'p4'), ev('t1_ko', 'p4'), ev('reb', 'p4'), ev('ast', 'p7')],
  }),
];

const open = (hash = '#/stats/temporada', opts = {}) => openApp({ data: makeData({ games: games() }), hash, ...opts });

/** Lo que muestra la tabla de la pantalla, fila a fila: el texto de cada celda sin espacios sobrantes */
const screen = (app) => ({
  head: app.$$('table.stats thead th').map((th) => th.textContent.trim()),
  rows: app.$$('table.stats tbody tr').map((tr) => [...tr.children].map((td) => td.textContent.replace(/\s+/g, ''))),
  total: [...app.$('table.stats tfoot tr').children].map((td) => td.textContent.replace(/\s+/g, '')),
});

/** Lo que lleva la imagen: el valor de cada celda con su porcentaje debajo, como junta la pantalla (1/2 + 50% → 1/250%) */
const image = (app, arg) => {
  const m = plain(app.fn.tableModel(arg));
  const flat = (row) => row.cells.map((c) => `${c.text}${c.sub ?? ''}`.replace(/\s+/g, ''));
  return { m, head: m.cols.map((c) => c.h), rows: m.rows.map(flat), total: flat(m.total) };
};

describe('la imagen lleva lo mismo que la tabla de la pantalla', () => {
  const same = async (hash, arg, act) => {
    const app = await open(hash);
    if (act) await act(app);
    const shown = screen(app), img = image(app, arg);
    expect(img.head).toEqual(shown.head);
    expect(img.rows).toEqual(shown.rows);
    expect(img.total).toEqual(shown.total.map((t, i) => (img.m.cols[i].k === 'number' ? '' : t)).map((t, i) => t ?? img.total[i]));
    return img;
  };

  it('un partido, con las básicas', async () => {
    const img = await same('#/stats/g1', 'g1');
    expect(img.head.slice(0, 4)).toEqual(['#', 'Jugador', 'PER', 'PTS']);
    expect(img.rows.length).toBe(6);
  });

  it('la temporada, con las básicas y los partidos jugados', async () => {
    const img = await same('#/stats/temporada', 'temporada');
    expect(img.head).toContain('PJ');
  });

  it('la temporada «Por partido»', async () => {
    const img = await same('#/stats/temporada', 'temporada', (app) => app.act('avg', { v: '1' }));
    expect(img.m.subtitle).toContain('Por partido');
  });

  it('las avanzadas, con sus asteriscos de pocos tiros y los guiones sin datos', async () => {
    const img = await same('#/stats/temporada', 'temporada', (app) => app.act('adv', { v: '1' }));
    expect(img.head).toEqual(expect.arrayContaining(['eFG%', 'TS%', '%PÉR', 'TL/TC']));
    expect(img.m.subtitle).toContain('Avanzadas');
    const texts = img.m.rows.flatMap((r) => r.cells.map((c) => c.text));
    expect(texts.some((t) => t.endsWith('*'))).toBe(true);
    expect(texts).toContain('–');
    expect(img.m.note).toMatch(/pocos tiros/);
  });

  it('en el orden elegido al ordenar por una columna, y al invertirlo', async () => {
    const app = await open('#/stats/temporada');
    const order = () => image(app, 'temporada').m.rows.map((r) => r.cells[1].text);
    await app.act('sort', { k: 'pts' });
    expect(order()).toEqual(screen(app).rows.map((r) => r[1]));
    const desc = order();
    await app.act('sort', { k: 'pts' });
    expect(order()).toEqual(screen(app).rows.map((r) => r[1]));
    expect(order()).not.toEqual(desc);
  });

  it('con un botón desactivado en Ajustes, sin esa columna, como la tabla', async () => {
    const app = await openApp({ data: makeData({ teams: [makeTeam({ hidden: ['blk', 'blkr'] })], games: games() }), hash: '#/stats/temporada' });
    const img = image(app, 'temporada');
    expect(img.head).not.toContain('TAP');
    expect(img.head).toEqual(screen(app).head);
  });
});

describe('qué lleva el modelo de la tabla', () => {
  it('título, subtítulo y nombre de archivo de un partido', async () => {
    const m = plain((await open('#/stats/g1')).fn.tableModel('g1'));
    expect(m).toMatchObject({
      type: 'table', title: 'Alevín A 8 - 4 Rival', subtitle: '03/10/2026 · Local · Básicas',
      fileBase: 'estadisticas-2026-10-03-vs-Rival', host: 'myownbasketballstats.com',
    });
  });

  it('de visitante, el rival primero en el título, como el resumen del partido', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame({ venue: 'away' })] }), hash: '#/stats/g1' });
    expect(app.fn.tableModel('g1').title).toBe('Rival 4 - 8 Alevín A');
  });

  it('título y subtítulo de la temporada y de una fase', async () => {
    const app = await openApp({ data: makeData({ teams: [makeTeam({ phase: 2, levels: ['Nivel B', 'Nivel A'] })], games: games() }), hash: '#/stats/temporada' });
    expect(app.fn.tableModel('temporada')).toMatchObject({ title: 'Alevín A · Temporada', subtitle: '2 partidos · Totales · Básicas' });
    expect(app.fn.tableModel('temporada').fileBase).toMatch(/^estadisticas-temporada-\d{4}-\d{2}-\d{2}$/);
    expect(app.fn.tableModel('fase-1')).toMatchObject({ title: 'Alevín A · 1ª fase', subtitle: '2 partidos · Totales · Básicas' });
    expect(app.fn.tableModel('fase-1').fileBase).toMatch(/^estadisticas-fase-1-/);
  });

  it('un partido que no existe no tiene tabla', async () => {
    expect((await open()).fn.tableModel('no-existe')).toBeNull();
  });

  it('marca a quien no ha jugado (apagado) y no a la fila del equipo', async () => {
    const m = plain((await open('#/stats/temporada')).fn.tableModel('temporada'));
    const names = m.rows.map((r) => r.cells[1].text);
    expect(m.rows.filter((r) => r.dnp).map((r) => r.cells[1].text)).toEqual(['Eva', 'Fran']);
    expect(names).toContain('Ana');
    expect(m.total.dnp).toBe(false);
    expect(m.total.cells[1].text).toBe('Equipo');
  });

  it('tono: ceros atenuados, valoración en verde si suma y en rojo si resta, +/- con signo', async () => {
    const lineups = trackedGame('g1', [[1, ['p4', 'p7', 'p10', 'p12', 'p15'], 4, 6]], { finished: true });
    const app = await openApp({ data: makeData({ games: [lineups] }), hash: '#/stats/g1' });
    const m = plain(app.fn.tableModel('g1'));
    const col = (k) => m.cols.findIndex((c) => c.k === k);
    const cell = (name, k) => m.rows.find((r) => r.cells[1].text === name).cells[col(k)];
    expect(cell('Ana', 'pm')).toMatchObject({ text: '−2', tone: 'neg' });
    // Bruno ha jugado pero no ha anotado: su cero se atenúa
    expect(cell('Bruno', 'pts')).toMatchObject({ text: '0', tone: 'zero' });
    expect(cell('Ana', 'pts').tone).toBe('');
    expect(cell('Ana', 'name')).not.toHaveProperty('sub');
    expect(cell('Ana', 'val').tone).toBe('pos');
    // Un jugador que no ha jugado no tiene +/-
    expect(cell('Fran', 'pm')).toMatchObject({ text: '–', tone: 'zero' });
  });

  it('los tiros llevan su porcentaje debajo y, sin tiros, un guion', async () => {
    const m = plain((await open('#/stats/g1')).fn.tableModel('g1'));
    const t2 = m.cols.findIndex((c) => c.k === 't2');
    expect(m.rows.find((r) => r.cells[1].text === 'Ana').cells[t2]).toMatchObject({ text: '1/2', sub: '50%' });
    expect(m.rows.find((r) => r.cells[1].text === 'Carla').cells[t2]).toMatchObject({ text: '1/1', sub: '100%' });
    expect(m.rows.find((r) => r.cells[1].text === 'Fran').cells[t2]).toMatchObject({ text: '0/0', sub: '–', tone: 'zero' });
  });

  it('solo anotados: los tiros son un solo número, sin porcentaje', async () => {
    const team = makeTeam({ players: [], board: true, hidden: ['t1ko', 't2ko', 't3ko', 'miss'] });
    const game = makeGame({ roster: [{ id: BOARD, number: '', name: 'Equipo (marcador)' }], played: { [BOARD]: [1] }, events: [ev('t2_ok', BOARD), ev('t3_ok', BOARD)] });
    const app = await openApp({ data: makeData({ teams: [team], games: [game] }), hash: '#/stats/g1' });
    const m = plain(app.fn.tableModel('g1'));
    expect(m.total.cells.some((c) => 'sub' in c)).toBe(false);
  });

  it('un partido de marcador solo lleva la fila del equipo', async () => {
    const team = makeTeam({ players: [], board: true });
    const game = makeGame({ roster: [{ id: BOARD, number: '', name: 'Equipo (marcador)' }], played: { [BOARD]: [1] }, events: [ev('t2_ok', BOARD), opp(3)] });
    const app = await openApp({ data: makeData({ teams: [team], games: [game] }), hash: '#/stats/g1' });
    const m = plain(app.fn.tableModel('g1'));
    expect(m.rows).toEqual([]);
    expect(m.total.cells.find((_, i) => m.cols[i].k === 'pts').text).toBe('2');
  });

  it('un jugador con 5 faltas en un partido sale en rojo, como en la tabla; en la temporada no', async () => {
    const fouls = Array.from({ length: 5 }, () => ev('fc', 'p4'));
    const app = await openApp({ data: makeData({ games: [makeGame({ finished: true, played: { p4: [1] }, events: fouls })] }), hash: '#/stats/g1' });
    const fc = (arg) => {
      const m = plain(app.fn.tableModel(arg));
      return m.rows.find((r) => r.cells[1].text === 'Ana').cells[m.cols.findIndex((c) => c.k === 'fc')];
    };
    expect(fc('g1')).toMatchObject({ text: '5', tone: 'neg' });
    expect(fc('temporada').tone).not.toBe('neg');
  });

  it('las columnas de cada grupo (tiros, rebotes, balón…) empiezan con una raya, y PTS va destacada', async () => {
    const m = plain((await open('#/stats/temporada')).fn.tableModel('temporada'));
    const by = (k) => m.cols.find((c) => c.k === k);
    // Las columnas de un mismo grupo van juntas: la raya solo está donde empieza uno nuevo
    expect(by('pts').gs).toBe(true);
    expect(by('t1').gs).toBe(false);
    expect(by('t2').gs).toBe(false);
    expect(by('ro').gs).toBe(true);
    expect(by('rd').gs).toBe(false);
    expect(by('ast').gs).toBe(true);
    expect(by('fc').gs).toBe(true);
    expect(by('val').gs).toBe(true);
    expect(by('pts').hl).toBe(true);
    expect(by('val').hl).toBe(true);
    expect(by('ast').hl).toBe(false);
    expect(by('number').gs).toBe(false);
    expect(by('gp').gs).toBe(false);
  });

  it('la leyenda explica cada abreviatura visible, sin entre paréntesis ni el término técnico', async () => {
    const app = await open('#/stats/temporada');
    const basic = plain(app.fn.tableModel('temporada')).legend;
    expect(basic).toEqual(expect.arrayContaining(['PJ Partidos jugados', 'T1 Tiros libres', 'VAL Valoración']));
    // Sin «(anotados/intentados)» ni separadores que se confundan con los de la leyenda
    expect(basic.some((l) => l.includes('anotados') || l.includes('·'))).toBe(false);
    await app.act('adv', { v: '1' });
    const adv = plain(app.fn.tableModel('temporada')).legend;
    expect(adv).toContain('eFG% Acierto en el tiro, con el triple');
    expect(adv.some((l) => l.includes('·'))).toBe(false);
    expect(adv.every((l) => !l.startsWith('# ') && !l.startsWith('Jugador'))).toBe(true);
  });
});

describe('el botón «Tabla PNG» de Enviar', () => {
  const tableBtn = (app) => app.$('.modal [data-action="share-table"]');
  const prepared = async (app, arg) => {
    await app.act('share', { arg });
    await app.settle();
  };

  it('sale en un partido, en la temporada y en una fase, y se activa cuando la imagen está lista', async () => {
    for (const [hash, arg] of [['#/stats/g1', 'g1'], ['#/stats/temporada', 'temporada'], ['#/stats/fase-1', 'fase-1']]) {
      const app = await openApp({ data: makeData({ teams: [makeTeam({ phase: 2 })], games: games() }), hash });
      await prepared(app, arg);
      expect(tableBtn(app), arg).not.toBeNull();
      expect(tableBtn(app).disabled).toBe(false);
    }
  });

  it('dibuja la tabla con lo que se ve: título, cabeceras, jugadores y la web', async () => {
    const app = await open('#/stats/temporada');
    await prepared(app, 'temporada');
    const texts = app.canvasTexts.map((t) => t.text);
    expect(texts).toEqual(expect.arrayContaining(['Alevín A · Temporada', '2 partidos · Totales · Básicas', 'Jugador', 'PTS', 'Ana', 'Equipo', 'myownbasketballstats.com']));
  });

  it('recoge el estado de la pantalla al abrir Enviar: lo que se vea es lo que se exporta', async () => {
    const app = await open('#/stats/temporada');
    await app.act('adv', { v: '1' });
    await prepared(app, 'temporada');
    expect(app.canvasTexts.map((t) => t.text)).toEqual(expect.arrayContaining(['2 partidos · Totales · Avanzadas', 'eFG%']));
  });

  /** Un navegador que comparte archivos, o falla con el error indicado */
  function withShare(app, { error } = {}) {
    const shared = [];
    app.window.navigator.canShare = () => true;
    app.window.navigator.share = async (data) => {
      if (error) throw Object.assign(new Error('share'), { name: error });
      shared.push(data);
    };
    return shared;
  }

  it('con el menú de compartir del móvil, comparte el PNG de la tabla', async () => {
    const app = await open('#/stats/g1');
    const shared = withShare(app);
    await prepared(app, 'g1');
    await app.act('share-table');
    expect(shared).toHaveLength(1);
    const [file] = shared[0].files;
    expect(file.name).toBe('estadisticas-2026-10-03-vs-Rival.png');
    expect(file.type).toBe('image/png');
    expect(app.downloads).toEqual([]);
  });

  it('si el navegador no comparte archivos (ordenador), descarga el PNG con un nombre solo ASCII', async () => {
    const app = await open('#/stats/g1');
    await prepared(app, 'g1');
    await app.act('share-table');
    expect(app.downloads.map((d) => d.name)).toEqual(['estadisticas-2026-10-03-vs-Rival.png']);
    expect(app.toast).toContain('Imagen descargada');
  });

  it('la tarjeta y la tabla son archivos distintos y se pueden sacar las dos', async () => {
    const app = await open('#/stats/g1');
    await prepared(app, 'g1');
    await app.act('share-image');
    await app.act('share-table');
    expect(app.downloads.map((d) => d.name)).toEqual(['partido-Alevin_A-Rival-03_10_2026.png', 'estadisticas-2026-10-03-vs-Rival.png']);
  });

  it('si el usuario cierra el menú de compartir, no se descarga nada; si lo rechaza, se descarga', async () => {
    const app = await open('#/stats/g1');
    withShare(app, { error: 'AbortError' });
    await prepared(app, 'g1');
    await app.act('share-table');
    expect(app.downloads).toEqual([]);

    withShare(app, { error: 'NotAllowedError' });
    await app.act('share-table');
    expect(app.downloads).toHaveLength(1);
  });

  it('si no se puede dibujar, el botón no sale', async () => {
    const app = await open('#/stats/g1', { setup(w) { w.HTMLCanvasElement.prototype.toBlob = (cb) => cb(null); } });
    await prepared(app, 'g1');
    expect(tableBtn(app)).toBeNull();
  });
});
