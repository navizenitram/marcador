import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { home } from '../../src/i18n/home.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const APP = join(ROOT, 'public/minibasket-stats');

describe('site.config.mjs', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  const siteUrl = async (value) => {
    vi.stubEnv('SITE_URL', value);
    vi.resetModules();
    return (await import('../../site.config.mjs')).SITE_URL;
  };

  it('usa el dominio propio si no se define SITE_URL', async () => {
    expect(await siteUrl('')).toBe('https://myownbasketballstats.com');
  });

  it('quita las barras finales de SITE_URL', async () => {
    expect(await siteUrl('https://ejemplo.com//')).toBe('https://ejemplo.com');
  });
});

describe('scripts/postbuild.mjs', () => {
  const run = (cwd, siteUrl) => execFileSync(process.execPath, [join(ROOT, 'scripts/postbuild.mjs')], {
    cwd, env: { ...process.env, SITE_URL: siteUrl }, encoding: 'utf8', stdio: 'pipe',
  });
  const withDist = (fn) => {
    const dir = mkdtempSync(join(tmpdir(), 'postbuild-'));
    try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
  };

  it('sustituye %SITE_URL% en las dos apps', () => withDist((dir) => {
    for (const app of ['minibasket-stats', 'marcador']) cpSync(join(ROOT, 'public', app, 'index.html'), join(dir, 'dist', app, 'index.html'));
    run(dir, 'https://ejemplo.com/');
    for (const app of ['minibasket-stats', 'marcador']) {
      const html = readFileSync(join(dir, 'dist', app, 'index.html'), 'utf8');
      expect(html).not.toContain('%SITE_URL%');
      expect(html).toContain(`<link rel="canonical" href="https://ejemplo.com/${app}/">`);
    }
  }));

  it('falla si falta alguna de las apps en dist/', () => withDist((dir) => {
    cpSync(join(ROOT, 'public/marcador/index.html'), join(dir, 'dist/marcador/index.html'));
    expect(() => run(dir, 'https://ejemplo.com')).toThrow();
  }));
});

describe('textos de la portada (src/i18n/home.ts)', () => {
  const { es, ca } = home;
  // Las preguntas frecuentes pueden variar entre idiomas (en catalán se explica que la app está en castellano)
  const FREE_LENGTH = new Set(['faqs']);

  it('castellano y catalán tienen las mismas claves y del mismo tipo', () => {
    expect(Object.keys(ca).sort()).toEqual(Object.keys(es).sort());
    for (const k of Object.keys(es)) {
      expect(Array.isArray(ca[k]), k).toBe(Array.isArray(es[k]));
      expect(typeof ca[k], k).toBe(typeof es[k]);
    }
  });

  it('las listas tienen los mismos elementos en los dos idiomas', () => {
    for (const k of Object.keys(es).filter((k) => Array.isArray(es[k]) && !FREE_LENGTH.has(k))) {
      expect(ca[k].length, k).toBe(es[k].length);
      es[k].forEach((item, i) => {
        if (item && typeof item === 'object') expect(Object.keys(ca[k][i]).sort(), `${k}[${i}]`).toEqual(Object.keys(item).sort());
      });
    }
  });

  it('no hay textos vacíos', () => {
    const empty = [];
    const walk = (v, path) => {
      if (typeof v === 'string') { if (!v.trim()) empty.push(path); }
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(home, 'home');
    expect(empty).toEqual([]);
  });

  it('los enlaces de las preguntas frecuentes apuntan a páginas que existen', () => {
    const links = [...es.faqs, ...ca.faqs].filter((f) => f.link).map((f) => f.link.href);
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      const page = href.replace(/^\/|\/$/g, '');
      const exists = existsSync(join(ROOT, 'src/pages', `${page}.astro`)) || existsSync(join(ROOT, 'src/pages', page, 'index.astro'));
      expect(exists, href).toBe(true);
    }
  });
});

