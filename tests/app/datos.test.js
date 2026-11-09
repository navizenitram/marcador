import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, STORE_KEY } from '../helpers/app.js';
import { ev, makeData, makeGame, makeTeam, PLAYERS, sampleGame } from '../helpers/fixtures.js';

/** Copia de seguridad del formato antiguo (v1): un único equipo en `team` y los botones en `settings` */
const v1Backup = () => ({
  team: { name: 'Benjamín', email: 'entrenador@club.com', players: PLAYERS.slice(0, 2) },
  settings: { hidden: ['blk', 'blkr'] },
  games: [{ id: 'g1', date: '2026-09-20', opponent: 'Rival', periods: 8, period: 3, roster: PLAYERS.slice(0, 2), onCourt: [], played: {}, events: [ev('t2_ok', 'p4')], finished: true }],
});

describe('normalize', () => {
  let app;
  beforeAll(async () => { app = await openApp(); });
  afterAll(() => app.close());

  it('convierte datos vacíos o no válidos en una base de datos vacía', () => {
    for (const input of [null, undefined, 'texto', 42]) {
      expect(app.fn.normalize(input)).toEqual({ games: [], teams: [], currentTeamId: null, version: 2 });
    }
  });

  it('migra el formato v1 (un solo equipo) a la lista de equipos', () => {
    const d = app.fn.normalize(v1Backup());
    expect(d.version).toBe(2);
    expect(d.teams).toHaveLength(1);
    expect(d.teams[0]).toMatchObject({ name: 'Benjamín', email: 'entrenador@club.com', hidden: ['blk', 'blkr'] });
    expect(d.teams[0].players).toHaveLength(2);
    expect(d.currentTeamId).toBe(d.teams[0].id);
    expect(d.games[0].teamId).toBe(d.teams[0].id);
    expect(d.games[0].teamName).toBe('Benjamín');
    expect(d).not.toHaveProperty('team');
    expect(d).not.toHaveProperty('settings');
  });

  it('crea «Mi equipo» si un v1 tenía partidos pero no equipo', () => {
    const d = app.fn.normalize({ games: [makeGame({ teamId: undefined })] });
    expect(d.teams.map((t) => t.name)).toEqual(['Mi equipo']);
    expect(d.games[0].teamId).toBe(d.teams[0].id);
  });

  it('completa los campos que faltan en partidos y equipos', () => {
    const d = app.fn.normalize({ teams: [{ id: 't1' }], games: [{ id: 'g1', teamId: 't1' }] });
    expect(d.teams[0]).toEqual({ id: 't1', name: 'Mi equipo', email: '', players: [], hidden: [] });
    expect(d.games[0]).toMatchObject({ events: [], onCourt: [], roster: [], played: {}, periods: 8, period: 1, teamName: 'Mi equipo' });
  });

  it('mantiene el periodo actual dentro de los límites del partido', () => {
    const d = app.fn.normalize(makeData({ games: [makeGame({ id: 'a', periods: '4', period: 9 }), makeGame({ id: 'b', period: -2 })] }));
    expect(d.games[0]).toMatchObject({ periods: 4, period: 4 });
    expect(d.games[1]).toMatchObject({ periods: 8, period: 1 });
  });

  it('asigna al primer equipo los partidos de un equipo que no existe', () => {
    const d = app.fn.normalize(makeData({ games: [makeGame({ teamId: 'borrado' })] }));
    expect(d.games[0].teamId).toBe('t1');
  });

  it('elige el primer equipo si el equipo actual no existe', () => {
    const d = app.fn.normalize(makeData({ teams: [makeTeam({ id: 'a' }), makeTeam({ id: 'b' })], currentTeamId: 'borrado' }));
    expect(d.currentTeamId).toBe('a');
  });
});

