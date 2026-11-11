// +/- y mejores quintetos (core.js), fase 1B de docs/plan-mejoras-bsa.md. Todo se mide en periodos, sin reloj.
import { describe, expect, it } from 'vitest';
import { loadCore, plain } from '../helpers/core.js';
import { makeGame } from '../helpers/fixtures.js';

const core = loadCore();
const A = ['p4', 'p7', 'p10', 'p12', 'p15'];
const B = ['p4', 'p7', 'p10', 'p12', 'p21'];
const e = (seq, period, type, extra = {}) => ({ id: `x${seq}`, seq, period, type, ...extra });

/*
 * Partido de referencia (8-6 en lo registrado):
 *   P1: A → +2, rival +2, RD   (3 jugadas)   ·   cambio p15 → p21   ·   B → +3, rival +1   (2 jugadas)
 *   P2: B → +2, rival +2, rival −1 (corrección), +1 tiro libre   (4 jugadas)
 * Reparto del P1 por jugadas: A 3/5 = 0,6 periodos, B 2/5 = 0,4.
 */
const game = (over = {}) => makeGame({
  lineupFrom: 1,
  lineups: [{ seq: 1, period: 1, on: A }, { seq: 5, period: 1, on: B }, { seq: 8, period: 2, on: B }],
  events: [
    e(2, 1, 't2_ok', { pid: 'p4' }), e(3, 1, 'opp', { pts: 2 }), e(4, 1, 'rd', { pid: 'p7' }),
    e(6, 1, 't3_ok', { pid: 'p21' }), e(7, 1, 'opp', { pts: 1 }),
    e(9, 2, 't2_ok', { pid: 'p4' }), e(10, 2, 'opp', { pts: 2 }), e(11, 2, 'opp', { pts: -1 }), e(12, 2, 't1_ok', { pid: 'p10' }),
  ],
  seq: 12,
  ...over,
});

describe('stints (tramos con un mismo quinteto en un periodo)', () => {
  it('reparte cada periodo según las jugadas de cada tramo y cada periodo suma 1', () => {
    const s = plain(core.stints(game()));
    expect(s.map((x) => [x.period, x.on, x.events, x.pf, x.pc])).toEqual([
      [1, A, 3, 2, 2],
      [1, B, 2, 3, 1],
      [2, B, 4, 3, 1],
    ]);
    expect(s.map((x) => x.share)).toEqual([0.6, 0.4, 1]);
    expect(s.map((x) => x.approx)).toEqual([true, true, false]);
  });

  it('sin registro de quintetos (partido antiguo) no hay tramos', () => {
    const g = game();
    delete g.lineupFrom;
    expect(plain(core.stints(g))).toEqual([]);
  });

  it('lo jugado antes del inicio del registro no cuenta', () => {
    const g = game({ lineupFrom: 5, lineups: [{ seq: 5, period: 1, on: B }, { seq: 8, period: 2, on: B }] });
    expect(plain(core.stints(g)).map((x) => [x.period, x.events, x.share])).toEqual([[1, 2, 1], [2, 4, 1]]);
  });

  it('las jugadas apuntadas al volver a un periodo anterior no cuentan para ningún quinteto', () => {
    // En P2 juega B; se vuelve a P1 (foto de B con periodo 1) para apuntar algo olvidado: no se sabe quién jugaba
    const g = game({
      lineups: [...game().lineups, { seq: 13, period: 1, on: B }, { seq: 15, period: 2, on: B }],
      events: [...game().events, e(14, 1, 't2_ok', { pid: 'p4' }), e(16, 2, 'opp', { pts: 2 })],
      seq: 16,
    });
    const s = plain(core.stints(g));
    expect(s.map((x) => [x.period, x.events, x.pf, x.pc])).toEqual([[1, 3, 2, 2], [1, 2, 3, 1], [2, 5, 3, 3]]);
    expect(s.map((x) => x.share)).toEqual([0.6, 0.4, 1]);
  });

  it('con inicio de registro pero sin quintetos válidos (descartados al cargar), no hay tramos', () => {
    expect(plain(core.stints(game({ lineups: [] })))).toEqual([]);
  });

  it('las jugadas fuera de orden en la lista se ordenan por seq', () => {
    const g = game();
    g.events.reverse();
    expect(plain(core.stints(g)).map((x) => x.events)).toEqual([3, 2, 4]);
  });
});

describe('plusMinus', () => {
  it('suma a cada jugador lo que pasó con él en pista', () => {
    const pm = plain(core.plusMinus(game()));
    expect(pm.p4).toEqual({ pf: 8, pc: 4, pm: 4, periods: 2 });
    expect(pm.p15).toEqual({ pf: 2, pc: 2, pm: 0, periods: 0.6 });
    expect(pm.p21).toEqual({ pf: 6, pc: 2, pm: 4, periods: 1.4 });
    expect(pm.p30).toBeUndefined();
  });

  it('con quintetos completos, la suma de los +/- es 5 veces la diferencia del equipo', () => {
    const pm = Object.values(plain(core.plusMinus(game())));
    expect(pm.reduce((s, x) => s + x.pm, 0)).toBe(5 * (8 - 4));
  });

  it('en un partido sin registro no está disponible (null)', () => {
    const g = game();
    delete g.lineupFrom;
    expect(core.plusMinus(g)).toBeNull();
  });
});

