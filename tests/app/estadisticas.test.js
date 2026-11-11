import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { ev, makeData, makeGame, makeTeam, opp, PLAYERS, sampleGame } from '../helpers/fixtures.js';

let app;
beforeAll(async () => { app = await openApp(); });
afterAll(() => app.close());

/** Línea de un jugador a partir de una lista de acciones */
const lineOf = (...types) => {
  const l = app.fn.blankLine();
  for (const t of types) app.fn.addEvent(l, t);
  return l;
};

describe('addEvent', () => {
  it('un tiro anotado suma anotado e intento; uno fallado, solo intento', () => {
    const l = lineOf('t1_ok', 't1_ko', 't1_ko', 't2_ok', 't2_ko', 't3_ok', 't3_ok', 't3_ko');
    expect(l).toMatchObject({ t1m: 1, t1a: 3, t2m: 1, t2a: 2, t3m: 2, t3a: 3 });
  });

  it('cuenta el resto de acciones por su clave', () => {
    const l = lineOf('rec', 'lost', 'ro', 'rd', 'rd', 'ast', 'blk', 'blkr', 'fc', 'fc', 'fr');
    expect(l).toMatchObject({ rec: 1, lost: 1, ro: 1, rd: 2, ast: 1, blk: 1, blkr: 1, fc: 2, fr: 1 });
  });

  it('ignora tipos desconocidos y los puntos del rival', () => {
    expect(lineOf('opp', 'mate', 'pts')).toEqual(app.fn.blankLine());
  });
});

describe('finish (puntos, rebotes y valoración ACB)', () => {
  it('calcula puntos, rebotes, tiros fallados y valoración', () => {
    const l = app.fn.finish({
      ...app.fn.blankLine(),
      t1m: 2, t1a: 4, t2m: 3, t2a: 5, t3m: 1, t3a: 3,
      ro: 2, rd: 3, ast: 4, blk: 1, blkr: 1, rec: 2, lost: 3, fc: 2, fr: 1,
    });
    expect(l.pts).toBe(2 + 3 * 2 + 1 * 3);           // 11
    expect(l.reb).toBe(5);
    expect(l.miss).toBe(2 + 2 + 2);                  // cada tiro fallado resta 1, sea de 1, 2 o 3
    // (11 + 5 reb + 4 as + 2 rec + 1 tap + 1 fr) − (6 fallos + 1 tr + 3 pér + 2 fc)
    expect(l.val).toBe(24 - 12);
  });

  it('una línea vacía vale 0', () => {
    expect(app.fn.finish(app.fn.blankLine())).toMatchObject({ pts: 0, reb: 0, miss: 0, val: 0 });
  });

  it('un triple fallado resta lo mismo que un tiro libre fallado', () => {
    expect(app.fn.finish(lineOf('t3_ko')).val).toBe(-1);
    expect(app.fn.finish(lineOf('t1_ko')).val).toBe(-1);
  });

  it('cada acción positiva suma 1 y cada negativa resta 1', () => {
    for (const t of ['rec', 'ro', 'rd', 'ast', 'blk', 'fr']) expect(app.fn.finish(lineOf(t)).val, t).toBe(1);
    for (const t of ['lost', 'blkr', 'fc']) expect(app.fn.finish(lineOf(t)).val, t).toBe(-1);
  });
});

describe('score y periodScores', () => {
  it('suma los tiros anotados propios y los puntos del rival (incluidas correcciones −1)', () => {
    expect(app.fn.score(sampleGame())).toEqual({ us: 8, them: 4 });
  });

  it('un partido sin jugadas va 0-0', () => {
    expect(app.fn.score(makeGame())).toEqual({ us: 0, them: 0 });
  });

  it('reparte los puntos por periodo', () => {
    const ps = app.fn.periodScores(sampleGame());
    expect([...ps.us]).toEqual([6, 0, 2, 0, 0, 0, 0, 0]);
    expect([...ps.them]).toEqual([2, 2, 0, 0, 0, 0, 0, 0]);
  });

  it('tiene tantos parciales como periodos (4 cuartos)', () => {
    const ps = app.fn.periodScores(makeGame({ periods: 4, events: [ev('t2_ok', 'p4', 4)] }));
    expect([...ps.us]).toEqual([0, 0, 0, 2]);
  });

  it('lleva al primer o al último periodo las jugadas con un periodo fuera de rango', () => {
    const g = makeGame({ periods: 4, events: [{ ...ev('t2_ok', 'p4'), period: 0 }, { ...ev('t3_ok', 'p4'), period: 9 }, { ...opp(1), period: undefined }] });
    const ps = app.fn.periodScores(g);
    expect([...ps.us]).toEqual([2, 0, 0, 3]);
    expect([...ps.them]).toEqual([1, 0, 0, 0]);
  });
});