describe('copia de seguridad manipulada', () => {
  // Cada campo que la app pinta en el HTML sin escapar lleva una etiqueta <img>. La app no pinta ninguna imagen,
  // así que cualquier <img> en la página es HTML colado (el id ayuda a saber de qué campo viene, aunque puede
  // llegar recortado: fmtDate, por ejemplo, parte la fecha por los guiones).
  const evil = (n) => `"><img id="xss-${n}">`;
  const tampered = () => ({
    version: 2,
    currentTeamId: evil('team'),
    teams: [{
      id: evil('team'), name: 'Alevín A', email: '', hidden: [],
      players: [{ id: evil('player'), number: '4', name: 'Ana' }, { id: 'p9', number: 9, name: 42 }],
    }],
    games: [{
      id: evil('game'), teamId: evil('team'), teamName: 'Alevín A', opponent: 'Rival',
      date: '<img id="xss-date">', periods: 8, period: 1, finished: false,
      roster: [{ id: evil('player'), number: '4', name: 'Ana' }],
      onCourt: [evil('player')],
      played: { [evil('player')]: [1, '<img id="xss-played">'] },
      events: [
        { id: evil('event'), ts: 1, period: '<img id="xss-period">', type: 't2_ok', pid: evil('player') },
        { id: 'e2', ts: 2, period: 1, type: 'opp', pts: '<img id="xss-pts">' },
        { id: 'e3', ts: 3, period: 1, type: '<img id="xss-type">', pid: evil('player') },
        { id: 'e4', ts: 4, period: 1, type: 'toString', pid: evil('player') },
      ],
    }],
  });
  const injected = (app) => app.$$('img').map((el) => el.outerHTML);

  it('no se cuela HTML en ninguna pantalla', async () => {
    const app = await openApp({ data: tampered() });
    const gid = app.db.games[0].id;
    for (const hash of ['#/equipos', '#/equipo', '#/partidos', `#/partido/${gid}`, `#/stats/${gid}`, '#/stats/temporada', '#/ajustes']) {
      await app.go(hash);
      expect(injected(app), hash).toEqual([]);
    }
    await app.go(`#/partido/${gid}`);
    await app.act('menu');
    await app.act('log');
    expect(injected(app), 'jugadas registradas').toEqual([]);
  });

  it('sustituye los identificadores no válidos manteniendo todas sus referencias', async () => {
    const app = await openApp();
    const d = app.fn.normalize(tampered());
    const [team] = d.teams;
    const [game] = d.games;
    const pid = team.players[0].id;
    expect(pid).toMatch(/^[\w-]+$/);
    expect(d.currentTeamId).toBe(team.id);
    expect(game.teamId).toBe(team.id);
    expect(game.id).toMatch(/^[\w-]+$/);
    expect(game.roster[0].id).toBe(pid);
    expect([...game.onCourt]).toEqual([pid]);
    expect(Object.keys(game.played)).toEqual([pid]);
    expect(game.events[0]).toMatchObject({ pid, type: 't2_ok' });
    expect(game.events[0].id).toMatch(/^[\w-]+$/);
    // La canasta sigue contando para la jugadora
    expect(app.fn.gameRows(game)[0]).toMatchObject({ id: pid, pts: 2, nper: 1 });
  });

  it('descarta jugadas que no se pueden interpretar y corrige periodos, dorsales y nombres', async () => {
    const app = await openApp();
    const d = app.fn.normalize(tampered());
    const [game] = d.games;
    expect(game.events).toHaveLength(1);
    expect(game.events[0].period).toBe(1);
    expect(Object.values(game.played)[0]).toEqual([1]);
    expect(game.date).toBe('');
    expect(d.teams[0].players[1]).toMatchObject({ number: '9', name: '42' });
  });

  it('limita el número de periodos de un partido', async () => {
    const app = await openApp();
    const d = app.fn.normalize(makeData({ games: [makeGame({ id: 'a', periods: 1e9 }), makeGame({ id: 'b', periods: 2.6 })] }));
    expect(d.games.map((g) => g.periods)).toEqual([12, 3]);
  });

  it('deja intactos los datos válidos', async () => {
    const app = await openApp();
    const data = makeData({ games: [sampleGame(), sampleGame({ id: 'g2', periods: 4, period: 4, finished: true })] });
    const json = JSON.stringify(data);
    expect(JSON.stringify(app.fn.normalize(JSON.parse(json)))).toBe(json);
  });

  it('al importarla guarda los datos ya saneados', async () => {
    const app = await openApp({ data: makeData(), hash: '#/ajustes' });
    const done = app.fn.importJSON(new app.window.File([JSON.stringify(tampered())], 'copia.json'));
    await app.settle();
    await app.act('confirm-yes');
    await done;
    expect(JSON.stringify(app.stored())).not.toContain('<img');
    expect(injected(app)).toEqual([]);
  });

  it('si ya estaba guardada, la sanea al abrir y conserva los identificadores nuevos', async () => {
    const first = await openApp({ data: tampered() });
    const stored = first.stored();
    expect(JSON.stringify(stored)).not.toContain('<img');
    const second = await openApp({ data: stored });
    expect(second.db.games[0].id).toBe(stored.games[0].id);
  });
});

