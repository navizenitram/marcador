// Registro de quintetos (formato v3): se guarda quién está en pista en cada momento con los mismos toques de siempre,
// para poder calcular el +/- y los mejores quintetos. Ver docs/plan-mejoras-bsa.md, fase 1A.
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { ev, makeData, makeGame, makeTeam, opp, PLAYERS } from '../helpers/fixtures.js';

const FIVE = ['p4', 'p7', 'p10', 'p12', 'p15'];
const plain = (v) => JSON.parse(JSON.stringify(v));
const lineups = (g) => plain(g.lineups).map((l) => [l.period, l.on]);

/** Crea un partido desde el formulario (como un usuario) y elige el quinteto inicial */
async function newGame(app, lineup = FIVE) {
  await app.submit('game', { opponent: 'Lakers', venue: 'home' });
  for (const pid of lineup) await app.act('toggle-court', { id: pid });
  await app.act('lineup-done');
  return app.db.games.at(-1);
}

describe('normalize: formato v3', () => {
  it('numera las jugadas de los datos v2 en su orden y deja el contador en la última', async () => {
    const app = await openApp();
    const d = app.fn.normalize({
      version: 2,
      teams: [makeTeam()],
      games: [{ id: 'g1', teamId: 't1', events: [{ id: 'a', type: 't2_ok', pid: 'p4' }, { id: 'b', type: 'opp', pts: 2 }, { id: 'c', type: 'rd', pid: 'p7' }] }],
    });
    expect(d.version).toBe(3);
    expect(d.games[0].events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(d.games[0].seq).toBe(3);
    expect(plain(d.games[0].lineups)).toEqual([]);
    expect(d.games[0]).not.toHaveProperty('lineupFrom');  // sin registro: +/- y quintetos «no disponible»
  });

  it('respeta los seq que ya hay y numera después las jugadas que llegan sin él', async () => {
    const app = await openApp();
    const d = app.fn.normalize(makeData({ games: [makeGame({ seq: 0, events: [{ id: 'a', seq: 7, type: 't2_ok', pid: 'p4' }, { id: 'b', type: 'opp', pts: 2 }] })] }));
    expect(d.games[0].events.map((e) => e.seq)).toEqual([7, 8]);
    expect(d.games[0].seq).toBe(8);
  });

  it('es idempotente: normalizar dos veces da lo mismo', async () => {
    const app = await openApp();
    const once = plain(app.fn.normalize({ version: 2, teams: [makeTeam()], games: [{ id: 'g1', teamId: 't1', events: [{ id: 'a', type: 't2_ok', pid: 'p4' }] }] }));
    expect(plain(app.fn.normalize(structuredClone(once)))).toEqual(once);
  });

  it('descarta los quintetos no válidos y ordena el resto', async () => {
    const app = await openApp();
    const d = app.fn.normalize(makeData({
      games: [makeGame({
        seq: 20,
        lineupFrom: 2,
        lineups: [
          { seq: 9, period: 2, on: ['p4', 'p7'] },
          { seq: 2, period: 1, on: FIVE },
          'texto',
          { seq: 3, period: 1, on: [...FIVE, 'p21'] },              // 6 en pista
          { seq: 4, period: 1, on: ['p4', 'p4', 'p7'] },            // repetido
          { seq: 'x', period: 1, on: FIVE },                        // seq no válido
          { seq: 5, period: 1, on: 'p4' },                          // no es una lista
          { seq: 6, period: 1.5, on: ['p4', '<img src=x>'] },       // periodo e id raros: se corrigen
        ],
      })],
    }));
    const g = d.games[0];
    expect(g.lineups.map((l) => l.seq)).toEqual([2, 6, 9]);
    expect(g.lineups[1].period).toBe(2);
    expect(g.lineups[1].on[0]).toBe('p4');
    expect(g.lineups[1].on[1]).toMatch(/^[\w-]+$/);
    expect(g.lineupFrom).toBe(2);
  });

  it('el id raro de un jugador cambia igual en la plantilla y en los quintetos', async () => {
    const app = await openApp();
    const bad = '<b>x</b>';
    const d = app.fn.normalize(makeData({ games: [makeGame({ roster: [{ id: bad, number: '1', name: 'X' }], lineupFrom: 1, lineups: [{ seq: 1, period: 1, on: [bad] }], seq: 1 })] }));
    expect(d.games[0].lineups[0].on[0]).toBe(d.games[0].roster[0].id);
  });

  it('si falta el inicio del registro, lo toma del primer quinteto; si no es válido, lo quita', async () => {
    const app = await openApp();
    const d = app.fn.normalize(makeData({
      games: [
        makeGame({ id: 'a', lineups: [{ seq: 3, period: 1, on: FIVE }], seq: 3 }),
        makeGame({ id: 'b', lineupFrom: 'x' }),
      ],
    }));
    expect(d.games[0].lineupFrom).toBe(3);
    expect(d.games[1]).not.toHaveProperty('lineupFrom');
  });

  it('el contador del partido nunca queda por debajo de sus jugadas y quintetos', async () => {
    const app = await openApp();
    const d = app.fn.normalize(makeData({ games: [makeGame({ seq: 1, lineupFrom: 1, lineups: [{ seq: 12, period: 1, on: FIVE }], events: [{ id: 'a', seq: 5, type: 'rd', pid: 'p4' }] })] }));
    expect(d.games[0].seq).toBe(12);
  });
});

describe('registro de quintetos en el partido (sin toques extra)', () => {
  it('desde que se crea el partido se registra el quinteto inicial', async () => {
    const app = await openApp({ data: makeData(), hash: '#/partidos' });
    const g = await newGame(app);
    expect(lineups(g)).toEqual([[1, FIVE]]);
    expect(g.lineupFrom).toBe(g.lineups[0].seq);
  });

  it('tocar varias veces en el selector de quinteto antes de jugar deja una sola entrada', async () => {
    const app = await openApp({ data: makeData(), hash: '#/partidos' });
    await app.submit('game', { opponent: 'Lakers', venue: 'home' });
    // Entra p21 por error, se quita, entra p15 y se quita y vuelve a poner a p4
    for (const pid of ['p4', 'p7', 'p21', 'p10', 'p12', 'p21', 'p15', 'p4', 'p4']) await app.act('toggle-court', { id: pid });
    await app.act('lineup-done');
    const g = app.db.games[0];
    expect(g.lineups).toHaveLength(1);
    expect([...g.lineups[0].on].sort()).toEqual([...FIVE].sort());
  });

  it('cada jugada lleva su número de orden y queda atribuida al quinteto en pista', async () => {
    const app = await openApp({ data: makeData(), hash: '#/partidos' });
    const g = await newGame(app);
    await app.act('ev', { pid: 'p4', type: 't2_ok' });
    await app.act('opp', { pts: 2 });
    await app.act('swap', { pid: 'p15' });
    await app.act('swap-in', { id: 'p21' });
    await app.act('ev', { pid: 'p21', type: 't3_ok' });
    await app.act('opp', { pts: 1 });

    const seqs = g.events.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    const at = g.events.map((e) => [...app.window.MBCore.lineupAt(g, e.seq)]);
    const after = ['p4', 'p7', 'p10', 'p12', 'p21'];
    expect(at).toEqual([FIVE, FIVE, after, after]);
    expect(app.stored().games[0].lineups).toHaveLength(2);
  });

  it('sentar sin cambio, vaciar la pista y añadir a alguien también se registran', async () => {
    const app = await openApp({ data: makeData(), hash: '#/partidos' });
    const g = await newGame(app);
    await app.act('ev', { pid: 'p4', type: 'rd' });
    await app.act('swap', { pid: 'p4' });
    await app.act('bench-out');
    await app.act('ev', { pid: 'p7', type: 'rd' });
    await app.click('.court .add-player');
    await app.act('swap-in', { id: 'p21' });
    await app.act('ev', { pid: 'p7', type: 'rd' });
    await app.act('lineup');
    await app.act('clear-court');
    await app.act('lineup-done');
    expect(lineups(g)).toEqual([
      [1, FIVE],
      [1, ['p7', 'p10', 'p12', 'p15']],
      [1, ['p7', 'p10', 'p12', 'p15', 'p21']],
      [1, []],
    ]);
  });

  it('al cambiar de periodo se registra el quinteto del periodo nuevo', async () => {
    const app = await openApp({ data: makeData(), hash: '#/partidos' });
    const g = await newGame(app);
    await app.act('ev', { pid: 'p4', type: 't2_ok' });
    await app.act('period', { d: 1 });
    await app.act('toggle-court', { id: 'p15' });
    await app.act('toggle-court', { id: 'p21' });
    await app.act('lineup-done');
    await app.act('ev', { pid: 'p21', type: 't2_ok' });
    await app.act('period', { d: -1 });
    expect(lineups(g)).toEqual([
      [1, FIVE],
      [2, ['p4', 'p7', 'p10', 'p12', 'p21']],
      [1, ['p4', 'p7', 'p10', 'p12', 'p21']],
    ]);
  });

  it('cambiar de periodo sin jugadas en el anterior reutiliza la entrada (no deja periodos vacíos)', async () => {
    const app = await openApp({ data: makeData(), hash: '#/partidos' });
    const g = await newGame(app);
    await app.act('period', { d: 1 });
    await app.act('lineup-done');
    expect(lineups(g)).toEqual([[2, FIVE]]);
  });

  it('deshacer tras un cambio quita la última jugada, no el cambio', async () => {
    const app = await openApp({ data: makeData(), hash: '#/partidos' });
    const g = await newGame(app);
    await app.act('ev', { pid: 'p4', type: 't2_ok' });
    await app.act('swap', { pid: 'p15' });
    await app.act('swap-in', { id: 'p21' });
    await app.act('undo');
    expect(g.events).toHaveLength(0);
    expect(g.lineups).toHaveLength(2);
    expect([...g.onCourt]).toContain('p21');
  });

  it('un partido antiguo a medias empieza a registrar en el siguiente cambio; lo anterior no tiene quinteto', async () => {
    const old = makeGame({ onCourt: [...FIVE], events: [ev('t2_ok', 'p4'), opp(2)] });
    delete old.lineups;
    delete old.seq;
    const app = await openApp({ data: { ...makeData({ games: [old] }), version: 2 }, hash: '#/partido/g1' });
    await app.act('ev', { pid: 'p4', type: 't2_ok' });
    const g = app.db.games[0];
    expect(g).not.toHaveProperty('lineupFrom');

    await app.act('swap', { pid: 'p15' });
    await app.act('swap-in', { id: 'p21' });
    await app.act('ev', { pid: 'p21', type: 't2_ok' });
    const core = app.window.MBCore;
    expect(g.events.slice(0, 3).map((e) => core.lineupAt(g, e.seq))).toEqual([null, null, null]);
    expect([...core.lineupAt(g, g.events[3].seq)]).toEqual(['p4', 'p7', 'p10', 'p12', 'p21']);
  });

  it('en un partido finalizado y reabierto, el registro empieza al reabrirlo y tocar el quinteto', async () => {
    const old = makeGame({ finished: true, onCourt: [...FIVE], events: [ev('t2_ok', 'p4')] });
    const app = await openApp({ data: makeData({ games: [old] }), hash: '#/partido/g1' });
    await app.act('menu');
    await app.act('reopen', { id: 'g1' });
    await app.act('period', { d: 1 });
    await app.act('lineup-done');
    const g = app.db.games[0];
    expect(g.lineupFrom).toBe(g.lineups[0].seq);
    expect(app.window.MBCore.lineupAt(g, g.events[0].seq)).toBeNull();
  });
});

describe('copia de seguridad v3', () => {
  const file = (app, content) => new app.window.File([content], 'copia.json', { type: 'application/json' });

  it('la copia exportada lleva la versión del formato y la fecha', async () => {
    const app = await openApp({ data: makeData({ games: [makeGame()] }), hash: '#/ajustes' });
    await app.act('export-json');
    const exported = JSON.parse(await app.downloads[0].blob.text());
    expect(exported.version).toBe(3);
    expect(exported.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(app.db).not.toHaveProperty('exportedAt');
  });

  it('la fecha de exportación no se queda en los datos al importar', async () => {
    const app = await openApp();
    expect(app.fn.normalize({ ...makeData(), exportedAt: '2026-11-11T10:00:00.000Z' })).not.toHaveProperty('exportedAt');
  });

  it('avisa si la copia es de una versión más nueva de la app, pero deja importarla', async () => {
    const app = await openApp({ data: makeData(), hash: '#/ajustes' });
    const done = app.fn.importJSON(file(app, JSON.stringify({ ...makeData({ teams: [makeTeam({ name: 'Del futuro' })] }), version: 4 })));
    await app.settle();
    expect(app.text(app.modal)).toContain('versión más nueva');
    await app.act('confirm-yes');
    await done;
    expect(app.db.teams[0].name).toBe('Del futuro');
    expect(app.db.version).toBe(3);
  });

  it('una copia v2 o v3 no lleva ese aviso', async () => {
    const app = await openApp({ data: makeData(), hash: '#/ajustes' });
    for (const version of [2, 3]) {
      const done = app.fn.importJSON(file(app, JSON.stringify({ ...makeData(), version })));
      await app.settle();
      expect(app.text(app.modal)).not.toContain('versión más nueva');
      await app.act('confirm-no');
      await done;
    }
  });
});

describe('tamaño de los datos', () => {
  /** Temporada sintética: 30 partidos de 250 jugadas con un cambio cada 8 jugadas */
  function season(withLineups) {
    const roster = [...PLAYERS, { id: 'p23', number: '23', name: 'Gala' }, { id: 'p30', number: '30', name: 'Hugo' }];
    const ids = roster.map((p) => p.id);
    const types = ['t2_ok', 't2_ko', 't1_ok', 'rd', 'ro', 'rec', 'lost', 'ast', 'fc', 'opp'];
    const games = Array.from({ length: 30 }, (_, n) => {
      let seq = 0;
      const events = [], lups = [];
      for (let i = 0; i < 250; i++) {
        const period = Math.floor(i / 32) + 1;
        if (i % 8 === 0) {
          const on = Array.from({ length: 5 }, (_, k) => ids[(i / 8 + k) % ids.length]);
          if (withLineups) lups.push({ seq: ++seq, period, on });
        }
        const type = types[i % types.length];
        const e = { id: `e${n}-${i}`, ts: 1_731_000_000_000 + i * 9000, period, type };
        if (withLineups) e.seq = ++seq;
        if (type === 'opp') e.pts = 2; else e.pid = ids[i % 5];
        events.push(e);
      }
      const g = makeGame({ id: `g${n}`, roster, events, lineups: lups, finished: true });
      if (withLineups) { g.lineupFrom = 1; g.seq = seq; } else { delete g.lineups; delete g.seq; }
      return g;
    });
    return makeData({ games });
  }

  it('el registro de quintetos añade menos de un 35 % y la temporada cabe en el traspaso de datos', async () => {
    const before = JSON.stringify(season(false)).length;
    const after = JSON.stringify(season(true)).length;
    expect(after / before).toBeLessThan(1.35);

    const app = await openApp({ compression: true });
    const code = await app.fn.encodeTransfer(season(true));
    expect(code.length).toBeLessThan(vm.runInContext('MAX_TRANSFER', app.ctx));
  });
});
