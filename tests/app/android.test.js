// App de Android (Trusted Web Activity): la misma web abierta desde la app de Google Play.
// Se reconoce por ?origen=android o por el referrer android-app://<paquete>/, y entonces no ofrece instalarla ni
// enlaza a Ko-fi.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { openApp } from '../helpers/app.js';
import { makeData, sampleGame } from '../helpers/fixtures.js';

const ASSETLINKS = JSON.parse(readFileSync(new URL('../../public/.well-known/assetlinks.json', import.meta.url), 'utf8'));
const PACKAGE = ASSETLINKS[0].target.package_name;
const data = () => makeData({ games: [sampleGame()] });

const kofiLinks = (app) => app.$$('a[href*="ko-fi.com"]').length;

/** Enlaces a Ko-fi en Ajustes, en las estadísticas y en la privacidad */
async function kofiEverywhere(app) {
  const out = {};
  for (const [name, hash] of [['ajustes', '#/ajustes'], ['stats', '#/stats/g1'], ['privacidad', '#/privacidad']]) {
    await app.go(hash);
    out[name] = kofiLinks(app);
  }
  return out;
}

/** Simula que Chrome ofrece instalar la PWA y dice si la app muestra el botón «Instalar» */
async function installShownAfterPrompt(app) {
  app.window.dispatchEvent(new app.window.Event('beforeinstallprompt', { cancelable: true }));
  await app.settle();
  return !app.$('#install').hidden;
}

describe('app de Android', () => {
  it('en el navegador se enlaza a Ko-fi y se ofrece instalar la app', async () => {
    const app = await openApp({ data: data() });
    expect(await kofiEverywhere(app)).toEqual({ ajustes: 1, stats: 1, privacidad: 1 });
    expect(app.text()).not.toContain('Google Play');
    expect(await installShownAfterPrompt(app)).toBe(true);
  });

  it('abierta con ?origen=android: sin Ko-fi, sin «Instalar» y con Google Play en la privacidad', async () => {
    const app = await openApp({ data: data(), search: '?origen=android' });
    expect(await kofiEverywhere(app)).toEqual({ ajustes: 0, stats: 0, privacidad: 0 });
    expect(app.text()).toContain('Google Play gestiona la descarga');
    expect(app.text()).not.toContain('Ko-fi');
    expect(app.text()).toContain('sin intereses detrás.');
    expect(await installShownAfterPrompt(app)).toBe(false);
    await app.go('#/ajustes');
    expect(app.text()).not.toContain('Apoya el proyecto');
    expect(app.text()).toContain('Leer la política de privacidad');
  });

  it('se reconoce también por el referrer que pone Chrome, pero no por el de otra app', async () => {
    const ours = await openApp({ data: data(), hash: '#/ajustes', referrer: `android-app://${PACKAGE}/` });
    expect(kofiLinks(ours)).toBe(0);
    const other = await openApp({ data: data(), hash: '#/ajustes', referrer: `android-app://${PACKAGE}.otra/` });
    expect(kofiLinks(other)).toBe(1);
  });

  it('se recuerda en sessionStorage al recargar, y no en localStorage (que comparte con Chrome)', async () => {
    const first = await openApp({ data: data(), search: '?origen=android' });
    expect(first.window.sessionStorage.getItem('mb_android')).toBe('1');
    expect(first.window.localStorage.getItem('mb_android')).toBeNull();

    const reloaded = await openApp({ data: data(), hash: '#/ajustes', session: { mb_android: '1' } });
    expect(kofiLinks(reloaded)).toBe(0);
  });

  it('el paquete de la app coincide con el de assetlinks.json', async () => {
    const app = await openApp();
    expect(vm.runInContext('ANDROID_PACKAGE', app.ctx)).toBe(PACKAGE);
  });
});
