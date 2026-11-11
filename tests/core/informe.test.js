// Informe de un jugador en texto (core.js), fase 4 de docs/plan-mejoras-bsa.md.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { loadCore, plain } from '../helpers/core.js';
import { ev, makeGame, opp, trackedGame } from '../helpers/fixtures.js';

const core = loadCore();
const ALL = { t1: true, t3: true, lost: true };

// Textos reales (i18n/es.js) con su t() y formato de números, sin DOM
const DIR = fileURLToPath(new URL('../../public/minibasket-stats/', import.meta.url));
const i18nCtx = vm.createContext({ console: { warn() {} } });
for (const f of ['i18n/es.js', 'i18n.js']) vm.runInContext(readFileSync(DIR + f, 'utf8'), i18nCtx);
const { t, fmtNum, fmtPct } = i18nCtx.MBI18n;
const ctx = { t, fmtNum, fmtPct, fmtDate: (iso) => iso.split('-').reverse().slice(0, 2).join('/'), scope: 'Temporada', team: 'Alevín A', site: 'myownbasketballstats.com' };

const Q1 = ['p4', 'p7', 'p10', 'p12', 'p15'];
const Q2 = ['p7', 'p10', 'p12', 'p15', 'p21'];

/* Ana (#4): g1 (1ª fase) 4 puntos de tiro libre en P1 (+2) · g2 (2ª fase) 5 puntos en P1-P2 (+4) · el equipo +1 y +4 */
const season = () => [
  trackedGame('g1', [[1, Q1, 4, 2], [2, Q2, 2, 3]], { date: '2026-10-03', phase: 1, opponent: 'Lakers' }),
  trackedGame('g2', [[1, Q1, 2, 0], [2, Q1, 3, 1]], { date: '2026-11-08', phase: 2, opponent: 'Celtics' }),
];

describe('reportModel', () => {
  it('resume la temporada del jugador', () => {
    const m = plain(core.reportModel(season(), 'p4', ALL));
    expect(m).toMatchObject({ number: '4', name: 'Ana', games: 2, periods: 3, first: '2026-10-03', last: '2026-11-08' });
    expect(m.line).toMatchObject({ pts: 9, t1m: 9, t1a: 9 });
    expect(m.per.pts).toBe(4.5);
    expect(m.evolution).toEqual([
      { date: '2026-10-03', opponent: 'Lakers', pts: 4, val: 4 },
      { date: '2026-11-08', opponent: 'Celtics', pts: 5, val: 5 },
    ]);
    expect(m.phases).toEqual([{ phase: 1, games: 1, pts: 4 }, { phase: 2, games: 1, pts: 5 }]);
  });

  it('+/- del jugador y del equipo en los partidos con registro', () => {
    const m = plain(core.reportModel(season(), 'p4', ALL));
    expect(m.pm).toEqual({ pf: 9, pc: 3, pm: 6, periods: 3, games: 2 });
    expect(m.teamPm).toBe(5);
  });

  it('el +/- del equipo es el de los mismos partidos que el del jugador', () => {
    const g3 = trackedGame('g3', [[1, Q2, 0, 5]], { date: '2026-11-20' });   // Ana no juega: el equipo −5 no cuenta
    expect(core.reportModel([...season(), g3], 'p4', ALL).teamPm).toBe(5);
  });

  it('nombre y dorsal actuales del equipo si se pasan (pueden haber cambiado tras el último partido)', () => {
    const m = plain(core.reportModel(season(), 'p4', ALL, { number: '14', name: 'Anna' }));
    expect([m.number, m.name]).toEqual(['14', 'Anna']);
  });

  it('sin partidos con registro, sin +/-', () => {
    const old = makeGame({ played: { p4: [1] }, events: [ev('t2_ok', 'p4'), opp(2)] });
    const m = plain(core.reportModel([old], 'p4', ALL));
    expect(m.pm).toBeNull();
    expect(m.teamPm).toBeNull();
  });

  it('con una sola fase no hay comparación de fases', () => {
    expect(plain(core.reportModel(season().slice(0, 1), 'p4', ALL)).phases).toEqual([]);
  });

  it('un jugador que no ha jugado no tiene informe', () => {
    expect(core.reportModel(season(), 'p30', ALL)).toBeNull();
  });

  it('los partidos se ordenan por fecha', () => {
    const m = plain(core.reportModel([...season()].reverse(), 'p4', ALL));
    expect(m.evolution.map((e) => e.date)).toEqual(['2026-10-03', '2026-11-08']);
  });
});

