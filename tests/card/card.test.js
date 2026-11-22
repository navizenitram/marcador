// Tarjeta del partido como imagen (public/minibasket-stats/card.js): dibujo, ajuste de textos largos, PNG y nombre de
// archivo. Se carga sola en un contexto vacío y se dibuja en un contexto 2D falso (tests/helpers/canvas.js).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { fakeContext, written } from '../helpers/canvas.js';

const FILE = fileURLToPath(new URL('../../public/minibasket-stats/card.js', import.meta.url));
const SCRIPT = new vm.Script(readFileSync(FILE, 'utf8'), { filename: FILE });

/** MBCard de una carga nueva de card.js; `globals` es lo que el navegador le da (document…) */
function loadCard(globals = {}) {
  const ctx = vm.createContext(globals);
  SCRIPT.runInContext(ctx);
  return ctx.MBCard;
}

const GREEN = '#00e676';
const BLUE = '#29b6f6';

const model = (over = {}) => ({
  date: '03/10/2026',
  meta: 'Local · 2ª fase',
  result: 'win',
  host: 'myownbasketballstats.com',
  home: { name: 'Alevín A', score: 48, us: true },
  away: { name: 'Rival', score: 36, us: false },
  periods: { labels: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'], home: [6, 8, 4, 10, 6, 4, 5, 5], away: [2, 6, 8, 4, 6, 2, 4, 4] },
  leaders: [
    { label: 'Máx. anotador', value: 14, who: '#7 Bruno' },
    { label: 'Más rebotes', value: 9, who: '#4 Ana' },
  ],
  ...over,
});

/** Textos que escribe draw(), con su posición y su color */
function drawn(m) {
  const texts = [];
  loadCard().draw(fakeContext(texts), m);
  return texts;
}
const find = (texts, text) => texts.find((t) => t.text === text);
const px = (t) => parseFloat(/(\d+)px/.exec(t.font)[1]);

describe('dibujo de la tarjeta', () => {
  it('escribe la fecha y el campo, el resultado, los parciales, los líderes y la web', () => {
    const texts = written(drawn(model()));
    expect(texts).toEqual(expect.arrayContaining([
      '03/10/2026   ·   Local · 2ª fase', 'VICTORIA',
      'ALEVÍN A', '48', 'RIVAL', '36',
      'PARCIALES', 'P1', 'P8', 'TOTAL', 'Alevín A', 'Rival',
      'LÍDERES', 'MÁX. ANOTADOR', '14', '#7 Bruno', 'MÁS REBOTES', '9', '#4 Ana',
      'myownbasketballstats.com',
    ]));
  });

  it('el local queda a la izquierda y se pinta de verde si es el nuestro y de azul si es el rival', () => {
    const texts = drawn(model());
    const home = find(texts, '48'), away = find(texts, '36');
    expect(home.x).toBeLessThan(540);
    expect(away.x).toBeGreaterThan(540);
    expect([home.fillStyle, away.fillStyle]).toEqual([GREEN, BLUE]);

    // De visitante, el rival va a la izquierda y el nuestro, a la derecha
    const visitor = drawn(model({ home: { name: 'Rival', score: 36, us: false }, away: { name: 'Alevín A', score: 48, us: true } }));
    expect(find(visitor, '36').x).toBeLessThan(540);
    expect(find(visitor, '36').fillStyle).toBe(BLUE);
    expect(find(visitor, '48').x).toBeGreaterThan(540);
    expect(find(visitor, '48').fillStyle).toBe(GREEN);
  });

  it('la etiqueta dice victoria, derrota, empate o en juego según el resultado', () => {
    const label = (result) => written(drawn(model({ result }))).find((t) => /^(VICTORIA|DERROTA|EMPATE|EN JUEGO)$/.test(t));
    expect(['win', 'loss', 'tie', null].map(label)).toEqual(['VICTORIA', 'DERROTA', 'EMPATE', 'EN JUEGO']);
  });

  it('marca en color el periodo que gana cada equipo y deja en gris el que pierde', () => {
    const texts = drawn(model());
    const cells = texts.filter((t) => ['6', '8', '4', '10', '5', '2'].includes(t.text) && t.textAlign === 'center' && px(t) === 38);
    // 8 periodos de cada equipo, en el orden en que se dibujan: primero la fila del local, luego la del rival
    expect(cells).toHaveLength(16);
    const home = cells.slice(0, 8), away = cells.slice(8);
    expect(home.map((c) => c.fillStyle)).toEqual([GREEN, GREEN, '#94a2b6', GREEN, '#94a2b6', GREEN, GREEN, GREEN]);
    expect(away.map((c) => c.fillStyle)).toEqual(['#94a2b6', '#94a2b6', BLUE, '#94a2b6', '#94a2b6', '#94a2b6', '#94a2b6', '#94a2b6']);
  });

  it('a 4 cuartos solo hay 4 columnas', () => {
    const texts = written(drawn(model({ periods: { labels: ['Q1', 'Q2', 'Q3', 'Q4'], home: [12, 10, 14, 12], away: [9, 11, 8, 8] } })));
    expect(texts).toEqual(expect.arrayContaining(['Q1', 'Q4']));
    expect(texts).not.toContain('Q5');
    expect(texts).not.toContain('P1');
  });

  it('sin líderes (partidos de marcador) no hay bloque de líderes', () => {
    const texts = written(drawn(model({ leaders: [] })));
    expect(texts).not.toContain('LÍDERES');
    expect(texts).toContain('PARCIALES');
  });

  it('sin campo ni fase, la cabecera lleva solo la fecha', () => {
    expect(written(drawn(model({ meta: '' })))).toContain('03/10/2026');
  });

  it('un nombre largo se reduce y se corta con «…» sin salirse de su hueco', () => {
    const long = 'Club Bàsquet Sant Andreu de la Barca Infantil Masculino B';
    const texts = drawn(model({ home: { name: long, score: 50, us: false } }));
    const cut = texts.filter((t) => t.text.endsWith('…'));
    // Sale cortado en el resultado (hueco de 400 px) y en la fila de parciales (210 px)
    expect(cut).toHaveLength(2);
    for (const t of cut) {
      const room = px(t) === 30 ? 400 : 210;
      expect(t.text.length * px(t) * 0.5).toBeLessThanOrEqual(room);
      expect(t.text.startsWith('CLUB') || t.text.startsWith('Club')).toBe(true);
    }
    // Uno corto no se toca y se queda con el cuerpo grande
    expect(px(find(texts, 'RIVAL'))).toBe(48);
  });

  it('un nombre de jugador largo en los líderes también se ajusta a su tarjeta', () => {
    const who = '#10 Carla Fernández-Villanueva de la Cruz y Montoya';
    const texts = drawn(model({ leaders: [{ label: 'Más asistencias', value: 6, who }] }));
    const shown = texts.find((t) => t.text.startsWith('#10 Carla'));
    expect(shown.text.endsWith('…')).toBe(true);
    // Hueco: la tarjeta (456) menos los márgenes (28 y 24), el valor (un dígito a 70 px = 35) y el espacio que lo separa (22)
    expect(shown.text.length * px(shown) * 0.5).toBeLessThanOrEqual(456 - 28 - 35 - 22 - 24);
  });

  it('todo cabe dentro de la imagen, con o sin líderes', () => {
    const { WIDTH, HEIGHT } = loadCard();
    for (const leaders of [[], model().leaders, [...model().leaders, ...model().leaders]]) {
      for (const t of drawn(model({ leaders }))) {
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.x).toBeLessThanOrEqual(WIDTH);
        expect(t.y).toBeGreaterThan(0);
        expect(t.y).toBeLessThanOrEqual(HEIGHT);
      }
    }
  });
});

