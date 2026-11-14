// Equipo de ejemplo: se ofrece en la pantalla de equipos, se abre como un equipo más y se puede ocultar o eliminar.
import { describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { makeData, makeTeam } from '../helpers/fixtures.js';

/* Equipo de ejemplo en el formato compacto de demo.js. Dos partidos de 4 cuartos:
   - g1 (local): 5-3. Q1: #4 mete de 2 y el rival 3; Q2: entra #21 por #4 y #7 mete un triple.
   - g2 (visitante): 2-4. */
const DEMO = {
  team: {
    id: 'demo-team',
    name: 'Club de Ejemplo',
    players: [['4', 'Ana'], ['7', 'Bruno'], ['10', 'Carla'], ['12', 'Dani'], ['15', 'Eva'], ['21', 'Fran']].map(([number, name]) => ({ id: `demo-p${number}`, number, name })),
  },
  games: [
    {
      id: 'demo-g1', date: '2026-10-03', opponent: 'Rival Uno', venue: 'home', periods: 4,
      plays: [[1, [0, 1, 2, 3, 4]], [1, 't2_ok', 0], [1, 'ast', 1], [1, 3], [2, [5, 1, 2, 3, 4]], [2, 't3_ok', 1], [2, 'rd', 5]],
    },
    {
      id: 'demo-g2', date: '2026-10-10', opponent: 'Rival Dos', venue: 'away', periods: 4,
      plays: [[1, [0, 1, 2, 3, 4]], [1, 't2_ok', 2], [1, 2], [4, 2]],
    },
  ],
};

const card = (app) => app.$('.demo-card');

describe('equipo de ejemplo', () => {
  it('sin demo.js no se ofrece nada', async () => {
    const app = await openApp();
    expect(card(app)).toBeNull();
    expect(app.text()).toContain('Bienvenido/a');
  });

  it('se ofrece en la pantalla de equipos sin guardar nada', async () => {
    const app = await openApp({ demo: DEMO });
    expect(app.text()).toContain('Bienvenido/a');
    expect(app.text(card(app))).toContain('Club de Ejemplo');
    expect(app.text(card(app))).toContain('6 jugadores · 2 partidos · 1V 1D');
    expect(app.text(card(app))).toContain('Equipo de ejemplo');
    expect(app.db.teams).toEqual([]);
    expect(app.stored()).toBeNull();
  });

  it('al tocarlo se añade con su plantilla y sus partidos finalizados, y se abre', async () => {
    const app = await openApp({ demo: DEMO });
    await app.act('demo-open');
    expect(app.hash).toBe('#/partidos');
    expect(app.db.currentTeamId).toBe('demo-team');
    const [t] = app.db.teams;
    expect(t.players.map((p) => `${p.number} ${p.name}`)).toEqual(['4 Ana', '7 Bruno', '10 Carla', '12 Dani', '15 Eva', '21 Fran']);
    expect(t.hidden).toEqual(['reb']);   // perfil completo
    expect(app.db.games.map((g) => [g.opponent, g.finished, g.venue, g.periods])).toEqual([['Rival Uno', true, 'home', 4], ['Rival Dos', true, 'away', 4]]);
    expect(app.fn.score(app.db.games[0])).toMatchObject({ us: 5, them: 3 });
    expect(app.fn.score(app.db.games[1])).toMatchObject({ us: 2, them: 4 });
    expect(app.text()).toContain('Rival Uno');
    // Lo guardado pasa por normalize() sin cambios: el formato es el de la app
    expect(app.fn.normalize(app.stored())).toEqual(app.stored());
  });

  it('los partidos llevan quintetos, periodos jugados y jugadas numeradas', async () => {
    const app = await openApp({ demo: DEMO });
    await app.act('demo-open');
    const g = app.db.games[0];
    expect(g.lineups).toEqual([
      { seq: 1, period: 1, on: ['demo-p4', 'demo-p7', 'demo-p10', 'demo-p12', 'demo-p15'] },
      { seq: 5, period: 2, on: ['demo-p21', 'demo-p7', 'demo-p10', 'demo-p12', 'demo-p15'] },
    ]);
    expect(g.lineupFrom).toBe(1);
    expect(g.seq).toBe(7);
    expect(g.events.map((e) => e.seq)).toEqual([2, 3, 4, 6, 7]);
    expect(g.played).toMatchObject({ 'demo-p4': [1], 'demo-p7': [1, 2], 'demo-p21': [2] });
    expect(g.onCourt).toEqual(['demo-p21', 'demo-p7', 'demo-p10', 'demo-p12', 'demo-p15']);
    expect(app.db.games[1].period).toBe(4);
    // Las estadísticas del partido se abren sin errores, con el +/- de los quintetos
    await app.go('#/stats/demo-g1');
    expect(app.text('.summary')).toContain('Rival Uno');
  });

  it('con equipos propios se ofrece al final de la lista y no cambia el equipo actual', async () => {
    const app = await openApp({ demo: DEMO, data: makeData({ teams: [makeTeam(), makeTeam({ id: 't2', name: 'Infantil' })] }), hash: '#/equipos' });
    expect(app.$$('.teams > li').map((li) => li.classList.contains('demo-card'))).toEqual([false, false, true]);
    expect(app.db.currentTeamId).toBe('t1');
  });

  it('se puede ocultar y recuperar desde Ajustes', async () => {
    const app = await openApp({ demo: DEMO, data: makeData(), hash: '#/equipos' });
    await app.act('demo-hide');
    expect(card(app)).toBeNull();
    expect(app.stored().demoOff).toBe(true);
    expect(app.toast).toContain('Ajustes');
    await app.go('#/ajustes');
    await app.act('demo-open');
    expect(app.db.teams.map((t) => t.id)).toEqual(['t1', 'demo-team']);
    expect(app.stored().demoOff).toBeUndefined();
    await app.go('#/ajustes');
    expect(app.$('[data-action="demo-open"]')).toBeNull();
  });

  it('una vez abierto es un equipo más: no se ofrece otra vez ni se duplica', async () => {
    const app = await openApp({ demo: DEMO });
    await app.act('demo-open');
    await app.go('#/equipos');
    expect(card(app)).toBeNull();
    expect(app.$$('.team-card')).toHaveLength(1);
    expect(app.db.games).toHaveLength(2);
  });

  it('al eliminarlo no vuelve a ofrecerse solo', async () => {
    const app = await openApp({ demo: DEMO });
    await app.act('demo-open');
    await app.go('#/equipos');
    await app.act('del-team', { id: 'demo-team' });
    await app.act('confirm-yes');
    expect(app.db.teams).toEqual([]);
    expect(app.db.games).toEqual([]);
    expect(card(app)).toBeNull();
    expect(app.stored().demoOff).toBe(true);
  });

  it('abrirlo no modifica el original: se puede volver a añadir limpio', async () => {
    const app = await openApp({ demo: DEMO });
    await app.act('demo-open');
    app.db.games[0].events.length = 0;
    app.db.teams[0].players.length = 0;
    expect(app.fn.demoData().games[0].events).toHaveLength(5);
    expect(app.fn.demoData().team.players).toHaveLength(6);
  });

  it('demoOff solo se conserva si es true', async () => {
    const app = await openApp({ demo: DEMO, data: { ...makeData(), demoOff: 'sí' }, hash: '#/equipos' });
    expect(app.db.demoOff).toBeUndefined();
    expect(card(app)).not.toBeNull();
  });
});
