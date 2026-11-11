// Datos de ejemplo con el formato que guarda la app (versión 3 de mbstats.v1).

export const PLAYERS = [
  { id: 'p4', number: '4', name: 'Ana' },
  { id: 'p7', number: '7', name: 'Bruno' },
  { id: 'p10', number: '10', name: 'Carla' },
  { id: 'p12', number: '12', name: 'Dani' },
  { id: 'p15', number: '15', name: 'Eva' },
  { id: 'p21', number: '21', name: 'Fran' },
];

const copy = (list) => list.map((p) => ({ ...p }));

export function makeTeam(overrides = {}) {
  return { id: 't1', name: 'Alevín A', email: '', players: copy(PLAYERS), hidden: [], phase: 1, levels: ['', ''], move: '', ...overrides };
}

/** Partido. Sin `lineupFrom` es un partido sin registro de quintetos (como los anteriores a la versión 3). */
export function makeGame(overrides = {}) {
  const g = {
    id: 'g1',
    createdAt: 1,
    date: '2026-10-03',
    opponent: 'Rival',
    teamId: 't1',
    teamName: 'Alevín A',
    periods: 8,
    period: 1,
    roster: copy(PLAYERS),
    onCourt: [],
    played: {},
    events: [],
    finished: false,
    phase: 1,
    venue: '',
    lineups: [],
    ...overrides,
  };
  // Contador del partido: como lo deja la app, el mayor seq de sus jugadas y quintetos
  if (g.seq === undefined) g.seq = Math.max(0, ...g.events.map((e) => e.seq || 0), ...g.lineups.map((l) => l.seq || 0));
  return g;
}

let seq = 0;
/** Acción de un jugador. Cada evento lleva un ts y un seq crecientes, como en la app. */
export function ev(type, pid, period = 1) {
  seq++;
  return { id: `e${seq}`, seq, ts: 1_000_000 + seq, period, type, pid };
}
/** Puntos del rival */
export function opp(pts, period = 1) {
  seq++;
  return { id: `e${seq}`, seq, ts: 1_000_000 + seq, period, type: 'opp', pts };
}

export function makeData({ teams = [makeTeam()], games = [], currentTeamId } = {}) {
  return { version: 3, teams, games, currentTeamId: currentTeamId ?? (teams[0] ? teams[0].id : null) };
}

/*
 * Partido de referencia para los tests de estadísticas. Resultado: 8-4.
 *
 *            P1                         P2                      P3
 *  #4 Ana    2✓ 2✗ 1✓ 1✗                3✗ REC FC               –
 *  #7 Bruno  3✓ RD AS                   –                       –
 *  #10 Carla –                          –                       2✓ PÉR TR
 *  #12 Dani  –                          –                       RO   (sin periodos registrados)
 *  Rival     +2                         +3 −1                   –
 */
export function sampleGame(overrides = {}) {
  return makeGame({
    played: { p4: [2, 1], p7: [1], p10: [3] },
    events: [
      ev('t2_ok', 'p4', 1), ev('t2_ko', 'p4', 1), ev('t1_ok', 'p4', 1), ev('t1_ko', 'p4', 1),
      opp(2, 1),
      ev('t3_ok', 'p7', 1), ev('rd', 'p7', 1), ev('ast', 'p7', 1),
      ev('t3_ko', 'p4', 2), ev('rec', 'p4', 2), opp(3, 2), opp(-1, 2), ev('fc', 'p4', 2),
      ev('t2_ok', 'p10', 3), ev('lost', 'p10', 3), ev('blkr', 'p10', 3),
      ev('ro', 'p12', 3),
    ],
    ...overrides,
  });
}
