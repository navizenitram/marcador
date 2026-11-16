// Modo marcador: un equipo sin jugadores lleva sus partidos como un marcador, con la estadística de todo el equipo.
import { describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { ev, makeData, makeGame, makeTeam, opp } from '../helpers/fixtures.js';

const BOARD = '_equipo';
const ESCUELA_HIDDEN = ['ro', 'rd', 'reb', 'rec', 'lost', 'ast', 'blk', 'blkr', 'fc', 'fr'];
const boardTeam = (o = {}) => makeTeam({ players: [], board: true, hidden: [...ESCUELA_HIDDEN], ...o });
const boardGame = (o = {}) => makeGame({ roster: [{ id: BOARD, number: '', name: 'Equipo (marcador)' }], ...o });
const openBoard = (game = {}, team = boardTeam()) =>
  openApp({ data: makeData({ teams: [team], games: [boardGame(game)] }), hash: '#/partido/g1' });
const score = (app) => app.$$('.sb-score').map((n) => n.textContent.trim()).join('-');

describe('crear un equipo de solo marcador', () => {
  it('es la opción por defecto al crear un equipo', async () => {
    const app = await openApp();
    expect(app.$('form[data-form="team-new"] input[name=mode]:checked').value).toBe('board');
  });

  it('se crea sin jugadores, con el perfil Escuela, y lleva a los partidos', async () => {
    const app = await openApp();
    await app.submit('team-new', { name: 'Mis peques' });
    const t = app.db.teams[0];
    expect(t).toMatchObject({ name: 'Mis peques', players: [], board: true });
    expect([...t.hidden].sort()).toEqual([...ESCUELA_HIDDEN].sort());
    expect(app.hash).toBe('#/partidos');
    expect(app.text()).toContain('Empezar marcador');
  });

  it('al volver a abrirlo va a los partidos y en la lista de equipos sale como marcador', async () => {
    expect((await openApp({ data: makeData({ teams: [boardTeam()] }) })).hash).toBe('#/partidos');
    const app = await openApp({ data: makeData({ teams: [boardTeam(), makeTeam({ id: 't2', name: 'Infantil' })] }) });
    expect(app.text('.team-card small')).toContain('Marcador');
  });

  it('el modo se conserva al cargar y se descarta si no es true', async () => {
    const app = await openApp({ data: makeData({ teams: [boardTeam(), makeTeam({ id: 't2', board: 'sí' })] }) });
    expect(app.db.teams[0].board).toBe(true);
    expect('board' in app.db.teams[1]).toBe(false);
  });
});

describe('empezar un partido sin jugadores', () => {
  it('crea un partido de marcador, sin quinteto, y abre el marcador', async () => {
    const app = await openApp({ data: makeData({ teams: [boardTeam()] }), hash: '#/partidos' });
    await app.submit('game', { opponent: 'Lakers', venue: 'home' });
    const g = app.db.games[0];
    expect(g.roster).toEqual([{ id: BOARD, number: '', name: 'Equipo (marcador)' }]);
    expect(g.lineups).toEqual([]);
    expect(g.lineupFrom).toBeUndefined();
    expect(app.modal).toBeNull();
    expect(app.$('.board-live')).not.toBeNull();
    expect(app.$('.court')).toBeNull();
    expect(score(app)).toBe('0-0');
  });

  it('un equipo con jugadores sigue con la pista de siempre', async () => {
    const app = await openApp({ data: makeData(), hash: '#/partidos' });
    await app.submit('game', { opponent: 'Lakers', venue: 'home' });
    expect(app.$('.board-live')).toBeNull();
    expect(app.$('.court')).not.toBeNull();
  });
});

describe('el marcador', () => {
  it('con el perfil Escuela solo hay tiros: anotados arriba y fallados debajo', async () => {
    const app = await openBoard();
    expect(app.$$('.sb-row.made [data-action="ev"]').map((b) => b.dataset.type)).toEqual(['t1_ok', 't2_ok', 't3_ok']);
    expect(app.$$('.sb-row.miss [data-action="ev"]').map((b) => b.dataset.type)).toEqual(['t1_ko', 't2_ko', 't3_ko']);
    expect(app.$('.sb-row.rest')).toBeNull();
    expect(app.text('.sb-side.us .sb-sub')).not.toContain('Faltas');
  });

  it('suma los puntos del equipo y del rival y los guarda como jugadas del equipo', async () => {
    const app = await openBoard();
    await app.act('ev', { pid: BOARD, type: 't2_ok' });
    expect(app.toast).toContain('Alevín A · Canasta de 2');
    await app.act('ev', { pid: BOARD, type: 't3_ok' });
    await app.act('ev', { pid: BOARD, type: 't1_ko' });
    await app.act('opp', { pts: 2 });
    expect(score(app)).toBe('5-2');
    expect(app.db.games[0].events.filter((e) => e.pid === BOARD).map((e) => e.type)).toEqual(['t2_ok', 't3_ok', 't1_ko']);
    // VAL: 5 puntos − 1 tiro fallado
    expect(app.text('.live-perf b')).toBe('4');
    await app.act('undo');
    await app.act('undo');
    expect(score(app)).toBe('5-0');
  });

  it('el local a la izquierda: de visitante, el rival sale primero', async () => {
    const app = await openBoard({ venue: 'away', events: [ev('t2_ok', BOARD), opp(3)] });
    expect(app.$$('.sb-side').map((s) => (s.classList.contains('us') ? 'us' : 'them'))).toEqual(['them', 'us']);
    expect(score(app)).toBe('3-2');
  });

  it('los botones se configuran en Ajustes, con las faltas del equipo por periodo', async () => {
    const app = await openBoard({ period: 2, events: [ev('fc', BOARD, 1), ev('fc', BOARD, 2)] }, boardTeam({ hidden: [] }));
    expect(app.$$('.sb-row.rest [data-action="ev"]')).toHaveLength(9);
    expect(app.text('.sb-side.us .sb-sub')).toContain('Faltas 1');
    await app.act('ev', { pid: BOARD, type: 'fc' });
    expect(app.toast).toContain('Falta cometida · 2 en P2');
    expect(app.text('.sb-side.us .sb-sub')).toContain('Faltas 2');
  });

  it('en Ajustes se explica que los botones son del equipo', async () => {
    const app = await openApp({ data: makeData({ teams: [boardTeam()] }), hash: '#/ajustes' });
    expect(app.text('.board-note')).toContain('Modo marcador');
    expect(app.$('.profile.on').dataset.v).toBe('escuela');
  });

  it('pasar de periodo no pide quinteto ni lleva registro de quintetos', async () => {
    const app = await openBoard();
    await app.act('period', { d: '1' });
    const g = app.db.games[0];
    expect(g.period).toBe(2);
    expect(app.modal).toBeNull();
    expect(g.lineups).toEqual([]);
  });

  it('el menú lleva a los botones del marcador en vez de a los jugadores en pista', async () => {
    const app = await openBoard();
    await app.act('menu');
    expect(app.text(app.modal)).toContain('Botones del marcador');
    expect(app.$('.modal [data-action="lineup"]')).toBeNull();
  });

  it('si el equipo añade jugadores, un marcador empezado sigue siendo de marcador', async () => {
    const app = await openBoard({}, boardTeam({ players: [{ id: 'p1', number: '5', name: 'Leo' }] }));
    await app.act('period', { d: '1' });
    expect(app.db.games[0].roster.map((p) => p.id)).toEqual([BOARD]);
    expect(app.$('.board-live')).not.toBeNull();
  });

  it('el listado de jugadas nombra al equipo', async () => {
    const app = await openBoard({ events: [ev('t2_ok', BOARD)] });
    await app.act('menu');
    await app.act('log');
    expect(app.text('.log-row')).toContain('Alevín A · Canasta de 2');
  });

  it('finalizado, los botones quedan bloqueados', async () => {
    const app = await openBoard({ finished: true, events: [ev('t2_ok', BOARD)] });
    expect(app.$$('.sb [data-action]').every((b) => b.disabled)).toBe(true);
    expect(app.text('.locked-bar')).toContain('Partido finalizado');
  });
});

describe('estadísticas de un marcador', () => {
  const events = () => [ev('t2_ok', BOARD, 1), ev('t2_ko', BOARD, 1), ev('t3_ok', BOARD, 2), opp(2, 1)];

  it('en el partido, solo los totales del equipo, sin líderes ni quintetos', async () => {
    const app = await openApp({ data: makeData({ teams: [boardTeam()], games: [boardGame({ events: events(), finished: true })] }), hash: '#/stats/g1' });
    expect(app.$$('table.stats tbody tr')).toHaveLength(0);
    expect(app.text('table.stats tfoot')).toContain('Equipo');
    expect(app.text('table.stats tfoot [data-k="pts"]')).toBe('5');
    expect(app.$('.leaders')).toBeNull();
    expect(app.$('.units')).toBeNull();
    expect(app.$('table.stats [data-k="nper"]')).toBeNull();
    expect(app.text('.board-hint')).toContain('Partidos de marcador');
  });

  it('en la temporada suma los partidos de marcador y no ofrece informes', async () => {
    const games = [boardGame({ events: events(), finished: true }), boardGame({ id: 'g2', date: '2026-10-10', events: [ev('t1_ok', BOARD)] })];
    const app = await openApp({ data: makeData({ teams: [boardTeam()], games }), hash: '#/stats/temporada' });
    expect(app.text('table.stats tfoot [data-k="pts"]')).toBe('6');
    expect(app.$('[data-action="report"]')).toBeNull();
    expect(app.$('.report-hint')).toBeNull();
  });

  it('si después hay jugadores, el marcador sale como una fila más y no como líder', async () => {
    const games = [
      boardGame({ events: [ev('t3_ok', BOARD), ev('t3_ok', BOARD)], finished: true }),
      makeGame({ id: 'g2', date: '2026-10-10', events: [ev('t2_ok', 'p4')] }),
    ];
    const app = await openApp({ data: makeData({ games }), hash: '#/stats/temporada' });
    expect(app.text(`table.stats tbody [data-pid="${BOARD}"]`)).toContain('Equipo (marcador)');
    expect(app.$(`[data-action="report"][data-pid="${BOARD}"]`)).toBeNull();
    expect(app.text('.leaders')).toContain('Ana');
    expect(app.text('table.stats tfoot [data-k="pts"]')).toBe('8');
  });

  it('el texto para compartir lleva el resultado y los totales del equipo', async () => {
    const app = await openApp({ data: makeData({ teams: [boardTeam()], games: [boardGame({ events: events() })] }), hash: '#/stats/g1' });
    await app.act('share', { arg: 'g1' });
    const text = app.ui.modal.text;
    expect(text).toContain('Alevín A 5 - 2 Rival');
    expect(text).toContain('EQUIPO: 5 pts');
    expect(text).not.toContain('Equipo (marcador)');
  });
});