describe('carga y guardado en localStorage', () => {
  it('migra los datos v1 al abrir y los guarda ya migrados, con identificadores estables', async () => {
    const first = await openApp({ data: v1Backup() });
    const stored = first.stored();
    expect(stored.version).toBe(2);
    expect(stored.teams[0].id).toBe(first.db.teams[0].id);

    // Al volver a abrir no se generan identificadores nuevos
    const second = await openApp({ data: stored });
    expect(second.db.teams[0].id).toBe(stored.teams[0].id);
  });

  it('no reescribe los datos que ya están en formato v2', async () => {
    const raw = JSON.stringify(makeData(), null, 2);
    const app = await openApp({ data: raw, hash: '#/equipo' });
    expect(app.window.localStorage.getItem(STORE_KEY)).toBe(raw);
  });

  it('si los datos están corruptos, arranca vacía y avisa por consola', async () => {
    const app = await openApp({ data: '{no es json' });
    expect(app.db).toMatchObject({ teams: [], games: [] });
    expect(app.logs.some((l) => l.level === 'warn' && String(l.args[0]).includes('No se pudieron leer'))).toBe(true);
    expect(app.hash).toBe('#/equipos');
  });

  it('avisa si el navegador no deja guardar (almacenamiento lleno)', async () => {
    const app = await openApp({ data: makeData(), hash: '#/equipo' });
    app.window.Storage.prototype.setItem = () => { throw new app.window.DOMException('Lleno', 'QuotaExceededError'); };
    await app.submit('player', { number: '99', name: 'Nuevo' });
    expect(app.toast).toContain('No se pudo guardar');
  });

  it('recarga los datos si cambian en otra pestaña', async () => {
    const app = await openApp({ data: makeData(), hash: '#/equipo' });
    const changed = makeData({ teams: [makeTeam({ name: 'Cambiado en otra pestaña' })] });
    app.window.localStorage.setItem(STORE_KEY, JSON.stringify(changed));
    app.window.dispatchEvent(new app.window.StorageEvent('storage', { key: STORE_KEY }));
    expect(app.db.teams[0].name).toBe('Cambiado en otra pestaña');
    expect(app.text('.brand-name')).toBe('Cambiado en otra pestaña');
  });
});

describe('importar copia de seguridad', () => {
  const file = (app, content, name = 'copia.json') => new app.window.File([content], name, { type: 'application/json' });

  it('reemplaza los datos tras confirmar, migrando el formato antiguo', async () => {
    const app = await openApp({ data: makeData(), hash: '#/ajustes' });
    const done = app.fn.importJSON(file(app, JSON.stringify(v1Backup())));
    await app.settle();
    expect(app.text(app.modal)).toContain('copia.json');
    expect(app.text(app.modal)).toContain('1 equipo y 0 partidos');
    await app.act('confirm-yes');
    await done;
    expect(app.db.teams.map((t) => t.name)).toEqual(['Benjamín']);
    expect(app.stored().teams.map((t) => t.name)).toEqual(['Benjamín']);
    expect(app.toast).toContain('Datos importados');
  });

  it('no toca nada si se cancela', async () => {
    const app = await openApp({ data: makeData(), hash: '#/ajustes' });
    const done = app.fn.importJSON(file(app, JSON.stringify(v1Backup())));
    await app.settle();
    await app.act('confirm-no');
    await done;
    expect(app.db.teams.map((t) => t.name)).toEqual(['Alevín A']);
  });

  it('rechaza archivos que no son una copia de seguridad', async () => {
    const app = await openApp({ data: makeData(), hash: '#/ajustes' });
    for (const content of ['no es json', '{"games": []}', '{"teams": [], "games": {}}']) {
      await app.fn.importJSON(file(app, content));
      expect(app.toast).toContain('No se pudo importar');
      expect(app.modal).toBeNull();
    }
    expect(app.db.teams.map((t) => t.name)).toEqual(['Alevín A']);
  });
});
