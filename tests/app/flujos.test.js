// Flujos de uso sobre el DOM real de la app: se pulsan sus botones y se envían sus formularios.
import { describe, expect, it } from 'vitest';
import { openApp, THEME_KEY } from '../helpers/app.js';
import { ev, makeData, makeGame, makeTeam, opp, PLAYERS, sampleGame } from '../helpers/fixtures.js';

const FIVE = ['p4', 'p7', 'p10', 'p12', 'p15'];

/** App abierta en un partido en juego con cinco jugadores en pista */
const live = (game = {}, team = makeTeam()) =>
  openApp({ data: makeData({ teams: [team], games: [makeGame({ onCourt: [...FIVE], ...game })] }), hash: '#/partido/g1' });

const scoreboard = (app) => `${app.text('.board .score.us')}-${app.text('.board .score.them')}`;
const rowOf = (app, pid) => app.$(`.court [data-action="swap"][data-pid="${pid}"]`).closest('.prow');
const tap = (app, pid, type, times = 1) => (async () => { for (let i = 0; i < times; i++) await app.act('ev', { pid, type }); })();

describe('arranque y navegación', () => {
  it('sin datos pide crear el primer equipo', async () => {
    const app = await openApp();
    expect(app.hash).toBe('#/equipos');
    expect(app.text()).toContain('Bienvenido/a');
  });

  it('con un equipo con jugadores abre los partidos; sin jugadores, la plantilla', async () => {
    expect((await openApp({ data: makeData() })).hash).toBe('#/partidos');
    expect((await openApp({ data: makeData({ teams: [makeTeam({ players: [] })] }) })).hash).toBe('#/equipo');
  });

  it('con varios equipos pide elegir uno y marca el actual', async () => {
    const app = await openApp({ data: makeData({ teams: [makeTeam(), makeTeam({ id: 't2', name: 'Infantil' })], currentTeamId: 't2' }) });
    expect(app.hash).toBe('#/equipos');
    expect(app.$$('.team-card').map((li) => li.classList.contains('current'))).toEqual([false, true]);
  });

  it('un partido que no existe lleva a la lista de partidos', async () => {
    expect((await openApp({ data: makeData(), hash: '#/partido/no-existe' })).hash).toBe('#/partidos');
  });

  it('las estadísticas sin partido elegido muestran el más reciente', async () => {
    const games = [sampleGame(), makeGame({ id: 'g2', date: '2026-10-10' })];
    const app = await openApp({ data: makeData({ games }), hash: '#/stats' });
    expect(app.hash).toBe('#/stats/g2');
  });

  it('un enlace a las estadísticas de un partido de otro equipo cambia de equipo', async () => {
    const data = makeData({ teams: [makeTeam(), makeTeam({ id: 't2', name: 'Infantil' })], games: [makeGame({ id: 'gx', teamId: 't2' })] });
    const app = await openApp({ data, hash: '#/stats/gx' });
    expect(app.db.currentTeamId).toBe('t2');
    expect(app.text('.brand-name')).toBe('Infantil');
  });

  it('la página de privacidad se abre desde la pantalla de equipos', async () => {
    const app = await openApp({ hash: '#/privacidad' });
    expect(app.text('h1')).toBe('Tu privacidad');
    expect(app.text()).toContain('No envía a ningún servidor');
  });

  it('la barra superior enlaza al partido en juego', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame()] }), hash: '#/equipo' });
    expect(app.$('.live-link').getAttribute('href')).toBe('#/partido/g1');
    expect(app.text('.live-link')).toBe('vs Rival');
  });
});

