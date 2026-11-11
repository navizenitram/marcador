// Estadísticas avanzadas en la pantalla de estadísticas y en el CSV (fase 2 de docs/plan-mejoras-bsa.md).
import { describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { ev, makeData, makeGame, makeTeam } from '../helpers/fixtures.js';

const many = (type, pid, n) => Array.from({ length: n }, () => ev(type, pid));

/* Ana: T2 4/8, T3 1/2, T1 2/4, 1 pérdida → TCI 10 · Bruno: T2 1/2 (muestra pequeña) · Carla: no tira */
const game = (over = {}) => makeGame({
  played: { p4: [1], p7: [1], p10: [1] },
  events: [
    ...many('t2_ok', 'p4', 4), ...many('t2_ko', 'p4', 4), ev('t3_ok', 'p4'), ev('t3_ko', 'p4'),
    ...many('t1_ok', 'p4', 2), ...many('t1_ko', 'p4', 2), ev('lost', 'p4'),
    ev('t2_ok', 'p7'), ev('t2_ko', 'p7'),
    ev('rd', 'p10'),
  ],
  ...over,
});

const open = (games = [game()], team = makeTeam()) => openApp({ data: makeData({ teams: [team], games }), hash: '#/stats/g1' });
const cellOf = (app, pid, k) => {
  const row = app.$$('table.stats tbody tr').find((tr) => tr.dataset.pid === pid);
  return row && row.querySelector(`td[data-k="${k}"]`);
};

describe('vista de estadísticas avanzadas', () => {
  it('se elige con «Básicas · Avanzadas» y cambia las columnas de la tabla', async () => {
    const app = await open();
    expect(app.$$('table.stats thead th').map((th) => th.dataset.k)).toContain('val');
    await app.act('adv', { v: 1 });
    const heads = app.$$('table.stats thead th').map((th) => th.dataset.k);
    expect(heads).toEqual(['number', 'name', 'pts', 'fg', 'efg', 'ts', 'tov', 'ftr']);
    await app.act('adv', { v: 0 });
    expect(app.$$('table.stats thead th').map((th) => th.dataset.k)).toContain('val');
  });

  it('muestra los porcentajes de cada jugador', async () => {
    const app = await open();
    await app.act('adv', { v: 1 });
    // eFG = (5 + 0,5) / 10 = 55 % · TS = 13 / (2·(10 + 1,76)) = 55 % · PÉR = 1 / 12,76 = 8 % · TL/TC = 0,4
    expect(app.text(cellOf(app, 'p4', 'efg'))).toMatch(/^55\s%$/);
    expect(app.text(cellOf(app, 'p4', 'ts'))).toMatch(/^55\s%$/);
    expect(app.text(cellOf(app, 'p4', 'tov'))).toMatch(/^8\s%$/);
    expect(app.text(cellOf(app, 'p4', 'ftr'))).toBe('0,4');
    expect(app.text(cellOf(app, 'p4', 'fg'))).toBe('5/10');
  });

  it('sin tiros, «–»; con pocos tiros, el valor no se da o se marca con asterisco', async () => {
    const app = await open([game({ events: [...game().events, ...many('t2_ok', 'p12', 2), ev('t2_ko', 'p12')], played: { ...game().played, p12: [1] } })]);
    await app.act('adv', { v: 1 });
    expect(app.text(cellOf(app, 'p10', 'efg'))).toBe('–');
    expect(app.text(cellOf(app, 'p7', 'efg'))).toBe('–');            // 2 intentos: no se da
    expect(app.text(cellOf(app, 'p12', 'efg'))).toMatch(/\*$/);       // 3 intentos: pocos tiros
    expect(cellOf(app, 'p12', 'efg').querySelector('.low')).not.toBeNull();
    expect(app.text('.adv-note')).toContain('pocos tiros');
  });

  it('el glosario explica cada métrica con su nombre para familias y su término técnico', async () => {
    const app = await open();
    await app.act('adv', { v: 1 });
    const g = app.text('.glossary');
    for (const s of ['Acierto real en el tiro', 'TS%', 'eFG%', 'Balones perdidos por ataque', 'Tiros libres que provoca']) expect(g).toContain(s);
  });

  it('sin el botón de tiros libres ni datos de ellos, se ocultan TS% y TL/TC', async () => {
    const noT1 = game({ events: game().events.filter((e) => !e.type.startsWith('t1')) });
    const app = await open([noT1], makeTeam({ hidden: ['t1'] }));
    await app.act('adv', { v: 1 });
    const heads = app.$$('table.stats thead th').map((th) => th.dataset.k);
    expect(heads).not.toContain('ts');
    expect(heads).not.toContain('ftr');
    expect(heads).toContain('efg');
  });

  it('sin triples, la columna se llama acierto en tiros de campo', async () => {
    const noT3 = game({ events: game().events.filter((e) => !e.type.startsWith('t3')) });
    const app = await open([noT3], makeTeam({ hidden: ['t3'] }));
    await app.act('adv', { v: 1 });
    expect(app.text('table.stats thead th[data-k="efg"]')).toBe('TC%');
  });

  it('se puede ordenar por una métrica avanzada (los que no tienen valor, al final)', async () => {
    const app = await open();
    await app.act('adv', { v: 1 });
    await app.act('sort', { k: 'efg' });
    const order = app.$$('table.stats tbody tr td[data-k="name"]').map((td) => td.textContent);
    expect(order[0]).toBe('Ana');
  });

  it('«Por partido» no cambia los porcentajes: se calculan con los totales', async () => {
    const g2 = game({ id: 'g2', events: [...many('t2_ok', 'p4', 1), ...many('t2_ko', 'p4', 6)] });
    const app = await openApp({ data: makeData({ games: [game(), g2] }), hash: '#/stats/temporada' });
    await app.act('adv', { v: 1 });
    const totals = app.text(cellOf(app, 'p4', 'efg'));
    await app.act('avg', { v: 1 });
    expect(app.text(cellOf(app, 'p4', 'efg'))).toBe(totals);
    // 6 de 17 (con el triple, 6,5 / 17 = 38 %)
    expect(totals).toMatch(/^38\s%/);
  });
});

describe('CSV con avanzadas', () => {
  it('añade las cuatro columnas al final sin mover las de siempre', async () => {
    const app = await open();
    await app.act('csv', { arg: 'g1' });
    const text = (await app.downloads[0].blob.text()).replace(/^﻿/, '');
    const [head, ...rows] = text.split('\r\n').map((l) => l.split(';'));
    expect(head.slice(0, 22)).toEqual(['Dorsal', 'Jugador', 'Periodos', 'PTS', 'T1A', 'T1I', 'T2A', 'T2I', 'T3A', 'T3I', 'RO', 'RD', 'RT', 'AS', 'TAP', 'TR', 'REC', 'PER', 'FC', 'FR', 'VAL', 'eFG%']);
    expect(head.slice(-4)).toEqual(['eFG%', 'TS%', '%PÉR', 'TL/TC']);
    const ana = rows.find((r) => r[1] === 'Ana');
    expect(ana.slice(-4)).toEqual(['55', '55', '8', '0,4']);
    const carla = rows.find((r) => r[1] === 'Carla');
    expect(carla.slice(-4)).toEqual(['', '', '', '']);
  });
});
