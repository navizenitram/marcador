import { describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { makeData, makeTeam, PLAYERS, sampleGame } from '../helpers/fixtures.js';

// Mudanza de marcador-kohl.vercel.app a myownbasketballstats.com: en la dirección antigua la app ofrece
// llevar los datos a la nueva en el fragmento de la URL (#traspaso=…), y la nueva los recoge al abrirse.

const OLD = 'https://marcador-kohl.vercel.app';
const NEW = 'https://myownbasketballstats.com';
const NEW_APP = `${NEW}/minibasket-stats/`;

/** App en la dirección antigua, ya compilada con SITE_URL = dominio nuevo. Guarda en `left` adónde intenta ir. */
async function openOld(opts = {}) {
  const app = await openApp({ origin: OLD, siteUrl: NEW, ...opts });
  app.left = [];
  app.fn.leaveTo = (url) => app.left.push(url);
  return app;
}

/** Espera a que se cumpla la condición (la descompresión tarda algunos ciclos) */
async function until(app, cond) {
  for (let i = 0; i < 50 && !cond(); i++) await app.settle();
  expect(cond()).toBe(true);
}

/** Datos con dos equipos, un partido y nombres con acentos y emojis */
const richData = () => makeData({
  teams: [makeTeam({ name: 'Alevín Ñ 🏀', players: [...PLAYERS, { id: 'p99', number: '0', name: 'Íñigo «el Rápido»' }] }), makeTeam({ id: 't2', name: 'Benjamín' })],
  games: [sampleGame()],
});

describe('aviso de mudanza', () => {
  it('aparece en la dirección antigua y ofrece llevar los datos', async () => {
    const app = await openOld({ data: makeData() });
    expect(app.text('.move-bar')).toContain('La app se ha mudado a myownbasketballstats.com');
    expect(app.text('.move-bar [data-action="move"]')).toBe('Llevar mis datos');
  });

  it('sin datos solo ofrece ir a la nueva dirección', async () => {
    const app = await openOld();
    expect(app.text('.move-bar [data-action="move"]')).toBe('Ir a la nueva dirección');
  });

  it('no aparece en la dirección nueva ni en otras', async () => {
    for (const origin of [NEW, 'https://app.test', 'http://localhost:4321']) {
      const app = await openApp({ origin, siteUrl: NEW, data: makeData() });
      expect(app.$('.move-bar')).toBeNull();
      app.close();
    }
  });

  it('no aparece si la canonical sigue apuntando a la dirección antigua', async () => {
    const app = await openOld({ siteUrl: OLD, data: makeData() });
    expect(app.$('.move-bar')).toBeNull();
  });

  it('avisa de que los datos siguen aquí después de llevarlos', async () => {
    const app = await openOld({ data: makeData(), storage: { 'mbstats.moved': '2026-11-11T10:00:00.000Z' } });
    expect(app.text('.move-bar')).toContain('Tus datos siguen también aquí');
  });
});

describe('llevar los datos', () => {
  it('pide confirmación y abre la app nueva con los datos en el fragmento', async () => {
    const app = await openOld({ data: richData() });
    await app.act('move');
    expect(app.text(app.modal)).toContain('con tus 2 equipos y 1 partido.');
    expect(app.text(app.modal)).toContain('Aquí no se borra nada');
    await app.act('confirm-yes');
    await until(app, () => app.left.length === 1);
    expect(app.left[0]).toMatch(/^https:\/\/myownbasketballstats\.com\/minibasket-stats\/#traspaso=j[\w-]+$/);
    expect(app.window.localStorage.getItem('mbstats.moved')).toBeTruthy();
    expect(app.stored().teams).toHaveLength(2);
  });

  it('con un solo equipo y sin partidos habla de «tu equipo»', async () => {
    const app = await openOld({ data: makeData() });
    await app.act('move');
    expect(app.text(app.modal)).toContain('con tu equipo.');
  });

  it('no sale si se cancela', async () => {
    const app = await openOld({ data: makeData() });
    await app.act('move');
    await app.act('confirm-no');
    await app.settle();
    expect(app.left).toEqual([]);
    expect(app.window.localStorage.getItem('mbstats.moved')).toBeNull();
  });

  it('sin datos abre la app nueva sin fragmento', async () => {
    const app = await openOld();
    await app.act('move');
    await app.act('confirm-yes');
    await until(app, () => app.left.length === 1);
    expect(app.left[0]).toBe(NEW_APP);
  });

  it('comprime los datos si el navegador puede', async () => {
    const plain = await openOld({ data: richData() });
    const zipped = await openOld({ data: richData(), compression: true });
    const a = await plain.fn.encodeTransfer(plain.db);
    const b = await zipped.fn.encodeTransfer(zipped.db);
    expect(a[0]).toBe('j');
    expect(b[0]).toBe('z');
    expect(b.length).toBeLessThan(a.length);
  });
});

describe('recibir los datos en la dirección nueva', () => {
  for (const compression of [false, true]) {
    it(`guarda los datos y limpia la URL (${compression ? 'comprimidos' : 'sin comprimir'})`, async () => {
      const old = await openOld({ data: richData(), compression });
      const code = await old.fn.encodeTransfer(old.db);
      const app = await openApp({ origin: NEW, siteUrl: NEW, hash: `#traspaso=${code}`, compression });
      await until(app, () => app.db.teams.length === 2);
      expect(app.stored()).toEqual(old.stored());
      expect(app.db.teams[0].players.at(-1).name).toBe('Íñigo «el Rápido»');
      expect(app.toast).toContain('Datos traspasados: 2 equipos y 1 partido');
      expect(app.hash).toBe('#/equipos');
      expect(app.window.location.href).not.toContain('traspaso');
    });
  }

  it('si ya hay datos, pregunta antes de reemplazarlos', async () => {
    const old = await openOld({ data: richData() });
    const code = await old.fn.encodeTransfer(old.db);
    const app = await openApp({ origin: NEW, siteUrl: NEW, data: makeData({ teams: [makeTeam({ name: 'Infantil' })] }), hash: `#traspaso=${code}` });
    await until(app, () => !!app.modal);
    expect(app.text(app.modal)).toContain('aquí ya hay datos (1 equipo y 0 partidos)');
    await app.act('confirm-yes');
    await until(app, () => app.db.teams.length === 2);
    expect(app.stored().teams.map((t) => t.name)).toEqual(['Alevín Ñ 🏀', 'Benjamín']);
  });

  it('conserva los datos de aquí si no se quiere reemplazar', async () => {
    const old = await openOld({ data: richData() });
    const code = await old.fn.encodeTransfer(old.db);
    const app = await openApp({ origin: NEW, siteUrl: NEW, data: makeData({ teams: [makeTeam({ name: 'Infantil' })] }), hash: `#traspaso=${code}` });
    await until(app, () => !!app.modal);
    await app.act('confirm-no');
    await app.settle();
    expect(app.stored().teams.map((t) => t.name)).toEqual(['Infantil']);
    expect(app.window.location.href).not.toContain('traspaso');
  });

  it('avisa y no toca nada si el fragmento no es válido', async () => {
    for (const code of ['xabc', 'jnoesbase64!', 'j' + Buffer.from('{"games":[]}').toString('base64url')]) {
      const app = await openApp({ origin: NEW, siteUrl: NEW, data: makeData(), hash: `#traspaso=${code}` });
      await until(app, () => !!app.toast);
      expect(app.toast).toContain('No se pudieron traer los datos');
      expect(app.stored().teams.map((t) => t.name)).toEqual(['Alevín A']);
      expect(app.window.location.href).not.toContain('traspaso');
      app.close();
    }
  });
});
