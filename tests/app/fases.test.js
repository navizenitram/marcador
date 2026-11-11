// Fases de la temporada (minibasket: dos fases independientes, cada una en su nivel) y partidos de local o visitante.
import { describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { ev, makeData, makeGame, makeTeam, opp, sampleGame } from '../helpers/fixtures.js';

/** Dos partidos de la 1ª fase (uno de local y otro de visitante) y uno de la 2ª, todos finalizados */
const phased = (team = {}) => makeData({
  teams: [makeTeam({ phase: 2, levels: ['Nivel C', 'Nivel B'], move: 'up', ...team })],
  games: [
    sampleGame({ finished: true, venue: 'home' }),                                                              // 8-4
    makeGame({ id: 'g2', date: '2026-10-10', finished: true, venue: 'away', events: [opp(2)] }),                // 0-2
    makeGame({ id: 'g3', date: '2027-01-20', opponent: 'Celtics', finished: true, phase: 2, venue: 'away',
      played: { p4: [1] }, events: [ev('t2_ok', 'p4'), ev('t2_ok', 'p4')] }),                                // 4-0
  ],
});

const kpisOf = (app) => Object.fromEntries(app.$$('.kpi').map((k) => [app.text(k.querySelector('small')), app.text(k.querySelector('b'))]));

describe('fase y nivel del equipo', () => {
  it('en Equipo se indica la fase actual y el nivel de cada fase', async () => {
    const app = await openApp({ data: makeData(), hash: '#/equipo' });
    expect(app.$$('[data-change="team-level"]').map((i) => i.dataset.phase)).toEqual(['1']);
    expect(app.$('[data-action="team-move"]')).toBeNull();
    await app.change('team-level', ' Nivel C ');
    expect(app.stored().teams[0].levels).toEqual(['Nivel C', '']);
    expect(app.toast).toBe('Nivel de la 1ª fase guardado');

    await app.act('team-phase', { v: 2 });
    expect(app.stored().teams[0].phase).toBe(2);
    expect(app.toast).toBe('Los partidos nuevos se apuntarán en la 2ª fase');
    const level2 = app.$('[data-change="team-level"][data-phase="2"]');
    level2.value = 'Nivel B';
    level2.dispatchEvent(new app.window.Event('change', { bubbles: true }));
    await app.settle();
    expect(app.stored().teams[0].levels).toEqual(['Nivel C', 'Nivel B']);
  });

  it('en la 2ª fase se apunta si se sube, se baja o se sigue en el mismo nivel', async () => {
    const app = await openApp({ data: makeData({ teams: [makeTeam({ phase: 2 })] }), hash: '#/equipo' });
    await app.act('team-move', { v: 'up' });
    expect(app.stored().teams[0].move).toBe('up');
    expect(app.$('[data-action="team-move"][data-v="up"]').getAttribute('aria-pressed')).toBe('true');
    await app.act('team-move', { v: 'down' });
    expect(app.stored().teams[0].move).toBe('down');
    // Tocar otra vez la opción elegida la quita
    await app.act('team-move', { v: 'down' });
    expect(app.stored().teams[0].move).toBe('');
  });

  it('la tarjeta del equipo muestra la fase y el nivel', async () => {
    const app = await openApp({ data: phased(), hash: '#/equipos' });
    expect(app.text('.team-phase')).toBe('2ª fase · Nivel B');
  });

  it('un equipo nuevo empieza en la 1ª fase', async () => {
    const app = await openApp({ data: makeData(), hash: '#/equipos' });
    await app.submit('team-new', { name: 'Benjamín' });
    expect(app.db.teams[1]).toMatchObject({ name: 'Benjamín', phase: 1, levels: ['', ''], move: '' });
  });
});

describe('partidos por fase y de local o visitante', () => {
  it('el partido nuevo se apunta en la fase actual, de local o de visitante', async () => {
    const app = await openApp({ data: makeData({ teams: [makeTeam({ phase: 2, levels: ['', 'Nivel B'] })] }), hash: '#/partidos' });
    expect(app.$('input[name=venue]:checked').value).toBe('home');
    expect(app.text('.phase-line')).toBe('Se apunta en la 2ª fase · Nivel B · Cambiar');
    await app.submit('game', { opponent: 'Lakers', venue: 'away' });
    expect(app.db.games[0]).toMatchObject({ opponent: 'Lakers', phase: 2, venue: 'away' });
  });

  it('la lista de partidos se agrupa por fase, con su nivel y su balance', async () => {
    const app = await openApp({ data: phased(), hash: '#/partidos' });
    expect(app.$$('.phase-head').map((h) => [...h.children].map((el) => el.textContent))).toEqual([
      ['2ª fase · Nivel B · sube de nivel', '1V 0D'],
      ['1ª fase · Nivel C', '1V 1D'],
    ]);
    const items = app.$$('.games li').map((li) => app.text(li.querySelector('.g-main small')));
    expect(items).toEqual(['Finalizado · Visitante · 8 periodos', 'Finalizado · Visitante · 8 periodos', 'Finalizado · Local · 8 periodos']);
  });

  it('sin 2ª fase la lista no se agrupa y el equipo no muestra fase', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame()] }), hash: '#/partidos' });
    expect(app.$$('.phase-head')).toHaveLength(0);
    expect(app.text('.games li .g-main small')).toBe('En juego · P1 · 8 periodos');
    await app.go('#/equipos');
    expect(app.$('.team-phase')).toBeNull();
  });

  it('se puede editar el rival, la fecha, el campo y la fase de un partido', async () => {
    const app = await openApp({ data: phased(), hash: '#/partidos' });
    await app.act('edit-game', { id: 'g2' });
    expect(app.$('.modal input[name=venue]:checked').value).toBe('away');
    expect(app.$('.modal input[name=phase]:checked').value).toBe('1');
    await app.submit('game-edit', { opponent: 'Bulls', date: '2026-10-11', venue: 'home', phase: 2 });
    expect(app.modal).toBeNull();
    expect(app.toast).toBe('Partido actualizado');
    expect(app.stored().games.find((g) => g.id === 'g2')).toMatchObject({ opponent: 'Bulls', date: '2026-10-11', venue: 'home', phase: 2 });
  });

  it('cancelar la edición no cambia nada', async () => {
    const app = await openApp({ data: phased(), hash: '#/partidos' });
    const before = JSON.stringify(app.stored());
    await app.act('edit-game', { id: 'g2' });
    await app.act('modal-close');
    expect(app.modal).toBeNull();
    expect(JSON.stringify(app.stored())).toBe(before);
  });

  it('un partido con una fecha antigua (no aaaa-mm-dd) se puede editar sin tocar la fecha', async () => {
    const app = await openApp({ data: makeData({ games: [makeGame({ date: '12/05/2025' })] }), hash: '#/partidos' });
    await app.act('edit-game', { id: 'g1' });
    const date = app.$('.modal input[name=date]');
    expect(date.required).toBe(false);
    await app.submit('game-edit', { date: '', venue: 'away' });
    expect(app.stored().games[0]).toMatchObject({ date: '12/05/2025', venue: 'away' });
  });

  it('la fase de un partido solo se muestra según su propio equipo', async () => {
    const app = await openApp({ data: phased() });
    // El equipo actual está en la 2ª fase, pero este partido no es suyo (su equipo no existe): no se le atribuye fase
    expect(app.fn.gameMeta({ ...app.db.games[0], teamId: 'otro', venue: 'home', phase: 2 })).toBe('Local');
    expect(app.fn.gameMeta({ ...app.db.games[0], venue: 'home', phase: 2 })).toBe('Local · 2ª fase');
  });

  it('el menú del partido muestra el campo y la fase y permite editarlo', async () => {
    const app = await openApp({ data: phased(), hash: '#/partido/g3' });
    await app.act('menu');
    expect(app.text('.modal-head h3')).toBe('vs Celtics · 20/01/2027 · Visitante · 2ª fase');
    await app.act('edit-game', { id: 'g3' });
    expect(app.text('.modal-head h3')).toBe('Editar partido');
  });
});

