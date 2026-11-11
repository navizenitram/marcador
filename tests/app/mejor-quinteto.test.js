// +/- por jugador y mejores quintetos en la pantalla de estadísticas (fase 1B de docs/plan-mejoras-bsa.md).
import { describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { makeData, makeGame, makeTeam, trackedGame } from '../helpers/fixtures.js';

const Q1 = ['p4', 'p7', 'p10', 'p12', 'p15'];
const Q2 = ['p4', 'p7', 'p10', 'p12', 'p21'];
const Q3 = ['p7', 'p10', 'p12', 'p15', 'p21'];

const tracked = trackedGame;

/* Q1: 4 periodos, 14-4 (+10, +2,5 por periodo) · Q2: 4 periodos, 4-10 (−6) · Q3: 1 periodo, 6-6 (0) */
const season = () => [
  tracked('g1', [[1, Q1, 5, 1], [2, Q2, 1, 4], [3, Q1, 3, 1], [4, Q2, 2, 2]], { date: '2026-10-03' }),
  tracked('g2', [[1, Q1, 4, 0], [2, Q2, 0, 3], [3, Q1, 2, 2], [4, Q2, 1, 1]], { date: '2026-10-10' }),
  tracked('g3', [[1, Q3, 6, 6]], { date: '2026-10-17' }),
];

const open = (games = season(), hash = '#/stats/temporada', team = makeTeam()) => openApp({ data: makeData({ teams: [team], games }), hash });
const unitRows = (app) => app.$$('.units .unit').map((u) => u.dataset.key);
const cellOf = (app, pid, k) => app.$$('table.stats tbody tr').find((tr) => tr.dataset.pid === pid)?.querySelector(`td[data-k="${k}"]`);

describe('mejores quintetos de la temporada', () => {
  it('ordena por +/- por periodo los que llegan al mínimo (4 periodos por defecto) y cuenta los que no', async () => {
    const app = await open();
    expect(unitRows(app)).toEqual([[...Q1].sort().join(','), [...Q2].sort().join(',')]);
    const first = app.text(app.$('.units .unit'));
    expect(first).toContain('#4 Ana');
    expect(first).toContain('14–4');
    expect(first).toContain('+10');
    expect(first).toContain('+2,5');
    expect(app.text('.units .below')).toContain('1 quinteto con menos de 4 periodos');
  });

  it('el mínimo se cambia y se guarda en el equipo', async () => {
    const app = await open();
    await app.change('unit-min', '1');
    expect(unitRows(app)).toHaveLength(3);
    expect(app.db.teams[0].minUnit).toBe(1);
    expect(app.stored().teams[0].minUnit).toBe(1);
  });

  it('ataque y defensa ordenan por puntos a favor y en contra por periodo', async () => {
    const app = await open(season(), '#/stats/temporada', makeTeam({ minUnit: 1 }));
    await app.act('unit-by', { v: 'pf' });
    expect(unitRows(app)[0]).toBe([...Q3].sort().join(','));   // 6 a favor en 1 periodo
    await app.act('unit-by', { v: 'pc' });
    expect(unitRows(app)[0]).toBe([...Q1].sort().join(','));   // 1 en contra por periodo
  });

  it('también por parejas y por tríos', async () => {
    const app = await open();
    await app.act('unit-size', { v: 2 });
    expect(app.text('.units h2')).toContain('Parejas');
    expect(unitRows(app)).toContain('p10,p12');
    await app.act('unit-size', { v: 3 });
    expect(unitRows(app)[0].split(',')).toHaveLength(3);
  });

  it('cada quinteto muestra en qué partidos jugó', async () => {
    const app = await open();
    const detail = app.text(app.$('.units .unit .unit-games'));
    expect(detail).toContain('03/10');
    expect(detail).toContain('10/10');
  });

  it('si nadie llega al mínimo lo explica', async () => {
    const app = await open([season()[2]]);
    expect(unitRows(app)).toEqual([]);
    expect(app.text('.units')).toContain('Todavía no hay suficientes datos');
  });

  it('avisa de cuántos partidos tienen datos y explica qué es el +/-', async () => {
    const old = makeGame({ id: 'g0', finished: true, date: '2026-09-26' });
    const app = await open([old, ...season()]);
    expect(app.text('.units .coverage')).toContain('3 de 4 partidos');
    expect(app.text('.units .units-help')).toContain('compañeros');
  });

  it('sin ningún partido con registro, no disponible', async () => {
    const app = await open([makeGame({ finished: true })]);
    expect(app.text('.units')).toContain('No disponible');
    expect(unitRows(app)).toEqual([]);
  });
});

describe('quintetos de un partido', () => {
  it('lista los quintetos usados, sin ranking ni mínimo', async () => {
    const app = await open(season(), '#/stats/g1');
    expect(unitRows(app)).toHaveLength(2);
    expect(app.$('[data-change="unit-min"]')).toBeNull();
    expect(app.text('.units')).toContain('8–2');   // Q1 en el partido: 5-1 y 3-1
  });

  it('con cambios dentro de un periodo, los periodos se reparten y se marcan con «≈»', async () => {
    // P1: Q1 con 3 jugadas y Q2 con 1 → 0,75 y 0,25 periodos
    const g = tracked('g1', [[1, Q1, 2, 1], [1, Q2, 1, 0]]);
    const app = await open([g], '#/stats/g1');
    const text = app.$$('.units .unit').map((u) => app.text(u.querySelector('.unit-per')));
    expect(text).toEqual(['≈ 0,8 periodos', '≈ 0,3 periodos']);
  });

  it('un partido con registro pero aún sin jugadas lo dice', async () => {
    const g = makeGame({ lineupFrom: 1, lineups: [{ seq: 1, period: 1, on: Q1 }], seq: 1 });
    const app = await open([g], '#/stats/g1');
    expect(app.text('.units')).toContain('Aún no hay jugadas');
  });

  it('un partido sin registro: no disponible', async () => {
    const app = await open([makeGame({ finished: true })], '#/stats/g1');
    expect(app.text('.units')).toContain('No disponible');
  });
});

describe('+/- en la tabla', () => {
  it('cada jugador con su +/- de la temporada', async () => {
    const app = await open();
    expect(app.text(cellOf(app, 'p15', 'pm'))).toBe('+10');
    expect(app.text(cellOf(app, 'p21', 'pm'))).toBe('−6');
    expect(app.text(cellOf(app, 'p4', 'pm'))).toBe('+4');
  });

  it('en «Por partido», entre los partidos con datos en que jugó', async () => {
    const app = await open();
    await app.act('avg', { v: 1 });
    expect(app.text(cellOf(app, 'p15', 'pm'))).toBe('+3,3');   // +10 en 3 partidos
  });

  it('en un partido sin registro no hay columna de +/-', async () => {
    const app = await open([season()[0], makeGame({ id: 'g9', finished: true, played: { p4: [1] }, events: [] })], '#/stats/g9');
    expect(app.$('table.stats th[data-k="pm"]')).toBeNull();
  });

  it('en la temporada, «–» para quien solo jugó partidos sin registro', async () => {
    const old = makeGame({ id: 'g0', finished: true, played: { p30: [1] }, roster: [{ id: 'p30', number: '30', name: 'Hugo' }] });
    const app = await open([old, ...season()], '#/stats/temporada', makeTeam({ players: [...makeTeam().players, { id: 'p30', number: '30', name: 'Hugo' }] }));
    expect(app.text(cellOf(app, 'p30', 'pm'))).toBe('–');
  });

  it('el CSV lleva el +/- en la última columna', async () => {
    const app = await open();
    await app.act('csv', { arg: 'temporada' });
    const lines = (await app.downloads[0].blob.text()).replace(/^﻿/, '').split('\r\n').map((l) => l.split(';'));
    expect(lines[0].at(-1)).toBe('+/-');
    expect(lines.find((l) => l[1] === 'Eva').at(-1)).toBe('10');
  });
});