describe('combos (quintetos, parejas y tríos de una lista de partidos)', () => {
  it('quintetos: periodos, puntos y +/- de cada uno', () => {
    const { list } = plain(core.combos([game()], 5));
    const [b, a] = list;   // por más periodos
    expect(b).toMatchObject({ pids: [...B].sort(), periods: 1.4, approx: true, pf: 6, pc: 2, pm: 4, games: ['g1'] });
    expect(b.pmPer).toBeCloseTo(4 / 1.4);
    expect(b.pfPer).toBeCloseTo(6 / 1.4);
    expect(b.pcPer).toBeCloseTo(2 / 1.4);
    expect(a).toMatchObject({ periods: 0.6, pf: 2, pc: 2, pm: 0 });
  });

  it('el mismo quinteto en varios partidos se suma, aunque cambie el orden de los jugadores', () => {
    const g2 = game({ id: 'g2', lineups: game().lineups.map((l) => ({ ...l, on: [...l.on].reverse() })) });
    const { list, tracked, total } = plain(core.combos([game(), g2], 5));
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ periods: 2.8, pf: 12, pc: 4, games: ['g1', 'g2'] });
    expect([tracked, total]).toEqual([2, 2]);
  });

  it('los tramos con menos de 5 en pista van aparte y no son un quinteto', () => {
    const g = game({ lineups: [{ seq: 1, period: 1, on: A.slice(0, 4) }, ...game().lineups.slice(1)] });
    const { list, incomplete } = plain(core.combos([g], 5));
    expect(list).toHaveLength(1);
    expect(incomplete).toEqual({ periods: 0.6, pf: 2, pc: 2 });
  });

  it('cuenta los partidos con y sin registro', () => {
    const old = game({ id: 'g0' });
    delete old.lineupFrom;
    expect(plain(core.combos([old, game()], 5))).toMatchObject({ tracked: 1, total: 2 });
  });

  it('parejas: cada pareja de cada tramo, también con menos de 5 en pista', () => {
    const { list } = plain(core.combos([game()], 2));
    expect(list).toHaveLength(10 + 4);   // 10 parejas de B y las 4 nuevas de A con p15
    expect(list.find((c) => c.key === 'p4,p7')).toMatchObject({ periods: 2, pf: 8, pc: 4, pm: 4 });
    expect(list.find((c) => c.key === 'p15,p4')).toMatchObject({ periods: 0.6, pm: 0 });
  });

  it('tríos', () => {
    const { list } = plain(core.combos([game()], 3));
    expect(list.find((c) => c.key === 'p10,p12,p4')).toMatchObject({ periods: 2, pm: 4 });
    expect(list).toHaveLength(10 + 6);
  });
});

describe('rankCombos', () => {
  const list = [
    { key: 'a', periods: 6, pm: 6, pmPer: 1, pfPer: 5, pcPer: 4 },
    { key: 'b', periods: 4, pm: 8, pmPer: 2, pfPer: 4, pcPer: 2 },
    { key: 'c', periods: 2, pm: 10, pmPer: 5, pfPer: 9, pcPer: 4 },   // pocos periodos
    { key: 'd', periods: 8, pm: 8, pmPer: 1, pfPer: 3, pcPer: 2 },
  ];
  const keys = (r) => r.ranked.map((c) => c.key);

  it('por +/- por periodo, solo los que llegan al mínimo; a igualdad, más periodos primero', () => {
    const r = core.rankCombos(list, { by: 'pm', min: 4 });
    expect(keys(r)).toEqual(['b', 'd', 'a']);
    expect(r.below).toBe(1);
  });

  it('ataque: más puntos a favor por periodo', () => {
    expect(keys(core.rankCombos(list, { by: 'pf', min: 4 }))).toEqual(['a', 'b', 'd']);
  });

  it('defensa: menos puntos en contra por periodo', () => {
    expect(keys(core.rankCombos(list, { by: 'pc', min: 4 }))).toEqual(['d', 'b', 'a']);
  });

  it('si nadie llega al mínimo, la lista sale vacía con el recuento', () => {
    const r = core.rankCombos(list, { by: 'pm', min: 10 });
    expect(r.ranked).toEqual([]);
    expect(r.below).toBe(4);
  });

  it('no cambia la lista original', () => {
    core.rankCombos(list, { by: 'pc', min: 0 });
    expect(list.map((c) => c.key)).toEqual(['a', 'b', 'c', 'd']);
  });
});