describe('estadísticas por fase', () => {
  it('el selector ofrece la temporada, cada fase y los partidos agrupados por fase', async () => {
    const app = await openApp({ data: phased(), hash: '#/stats/g1' });
    expect(app.$$('.stats-select > option').map((o) => o.textContent)).toEqual(['Temporada · 3 partidos', '1ª fase · 2 partidos', '2ª fase · 1 partido']);
    expect(app.$$('.stats-select optgroup').map((o) => o.label)).toEqual(['2ª fase', '1ª fase']);
    expect(app.text('.ft-mid .g-meta')).toBe('Local · 1ª fase');
  });

  it('una fase cuando el equipo no usa fases muestra la temporada', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame()] }), hash: '#/stats/fase-1' });
    expect(app.hash).toBe('#/stats/temporada');
    expect(app.text('.stats-select option:checked')).toBe('Temporada · 1 partido');
  });

  it('sin 2ª fase el selector es como siempre', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame({ venue: 'home' })] }), hash: '#/stats/g1' });
    expect(app.$$('.stats-select option').map((o) => o.value)).toEqual(['temporada', 'g1']);
    expect(app.text('.ft-mid .g-meta')).toBe('Local');
  });

  it('cada fase cuenta solo sus partidos', async () => {
    const app = await openApp({ data: phased(), hash: '#/stats/g1' });
    await app.change('stats-select', 'fase-2');
    expect(app.hash).toBe('#/stats/fase-2');
    expect(app.text('.stats-select option:checked')).toBe('2ª fase · 1 partido');
    expect(app.text('.phase-info')).toBe('Nivel B · sube de nivel');
    expect(kpisOf(app)).toMatchObject({ Partidos: '1', Victorias: '1', Derrotas: '0', 'Visitante (V–D)': '1–0' });
    expect(app.$$('.trend .tcol')).toHaveLength(1);
    expect(app.fn.statsData('fase-2').rows.find((r) => r.id === 'p4')).toMatchObject({ gp: 1, pts: 4 });

    await app.change('stats-select', 'fase-1');
    expect(kpisOf(app)).toMatchObject({ Partidos: '2', Victorias: '1', Derrotas: '1', 'Local (V–D)': '1–0', 'Visitante (V–D)': '0–1' });
    expect(app.fn.statsData('fase-1').rows.find((r) => r.id === 'p4')).toMatchObject({ gp: 1, pts: 3 });
  });

  it('la temporada completa suma las dos fases y muestra el balance de local y de visitante', async () => {
    const app = await openApp({ data: phased(), hash: '#/stats/temporada' });
    expect(kpisOf(app)).toMatchObject({ Partidos: '3', Victorias: '2', Derrotas: '1', 'Local (V–D)': '1–0', 'Visitante (V–D)': '1–1' });
    expect(app.fn.statsData('temporada').rows.find((r) => r.id === 'p4')).toMatchObject({ gp: 2, pts: 7 });
  });
});