describe('equipos', () => {
  it('crea un equipo y lleva a su plantilla', async () => {
    const app = await openApp();
    await app.submit('team-new', { name: '  Alevín B  ' });
    expect(app.db.teams).toHaveLength(1);
    expect(app.db.teams[0]).toMatchObject({ name: 'Alevín B', players: [], hidden: [] });
    expect(app.db.currentTeamId).toBe(app.db.teams[0].id);
    expect(app.stored().teams[0].name).toBe('Alevín B');
    expect(app.hash).toBe('#/equipo');
  });

  it('el equipo nuevo hereda el email del equipo actual', async () => {
    const app = await openApp({ data: makeData({ teams: [makeTeam({ email: 'club@club.com' })] }), hash: '#/equipos' });
    await app.submit('team-new', { name: 'Infantil' });
    expect(app.db.teams[1]).toMatchObject({ name: 'Infantil', email: 'club@club.com' });
  });

  it('al elegir otro equipo lo marca como actual', async () => {
    const app = await openApp({ data: makeData({ teams: [makeTeam(), makeTeam({ id: 't2', name: 'Infantil', players: [] })] }) });
    await app.act('pick-team', { id: 't2' });
    expect(app.db.currentTeamId).toBe('t2');
    expect(app.hash).toBe('#/equipo');
  });

  it('la tarjeta solo cuenta como victoria o derrota los partidos finalizados', async () => {
    const games = [
      sampleGame(),                                                                     // 8-4, en juego
      makeGame({ id: 'g2', finished: true, events: [ev('t2_ok', 'p4')] }),              // 2-0
      makeGame({ id: 'g3', finished: true, events: [opp(3)] }),                         // 0-3
    ];
    const app = await openApp({ data: makeData({ teams: [makeTeam(), makeTeam({ id: 't2' })], games }) });
    expect(app.text(app.$$('.team-card')[0])).toContain('3 partidos · 1V 1D');
  });

  it('muestra jugadores, partidos y si hay uno en juego', async () => {
    const app = await openApp({ data: makeData({ teams: [makeTeam(), makeTeam({ id: 't2' })], games: [sampleGame(), makeGame({ id: 'g2', finished: true })] }) });
    const card = app.text(app.$$('.team-card')[0]);
    expect(card).toContain('6 jugadores · 2 partidos');
    expect(card).toContain('Partido en juego');
  });

  it('eliminar un equipo borra también sus partidos, tras confirmar', async () => {
    const data = makeData({ teams: [makeTeam(), makeTeam({ id: 't2', name: 'Infantil' })], games: [sampleGame(), makeGame({ id: 'g2', teamId: 't2' })] });
    const app = await openApp({ data, hash: '#/equipos' });

    await app.act('del-team', { id: 't1' });
    expect(app.text(app.modal)).toContain('Se borrarán sus 6 jugadores y 1 partidos');
    await app.act('confirm-no');
    expect(app.db.teams).toHaveLength(2);

    await app.act('del-team', { id: 't1' });
    await app.act('confirm-yes');
    expect(app.db.teams.map((t) => t.id)).toEqual(['t2']);
    expect(app.db.games.map((g) => g.id)).toEqual(['g2']);
    expect(app.db.currentTeamId).toBe('t2');
  });

  it('cambiar el nombre del equipo actualiza los partidos en juego, pero no los finalizados', async () => {
    const games = [makeGame({ id: 'abierto' }), makeGame({ id: 'cerrado', finished: true })];
    const app = await openApp({ data: makeData({ games }), hash: '#/equipo' });
    await app.change('team-name', 'Alevín Oro');
    expect(app.db.teams[0].name).toBe('Alevín Oro');
    expect(app.db.games.map((g) => g.teamName)).toEqual(['Alevín Oro', 'Alevín A']);

    await app.change('team-name', '   ');
    expect(app.db.teams[0].name).toBe('Mi equipo');
  });

  it('guarda el email al que se envían las estadísticas', async () => {
    const app = await openApp({ data: makeData(), hash: '#/equipo' });
    await app.change('team-email', ' entrenador@club.com ');
    expect(app.stored().teams[0].email).toBe('entrenador@club.com');
    expect(app.toast).toBe('Email guardado');
  });
});

describe('lista de partidos', () => {
  it('muestra los partidos del más reciente al más antiguo, con su estado', async () => {
    const games = [sampleGame({ finished: true }), makeGame({ id: 'g2', date: '2026-10-10', opponent: 'Celtics', period: 3 })];
    const app = await openApp({ data: makeData({ games }), hash: '#/partidos' });
    const items = app.$$('.games li').map((li) => app.text(li));
    expect(items[0]).toContain('vs Celtics');
    expect(items[0]).toContain('En juego · P3');
    expect(items[1]).toContain('vs Rival');
    expect(items[1]).toContain('Finalizado');
    expect(app.text(app.$$('.games .g-score')[1])).toBe('8–4');
  });

  it('cada partido lleva su fecha y, si está finalizado, su resultado', async () => {
    const games = [
      sampleGame({ finished: true }),                                                                        // 8-4
      makeGame({ id: 'g2', date: '2026-10-10', finished: true, events: [opp(2)] }),                          // 0-2
      makeGame({ id: 'g3', date: '2026-11-07', finished: true }),                                            // 0-0
      makeGame({ id: 'g4', date: '2026-11-14' }),                                                            // en juego
    ];
    const app = await openApp({ data: makeData({ games }), hash: '#/partidos' });
    const rows = app.$$('.games li');
    expect(rows.map((li) => app.text(li.querySelector('.g-date')))).toEqual(['14nov', '7nov', '10oct', '3oct']);
    expect(rows.map((li) => app.text(li.querySelector('.g-res')))).toEqual(['', 'E', 'D', 'V']);
    expect(rows.map((li) => li.querySelector('.g-res').title)).toEqual(['En juego', 'Empate', 'Derrota', 'Victoria']);
  });

  it('borra un partido tras confirmar', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame(), makeGame({ id: 'g2' })] }), hash: '#/partidos' });
    await app.act('del-game', { id: 'g1' });
    expect(app.text(app.modal)).toContain('¿Borrar el partido contra Rival (03/10/2026)?');
    await app.act('confirm-no');
    expect(app.db.games).toHaveLength(2);

    await app.act('del-game', { id: 'g1' });
    await app.act('confirm-yes');
    expect(app.db.games.map((g) => g.id)).toEqual(['g2']);
    expect(app.stored().games.map((g) => g.id)).toEqual(['g2']);
  });
});

