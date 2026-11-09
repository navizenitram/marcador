import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { makeGame } from '../helpers/fixtures.js';

let app;
beforeAll(async () => { app = await openApp(); });
afterAll(() => app.close());

describe('esc', () => {
  it('escapa los caracteres especiales de HTML', () => {
    expect(app.fn.esc(`<img src=x onerror="alert('x')">&`)).toBe('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;');
  });

  it('convierte null y undefined en cadena vacía y los números en texto', () => {
    expect(app.fn.esc(null)).toBe('');
    expect(app.fn.esc(undefined)).toBe('');
    expect(app.fn.esc(7)).toBe('7');
  });
});

describe('fechas', () => {
  it('fmtDate pasa de ISO a dd/mm/aaaa, o dd/mm en formato corto', () => {
    expect(app.fn.fmtDate('2026-11-08')).toBe('08/11/2026');
    expect(app.fn.fmtDate('2026-11-08', true)).toBe('08/11');
    expect(app.fn.fmtDate('')).toBe('');
  });

  it('todayISO devuelve la fecha local en formato aaaa-mm-dd', () => {
    const d = new app.window.Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(app.fn.todayISO()).toBe(expected);
  });
});

describe('números', () => {
  it('pct redondea el porcentaje y muestra – sin intentos', () => {
    expect(app.fn.pct(1, 3)).toBe('33%');
    expect(app.fn.pct(2, 3)).toBe('67%');
    expect(app.fn.pct(0, 4)).toBe('0%');
    expect(app.fn.pct(0, 0)).toBe('–');
  });

  it('round1 redondea a un decimal', () => {
    expect(app.fn.round1(10 / 3)).toBe(3.3);
    expect(app.fn.round1(2 / 3)).toBe(0.7);
    expect(app.fn.round1(4)).toBe(4);
  });
});

describe('orden de jugadores por dorsal', () => {
  it('ordena numéricamente, con los dorsales no numéricos al final y por nombre en caso de empate', () => {
    const list = [
      { number: '10', name: 'Diez' }, { number: 'A', name: 'Zeta' }, { number: '4', name: 'Cuatro' },
      { number: '00', name: 'Doble cero' }, { number: 'A', name: 'Alba' }, { number: '0', name: 'Cero' }, { number: '7', name: 'Siete' },
    ];
    expect(app.fn.sortedPlayers(list).map((p) => p.name)).toEqual(['Cero', 'Doble cero', 'Cuatro', 'Siete', 'Diez', 'Alba', 'Zeta']);
  });

  it('no modifica la lista original', () => {
    const list = [{ number: '9', name: 'B' }, { number: '1', name: 'A' }];
    app.fn.sortedPlayers(list);
    expect(list[0].number).toBe('9');
  });
});

describe('periodos', () => {
  it('los partidos a 4 cuartos usan Q y «Cuarto»', () => {
    const g = makeGame({ periods: 4 });
    expect(app.fn.perAbbr(g, 2)).toBe('Q2');
    expect(app.fn.perName(g)).toBe('Cuarto');
    expect(app.fn.perCount(g)).toBe('4 cuartos');
  });

  it('el resto usa P y «Periodo»', () => {
    const g = makeGame({ periods: 8 });
    expect(app.fn.perAbbr(g, 2)).toBe('P2');
    expect(app.fn.perName(g)).toBe('Periodo');
    expect(app.fn.perCount(g)).toBe('8 periodos');
    expect(app.fn.perCount(makeGame({ periods: 6 }))).toBe('6 periodos');
  });
});

describe('varios', () => {
  it('pLabel muestra dorsal y nombre, o ¿? si no hay jugador', () => {
    expect(app.fn.pLabel({ number: '7', name: 'Bruno' })).toBe('#7 Bruno');
    expect(app.fn.pLabel(undefined)).toBe('¿?');
  });

  it('uid genera identificadores distintos', () => {
    const ids = new Set(Array.from({ length: 200 }, () => app.fn.uid()));
    expect(ids.size).toBe(200);
  });

  it('parseRoute separa la vista y el argumento del hash', () => {
    // replaceState cambia el hash sin navegar (sin datos, la app redirigiría a #/equipos)
    const route = (hash) => { app.window.history.replaceState(null, '', hash); return app.fn.parseRoute(); };
    expect(route('#/stats/abc123')).toEqual({ view: 'stats', arg: 'abc123' });
    expect(route('#/equipos')).toEqual({ view: 'equipos', arg: '' });
    expect(route('#stats')).toEqual({ view: 'stats', arg: '' });
    expect(route('#')).toEqual({ view: '', arg: '' });
  });
});