describe('reportText', () => {
  const text = (games = season(), pid = 'p4') => core.reportText(core.reportModel(games, pid, ALL), ctx);

  it('cabecera, resumen, tiro, evolución, fases y pie con el dominio', () => {
    const s = text();
    expect(s).toContain('Informe de #4 Ana · Temporada');
    expect(s).toContain('Alevín A · 2 partidos (03/10 – 08/11)');
    expect(s).toContain('Puntos: 9 (4,5 por partido)');
    expect(s).toContain('Tiros libres: 9/9 (100 %)');
    expect(s).toContain('03/10 vs Lakers: 4 · 4');
    expect(s).toMatch(/1ª fase: 4 pts por partido · 2ª fase: 5 pts por partido/);
    expect(s.trim().split('\n').at(-1)).toBe('myownbasketballstats.com');
    expect(s).not.toMatch(/NaN|undefined|null|\{\w+\}/);
  });

  it('con menos de 4 periodos con datos, el +/- no se da', () => {
    const s = text();
    expect(s).toContain('Todavía hay pocos datos');
    expect(s).not.toContain('+6');
  });

  it('con datos suficientes, el +/- con el dato del equipo y la explicación completa', () => {
    const g3 = trackedGame('g3', [[1, Q1, 3, 1], [2, Q1, 1, 1]], { date: '2026-11-15', phase: 2, opponent: 'Bulls' });
    const s = text([...season(), g3]);
    expect(s).toContain('Con Ana jugando, el equipo metió 13 puntos y recibió 5: +8');
    expect(s).toContain('el equipo va +7');
    expect(s).toContain('No sirve para comparar a dos jugadores');
    expect(s).toContain('Ana');
  });

  it('sin partidos con registro, no hay apartado de +/-', () => {
    const old = makeGame({ played: { p4: [1] }, events: [ev('t2_ok', 'p4')] });
    expect(text([old])).not.toContain('+/-');
  });

  it('avanzadas con su nombre para familias y aviso de pocos tiros', () => {
    const s = text();
    expect(s).toContain('Acierto real en el tiro (TS%)');
    expect(s).toContain('*');
    expect(s).toContain('pocos tiros');
  });

  it('+/- negativo; los partidos en los que no jugó no cuentan', () => {
    const g3 = trackedGame('g3', [[1, Q2, 0, 5]], { date: '2026-11-20', opponent: 'Heat' });                // Ana no juega
    const g4 = trackedGame('g4', [[1, Q1, 1, 9], [2, Q1, 1, 4]], { date: '2026-11-27', opponent: 'Spurs' });
    const m = core.reportModel([...season(), g3, g4], 'p4', ALL);
    expect(m.games).toBe(3);
    const s = core.reportText(m, ctx);
    expect(s).toContain('recibió 16: −5');
    expect(s).not.toContain('Heat');
  });

  it('sin triples ni tiros libres apuntados: acierto en tiros de campo y sin TS% ni TL/TC; sin asterisco si hay tiros', () => {
    const shots = [...Array(10)].flatMap(() => [ev('t2_ok', 'p4'), ev('t2_ko', 'p4')]);
    const g = makeGame({ played: { p4: [1] }, events: [...shots, ev('lost', 'p4')] });
    const s = core.reportText(core.reportModel([g], 'p4', { t1: false, t3: false, lost: true }), ctx);
    expect(s).toContain('Acierto en tiros de campo (TC%): 50 %.');
    expect(s).not.toContain('TS%');
    expect(s).not.toContain('TL/TC');
    expect(s).not.toContain('pocos tiros');
  });

  it('si el mismo mes se repite en años distintos, lleva el año', () => {
    const dates = ['2026-09-05', '2026-09-12', '2026-10-03', '2026-11-07', '2027-01-09', '2027-03-06', '2027-05-08', '2027-09-04', '2027-09-11'];
    const games = dates.map((date, i) => trackedGame(`y${i}`, [[1, Q1, 1, 0]], { date }));
    const s = core.reportText(core.reportModel(games, 'p4', ALL), ctx);
    expect(s).toMatch(/^sept 2026: 2 partidos/m);
    expect(s).toMatch(/^sept 2027: 2 partidos/m);
    expect(s).toMatch(/^oct: 1 partido/m);
  });

  it('el mínimo de periodos del +/- sale de la constante, no del texto', () => {
    expect(text()).toContain(`al menos ${core.PM_MIN_PERIODS} periodos`);
  });

  it('un partido sin fecha no rompe el resumen por meses', () => {
    const games = Array.from({ length: 9 }, (_, i) => trackedGame(`d${i}`, [[1, Q1, 1, 0]], { date: i ? `2026-10-${String(i + 10)}` : '', createdAt: i }));
    const s = core.reportText(core.reportModel(games, 'p4', ALL), ctx);
    expect(s).toMatch(/^–: 1 partido/m);
    expect(s).not.toMatch(/NaN|undefined/);
  });

  it('con muchos partidos, la evolución se resume por mes y el informe sigue siendo corto', () => {
    const games = Array.from({ length: 24 }, (_, i) => {
      const month = 10 + Math.floor(i / 8);
      const day = String((i % 8) * 3 + 1).padStart(2, '0');
      return trackedGame(`m${i}`, [[1, Q1, 2 + (i % 3), 1], [2, Q1, 1, 2]], { date: `2026-${month}-${day}`, opponent: `Rival ${i}` });
    });
    const s = text(games);
    expect(s).not.toContain('Rival 0');
    expect(s).toMatch(/oct.*8 partidos/);
    expect(s.length).toBeLessThan(2000);
  });
});