describe('plantilla', () => {
  it('añade un jugador y lo muestra ordenado por dorsal', async () => {
    const app = await openApp({ data: makeData(), hash: '#/equipo' });
    await app.submit('player', { number: ' 8 ', name: ' Gala ' });
    expect(app.db.teams[0].players.at(-1)).toMatchObject({ number: '8', name: 'Gala' });
    expect(app.$$('.roster .num').map((n) => n.textContent)).toEqual(['4', '7', '8', '10', '12', '15', '21']);
    expect(app.toast).toContain('Añadido #8 Gala');
  });

  it('no deja repetir dorsal', async () => {
    const app = await openApp({ data: makeData(), hash: '#/equipo' });
    await app.submit('player', { number: '4', name: 'Otra' });
    expect(app.db.teams[0].players).toHaveLength(PLAYERS.length);
    expect(app.toast).toContain('El dorsal 4 ya es de Ana');
  });

  it('edita un jugador (conservando su dorsal)', async () => {
    const app = await openApp({ data: makeData(), hash: '#/equipo' });
    await app.act('edit-player', { id: 'p4' });
    expect(app.$('input[name=name]').value).toBe('Ana');
    await app.submit('player', { name: 'Ana María' });
    expect(app.db.teams[0].players.find((p) => p.id === 'p4')).toMatchObject({ number: '4', name: 'Ana María' });
    expect(app.ui.editId).toBeNull();
  });

  it('elimina un jugador del equipo pero conserva sus partidos', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame()] }), hash: '#/equipo' });
    await app.act('del-player', { id: 'p4' });
    await app.act('confirm-yes');
    expect(app.db.teams[0].players.map((p) => p.id)).not.toContain('p4');
    expect(app.db.games[0].roster.map((p) => p.id)).toContain('p4');
  });
});

