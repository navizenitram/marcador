// Tiempo de juego (core.js, formato v4): duración de los periodos y segundos jugados a partir de g.shifts.
import { describe, expect, it } from 'vitest';
import { loadCore, plain } from '../helpers/core.js';
import { makeGame } from '../helpers/fixtures.js';

const core = loadCore();
const A = ['p4', 'p7', 'p10', 'p12', 'p15'];
const B = ['p4', 'p7', 'p10', 'p12', 'p21'];
const secs = (g) => plain(core.secondsPlayed(g));

describe('periodSecs', () => {
  it('6 minutos con 8 periodos y 10 con 4; con otro número, sin duración', () => {
    expect(core.periodSecs({ periods: 8 })).toBe(360);
    expect(core.periodSecs({ periods: 4 })).toBe(600);
    expect(core.periodSecs({ periods: 6 })).toBeNull();
  });
});

describe('secondsPlayed', () => {
  it('es null si el partido no registra el tiempo', () => {
    expect(core.secondsPlayed(makeGame())).toBeNull();
    expect(core.secondsPlayed(makeGame({ shifts: [] }))).toBeNull();
    // No empieza con la entrada t = 0: no se sabe quién estaba antes
    expect(core.secondsPlayed(makeGame({ shifts: [{ period: 1, t: 100, on: A }] }))).toBeNull();
    // Sin duración (6 periodos)
    expect(core.secondsPlayed(makeGame({ periods: 6, shifts: [{ period: 1, t: 0, on: A }] }))).toBeNull();
  });

  it('suma los tramos de cada jugador, con el periodo siguiente entero', () => {
    const g = makeGame({
      period: 2, finished: true,
      shifts: [
        { period: 1, t: 0, on: A },
        { period: 1, t: 120, on: B },   // p15 sale y entra p21 a los 2:00 transcurridos
        { period: 2, t: 0, on: B },
      ],
    });
    expect(secs(g)).toEqual({ p4: 120 + 240 + 360, p7: 720, p10: 720, p12: 720, p15: 120, p21: 240 + 360 });
  });

  it('con varios cambios seguidos sin jugadas entre medias cuenta cada uno', () => {
    const C = ['p4', 'p7', 'p10', 'p15', 'p21'];
    const g = makeGame({
      period: 1, finished: true,
      shifts: [
        { period: 1, t: 0, on: A },
        { period: 1, t: 60, on: B },
        { period: 1, t: 150, on: C },
      ],
    });
    expect(secs(g)).toMatchObject({ p15: 60 + 210, p21: 90 + 210, p12: 150, p4: 360 });
  });

  it('con 4 cuartos cada uno dura 10 minutos', () => {
    const g = makeGame({ periods: 4, finished: true, shifts: [{ period: 1, t: 0, on: A }] });
    expect(secs(g).p4).toBe(600);
  });

  it('en un partido en curso, el periodo actual solo cuenta hasta el último cambio', () => {
    const g = makeGame({
      period: 2, finished: false,
      shifts: [{ period: 1, t: 0, on: A }, { period: 1, t: 120, on: B }, { period: 2, t: 0, on: B }],
    });
    expect(secs(g)).toMatchObject({ p4: 360, p15: 120, p21: 240 });

    const later = { ...g, shifts: [...g.shifts, { period: 2, t: 90, on: A }] };
    expect(secs(later)).toMatchObject({ p4: 360 + 90, p15: 120 + 0, p21: 240 + 90 });
  });

  it('un periodo sin entrada propia sigue con la pista del anterior', () => {
    const g = makeGame({ period: 2, finished: true, shifts: [{ period: 1, t: 0, on: A }] });
    expect(secs(g).p4).toBe(720);
  });

  it('nunca pasa de la duración del periodo ni retrocede', () => {
    const g = makeGame({ period: 1, finished: true, shifts: [{ period: 1, t: 0, on: A }, { period: 1, t: 9999, on: B }, { period: 1, t: 50, on: A }] });
    expect(secs(g).p4).toBe(360);
    expect(secs(g).p21 || 0).toBe(0);
  });
});
