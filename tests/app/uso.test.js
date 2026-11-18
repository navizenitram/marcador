// Estadísticas de uso anónimas (analytics.js y los hitos de app.js): cuándo se envían, qué se envía y cómo se desactivan.
import { describe, it, expect } from 'vitest';
import { openApp } from '../helpers/app.js';
import { makeData, makeTeam, sampleGame } from '../helpers/fixtures.js';

const SITE = 'https://myownbasketballstats.com';
const ID = '0a1b2c3d-4e5f-6789-abcd-ef0123456789';
const QUEUE_KEY = 'mbstats.uso.cola';

/** Abre la app publicada (dominio de la canonical y con ID de Umami) con un fetch falso que apunta lo que se envía */
async function open({ fail = false, nav = {}, ...opts } = {}) {
  const net = { fail, calls: [] };
  net.sent = () => net.calls.map((c) => JSON.parse(c.body));
  net.names = () => net.sent().map((b) => b.payload.name);
  net.event = (name) => net.sent().find((b) => b.payload.name === name)?.payload;
  const app = await openApp({
    origin: SITE, siteUrl: SITE, umamiId: ID,
    ...opts,
    setup(w) {
      w.fetch = async (url, init) => {
        if (net.fail) throw new TypeError('Failed to fetch');
        net.calls.push({ url, ...init });
        return { ok: true, status: 200 };
      };
      for (const [k, v] of Object.entries(nav)) Object.defineProperty(w.navigator, k, { value: v, configurable: true });
    },
  });
  await app.settle();
  return { app, net };
}

describe('estadísticas de uso: cuándo se envían', () => {
  it('al abrir la app publicada se envía app-abierta a la API de Umami, sin datos del equipo', async () => {
    const { net } = await open({ data: makeData() });
    expect(net.names()).toEqual(['app-abierta']);
    const [call] = net.calls;
    expect(call.url).toBe('https://cloud.umami.is/api/send');
    expect(call.method).toBe('POST');
    const body = JSON.parse(call.body);
    expect(body.type).toBe('event');
    expect(body.payload).toMatchObject({
      website: ID, hostname: 'myownbasketballstats.com', url: '/minibasket-stats/', referrer: '',
      name: 'app-abierta', data: { instalada: false, equipos: '1' },
    });
    expect(call.body).not.toContain('Alevín');
  });

  it('sin ID de Umami (sin compilar o sin la variable) no envía nada', async () => {
    const { net } = await open({ umamiId: undefined });
    expect(net.calls).toHaveLength(0);
    const { net: empty } = await open({ umamiId: '' });
    expect(empty.calls).toHaveLength(0);
  });

  it('fuera del dominio publicado (local, vista previa, dirección antigua) no envía nada', async () => {
    const { app, net } = await open({ origin: 'https://marcador-kohl.vercel.app' });
    expect(net.calls).toHaveLength(0);
    expect(app.window.localStorage.getItem(QUEUE_KEY)).toBeNull();
  });

  it('si el navegador pide no ser rastreado (GPC o DNT) no envía nada y Ajustes lo explica', async () => {
    const { net } = await open({ nav: { globalPrivacyControl: true } });
    expect(net.calls).toHaveLength(0);
    const { app, net: dnt } = await open({ nav: { doNotTrack: '1' }, data: makeData(), hash: '#/ajustes' });
    expect(dnt.calls).toHaveLength(0);
    expect(app.text()).toContain('Tu navegador pide no ser rastreado');
  });
});

