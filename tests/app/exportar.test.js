import { describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { ev, makeData, makeGame, makeTeam, PLAYERS, sampleGame } from '../helpers/fixtures.js';

/** sampleGame (8-4, en juego) + un segundo partido finalizado 4-0 */
const season = (team = makeTeam()) => makeData({
  teams: [team],
  games: [
    sampleGame(),
    makeGame({ id: 'g2', date: '2026-10-10', finished: true, played: { p4: [1], p7: [1] }, events: [ev('t2_ok', 'p4'), ev('t2_ok', 'p4')] }),
  ],
});

// Se leen los bytes: Blob.text() decodifica en UTF-8 y se come el BOM.
const csvOf = async (download) => {
  const bytes = Buffer.from(await download.blob.arrayBuffer());
  const bom = bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]));
  return { bom, lines: bytes.subarray(bom ? 3 : 0).toString('utf8').split('\r\n') };
};

describe('texto para compartir (buildText)', () => {
  it('resume un partido: marcador, parciales, jugadores por valoración y totales', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame()] }), hash: '#/stats/g1' });
    const lines = app.fn.buildText('g1').split('\n');
    expect(lines.slice(0, 3)).toEqual([
      'Alevín A 8 - 4 Rival',
      'Fecha: 03/10/2026',
      'Parciales: P1 6-2 | P2 0-2 | P3 2-0 | P4 0-0 | P5 0-0 | P6 0-0 | P7 0-0 | P8 0-0',
    ]);
    // Solo quien ha jugado, de mayor a menor valoración y, si empatan, por dorsal
    expect(lines.filter((l) => l.startsWith('#'))).toEqual(['#7 Bruno', '#12 Dani', '#4 Ana', '#10 Carla']);
    expect(lines).toContain('   3 pts · T1 0/0 · T2 0/0 · T3 1/1');
    expect(lines).toContain('   Reb 1 (0 of + 1 def) · As 1 · Tap 0 · TapRec 0 · Rec 0 · Pér 0 · FC 0 · FR 0 · VAL 5');
    expect(lines).toContain('EQUIPO: 8 pts · T1 1/2 · T2 2/3 · T3 1/2 · Reb 2 · As 1 · Tap 0 · TapRec 1 · Rec 1 · Pér 1 · FC 1 · FR 0 · VAL 6');
  });

  it('resume la temporada y marca los partidos sin finalizar', async () => {
    const app = await openApp({ data: season(), hash: '#/stats/temporada' });
    const lines = app.fn.buildText('temporada').split('\n');
    expect(lines.slice(0, 3)).toEqual([
      'Alevín A · Estadísticas de temporada (2 partidos)',
      '  10/10/2026 vs Rival: 4-0',
      '  03/10/2026 vs Rival: 8-4 (en juego)',
    ]);
    expect(lines).toContain('#4 Ana (2 PJ)');
  });

  it('usa el singular con un solo partido', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame()] }), hash: '#/stats/temporada' });
    expect(app.fn.buildText('temporada').split('\n')[0]).toBe('Alevín A · Estadísticas de temporada (1 partido)');
  });

  it('«Enviar» prepara el email al correo del equipo con asunto y cuerpo', async () => {
    const app = await openApp({ data: makeData({ teams: [makeTeam({ email: 'entrenador@club.com' })], games: [sampleGame()] }), hash: '#/stats/g1' });
    await app.act('share', { arg: 'g1' });
    expect(app.text(app.$('.share-preview'))).toContain('Alevín A 8 - 4 Rival');
    const mailto = app.$('#modal a.btn.primary').getAttribute('href');
    expect(mailto.startsWith('mailto:entrenador%40club.com?')).toBe(true);
    const params = new URLSearchParams(mailto.split('?')[1]);
    expect(params.get('subject')).toBe('Estadísticas · Alevín A vs Rival · 03/10/2026');
    expect(params.get('body')).toBe(app.fn.buildText('g1'));
  });
});

