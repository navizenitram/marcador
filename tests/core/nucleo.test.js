// Núcleo de cálculo (core.js): funciones puras, sin DOM ni estado de la app.
import { describe, expect, it } from 'vitest';
import { loadCore, plain } from '../helpers/core.js';
import { ev, makeGame, opp, sampleGame } from '../helpers/fixtures.js';

const core = loadCore();

describe('carga', () => {
  it('se carga sin DOM y expone sus funciones en un objeto congelado', () => {
    expect(Object.isFrozen(core)).toBe(true);
    for (const fn of ['blankLine', 'addEvent', 'sumLines', 'finish', 'score', 'periodScores', 'playerLines', 'scoreFlow', 'lineupAt']) {
      expect(typeof core[fn], fn).toBe('function');
    }
  });

  it('los tiros anotados valen 1, 2 y 3 puntos', () => {
    expect(plain(core.EV_PTS)).toEqual({ t1_ok: 1, t2_ok: 2, t3_ok: 3 });
  });
});

describe('estadísticas de un partido sin DOM', () => {
  it('marcador, parciales y líneas del partido de referencia', () => {
    const g = sampleGame();
    expect(plain(core.score(g))).toEqual({ us: 8, them: 4 });
    expect(plain(core.periodScores(g)).us.slice(0, 3)).toEqual([6, 0, 2]);
    expect(plain(core.periodScores(g)).them.slice(0, 3)).toEqual([2, 2, 0]);
    const lines = core.playerLines(g);
    expect(lines.p4).toMatchObject({ pts: 3, t2m: 1, t2a: 2, t1m: 1, t1a: 2, t3a: 1, rec: 1, fc: 1 });
    expect(lines.p7).toMatchObject({ pts: 3, rd: 1, ast: 1 });
  });

  it('tolera jugadas raras: tipo desconocido, sin periodo o de alguien que ya no está en la plantilla', () => {
    const g = makeGame({
      periods: 4,
      events: [{ id: 'a', seq: 1, type: 'mate', pid: 'p4' }, { id: 'b', seq: 2, type: 't3_ok', pid: 'baja' }, { id: 'c', seq: 3, period: 9, type: 'opp', pts: 1 }],
    });
    expect(plain(core.periodScores(g))).toEqual({ us: [3, 0, 0, 0], them: [0, 0, 0, 1] });
    const lines = core.playerLines(g);
    expect(lines.baja.pts).toBe(3);
    expect(lines.p4.val).toBe(0);
  });

  it('sumLines acumula una línea sobre otra', () => {
    const a = core.blankLine(), b = core.blankLine();
    core.addEvent(b, 't2_ok'); core.addEvent(b, 'rd');
    core.sumLines(a, b); core.sumLines(a, b);
    expect(plain(a)).toMatchObject({ t2m: 2, t2a: 2, rd: 2 });
  });

  it('la evolución del marcador acaba en el resultado final', () => {
    const flow = core.scoreFlow(sampleGame());
    expect(plain(flow.at(-1))).toMatchObject({ us: 8, them: 4 });
  });
});

describe('lineupAt (quinteto en pista en cada jugada)', () => {
  const A = ['p4', 'p7', 'p10', 'p12', 'p15'];
  const B = ['p4', 'p7', 'p10', 'p12', 'p21'];

  it('sin registro de quintetos (partido antiguo) no hay quinteto para ninguna jugada', () => {
    const g = makeGame({ events: [ev('t2_ok', 'p4'), opp(2)] });
    for (const e of g.events) expect(core.lineupAt(g, e.seq)).toBeNull();
  });

  it('cada jugada se atribuye al último quinteto anterior a ella', () => {
    const g = makeGame({
      lineupFrom: 1,
      lineups: [{ seq: 1, period: 1, on: A }, { seq: 4, period: 1, on: B }],
      events: [
        { id: 'a', seq: 2, period: 1, type: 't2_ok', pid: 'p4' },
        { id: 'b', seq: 3, period: 1, type: 'opp', pts: 2 },
        { id: 'c', seq: 5, period: 1, type: 'opp', pts: 3 },
      ],
      seq: 5,
    });
    expect(plain(core.lineupAt(g, 2))).toEqual(A);
    expect(plain(core.lineupAt(g, 3))).toEqual(A);
    expect(plain(core.lineupAt(g, 5))).toEqual(B);
  });

  it('lo anterior al inicio del registro no tiene quinteto (partido a medias al actualizar la app)', () => {
    const g = makeGame({ lineupFrom: 10, lineups: [{ seq: 10, period: 3, on: A }], seq: 11 });
    expect(core.lineupAt(g, 9)).toBeNull();
    expect(plain(core.lineupAt(g, 11))).toEqual(A);
  });

  it('devuelve una copia: cambiarla no toca el registro', () => {
    const g = makeGame({ lineupFrom: 1, lineups: [{ seq: 1, period: 1, on: [...A] }], seq: 2 });
    core.lineupAt(g, 2).push('p21');
    expect(plain(g.lineups[0].on)).toEqual(A);
  });
});