describe('estadísticas de uso: los hitos', () => {
  it('un equipo de solo marcador: equipo creado y partido empezado', async () => {
    const { app, net } = await open();
    expect(net.event('app-abierta').data.equipos).toBe('0');
    await app.submit('team-new', { name: 'Benjamín', mode: 'board' });
    expect(net.event('equipo-creado').data).toEqual({ modo: 'marcador' });
    await app.submit('game', { opponent: 'Lakers', periods: 4, venue: 'home' });
    await app.settle();
    expect(net.event('partido-empezado').data).toEqual({ tipo: 'marcador', periodos: 4, perfil: 'marcador' });
    expect(net.calls.map((c) => c.body).join()).not.toMatch(/Benjamín|Lakers/);
  });

  it('el primer jugador de un equipo cuenta una vez (jugadores-anadidos), el resto no', async () => {
    const { app, net } = await open();
    await app.submit('team-new', { name: 'Alevín B', mode: 'board' });
    await app.go('#/equipo');
    await app.submit('player', { number: '4', name: 'Ana' });
    await app.submit('player', { number: '7', name: 'Bruno' });
    await app.settle();
    expect(net.names().filter((n) => n === 'jugadores-anadidos')).toHaveLength(1);
    expect(net.event('jugadores-anadidos').data).toEqual({ equipo: 'marcador' });
    expect(net.calls.map((c) => c.body).join()).not.toMatch(/Ana|Bruno/);
  });

  it('finalizar un partido envía partido-finalizado con cuántos lleva el equipo', async () => {
    const { app, net } = await open({ data: makeData({ games: [sampleGame()] }), hash: '#/stats/g1' });
    await app.act('finish', { id: 'g1' });
    await app.act('confirm-yes');
    await app.settle();
    expect(net.event('partido-finalizado').data).toEqual({ tipo: 'jugadores', periodos: 8, n: '1' });
  });

  it('compartir las estadísticas de un partido dice por qué vía, no qué se comparte', async () => {
    const { app, net } = await open({
      data: makeData({ games: [sampleGame({ finished: true })] }), hash: '#/stats/g1',
    });
    app.window.navigator.clipboard = { writeText: async () => {} };
    await app.act('share', { arg: 'g1' });
    await app.act('copy-text');
    await app.act('csv', { arg: 'g1' });
    await app.settle();
    const shares = net.sent().filter((b) => b.payload.name === 'compartir-resultado').map((b) => b.payload.data);
    expect(shares).toEqual([{ canal: 'copiar', que: 'partido' }, { canal: 'csv', que: 'partido' }]);
  });

  it('abrir el equipo de ejemplo cuenta, pero sus partidos ya jugados no cuentan como finalizados', async () => {
    const { app, net } = await open({ demo: true });
    await app.act('demo-open');
    await app.settle();
    expect(net.names()).toContain('ejemplo-abierto');
    expect(net.names()).not.toContain('partido-finalizado');
  });
});

describe('estadísticas de uso: sin conexión y desactivadas', () => {
  it('sin conexión se guardan en la cola y se envían al volver la conexión', async () => {
    const { app, net } = await open({ fail: true });
    await app.submit('team-new', { name: 'Infantil', mode: 'players' });
    const queued = JSON.parse(app.window.localStorage.getItem(QUEUE_KEY));
    expect(queued.map((e) => e.name)).toEqual(['app-abierta', 'equipo-creado']);
    expect(net.calls).toHaveLength(0);

    net.fail = false;
    app.window.dispatchEvent(new app.window.Event('online'));
    await app.settle();
    expect(net.names()).toEqual(['app-abierta', 'equipo-creado']);
    expect(app.window.localStorage.getItem(QUEUE_KEY)).toBeNull();
  });

  it('la cola no crece sin límite', async () => {
    const { app } = await open({ fail: true });
    for (let i = 0; i < 40; i++) app.window.MBAnalytics.track('x', { i });
    expect(app.window.MBAnalytics.queue()).toHaveLength(30);
  });

  it('solo se envían textos cortos, números y booleanos', async () => {
    const { app, net } = await open();
    app.window.MBAnalytics.track('prueba', { ok: 'sí', n: 3, b: true, obj: { nombre: 'Ana' }, largo: 'x'.repeat(41) });
    await app.settle();
    expect(net.event('prueba').data).toEqual({ ok: 'sí', n: 3, b: true });
  });

  it('se desactivan en Ajustes: no se envía nada más y se vacía la cola', async () => {
    const { app, net } = await open({ data: makeData({ teams: [makeTeam()] }), hash: '#/ajustes', fail: true });
    const sw = app.$('[data-action="toggle-uso"]');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    await app.act('toggle-uso');
    expect(app.$('[data-action="toggle-uso"]').getAttribute('aria-checked')).toBe('false');
    expect(app.window.localStorage.getItem('mbstats.uso')).toBe('off');
    expect(app.window.localStorage.getItem(QUEUE_KEY)).toBeNull();

    net.fail = false;
    await app.go('#/partidos');
    await app.submit('game', { opponent: 'Lakers', venue: 'away' });
    await app.settle();
    expect(net.calls).toHaveLength(0);

    // Y se vuelven a activar
    await app.go('#/ajustes');
    await app.act('toggle-uso');
    expect(app.window.localStorage.getItem('mbstats.uso')).toBeNull();
  });

  it('la pantalla de privacidad explica qué se cuenta y cómo desactivarlo', async () => {
    const { app } = await open({ hash: '#/privacidad' });
    const text = app.text();
    expect(text).toContain('Estadísticas de uso anónimas');
    expect(text).toContain('Nunca se envían nombres de equipos, jugadores o rivales');
    expect(text).toContain('Ajustes › Privacidad');
  });
});