describe('CSV', () => {
  it('exporta un partido con BOM, separador ; y una fila de totales', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame()] }), hash: '#/stats/g1' });
    await app.act('csv', { arg: 'g1' });
    expect(app.downloads).toHaveLength(1);
    expect(app.downloads[0].name).toBe('estadisticas-2026-10-03-vs-Rival.csv');
    const { bom, lines } = await csvOf(app.downloads[0]);
    expect(bom).toBe(true);  // para que Excel lea bien las tildes
    expect(lines).toEqual([
      'Dorsal;Jugador;Periodos;PTS;T1A;T1I;T2A;T2I;T3A;T3I;RO;RD;RT;AS;TAP;TR;REC;PER;FC;FR;VAL;eFG%;TS%;%PÉR;TL/TC',
      // Ana: 3 tiros de campo → eFG 1/3 = 33 %, TS 3 / (2·3,88) = 39 %, 0 pérdidas, 2 TL / 3 TC = 0,67
      '4;Ana;2;3;1;2;1;2;0;1;0;0;0;0;0;0;1;0;1;0;0;33;39;0;0,67',
      // Con menos de 3 intentos no se calcula
      '7;Bruno;1;3;0;0;0;0;1;1;0;1;1;1;0;0;0;0;0;0;5;;;;',
      '10;Carla;1;2;0;0;1;1;0;0;0;0;0;0;0;1;0;1;0;0;0;;;;',
      '12;Dani;0;0;0;0;0;0;0;0;1;0;1;0;0;0;0;0;0;0;1;;;;',
      '15;Eva;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;;;;',
      '21;Fran;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;;;;',
      // Equipo: 3/5 TC con 1 triple → 70 %; TS 8 / (2·5,88) = 68 %; 1 / 6,88 = 15 %; 2 / 5 = 0,4
      ';Equipo;4;8;1;2;2;3;1;2;1;1;2;1;0;1;1;1;1;0;6;70;68;15;0,4',
    ]);
  });

  it('en la temporada añade PJ y escribe los promedios con coma decimal', async () => {
    const app = await openApp({ data: season(), hash: '#/stats/temporada' });
    await app.act('avg', { v: '1' });
    await app.act('csv', { arg: 'temporada' });
    expect(app.downloads[0].name).toBe(`estadisticas-temporada-${app.fn.todayISO()}.csv`);
    const { lines } = await csvOf(app.downloads[0]);
    expect(lines[0].startsWith('Dorsal;Jugador;PJ;Periodos;PTS;')).toBe(true);
    // Ana: 2 partidos, 3 periodos y 7 puntos → 1,5 periodos y 3,5 puntos por partido
    expect(lines[1].startsWith('4;Ana;2;1,5;3,5;')).toBe(true);
  });

  it('entrecomilla los valores con ; o comillas', async () => {
    const team = makeTeam({ players: [{ id: 'p4', number: '4', name: 'Ana; "Ani"' }] });
    const app = await openApp({ data: makeData({ teams: [team], games: [makeGame({ roster: team.players })] }), hash: '#/stats/g1' });
    await app.act('csv', { arg: 'g1' });
    const { lines } = await csvOf(app.downloads[0]);
    expect(lines[1].startsWith('4;"Ana; ""Ani""";')).toBe(true);
  });

  it('la coma decimal solo se aplica a los números, no a los nombres', async () => {
    const team = makeTeam({ players: [{ id: 'p4', number: '4', name: 'J. Pablo' }] });
    const app = await openApp({ data: makeData({ teams: [team], games: [makeGame({ roster: team.players })] }), hash: '#/stats/g1' });
    await app.act('csv', { arg: 'g1' });
    const { lines } = await csvOf(app.downloads[0]);
    expect(lines[1].startsWith('4;J. Pablo;')).toBe(true);
  });

  it('limpia el nombre del archivo', async () => {
    const app = await openApp({ data: makeData({ games: [sampleGame({ opponent: 'C.B. Sant Josep / B' })] }), hash: '#/stats/g1' });
    await app.act('csv', { arg: 'g1' });
    expect(app.downloads[0].name).toBe('estadisticas-2026-10-03-vs-C_B_Sant_Josep_B.csv');
  });
});

describe('copia de seguridad', () => {
  it('exporta todos los datos en JSON', async () => {
    const data = makeData({ teams: [makeTeam(), makeTeam({ id: 't2', name: 'Infantil', players: PLAYERS.slice(0, 1) })], games: [sampleGame()] });
    const app = await openApp({ data, hash: '#/ajustes' });
    await app.act('export-json');
    expect(app.downloads[0].name).toBe(`minibasket-stats-${app.fn.todayISO()}.json`);
    const { exportedAt, ...exported } = JSON.parse(await app.downloads[0].blob.text());
    expect(exported).toEqual(JSON.parse(JSON.stringify(app.db)));
    expect(exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(exported.teams.map((t) => t.name)).toEqual(['Alevín A', 'Infantil']);
  });
});