describe('scoreFlow (evolución del marcador)', () => {
  it('da el marcador tras cada anotación, en el orden del partido', () => {
    const flow = app.fn.scoreFlow(sampleGame());
    expect(flow.map((p) => [p.period, p.us, p.them])).toEqual([
      [1, 2, 0], [1, 3, 0], [1, 3, 2], [1, 6, 2],   // P1: 2✓ y 1✓ de Ana, +2 del rival, triple de Bruno
      [2, 6, 5], [2, 6, 4],                           // P2: +3 del rival y su corrección −1
      [3, 8, 4],                                      // P3: 2✓ de Carla
    ]);
  });

  it('coloca cada anotación dentro del tramo de su periodo, de izquierda a derecha', () => {
    const flow = app.fn.scoreFlow(sampleGame());
    for (const p of flow) {
      expect(p.x).toBeGreaterThan(p.period - 1);
      expect(p.x).toBeLessThan(p.period);
    }
    expect(flow.map((p) => p.x)).toEqual([...flow.map((p) => p.x)].sort((a, b) => a - b));
  });

  it('ordena por periodo aunque una jugada de un periodo anterior se apunte después', () => {
    const g = makeGame({ events: [ev('t2_ok', 'p4', 2), opp(3, 1)] });
    expect(app.fn.scoreFlow(g).map((p) => [p.period, p.us, p.them])).toEqual([[1, 0, 3], [2, 2, 3]]);
  });

  it('ignora las jugadas que no dan puntos y lleva al último periodo las que están fuera de rango', () => {
    const g = makeGame({ periods: 4, events: [ev('rd', 'p4', 1), ev('t2_ko', 'p4', 1), ev('t3_ok', 'p4', 9)] });
    expect(app.fn.scoreFlow(g).map((p) => [p.period, p.us, p.them])).toEqual([[4, 3, 0]]);
    expect(app.fn.scoreFlow(makeGame())).toEqual([]);
  });

  it('flowEnd: la línea llega al final si el partido está finalizado; si no, hasta donde va el partido', () => {
    const g = sampleGame({ period: 3 });
    const flow = app.fn.scoreFlow(g);
    expect(app.fn.flowEnd({ ...g, finished: true }, flow)).toBe(8);
    expect(app.fn.flowEnd(g, flow)).toBe(flow.at(-1).x);           // última anotación, en el P3
    expect(app.fn.flowEnd({ ...g, period: 6 }, flow)).toBe(5);     // en el P6 aún no se ha anotado: su inicio
  });

  it('flowScale incluye siempre el cero, con margen a los dos lados', () => {
    const { hi, lo, y } = app.fn.flowScale([{ us: 10, them: 0 }, { us: 10, them: 3 }]);
    expect([hi, lo]).toEqual([10, -2]);
    expect(y(10)).toBe(0);
    expect(y(-2)).toBe(100);
    expect(y(0)).toBeCloseTo(83.3, 1);
  });
});

