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

  it('el rebote sin distinguir (botón único REB) cuenta en los rebotes totales y en la valoración', () => {
    const l = core.blankLine();
    core.addEvent(l, 'reb'); core.addEvent(l, 'reb'); core.addEvent(l, 'ro');
    core.finish(l);
    expect(plain(l)).toMatchObject({ rb: 2, ro: 1, rd: 0, reb: 3, val: 3 });
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

describe('lineupRun (+/- del quinteto en pista desde que entró)', () => {
  const A = ['p4', 'p7', 'p10', 'p12', 'p15'];
  const B = ['p4', 'p7', 'p10', 'p12', 'p21'];
  const at = (seq, type, extra = {}) => ({ id: `e${seq}`, seq, period: 1, type, pid: 'p4', ...extra });

  it('cuenta solo desde la entrada del quinteto actual', () => {
    const g = makeGame({
      onCourt: [...B], lineupFrom: 1,
      lineups: [{ seq: 1, period: 1, on: A }, { seq: 4, period: 1, on: B }],
      events: [at(2, 't3_ok'), at(3, 'opp', { pts: 2 }), at(5, 't2_ok'), at(6, 'opp', { pts: 3 }), at(7, 't1_ok')],
    });
    expect(plain(core.lineupRun(g))).toEqual({ pf: 3, pc: 3, pm: 0 });
  });

  it('un cambio de periodo sin cambiar a nadie no corta la cuenta', () => {
    const g = makeGame({
      onCourt: [...A], lineupFrom: 1,
      lineups: [{ seq: 1, period: 1, on: A }, { seq: 3, period: 2, on: [...A].reverse() }],
      events: [at(2, 't2_ok'), at(4, 'opp', { pts: 1 })],
    });
    expect(core.lineupRun(g).pm).toBe(1);
  });

  it('no cuenta lo apuntado tras volver a un periodo anterior (como el +/- de cada jugador)', () => {
    const g = makeGame({
      onCourt: [...A], lineupFrom: 1, period: 3,
      lineups: [{ seq: 1, period: 3, on: A }, { seq: 3, period: 2, on: A }, { seq: 5, period: 3, on: A }],
      events: [at(2, 't2_ok', { period: 3 }), at(4, 'opp', { pts: 2, period: 2 }), at(6, 't1_ok', { period: 3 })],
    });
    expect(plain(core.lineupRun(g))).toEqual({ pf: 3, pc: 0, pm: 3 });
    expect(core.plusMinus(g).p4.pm).toBe(3);
  });

  it('sin registro de quintetos o sin nadie en pista no hay cuenta', () => {
    expect(core.lineupRun(makeGame({ onCourt: [...A], events: [at(1, 't2_ok')] }))).toBeNull();
    expect(core.lineupRun(makeGame({ onCourt: [], lineupFrom: 1, lineups: [{ seq: 1, period: 1, on: A }] }))).toBeNull();
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
