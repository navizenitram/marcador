// Informe de un jugador desde la pantalla de estadísticas (fase 4 de docs/plan-mejoras-bsa.md).
import { describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { makeData, makeTeam, trackedGame } from '../helpers/fixtures.js';

const Q1 = ['p4', 'p7', 'p10', 'p12', 'p15'];
const games = () => [
  trackedGame('g1', [[1, Q1, 4, 2], [2, Q1, 1, 1]], { date: '2026-10-03', opponent: 'Lakers' }),
  trackedGame('g2', [[1, Q1, 2, 0], [2, Q1, 3, 1]], { date: '2026-10-10', opponent: 'Celtics' }),
];
const open = (hash = '#/stats/temporada', team = makeTeam()) => openApp({ data: makeData({ teams: [team], games: games() }), hash });

describe('informe del jugador', () => {
  it('en la temporada, el nombre de cada jugador abre su informe', async () => {
    const app = await open();
    await app.act('report', { pid: 'p4' });
    expect(app.text('.modal h3')).toBe('Informe del jugador');
    const text = app.$('.share-preview').textContent;
    expect(text).toMatch(/^Informe de #4 Ana · Temporada\n/);
    expect(text).toContain('Alevín A · 2 partidos (03/10 – 10/10)');
    expect(text).toContain('Cómo le fue al equipo con Ana en pista');
  });

  it('el email lleva el asunto del informe y el texto', async () => {
    const app = await open('#/stats/temporada', makeTeam({ email: 'familias@club.com' }));
    await app.act('report', { pid: 'p4' });
    const href = app.$('.modal a[href^="mailto:"]').getAttribute('href');
    expect(href).toContain('mailto:familias%40club.com');
    expect(decodeURIComponent(href)).toContain('subject=Informe de #4 Ana · Temporada · Alevín A');
    expect(decodeURIComponent(href)).toContain('Con Ana jugando');
  });

  it('se puede copiar, compartir y descargar en .txt', async () => {
    const app = await open();
    const shared = [];
    app.window.navigator.share = async (d) => { shared.push(d); };
    app.window.navigator.clipboard = { writeText: async (s) => { shared.push({ copied: s }); } };
    await app.act('report', { pid: 'p4' });
    await app.act('native-share');
    await app.act('copy-text');
    await app.act('download-text');
    expect(shared[0].title).toBe('Informe de #4 Ana · Temporada · Alevín A');
    expect(shared[0].text).toContain('Informe de #4 Ana');
    expect(shared[1].copied).toContain('Informe de #4 Ana');
    expect(app.downloads[0].name).toBe('informe-4-Ana-temporada.txt');
    expect(await app.downloads[0].blob.text()).toContain('Informe de #4 Ana');
  });

  it('en una fase, el informe es de esa fase', async () => {
    const app = await open('#/stats/fase-1', makeTeam({ phase: 2 }));
    await app.act('report', { pid: 'p4' });
    expect(app.$('.share-preview').textContent).toMatch(/^Informe de #4 Ana · 1ª fase/);
  });

  it('en un partido no hay informe (es de temporada o fase)', async () => {
    const app = await open('#/stats/g1');
    expect(app.$('[data-action="report"]')).toBeNull();
  });

  it('el informe usa el nombre y el dorsal actuales del equipo', async () => {
    const team = makeTeam();
    team.players[0] = { id: 'p4', number: '14', name: 'Anna' };
    const app = await open('#/stats/temporada', team);
    await app.act('report', { pid: 'p4' });
    expect(app.$('.share-preview').textContent).toMatch(/^Informe de #14 Anna/);
  });

  it('la pista de «toca el nombre» solo sale si hay algún informe', async () => {
    expect((await open()).$('.report-hint')).not.toBeNull();
    const app = await open('#/stats/fase-2', makeTeam({ phase: 2 }));   // sin partidos en la 2ª fase
    expect(app.$('.report-hint')).toBeNull();
  });

  it('un jugador sin partidos no tiene botón de informe', async () => {
    const app = await open();
    expect(app.$('[data-action="report"][data-pid="p21"]')).toBeNull();
    expect(app.$('[data-action="report"][data-pid="p4"]')).not.toBeNull();
  });

  it('si el texto es demasiado largo para un enlace de email, se propone copiarlo', async () => {
    const app = await open();
    await app.act('report', { pid: 'p4' });
    app.ui.modal.mailto = null;   // como si el enlace superase el límite
    app.fn.refreshModal();
    expect(app.$('.modal a[href^="mailto:"]')).toBeNull();
    expect(app.text('.modal')).toContain('demasiado largo');
  });

  it('el botón «Enviar» de siempre sigue funcionando igual', async () => {
    const app = await open();
    await app.act('share', { arg: 'temporada' });
    expect(app.text('.modal h3')).toBe('Enviar estadísticas');
    expect(app.$('[data-action="download-text"]')).toBeNull();
  });
});