describe('playerLines y gameRows (estadísticas de un partido)', () => {
  it('da una línea a cada jugador convocado, aunque no haya hecho nada', () => {
    const lines = app.fn.playerLines(sampleGame());
    expect(Object.keys(lines).sort()).toEqual(PLAYERS.map((p) => p.id).sort());
    expect(lines.p15).toMatchObject({ pts: 0, val: 0 });
  });

  it('incluye a quien tiene jugadas aunque ya no esté en la convocatoria', () => {
    const g = sampleGame({ events: [ev('t2_ok', 'baja')] });
    expect(app.fn.playerLines(g).baja).toMatchObject({ pts: 2 });
  });

  it('calcula la línea de cada jugador', () => {
    const rows = Object.fromEntries(app.fn.gameRows(sampleGame()).map((r) => [r.id, r]));
    expect(rows.p4).toMatchObject({ pts: 3, t1m: 1, t1a: 2, t2m: 1, t2a: 2, t3m: 0, t3a: 1, rec: 1, fc: 1, miss: 3, val: 0 });
    expect(rows.p7).toMatchObject({ pts: 3, reb: 1, ast: 1, val: 5 });
    expect(rows.p10).toMatchObject({ pts: 2, lost: 1, blkr: 1, val: 0 });
    expect(rows.p12).toMatchObject({ pts: 0, ro: 1, reb: 1, val: 1 });
  });

  it('ordena por dorsal y lista los periodos jugados en orden', () => {
    const rows = app.fn.gameRows(sampleGame());
    expect(rows.map((r) => r.number)).toEqual(['4', '7', '10', '12', '15', '21']);
    expect(rows[0]).toMatchObject({ nper: 2, perList: [1, 2] });
  });

  it('cuenta como partido jugado haber estado en pista o tener alguna jugada', () => {
    const gp = Object.fromEntries(app.fn.gameRows(sampleGame()).map((r) => [r.id, r.gp]));
    expect(gp).toEqual({ p4: 1, p7: 1, p10: 1, p12: 1, p15: 0, p21: 0 });
  });

  it('totalsRow suma las líneas del equipo', () => {
    const rows = app.fn.gameRows(sampleGame());
    const t = app.fn.totalsRow(rows, 1);
    expect(t).toMatchObject({ id: '_team', name: 'Equipo', gp: 1, pts: 8, reb: 2, ast: 1, nper: 4, val: 6 });
  });
});

describe('seasonRows y averageRow (temporada)', () => {
  const season = async (teams, games) => {
    const a = await openApp({ data: makeData({ teams, games }), hash: '#/partidos' });
    return Object.fromEntries(a.fn.seasonRows(a.fn.teamGames()).map((r) => [r.id, r]));
  };

  it('acumula los partidos del equipo y cuenta partidos y periodos jugados', async () => {
    const g2 = makeGame({ id: 'g2', date: '2026-10-10', finished: true, played: { p4: [1], p7: [1] }, events: [ev('t2_ok', 'p4'), ev('t2_ok', 'p4')] });
    const rows = await season([makeTeam()], [sampleGame(), g2]);
    expect(rows.p4).toMatchObject({ gp: 2, nper: 3, pts: 7 });
    // Bruno estuvo en pista en el segundo partido aunque no hizo nada: cuenta como jugado
    expect(rows.p7).toMatchObject({ gp: 2, pts: 3 });
    expect(rows.p15).toMatchObject({ gp: 0, pts: 0 });
  });

  it('no mezcla partidos de otros equipos', async () => {
    const other = makeGame({ id: 'gx', teamId: 't2', events: [ev('t3_ok', 'p4')], played: { p4: [1] } });
    const rows = await season([makeTeam(), makeTeam({ id: 't2', name: 'Infantil' })], [sampleGame(), other]);
    expect(rows.p4).toMatchObject({ gp: 1, pts: 3 });
  });

  it('usa el dorsal y el nombre actuales del jugador', async () => {
    const team = makeTeam({ players: PLAYERS.map((p) => (p.id === 'p4' ? { ...p, number: '44', name: 'Ana María' } : p)) });
    const rows = await season([team], [sampleGame()]);
    expect(rows.p4).toMatchObject({ number: '44', name: 'Ana María' });
  });

  it('incluye a las altas sin partidos y a las bajas con partidos, pero no a bajas que nunca jugaron', async () => {
    const team = makeTeam({ players: [...PLAYERS.filter((p) => !['p12', 'p21'].includes(p.id)), { id: 'p30', number: '30', name: 'Nueva' }] });
    const rows = await season([team], [sampleGame()]);
    expect(rows.p30).toMatchObject({ gp: 0 });  // alta nueva, sin partidos
    expect(rows.p12).toMatchObject({ gp: 1 });  // baja que sí jugó
    expect(rows.p21).toBeUndefined();           // baja convocada que no llegó a jugar
  });

  it('averageRow divide por partidos jugados y redondea a un decimal', () => {
    const r = { id: 'x', number: '4', name: 'Ana', gp: 3, nper: 5, ...app.fn.finish({ ...app.fn.blankLine(), t2m: 5, t2a: 7, rd: 2 }) };
    expect(app.fn.averageRow(r)).toMatchObject({ gp: 3, pts: 3.3, t2m: 1.7, t2a: 2.3, reb: 0.7, nper: 1.7 });
  });

  it('averageRow deja igual a quien no ha jugado (sin dividir por cero)', () => {
    const r = { id: 'x', gp: 0, ...app.fn.finish(app.fn.blankLine()) };
    expect(app.fn.averageRow(r)).toBe(r);
  });
});