describe('empezar un partido', () => {
  it('crea el partido con la plantilla ordenada y pide el quinteto inicial', async () => {
    const app = await openApp({ data: makeData(), hash: '#/partidos' });
    await app.submit('game', { opponent: 'Lakers', date: '2026-11-01', periods: 4 });
    const g = app.db.games[0];
    expect(g).toMatchObject({ opponent: 'Lakers', date: '2026-11-01', periods: 4, period: 1, teamId: 't1', teamName: 'Alevín A', finished: false });
    expect(g.roster.map((p) => p.number)).toEqual(['4', '7', '10', '12', '15', '21']);
    expect(app.hash).toBe(`#/partido/${g.id}`);
    expect(app.text(app.modal)).toContain('Quinteto inicial · Cuarto 1');
  });

  it('sin jugadores no deja empezar', async () => {
    const app = await openApp({ data: makeData({ teams: [makeTeam({ players: [] })] }), hash: '#/partidos' });
    expect(app.text()).toContain('Primero da de alta a los jugadores');
    expect(app.$('form[data-form="game"] button[type=submit]').disabled).toBe(true);
  });

  it('propone la duración del último partido', async () => {
    const app = await openApp({ data: makeData({ games: [makeGame({ periods: 4 })] }), hash: '#/partidos' });
    expect(app.$('input[name=periods]:checked').value).toBe('4');
  });

  it('elige hasta 5 jugadores en pista y registra que juegan el periodo', async () => {
    const app = await openApp({ data: makeData(), hash: '#/partidos' });
    await app.submit('game', { opponent: 'Lakers' });
    for (const pid of [...FIVE, 'p21']) await app.act('toggle-court', { id: pid });
    expect(app.toast).toContain('Máximo 5 jugadores en pista');
    expect(app.text('.modal .count')).toBe('5/5 en pista');

    await app.act('lineup-done');
    const g = app.db.games[0];
    expect(app.modal).toBeNull();
    expect([...g.onCourt]).toEqual(FIVE);
    expect(Object.keys(g.played).sort()).toEqual([...FIVE].sort());
    expect(app.$$('.court .pname').map((n) => n.textContent)).toEqual(['Ana', 'Bruno', 'Carla', 'Dani', 'Eva']);
  });

  it('en el quinteto se puede quitar a un jugador o vaciar la pista', async () => {
    const app = await live();
    await app.act('lineup');
    await app.act('toggle-court', { id: 'p4' });
    expect(app.text('.modal .count')).toBe('4/5 en pista');
    await app.act('clear-court');
    expect(app.text('.modal .count')).toBe('0/5 en pista');
    await app.act('lineup-done');
    expect(app.$$('.court .add-player')).toHaveLength(5);
  });

  describe('si hay partidos sin finalizar', () => {
    const pending = () => makeData({ games: [sampleGame(), makeGame({ id: 'vacio', date: '2026-10-05' })] });

    it('propone finalizar los que tienen jugadas (no los vacíos, que serían un 0-0)', async () => {
      const app = await openApp({ data: pending(), hash: '#/partidos' });
      await app.submit('game', { opponent: 'Nuevo' });
      expect(app.text(app.modal)).toContain('El partido contra Rival del 03/10 (8-4) sigue sin finalizar');
      await app.act('confirm-yes');
      const byId = Object.fromEntries(app.db.games.map((g) => [g.id, g]));
      expect(byId.g1.finished).toBe(true);
      expect(byId.vacio.finished).toBe(false);
      expect(app.db.games).toHaveLength(3);
      expect(app.hash).toMatch(/^#\/partido\//);
    });

    it('con varios, los lista y permite dejarlos sin finalizar', async () => {
      const data = makeData({ games: [sampleGame(), sampleGame({ id: 'g2', opponent: 'Celtics', date: '2026-10-10' })] });
      const app = await openApp({ data, hash: '#/partidos' });
      await app.submit('game', { opponent: 'Nuevo' });
      expect(app.text(app.modal)).toContain('Hay 2 partidos sin finalizar');
      expect(app.text(app.modal)).toContain('Celtics');
      await app.act('confirm-no');
      expect(app.db.games.filter((g) => g.finished)).toHaveLength(0);
      expect(app.db.games).toHaveLength(3);
    });

    it('sin partidos pendientes empieza directamente', async () => {
      const app = await openApp({ data: makeData({ games: [makeGame({ finished: true })] }), hash: '#/partidos' });
      await app.submit('game', { opponent: 'Nuevo' });
      expect(app.text(app.modal)).toContain('Quinteto inicial');
    });
  });
});

describe('partido en directo', () => {
  it('cada canasta suma al marcador y queda guardada', async () => {
    const app = await live();
    await app.act('ev', { pid: 'p4', type: 't2_ok' });
    await app.act('ev', { pid: 'p7', type: 't3_ok' });
    await app.act('ev', { pid: 'p7', type: 't1_ko' });
    expect(scoreboard(app)).toBe('5-0');
    expect(app.text(rowOf(app, 'p7'))).toContain('3 pts');
    expect(app.toast).toContain('#7 Bruno · Tiro libre fallado');
    expect(app.stored().games[0].events.map((e) => [e.pid, e.type, e.period])).toEqual([['p4', 't2_ok', 1], ['p7', 't3_ok', 1], ['p7', 't1_ko', 1]]);
  });

  it('los puntos del rival se suman con +1/+2/+3 y se corrigen con −1, sin bajar de 0', async () => {
    const app = await live();
    await app.act('opp', { pts: -1 });
    expect(app.toast).toContain('El rival no tiene puntos en P1');
    expect(app.db.games[0].events).toHaveLength(0);

    await app.act('opp', { pts: 3 });
    await app.act('opp', { pts: 2 });
    await app.act('opp', { pts: -1 });
    expect(scoreboard(app)).toBe('0-4');
  });

  it('el −1 del rival no deja en negativo el parcial del periodo actual', async () => {
    const app = await live({ period: 2, events: [opp(2, 1)] });
    await app.act('opp', { pts: -1 });
    expect(app.toast).toContain('El rival no tiene puntos en P2');
    expect(app.toast).toContain('Jugadas');  // indica dónde corregir otro periodo
    expect(app.db.games[0].events).toHaveLength(1);
    expect([...app.fn.periodScores(app.db.games[0]).them.slice(0, 2)]).toEqual([2, 0]);
  });

  it('deshacer quita la última jugada', async () => {
    const app = await live();
    await app.act('undo');
    expect(app.toast).toBe('Nada que deshacer');

    await app.act('ev', { pid: 'p4', type: 't2_ok' });
    await app.act('ev', { pid: 'p4', type: 't3_ok' });
    await app.act('undo');
    expect(scoreboard(app)).toBe('2-0');
    expect(app.toast).toContain('Deshecho: #4 Ana · Triple');
  });

  it('avisa a las 4 faltas y elimina con la quinta', async () => {
    const app = await live();
    await tap(app, 'p4', 'fc', 3);
    expect(rowOf(app, 'p4').className).not.toMatch(/f-warn|f-out/);

    await tap(app, 'p4', 'fc');
    expect(rowOf(app, 'p4').classList.contains('f-warn')).toBe(true);
    expect(app.toast).toContain('⚠️ #4 Ana · 4 faltas');

    await tap(app, 'p4', 'fc');
    expect(rowOf(app, 'p4').classList.contains('f-out')).toBe(true);
    expect(app.text(rowOf(app, 'p4'))).toContain('ELIM.');
    expect(app.toast).toContain('5 faltas: eliminado/a');
  });

  it('las faltas de cada jugador se ven también como puntos bajo su dorsal', async () => {
    const app = await live();
    const dots = (pid) => rowOf(app, pid).querySelectorAll('.fouls-dots i.on').length;
    expect(rowOf(app, 'p4').querySelectorAll('.fouls-dots i')).toHaveLength(5);
    expect(dots('p4')).toBe(0);
    await tap(app, 'p4', 'fc', 3);
    await tap(app, 'p7', 'fc');
    expect([dots('p4'), dots('p7'), dots('p10')]).toEqual([3, 1, 0]);
    expect(app.text(rowOf(app, 'p4').querySelector('.num'))).toBe('4');  // el dorsal sigue siendo solo el dorsal
  });

  it('cambia a un jugador por otro del banquillo en el mismo hueco', async () => {
    const app = await live({ period: 3 });
    await app.act('swap', { pid: 'p4' });
    expect(app.text(app.modal)).toContain('Cambio · sale #4 Ana');
    expect(app.$$('#modal [data-action="swap-in"]').map((b) => b.dataset.id)).toEqual(['p21']);

    await app.act('swap-in', { id: 'p21' });
    const g = app.db.games[0];
    expect(g.onCourt[0]).toBe('p21');
    expect(g.played.p21).toEqual([3]);
    expect(app.modal).toBeNull();
  });

  it('sienta a un jugador sin cambio y deja el hueco libre para añadir a otro', async () => {
    const app = await live();
    await app.act('swap', { pid: 'p4' });
    await app.act('bench-out');
    expect([...app.db.games[0].onCourt]).toEqual(['p7', 'p10', 'p12', 'p15']);
    expect(app.$$('.court .add-player')).toHaveLength(1);

    await app.click('.court .add-player');
    expect(app.text(app.modal)).toContain('Añadir jugador a pista');
    await app.act('swap-in', { id: 'p21' });
    expect(app.db.games[0].onCourt).toContain('p21');
  });

  it('al pasar de periodo pide el quinteto y apunta el periodo a quien está en pista', async () => {
    const app = await live();
    expect(app.$('[data-action="period"][data-d="-1"]').disabled).toBe(true);

    await app.act('period', { d: 1 });
    expect(app.text('.period b')).toBe('P2');
    expect(app.text(app.modal)).toContain('Quinteto · Periodo 2');
    await app.act('lineup-done');
    expect(app.db.games[0].played.p4).toContain(2);

    await app.act('period', { d: -1 });
    expect(app.db.games[0].period).toBe(1);
    expect(app.modal).toBeNull();  // al volver atrás no se pide quinteto
  });

  it('los partidos a 4 cuartos se muestran como Q1…Q4', async () => {
    const app = await live({ periods: 4, period: 2 });
    expect(app.text('.period')).toContain('Q2');
    expect(app.text('.period')).toContain('de 4');
  });

  it('en el último periodo, «siguiente» propone finalizar el partido', async () => {
    const app = await live({ period: 8 });
    await app.act('period', { d: 1 });
    expect(app.text(app.modal)).toContain('Es el último periodo');
    await app.act('confirm-no');
    expect(app.db.games[0]).toMatchObject({ finished: false, period: 8 });

    await app.act('period', { d: 1 });
    await app.act('confirm-yes');
    expect(app.db.games[0].finished).toBe(true);
    expect(app.hash).toBe('#/stats/g1');
  });

  it('un partido finalizado no avanza más allá del último periodo', async () => {
    const app = await live({ period: 8, finished: true });
    await app.act('period', { d: 1 });
    expect(app.toast).toBe('El partido está finalizado');
    expect(app.modal).toBeNull();
  });

  it('se finaliza y se reabre desde el menú', async () => {
    const app = await live();
    await app.act('menu');
    await app.act('finish', { id: 'g1' });
    await app.act('confirm-yes');
    expect(app.db.games[0].finished).toBe(true);

    await app.go('#/partido/g1');
    await app.act('menu');
    await app.act('reopen', { id: 'g1' });
    expect(app.db.games[0].finished).toBe(false);
    expect(app.toast).toBe('Partido reabierto');
  });

  it('el listado de jugadas permite borrar cualquiera', async () => {
    const app = await live({ events: [ev('t2_ok', 'p4'), ev('t3_ok', 'p7'), ev('t2_ok', 'p10')] });
    await app.act('menu');
    await app.act('log');
    expect(app.$$('.log-row')).toHaveLength(3);
    expect(app.text(app.$$('.log-row')[0])).toContain('#10 Carla · Canasta de 2');  // la más reciente arriba

    const triple = app.db.games[0].events[1].id;
    await app.act('del-event', { id: triple });
    expect(app.db.games[0].events.map((e) => e.type)).toEqual(['t2_ok', 't2_ok']);
    expect(app.$$('.log-row')).toHaveLength(2);
    expect(scoreboard(app)).toBe('4-0');
  });

  it('añade a la convocatoria a los jugadores dados de alta durante el partido', async () => {
    const team = makeTeam({ players: [...PLAYERS, { id: 'p30', number: '30', name: 'Nueva' }] });
    const app = await live({}, team);
    await app.act('lineup');
    expect(app.$$('#modal [data-action="toggle-court"]').map((b) => b.dataset.id)).toContain('p30');
  });
});

describe('ajustes: botones del partido', () => {
  it('desactivar una acción la quita de la pista y de la vista previa', async () => {
    const app = await live();
    await app.go('#/ajustes');
    await app.act('toggle-opt', { id: 'blk' });
    expect([...app.db.teams[0].hidden]).toEqual(['blk']);
    expect(app.stored().teams[0].hidden).toEqual(['blk']);
    expect(app.$$('.preview .act.blk')).toHaveLength(0);

    await app.go('#/partido/g1');
    expect(app.$$('.court [data-type="blk"]')).toHaveLength(0);
    expect(app.$$('.court [data-type="t2_ok"]')).toHaveLength(5);
  });

  it('los tiros se activan por parejas (anotado y fallado)', async () => {
    const app = await live({}, makeTeam({ hidden: ['t3'] }));
    expect(app.$$('.court [data-type^="t3_"]')).toHaveLength(0);
    expect(app.$$('.court [data-type^="t2_"]')).toHaveLength(10);
  });

  it('«Activar todos» vuelve a mostrar todas las acciones', async () => {
    const app = await openApp({ data: makeData({ teams: [makeTeam({ hidden: ['blk', 'fr'] })] }), hash: '#/ajustes' });
    await app.act('opts-all');
    expect([...app.db.teams[0].hidden]).toEqual([]);
  });

  it('tiene que quedar al menos un botón', async () => {
    const all = ['t1', 't3', 'rec', 'lost', 'ro', 'rd', 'ast', 'blk', 'blkr', 'fc', 'fr'];
    const app = await openApp({ data: makeData({ teams: [makeTeam({ hidden: [...all] })] }), hash: '#/ajustes' });
    await app.act('toggle-opt', { id: 't2' });
    expect(app.toast).toBe('Tiene que quedar al menos un botón');
    expect(app.db.teams[0].hidden).not.toContain('t2');
  });

  it('las columnas de acciones desactivadas se ocultan en las estadísticas salvo que tengan datos', async () => {
    const team = makeTeam({ hidden: ['blk', 'blkr'] });
    const headers = async (events) => {
      const app = await openApp({ data: makeData({ teams: [team], games: [makeGame({ events })] }), hash: '#/stats/g1' });
      return app.$$('table.stats thead th').map((th) => th.textContent.replace(/[▲▼]/g, '').trim());
    };
    expect(await headers([])).not.toContain('TAP');
    expect(await headers([ev('blk', 'p4')])).toContain('TAP');
  });
});

describe('estadísticas', () => {
  const twoGames = () => makeData({
    games: [sampleGame(), makeGame({ id: 'g2', date: '2026-10-10', finished: true, played: { p4: [1] }, events: [ev('t2_ok', 'p4'), ev('t2_ok', 'p4')] })],
  });

  it('sin partidos invita a crear el primero', async () => {
    const app = await openApp({ data: makeData(), hash: '#/stats' });
    expect(app.text()).toContain('Aún no hay partidos registrados');
  });

  it('el selector cambia entre partidos y temporada', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame()] }), hash: '#/stats/g1' });
    await app.change('stats-select', 'temporada');
    expect(app.hash).toBe('#/stats/temporada');
    expect(app.text('.stats-select option:checked')).toBe('Temporada · 1 partido');
  });

  it('un partido que ya no existe muestra la temporada', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame()] }), hash: '#/stats/borrado' });
    expect(app.hash).toBe('#/stats/temporada');
    expect(app.$$('.kpi').length).toBeGreaterThan(0);
  });

  it('el resumen de temporada solo cuenta como resultado los partidos finalizados', async () => {
    const app = await openApp({ data: twoGames(), hash: '#/stats/temporada' });
    const kpis = Object.fromEntries(app.$$('.kpi').map((k) => [app.text(k.querySelector('small')), app.text(k.querySelector('b'))]));
    expect(kpis).toEqual({
      Partidos: '2', Victorias: '1', Derrotas: '0', 'En juego': '1',
      'Puntos a favor / partido': '4', 'Puntos en contra / partido': '0',
    });
  });

  it('el resumen del partido muestra resultado, parciales y líderes', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame({ finished: true })] }), hash: '#/stats/g1' });
    expect(app.text('.badge')).toBe('Victoria');
    const cells = (tr) => [...tr.cells].map((td) => td.textContent);
    expect(cells(app.$$('.ptable tr')[1])).toEqual(['Alevín A', '6', '0', '2', '0', '0', '0', '0', '0', '8']);
    expect(cells(app.$$('.ptable tr')[2])).toEqual(['Rival', '2', '2', '0', '0', '0', '0', '0', '0', '4']);
    const leader = app.$('.leader');
    expect([...leader.children].map((el) => el.textContent)).toEqual(['Mejor valoración', '5', '#7 Bruno']);
  });

  it('el resumen del partido dibuja la evolución del marcador bajo los parciales', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame({ finished: true })] }), hash: '#/stats/g1' });
    const flow = app.$('.ptable .flow');
    expect(flow.getAttribute('aria-label')).toBe('Diferencia de puntos a lo largo del partido. Máxima ventaja de Alevín A: 4. Máxima ventaja de Rival: 0. Final: +4.');
    expect(app.$('.flow-cell').colSpan).toBe(8);                           // ocupa las columnas de los periodos
    expect(app.text('.flow-diff')).toBe('+4');
    expect(app.$('.flow-end').classList.contains('us')).toBe(true);
    expect(app.$('.flow .line.them').getAttribute('d')).toBe('');          // el rival no ha ido nunca por delante
  });

  it('la evolución del marcador muestra cómo iba el partido en el punto que se señala', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame({ finished: true })] }), hash: '#/stats/g1' });
    const flow = app.$('.flow');
    flow.getBoundingClientRect = () => ({ left: 100, top: 0, width: 800, height: 60 });  // jsdom no calcula el diseño
    const point = (type, clientX = 0) => flow.dispatchEvent(new app.window.MouseEvent(type, { bubbles: true, clientX }));

    point('pointermove', 100 + 150);   // a mitad del P2: el rival acaba de anotar su +3
    expect(app.text('.flow-label')).toBe('P2 · 6–5');
    expect(app.text('.flow-diff')).toBe('+1');
    expect(app.$('.flow-cross').hidden).toBe(false);

    point('pointermove', 100 + 10);    // antes de la primera canasta
    expect(app.text('.flow-label')).toBe('P1 · 0–0');
    expect(app.text('.flow-diff')).toBe('0');

    point('pointerup');                // al soltar vuelve el resultado final
    expect(app.text('.flow-label')).toBe('Diferencia');
    expect(app.text('.flow-diff')).toBe('+4');
    expect(app.$('.flow-cross').hidden).toBe(true);
  });

  it('un partido sin puntos no dibuja la evolución', async () => {
    const app = await openApp({ data: makeData({ games: [makeGame({ events: [ev('rd', 'p4')] })] }), hash: '#/stats/g1' });
    expect(app.$('.ptable')).not.toBeNull();
    expect(app.$('.flow')).toBeNull();
  });

  it('la temporada dibuja la diferencia de puntos de cada partido, del más antiguo al más reciente', async () => {
    const games = [
      ...twoGames().games,                                                                                    // g1 en juego (8-4) y g2 finalizado (4-0)
      makeGame({ id: 'g3', date: '2026-10-17', finished: true, events: [opp(3), ev('t1_ok', 'p4')] }),       // 1-3
      makeGame({ id: 'g4', date: '2026-10-24', finished: true, events: [opp(2), ev('t2_ok', 'p4')] }),       // 2-2
      makeGame({ id: 'g5', date: '2026-10-31' }),                                                            // sin jugadas: no sale
    ];
    const app = await openApp({ data: makeData({ games }), hash: '#/stats/temporada' });
    const cols = app.$$('.trend .tcol');
    expect(cols.map((a) => a.getAttribute('href'))).toEqual(['#/stats/g1', '#/stats/g2', '#/stats/g3', '#/stats/g4']);
    expect(cols.map((a) => app.text(a.querySelector('.tval')))).toEqual(['+4', '+4', '−2', '0']);
    expect(cols.map((a) => a.className.replace('tcol ', ''))).toEqual(['up open', 'up win', 'down loss', 'flat tie']);
    expect(cols[0].title).toBe('03/10 · vs Rival: 8–4 (en juego)');
    expect(cols[2].title).toBe('17/10 · vs Rival: 1–3');
  });

  it('con muchos partidos la temporada dibuja los últimos 24 y solo rotula el mejor, el peor y el último', async () => {
    const games = Array.from({ length: 30 }, (_, i) => makeGame({
      id: `g${i}`, createdAt: i, date: `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, finished: true,
      events: i === 10 ? [opp(3)] : i === 20 ? [ev('t3_ok', 'p4'), ev('t3_ok', 'p4')] : [ev('t1_ok', 'p4')],
    }));
    const app = await openApp({ data: makeData({ games }), hash: '#/stats/temporada' });
    expect(app.text('.trend figcaption')).toBe('Diferencia de puntos por partido · últimos 24');
    expect(app.$$('.trend .tcol')).toHaveLength(24);
    expect(app.$('.trend .tcol').getAttribute('href')).toBe('#/stats/g6');
    expect(app.$$('.trend .tval').map((b) => b.textContent)).toEqual(['−3', '+6', '+1']);
  });

  it('la tabla atenúa los ceros y marca la columna por la que está ordenada', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame()] }), hash: '#/stats/g1' });
    const cell = (name, k) => { const tr = app.$$('table.stats tbody tr').find((r) => r.textContent.includes(name)); return tr.cells[app.$$('table.stats thead th').findIndex((th) => th.dataset.k === k)]; };
    expect(cell('Bruno', 'rd').classList.contains('zero')).toBe(false);   // 1 rebote defensivo
    expect(cell('Bruno', 'ro').classList.contains('zero')).toBe(true);
    expect(cell('Bruno', 't1').classList.contains('zero')).toBe(true);    // no ha tirado tiros libres
    expect(cell('Ana', 't3').classList.contains('zero')).toBe(false);     // 0/1: ha tirado, aunque no haya anotado

    expect(app.$('th[data-k="number"]').getAttribute('aria-sort')).toBe('ascending');
    await app.click('th[data-k="val"]');
    expect(app.$('th[data-k="val"]').getAttribute('aria-sort')).toBe('descending');
    expect(app.$('th[data-k="number"]').hasAttribute('aria-sort')).toBe(false);
    expect(cell('Bruno', 'val').classList.contains('sorted')).toBe(true);
  });

  it('un partido sin finalizar aparece «En juego» y se puede finalizar desde aquí', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame()] }), hash: '#/stats/g1' });
    expect(app.text('.badge')).toBe('En juego');
    await app.act('finish', { id: 'g1' });
    await app.act('confirm-yes');
    expect(app.db.games[0].finished).toBe(true);
  });

  it('ordena la tabla al tocar una cabecera, y al volver a tocarla invierte el orden', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame()] }), hash: '#/stats/g1' });
    const names = () => app.$$('table.stats tbody .c-name').map((td) => td.textContent);
    expect(names()).toEqual(['Ana', 'Bruno', 'Carla', 'Dani', 'Eva', 'Fran']);

    await app.click('th[data-k="val"]');
    expect(names()[0]).toBe('Bruno');
    await app.click('th[data-k="val"]');
    expect(names().at(-1)).toBe('Bruno');
  });

  it('la temporada se puede ver en promedio por partido', async () => {
    const app = await openApp({ data: twoGames(), hash: '#/stats/temporada' });
    await app.act('avg', { v: '1' });
    const ana = app.$$('table.stats tbody tr').find((tr) => tr.textContent.includes('Ana'));
    const pts = ana.querySelector('td.hl').textContent;
    expect(pts).toBe('3.5');  // 7 puntos en 2 partidos
  });
});

describe('tema claro / oscuro', () => {
  it('se cambia con el botón y se guarda en la clave compartida con el marcador', async () => {
    const app = await openApp({ data: makeData(), hash: '#/equipo' });
    await app.act('theme');
    expect(app.document.documentElement.dataset.theme).toBe('light');
    expect(app.window.localStorage.getItem(THEME_KEY)).toBe('light');
    await app.act('theme');
    expect(app.document.documentElement.dataset.theme).toBe('dark');
  });

  it('se aplica si se cambia en otra pestaña (o en el marcador)', async () => {
    const app = await openApp({ data: makeData(), hash: '#/equipo' });
    app.window.dispatchEvent(new app.window.StorageEvent('storage', { key: THEME_KEY, newValue: 'light' }));
    expect(app.document.documentElement.dataset.theme).toBe('light');
  });
});