describe('app de Android: public/.well-known/assetlinks.json', () => {
  // Digital Asset Links: demuestra a Android que la app de Google Play y el dominio son del mismo dueño. Si no
  // valida, la app se abre con la barra de direcciones de Chrome arriba.
  const links = JSON.parse(readFileSync(join(ROOT, 'public/.well-known/assetlinks.json'), 'utf8'));

  it('delega en la app de Android el manejo de las URL del dominio', () => {
    expect(links).toHaveLength(1);
    expect(links[0].relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(links[0].target.namespace).toBe('android_app');
    expect(links[0].target.package_name).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
  });

  it('las huellas son SHA-256 en hexadecimal en mayúsculas, separadas por dos puntos y sin repetir', () => {
    const prints = links[0].target.sha256_cert_fingerprints;
    expect(Array.isArray(prints)).toBe(true);
    for (const p of prints) expect(p).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    expect(new Set(prints).size).toBe(prints.length);
  });
});

describe('PWA de estadísticas: archivos', () => {
  const sw = () => {
    const sandbox = { self: { addEventListener() {} } };
    vm.runInNewContext(`${readFileSync(join(APP, 'sw.js'), 'utf8')}\n;globalThis.out = { CACHE, ASSETS };`, sandbox);
    return sandbox.out;
  };

  // cache.addAll() es todo o nada: si falta un archivo, el service worker no se instala y la app no funciona sin conexión
  it('existen todos los archivos que el service worker guarda para usarla sin conexión', () => {
    const missing = sw().ASSETS.map((a) => (a === './' ? 'index.html' : a.replace(/^\.\//, ''))).filter((f) => !existsSync(join(APP, f)));
    expect(missing).toEqual([]);
  });

  it('el service worker guarda la app, los estilos y las fuentes', () => {
    const { CACHE, ASSETS } = sw();
    expect(CACHE).toMatch(/^mbstats-v\d+$/);
    expect(ASSETS).toEqual(expect.arrayContaining(['./', './index.html', './app.js', './styles.css']));
    const fonts = [...readFileSync(join(APP, 'styles.css'), 'utf8').matchAll(/url\('([^']+\.woff2)'\)/g)].map((m) => `./${m[1]}`);
    expect(ASSETS).toEqual(expect.arrayContaining(fonts));
  });

  it('existen los archivos locales que enlaza index.html', () => {
    const { document } = new JSDOM(readFileSync(join(APP, 'index.html'), 'utf8')).window;
    const refs = [...document.querySelectorAll('link[href], script[src], img[src]')]
      .map((el) => el.getAttribute('href') ?? el.getAttribute('src'))
      .filter((u) => !/^(https?:|data:|#|%SITE_URL%)/.test(u));
    expect(refs).toEqual(expect.arrayContaining(['app.js', 'styles.css', 'manifest.webmanifest']));
    expect(refs.filter((u) => !existsSync(join(APP, u)))).toEqual([]);
  });

  it('el service worker guarda todos los scripts que carga index.html (si falta uno, la app no arranca sin conexión)', () => {
    const { document } = new JSDOM(readFileSync(join(APP, 'index.html'), 'utf8')).window;
    const scripts = [...document.querySelectorAll('script[src]')].map((el) => `./${el.getAttribute('src')}`);
    expect(scripts).toEqual(expect.arrayContaining(['./core.js', './app.js']));
    expect(scripts.indexOf('./core.js')).toBeLessThan(scripts.indexOf('./app.js'));
    expect(sw().ASSETS).toEqual(expect.arrayContaining(scripts));
  });

  it('existen los iconos del manifest y la app se abre en horizontal', () => {
    const manifest = JSON.parse(readFileSync(join(APP, 'manifest.webmanifest'), 'utf8'));
    expect(manifest.orientation).toBe('landscape');
    expect(manifest.icons.map((i) => i.src).filter((src) => !existsSync(join(APP, src)))).toEqual([]);
  });

  it('existen las fuentes que usan los estilos', () => {
    const css = [
      [APP, readFileSync(join(APP, 'styles.css'), 'utf8')],
      [join(ROOT, 'public'), readFileSync(join(ROOT, 'src/styles/global.css'), 'utf8')],
    ];
    for (const [base, text] of css) {
      for (const [, url] of text.matchAll(/url\('([^']+)'\)/g)) expect(existsSync(join(base, url)), url).toBe(true);
    }
  });
});