describe('exportar por fase', () => {
  it('el texto de una fase solo lleva sus partidos, con el campo', async () => {
    const app = await openApp({ data: phased({ move: 'down' }), hash: '#/stats/fase-2' });
    const lines = app.fn.buildText('fase-2').split('\n');
    expect(lines.slice(0, 2)).toEqual([
      'Alevín A · Estadísticas de la 2ª fase · Nivel B · baja de nivel (1 partido)',
      '  20/01/2027 vs Celtics (visitante): 4-0',
    ]);
    expect(lines.filter((l) => l.startsWith('#'))).toEqual(['#4 Ana (1 PJ)']);
  });

  it('el texto de un partido indica el campo y la fase', async () => {
    const app = await openApp({ data: phased(), hash: '#/stats/g1' });
    expect(app.fn.buildText('g1').split('\n')[1]).toBe('Fecha: 03/10/2026 · Local · 1ª fase');
    expect(app.fn.statsTitle('fase-1')).toBe('Alevín A · 1ª fase');
  });

  it('el CSV de una fase lleva la fase en el nombre', async () => {
    const app = await openApp({ data: phased(), hash: '#/stats/fase-1' });
    await app.act('csv', { arg: 'fase-1' });
    expect(app.downloads[0].name).toBe(`estadisticas-fase-1-${app.fn.todayISO()}.csv`);
  });
});