describe('PNG de la tarjeta (toBlob)', () => {
  /** document falso con un canvas que apunta su tamaño y los textos que se dibujan */
  function fakeDocument({ ctx = true, blob = true, fonts } = {}) {
    const texts = [];
    const canvas = {
      width: 0, height: 0,
      getContext: () => (ctx ? fakeContext(texts) : null),
      toBlob: (cb, type) => cb(blob ? new Blob(['png'], { type }) : null),
    };
    return { texts, canvas, document: { createElement: (tag) => (tag === 'canvas' ? canvas : null), fonts } };
  }

  it('devuelve un PNG de 1080 × 1350 con la tarjeta dibujada', async () => {
    const f = fakeDocument();
    const blob = await loadCard({ document: f.document }).toBlob(model());
    expect(blob.type).toBe('image/png');
    expect([f.canvas.width, f.canvas.height]).toEqual([1080, 1350]);
    expect(written(f.texts)).toContain('VICTORIA');
  });

  it('espera a las fuentes de la app antes de dibujar', async () => {
    const loaded = [];
    const f = fakeDocument({ fonts: { load: async (spec) => { loaded.push(spec); } } });
    await loadCard({ document: f.document }).toBlob(model());
    expect(loaded.join(' ')).toMatch(/Rajdhani.*Barlow|Barlow.*Rajdhani/);
  });

  it('si las fuentes fallan, dibuja igual con la de reserva', async () => {
    const f = fakeDocument({ fonts: { load: async () => { throw new Error('sin fuente'); } } });
    await expect(loadCard({ document: f.document }).toBlob(model())).resolves.toBeInstanceOf(Blob);
  });

  it('falla, para que la app oculte el botón, si el navegador no da contexto o no genera la imagen', async () => {
    await expect(loadCard({ document: fakeDocument({ ctx: false }).document }).toBlob(model())).rejects.toThrow();
    await expect(loadCard({ document: fakeDocument({ blob: false }).document }).toBlob(model())).rejects.toThrow();
  });
});

