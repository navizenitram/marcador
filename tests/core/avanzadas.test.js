// Estadísticas avanzadas (core.js): solo las que permiten los datos propios, sin datos del rival.
// TC = tiros de campo (T2 + T3), A = anotados, I = intentados.
import { describe, expect, it } from 'vitest';
import { loadCore, plain } from '../helpers/core.js';

const core = loadCore();
const ALL = { t1: true, t3: true, lost: true };
const line = (o) => core.finish({ ...core.blankLine(), ...o });

describe('advanced', () => {
  // T1 4/10, T2 6/14, T3 2/6 → TCI 20, TCA 8, PTS 4 + 12 + 6 = 22, 5 pérdidas
  const l = line({ t1m: 4, t1a: 10, t2m: 6, t2a: 14, t3m: 2, t3a: 6, lost: 5 });
  const a = core.advanced(l, 'season', ALL);

  it('eFG% = (TCA + 0,5·T3A) / TCI', () => expect(a.efg.value).toBeCloseTo((8 + 1) / 20));
  it('TS% = PTS / (2·(TCI + 0,44·TLI))', () => expect(a.ts.value).toBeCloseTo(22 / (2 * (20 + 4.4))));
  it('% de pérdidas = PÉR / (TCI + 0,44·TLI + PÉR)', () => expect(a.tov.value).toBeCloseTo(5 / (20 + 4.4 + 5)));
  it('tasa de tiros libres = TLI / TCI', () => expect(a.ftr.value).toBeCloseTo(10 / 20));

  it('guarda el denominador de cada métrica', () => {
    expect(a.efg.den).toBe(20);
    expect(a.ts.den).toBeCloseTo(24.4);
    expect(a.tov.den).toBeCloseTo(29.4);
    expect(a.ftr.den).toBe(20);
  });

  it('sin intentos no hay valor (ni NaN ni 0)', () => {
    const z = core.advanced(line({}), 'game', ALL);
    for (const k of ['efg', 'ts', 'tov', 'ftr']) expect(z[k].value, k).toBeNull();
  });

  it('solo pérdidas: 100 % de pérdidas, el resto sin valor', () => {
    const z = core.advanced(line({ lost: 4 }), 'game', ALL);
    expect(z.tov.value).toBe(1);
    expect(z.efg.value).toBeNull();
  });

  describe('muestra pequeña', () => {
    it('en un partido: con menos de 3 no hay valor y con menos de 5 se marca', () => {
      expect(core.advanced(line({ t2m: 1, t2a: 2 }), 'game', ALL).efg).toMatchObject({ value: null, den: 2 });
      expect(core.advanced(line({ t2m: 1, t2a: 3 }), 'game', ALL).efg).toMatchObject({ den: 3, low: true });
      expect(core.advanced(line({ t2m: 1, t2a: 4 }), 'game', ALL).efg.low).toBe(true);
      expect(core.advanced(line({ t2m: 1, t2a: 5 }), 'game', ALL).efg.low).toBe(false);
    });

    it('en la temporada o una fase se marca por debajo de 15', () => {
      expect(core.advanced(line({ t2m: 5, t2a: 14 }), 'season', ALL).efg.low).toBe(true);
      expect(core.advanced(line({ t2m: 5, t2a: 15 }), 'season', ALL).efg.low).toBe(false);
    });

    it('los umbrales son constantes publicadas', () => {
      expect(plain(core.ADV_MIN)).toEqual({ hide: 3, game: 5, season: 15 });
    });
  });

  describe('datos que no se apuntan (botones desactivados)', () => {
    it('sin tiros libres se ocultan TS% y la tasa de tiros libres', () => {
      const z = core.advanced(l, 'game', { ...ALL, t1: false });
      expect(z.ts.hidden).toBe(true);
      expect(z.ftr.hidden).toBe(true);
      expect(z.efg.hidden).toBe(false);
    });

    it('sin pérdidas se oculta el % de pérdidas', () => {
      expect(core.advanced(l, 'game', { ...ALL, lost: false }).tov.hidden).toBe(true);
    });

    it('sin triples, el eFG% es el acierto en tiros de campo y se avisa', () => {
      const z = core.advanced(line({ t2m: 3, t2a: 6 }), 'game', { ...ALL, t3: false });
      expect(z.efg).toMatchObject({ value: 0.5, fgOnly: true, hidden: false });
      expect(core.advanced(l, 'game', ALL).efg.fgOnly).toBe(false);
    });
  });
});

describe('recordedOpts (qué se apuntó en un ámbito)', () => {
  it('un dato se apuntó si su botón está activo o si hay alguna jugada de ese tipo', () => {
    const total = line({ t1a: 0, t3a: 2, lost: 0 });
    expect(plain(core.recordedOpts(total, ['t1', 't3', 'lost']))).toEqual({ t1: false, t3: true, lost: false });
    expect(plain(core.recordedOpts(total, []))).toEqual({ t1: true, t3: true, lost: true });
  });
});
