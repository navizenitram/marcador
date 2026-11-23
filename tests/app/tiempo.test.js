// Tiempo de juego (formato v4): el reloj del marcador (cuenta atrás) se pide una vez por cambio, no al empezar un periodo,
// y se ve en la columna MIN de las estadísticas.
import { describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { makeData, makeGame, makeTeam } from '../helpers/fixtures.js';

const FIVE = ['p4', 'p7', 'p10', 'p12', 'p15'];
const START = [{ period: 1, t: 0, on: FIVE }];

const live = (game = {}) =>
  openApp({ data: makeData({ teams: [makeTeam()], games: [makeGame({ onCourt: [...FIVE], shifts: START, ...game })] }), hash: '#/partido/g1' });

/** Teclea el reloj del marcador en la ventana abierta (dispara input como el navegador) */
async function setClock(app, mm, ss) {
  for (const [k, v] of [['mm', mm], ['ss', ss]]) {
    const el = app.$(`[data-clock="${k}"]`);
    el.value = v;
    el.dispatchEvent(new app.window.Event('input', { bubbles: true }));
  }
  await app.settle();
}
const shifts = (app) => app.db.games[0].shifts;

describe('registro del tiempo de los cambios', () => {
  it('al crear el partido, el quinteto inicial no pide tiempo y empieza en 0', async () => {
    const app = await openApp({ data: makeData(), hash: '#/partidos' });
    await app.submit('game', { opponent: 'Lakers', venue: 'home' });
    for (const pid of FIVE) await app.act('toggle-court', { id: pid });
    expect(app.$$('.clock-field')).toHaveLength(0);
    await app.act('lineup-done');
    expect(app.modal).toBeNull();
    expect(app.db.games[0].shifts).toEqual([{ period: 1, t: 0, on: FIVE }]);
  });

  it('al pasar de periodo, el quinteto no pide tiempo y el periodo empieza en 0', async () => {
    const app = await live();
    await app.act('period', { d: 1 });
    expect(app.modal).not.toBeNull();
    expect(app.$$('.clock-field')).toHaveLength(0);
    await app.act('lineup-done');
    expect(shifts(app)).toEqual([...START, { period: 2, t: 0, on: FIVE }]);
  });

  it('un cambio pide el reloj del marcador (por defecto, el periodo entero) y guarda lo transcurrido', async () => {
    const app = await live();
    await app.act('swap', { pid: 'p15' });
    expect(app.$('[data-clock="mm"]').value).toBe('6');
    expect(app.$('[data-clock="ss"]').value).toBe('00');
    await setClock(app, '4', '30');   // quedan 4:30 → han pasado 1:30
    await app.act('swap-in', { id: 'p21' });
    expect(app.modal).toBeNull();
    expect(shifts(app).at(-1)).toEqual({ period: 1, t: 90, on: ['p4', 'p7', 'p10', 'p12', 'p21'] });
  });

  it('con 4 cuartos el reloj parte de 10:00', async () => {
    const app = await live({ periods: 4 });
    await app.act('swap', { pid: 'p15' });
    expect(app.$('[data-clock="mm"]').value).toBe('10');
    await setClock(app, '10', '00');
    await app.act('swap-in', { id: 'p21' });
    expect(shifts(app).at(-1).t).toBe(0);
  });

  it('rechaza un reloj vacío, con segundos de más o fuera del periodo, y la ventana sigue abierta', async () => {
    const app = await live();
    await app.act('swap', { pid: 'p15' });
    await setClock(app, '', '');
    await app.act('swap-in', { id: 'p21' });
    expect(app.toast).toContain('minuto');
    await setClock(app, '3', '75');
    await app.act('swap-in', { id: 'p21' });
    expect(app.toast).toContain('00 a 59');
    await setClock(app, '7', '00');
    await app.act('swap-in', { id: 'p21' });
    expect(app.toast).toContain('dura 6:00');
    expect(app.modal).not.toBeNull();
    expect([...app.db.games[0].onCourt]).toEqual(FIVE);
    expect(shifts(app)).toEqual(START);
  });

  it('el reloj no puede ir hacia atrás respecto al cambio anterior del mismo periodo', async () => {
    const app = await live();
    await app.act('swap', { pid: 'p15' });
    await setClock(app, '3', '00');
    await app.act('swap-in', { id: 'p21' });
    await app.act('swap', { pid: 'p4' });
    expect(app.$('[data-clock="mm"]').value).toBe('3');   // propone el último cambio
    await setClock(app, '4', '00');
    await app.act('swap-in', { id: 'p15' });
    expect(app.toast).toContain('hacia atrás');
    expect(shifts(app)).toHaveLength(2);
  });

  it('sentar sin cambio y añadir a la pista también piden el reloj', async () => {
    const app = await live();
    await app.act('swap', { pid: 'p15' });
    await setClock(app, '5', '00');
    await app.act('bench-out');
    expect(shifts(app).at(-1)).toEqual({ period: 1, t: 60, on: ['p4', 'p7', 'p10', 'p12'] });
    await app.act('swap', { pid: '' });
    expect(app.$$('.clock-field')).toHaveLength(1);
    await setClock(app, '4', '00');
    await app.act('swap-in', { id: 'p21' });
    expect(shifts(app).at(-1)).toEqual({ period: 1, t: 120, on: ['p4', 'p7', 'p10', 'p12', 'p21'] });
  });

  it('en un cambio múltiple pregunta una sola vez y guarda una sola entrada', async () => {
    const app = await live();
    await app.act('lineup');
    expect(app.$$('.clock-field')).toHaveLength(1);
    await app.act('toggle-court', { id: 'p4' });
    await app.act('toggle-court', { id: 'p15' });
    await app.act('toggle-court', { id: 'p21' });
    expect(app.$$('.clock-field')).toHaveLength(1);
    await setClock(app, '2', '15');   // quedan 2:15 → han pasado 3:45
    await app.act('toggle-court', { id: 'p4' });   // toca otro chip: el reloj tecleado no se pierde
    expect(app.$('[data-clock="mm"]').value).toBe('2');
    await app.act('lineup-done');
    expect(app.modal).toBeNull();
    expect(shifts(app)).toHaveLength(2);
    expect(shifts(app)[1]).toMatchObject({ period: 1, t: 225 });
    expect([...shifts(app)[1].on].sort()).toEqual(['p10', 'p12', 'p21', 'p4', 'p7']);
  });

  it('«Listo» con cambios y sin un reloj válido no cierra la ventana; sin cambios no pide nada', async () => {
    const app = await live();
    await app.act('lineup');
    await app.act('lineup-done');   // sin cambios
    expect(app.modal).toBeNull();
    expect(shifts(app)).toEqual(START);

    await app.act('lineup');
    await app.act('toggle-court', { id: 'p15' });
    await setClock(app, '', '');
    await app.act('lineup-done');
    expect(app.modal).not.toBeNull();
    expect(app.toast).toContain('minuto');
  });

  it('si se cierra la ventana con cambios y sin reloj válido, se deshacen', async () => {
    const app = await live();
    await app.act('lineup');
    await app.act('toggle-court', { id: 'p15' });
    await setClock(app, '9', '00');
    await app.click('.modal-back');   // se cierra tocando fuera, sin «Listo»
    expect([...app.db.games[0].onCourt]).toEqual(FIVE);
    expect(shifts(app)).toEqual(START);
    expect(app.toast).toContain('cambio no guardado');
  });

  it('al volver a un periodo anterior con ‹ no se apunta tiempo', async () => {
    const app = await live({ period: 2, shifts: [...START, { period: 2, t: 0, on: FIVE }] });
    await app.act('period', { d: -1 });
    await app.act('swap', { pid: 'p15' });
    expect(app.$$('.clock-field')).toHaveLength(0);
    await app.act('swap-in', { id: 'p21' });
    expect(shifts(app)).toHaveLength(2);
  });

  it('un partido sin registro de tiempo (anterior a la v4) se comporta como siempre', async () => {
    const app = await live({ shifts: undefined });
    await app.act('swap', { pid: 'p15' });
    expect(app.$$('.clock-field')).toHaveLength(0);
    await app.act('swap-in', { id: 'p21' });
    expect(app.db.games[0].shifts).toBeUndefined();
  });
});

describe('formato v4', () => {
  it('normalize conserva los registros válidos y descarta los que no lo son', async () => {
    const app = await openApp();
    const d = app.fn.normalize({
      version: 3,
      teams: [makeTeam()],
      games: [makeGame({
        shifts: [
          { period: 1, t: 0, on: FIVE },
          { period: 1, t: 400, on: FIVE },    // más que el periodo
          { period: 1, t: 10.5, on: FIVE },   // no entero
          { period: 1, t: 20, on: ['p4', 'p4'] },
          { period: 0, t: 20, on: FIVE },
          { period: 1, t: 30, on: [...FIVE, 'p21'] },
          { period: 1, t: 60, on: ['p4'], extra: 'x' },
        ],
      })],
    });
    expect(JSON.parse(JSON.stringify(d.games[0].shifts))).toEqual([{ period: 1, t: 0, on: FIVE }, { period: 1, t: 60, on: ['p4'] }]);
    expect(d.version).toBe(4);
  });

  it('los partidos sin shifts siguen sin él', async () => {
    const app = await openApp();
    const d = app.fn.normalize({ version: 3, teams: [makeTeam()], games: [makeGame()] });
    expect('shifts' in d.games[0]).toBe(false);
  });
});

describe('minutos en las estadísticas', () => {
  const finished = (game = {}) => makeGame({
    finished: true, period: 1, onCourt: [...FIVE], played: Object.fromEntries(FIVE.concat('p21').map((p) => [p, [1]])),
    shifts: [...START, { period: 1, t: 120, on: ['p4', 'p7', 'p10', 'p12', 'p21'] }],
    ...game,
  });

  it('el partido muestra MIN en min:seg, con el periodo entero para quien sigue en pista', async () => {
    const app = await openApp({ data: makeData({ games: [finished()] }), hash: '#/stats/g1' });
    expect(app.$$('thead th').map((th) => th.textContent)).toContain('MIN');
    const cell = (pid) => app.text(`tr[data-pid="${pid}"] td[data-k="min"]`);
    expect(cell('p4')).toBe('6:00');
    expect(cell('p15')).toBe('2:00');
    expect(cell('p21')).toBe('4:00');
    expect(app.text('tfoot td[data-k="min"]')).toBe('30:00');   // 5 jugadores × 6:00
  });

  it('sin registro de tiempo no sale la columna', async () => {
    const app = await openApp({ data: makeData({ games: [finished({ shifts: undefined })] }), hash: '#/stats/g1' });
    expect(app.$$('thead th').map((th) => th.textContent)).not.toContain('MIN');
  });

  it('la temporada promedia solo los partidos con tiempo; los antiguos no cuentan como 0', async () => {
    const old = finished({ id: 'g0', date: '2026-09-01', shifts: undefined });
    const data = makeData({ games: [old, finished({ id: 'g2', date: '2026-10-10' })] });
    const app = await openApp({ data, hash: '#/stats/temporada' });
    expect(app.text('tr[data-pid="p4"] td[data-k="min"]')).toBe('6:00');
    await app.act('avg', { v: '1' });
    expect(app.text('tr[data-pid="p4"] td[data-k="min"]')).toBe('6:00');   // 360 s entre 1 partido con tiempo
    expect(app.text('tr[data-pid="p15"] td[data-k="min"]')).toBe('2:00');
  });

  it('la tabla PNG lleva la columna MIN con su leyenda', async () => {
    const app = await openApp({ data: makeData({ games: [finished()] }), hash: '#/stats/g1' });
    const m = app.fn.tableModel('g1');
    const i = m.cols.findIndex((c) => c.k === 'min');
    expect(i).toBeGreaterThan(-1);
    expect(m.rows.find((r) => r.cells[1].text === 'Ana').cells[i].text).toBe('6:00');
    expect(m.legend).toContain('MIN Tiempo de juego (min:seg)');
  });

  it('el CSV lleva MIN al final solo si hay tiempo', async () => {
    const withTime = await openApp({ data: makeData({ games: [finished()] }), hash: '#/stats/g1' });
    withTime.fn.downloadCSV('g1');
    const csv = await withTime.downloads[0].blob.text();
    const [head, ...rows] = csv.replace('﻿', '').split('\r\n');
    expect(head.split(';').at(-1)).toBe('MIN');
    expect(rows.find((r) => r.startsWith('4;Ana')).split(';').at(-1)).toBe('6:00');

    const without = await openApp({ data: makeData({ games: [finished({ shifts: undefined })] }), hash: '#/stats/g1' });
    without.fn.downloadCSV('g1');
    expect((await without.downloads[0].blob.text())).not.toContain('MIN');
  });
});