describe('nombre del archivo', () => {
  const { fileName } = loadCard();

  it('lleva los dos equipos y la fecha', () => {
    expect(fileName(model())).toBe('partido-Alevin_A-Rival-03_10_2026.png');
  });

  it('quita lo que no se puede poner en un nombre de archivo', () => {
    const name = fileName(model({ away: { name: 'Los "Súper" /Ñus?: B', score: 1, us: false } }));
    expect(name).toBe('partido-Alevin_A-Los_Super_Nus_B-03_10_2026.png');
    // Solo ASCII sin signos: Chromium descarga como «download» si el nombre lleva una letra acentuada
    expect(name).toMatch(/^[A-Za-z0-9_.-]+$/);
  });
});

describe('tabla completa (type: table)', () => {
  const GRAY_ZERO = '#4b5565', GRAY_DNP = '#5a6575', AMBER = '#ffca28', RED = '#ff5252';
  const cell = (text, extra = {}) => ({ text, ...extra });

  const tmodel = (over = {}) => ({
    type: 'table',
    title: 'Alevín A · Temporada',
    subtitle: '2 partidos · Totales · Básicas',
    fileBase: 'estadisticas-temporada-2026-11-21',
    host: 'myownbasketballstats.com',
    cols: [{ k: 'number', h: '#' }, { k: 'name', h: 'Jugador' }, { k: 'pts', h: 'PTS', hl: true, gs: true }, { k: 't2', h: 'T2' }, { k: 'val', h: 'VAL', gs: true, hl: true }],
    rows: [
      { cells: [cell('4'), cell('Ana'), cell('7'), cell('3/4', { sub: '75%' }), cell('5', { tone: 'pos' })] },
      { cells: [cell('7'), cell('Bruno'), cell('0', { tone: 'zero' }), cell('0/1', { sub: '0%' }), cell('−2', { tone: 'neg' })] },
      { dnp: true, cells: [cell('15'), cell('Eva'), cell('0'), cell('0/0', { sub: '–' }), cell('0')] },
    ],
    total: { cells: [cell(''), cell('Equipo'), cell('7'), cell('3/5', { sub: '60%' }), cell('3')] },
    legend: ['PTS Puntos', 'T2 Tiros de 2', 'VAL Valoración'],
    note: '',
    ...over,
  });

  /** Textos de la tabla dibujada y su medida */
  function drawnTable(m) {
    const texts = [];
    const ctx = fakeContext(texts);
    const card = loadCard();
    card.draw(ctx, m);
    return { texts, layout: card.tableLayout(fakeContext(), m) };
  }

  it('escribe el título, el subtítulo, las cabeceras, cada celda, la leyenda y la web', () => {
    const { texts } = drawnTable(tmodel());
    expect(written(texts)).toEqual(expect.arrayContaining([
      'Alevín A · Temporada', '2 partidos · Totales · Básicas',
      '#', 'Jugador', 'PTS', 'T2', 'VAL',
      'Ana', '3/4', '75%', 'Bruno', '−2', 'Eva', 'Equipo', '3/5', '60%',
      'myownbasketballstats.com',
    ]));
    // La leyenda junta las abreviaturas en líneas con un separador
    expect(texts.some((t) => t.text.includes('PTS Puntos') && t.text.includes('VAL Valoración'))).toBe(true);
  });

  it('el porcentaje va debajo del valor y más pequeño', () => {
    const { texts } = drawnTable(tmodel());
    const main = find(texts, '3/4'), sub = find(texts, '75%');
    expect(sub.y).toBeGreaterThan(main.y);
    expect(px(sub)).toBeLessThan(px(main));
    expect(sub.x).toBe(main.x);
  });

  it('colorea por tono: verde si suma, rojo si resta, ceros atenuados, a quien no jugó apagado y lo destacado en ámbar', () => {
    const { texts } = drawnTable(tmodel());
    expect(find(texts, '5').fillStyle).toBe(GREEN);
    expect(find(texts, '−2').fillStyle).toBe(RED);
    expect(find(texts, 'Bruno').fillStyle).toBe('#edf1f5');
    // El cero de Bruno (tono zero), no el de la fila apagada de Eva
    const zeros = texts.filter((t) => t.text === '0');
    expect(zeros.map((t) => t.fillStyle)).toEqual([GRAY_ZERO, GRAY_DNP, GRAY_DNP]);
    expect(find(texts, 'Eva').fillStyle).toBe(GRAY_DNP);
    // En orden de dibujo: los puntos de Ana (columna destacada, ámbar), el dorsal 7 de Bruno (no) y los del equipo
    expect(texts.filter((t) => t.text === '7').map((t) => t.fillStyle)).toEqual([AMBER, '#edf1f5', AMBER]);
    expect(find(texts, 'PTS').fillStyle).toBe(AMBER);
    expect(find(texts, 'T2').fillStyle).toBe('#94a2b6');
  });

  it('el nombre va a la izquierda de su columna y los números, centrados', () => {
    const { texts } = drawnTable(tmodel());
    expect(find(texts, 'Ana').textAlign).toBe('left');
    expect(find(texts, 'Jugador').textAlign).toBe('left');
    expect(find(texts, '3/4').textAlign).toBe('center');
    expect(find(texts, 'VAL').textAlign).toBe('center');
  });

  it('las filas van en orden de arriba abajo y la del equipo, al final', () => {
    const { texts } = drawnTable(tmodel());
    const ys = ['Ana', 'Bruno', 'Eva', 'Equipo'].map((n) => find(texts, n).y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  });

  it('el alto crece con cada jugador y el ancho con las columnas', () => {
    const base = drawnTable(tmodel()).layout;
    const more = drawnTable(tmodel({ rows: [...tmodel().rows, ...tmodel().rows] })).layout;
    expect(more.H - base.H).toBe(3 * base.rowH);
    expect(more.W).toBe(base.W);
    const wide = tmodel({
      cols: [...tmodel().cols, ...Array.from({ length: 16 }, (_, i) => ({ k: `c${i}`, h: `C${i}` }))],
      rows: tmodel().rows.map((r) => ({ ...r, cells: [...r.cells, ...Array.from({ length: 16 }, () => cell('12'))] })),
      total: { cells: [...tmodel().total.cells, ...Array.from({ length: 16 }, () => cell('12'))] },
    });
    const w = drawnTable(wide).layout;
    expect(w.W).toBeGreaterThan(base.W);
    expect(w.W).toBe(w.tableW + 2 * 56);
  });

  it('con pocas columnas la imagen no baja de 1200 de ancho y la tabla queda centrada', () => {
    const { layout } = drawnTable(tmodel());
    expect(layout.W).toBe(1200);
    expect(layout.x0).toBeCloseTo((1200 - layout.tableW) / 2);
  });

  it('las filas sin porcentaje son más bajas', () => {
    const plainCells = (r) => ({ ...r, cells: r.cells.map(({ text, tone }) => ({ text, tone })) });
    const flat = tmodel({ rows: tmodel().rows.map(plainCells), total: plainCells(tmodel().total) });
    expect(drawnTable(flat).layout.rowH).toBeLessThan(drawnTable(tmodel()).layout.rowH);
  });

  it('un nombre largo se corta con «…» sin pasar de 420 de ancho de columna', () => {
    const m = tmodel();
    m.rows[0].cells[1] = cell('Carla Fernández-Villanueva de la Cruz y Montoya');
    const { texts, layout } = drawnTable(m);
    const cut = texts.find((t) => t.text.startsWith('Carla'));
    expect(cut.text.endsWith('…')).toBe(true);
    expect(layout.widths[1]).toBe(420);
  });

  it('una leyenda larga se reparte en varias líneas dentro del ancho y suma alto', () => {
    const long = Array.from({ length: 18 }, (_, i) => `A${i} Una explicación bastante larga de la abreviatura ${i}`);
    const base = drawnTable(tmodel()).layout;
    const m = drawnTable(tmodel({ legend: long })).layout;
    expect(m.legend.length).toBeGreaterThan(3);
    expect(m.H).toBeGreaterThan(base.H);
    for (const line of m.legend) expect(line.length * 26 * 0.5).toBeLessThanOrEqual(m.W - 2 * 56);
  });

  it('el aviso de las avanzadas va aparte, en ámbar, antes de la leyenda', () => {
    const note = '* = pocos tiros: tómalo con cautela.';
    const { texts } = drawnTable(tmodel({ note }));
    const n = texts.find((t) => t.text.startsWith('* = pocos'));
    expect(n.fillStyle).toBe(AMBER);
    expect(n.y).toBeLessThan(texts.find((t) => t.text.includes('PTS Puntos')).y);
  });

  it('todo cabe dentro de la imagen', () => {
    const { texts, layout } = drawnTable(tmodel({ note: '* aviso' }));
    for (const t of texts) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(layout.W);
      expect(t.y).toBeGreaterThan(0);
      expect(t.y).toBeLessThanOrEqual(layout.H);
    }
  });

  it('un partido de marcador (sin jugadores) dibuja solo la fila del equipo', () => {
    const { texts } = drawnTable(tmodel({ rows: [] }));
    expect(written(texts)).toContain('Equipo');
    expect(written(texts)).not.toContain('Ana');
  });

  it('toBlob da un PNG del tamaño que pide la tabla, no el de la tarjeta', async () => {
    const texts = [];
    const canvas = { width: 0, height: 0, getContext: () => fakeContext(texts), toBlob: (cb, type) => cb(new Blob(['png'], { type })) };
    const card = loadCard({ document: { createElement: () => canvas } });
    const m = tmodel();
    const blob = await card.toBlob(m);
    const size = card.tableLayout(fakeContext(), m);
    expect(blob.type).toBe('image/png');
    expect([canvas.width, canvas.height]).toEqual([size.W, size.H]);
    expect([canvas.width, canvas.height]).not.toEqual([1080, 1350]);
    expect(written(texts)).toContain('Alevín A · Temporada');
  });

  it('el nombre del archivo sale de la base del CSV, solo en ASCII', () => {
    const { tableFileName } = loadCard();
    expect(tableFileName(tmodel())).toBe('estadisticas-temporada-2026-11-21.png');
    expect(tableFileName(tmodel({ fileBase: 'estadisticas-2026-10-03-vs-Peñíscola "B"' }))).toBe('estadisticas-2026-10-03-vs-Peniscola_B.png');
  });
});
