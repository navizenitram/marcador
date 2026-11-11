// Comparativa con otras apps (fase 3 de docs/plan-mejoras-bsa.md). Los datos de la competencia los rellena a mano
// quien mantiene la web, con su fuente oficial y la fecha de consulta; mientras quede algún TODO, la página es un
// borrador: no se indexa, no está en el sitemap y no se enlaza.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as data from '../../src/data/comparativa.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const page = readFileSync(ROOT + 'src/pages/comparativa-apps-estadisticas-baloncesto.astro', 'utf8');
const PATH = data.COMPARISON_PATH;

/** Una app con todo rellenado correctamente (para probar el estado publicado) */
const filledApp = (name = 'App') => ({
  name,
  url: 'https://example.com',
  fit: 'Para equipos que quieren X.',
  better: ['Hace Y mejor.'],
  cells: Object.fromEntries(data.ROWS.map((r) => [r.key, { valor: 'Sí', fuente: 'https://example.com/precios', consultado: '2026-11-20' }])),
});

describe('datos de la comparativa', () => {
  it('compara con las cinco apps pedidas', () => {
    expect(data.APPS.map((a) => a.name)).toEqual(['Basketball Stats Assistant', 'GameChanger', 'Easy Stats', 'Breakthrough Stats', 'Hoopops / SportEasy']);
  });

  it('cada app tiene una celda para cada fila de la tabla', () => {
    const keys = data.ROWS.map((r) => r.key).sort();
    for (const app of data.APPS) expect(Object.keys(app.cells).sort(), app.name).toEqual(keys);
    expect(Object.keys(data.OURS).sort()).toEqual(keys);
  });

  it('nuestros datos están rellenos y dicen de dónde salen (verificables en el código)', () => {
    for (const [k, c] of Object.entries(data.OURS)) {
      expect(c.valor, k).not.toMatch(/TODO/);
      expect(c.evidencia, k).toBeTruthy();
    }
  });

  it('los datos actuales son válidos: cada celda está en TODO, en «No consta» o con fuente https y fecha', () => {
    expect(data.validationErrors()).toEqual([]);
  });

  it('la privacidad se dice con precisión: sin analítica en la app y Umami (sin cookies) en la web', () => {
    expect(data.OURS.analytics.valor).toMatch(/app/i);
    expect(data.OURS.analytics.valor).toMatch(/Umami/);
    expect(JSON.stringify(data.OURS) + page).not.toMatch(/sin rastreo/i);
  });
});

describe('pendientes y validación', () => {
  it('hoy todo lo de la competencia está pendiente: es un borrador', () => {
    expect(data.pendingTodos()).toBeGreaterThan(0);
    expect(data.DRAFT).toBe(true);
  });

  it('con todo rellenado y la fecha de revisión, no queda nada pendiente', () => {
    expect(data.pendingTodos([filledApp()], '2026-11-20')).toBe(0);
    expect(data.validationErrors([filledApp()], '2026-11-20')).toEqual([]);
  });

  it('un dato que no se puede verificar va como «No consta» (valor null) y no bloquea la publicación', () => {
    const app = filledApp();
    app.cells.storage = { valor: null, fuente: 'TODO', consultado: '2026-11-20' };
    expect(data.pendingTodos([app], '2026-11-20')).toBe(0);
    expect(data.validationErrors([app], '2026-11-20')).toEqual([]);
  });

  it('el nombre sin confirmar cuenta como pendiente', () => {
    expect(data.pendingTodos([{ ...filledApp(), nameCheck: 'TODO: confirmar el nombre' }], '2026-11-20')).toBe(1);
    expect(data.APPS.find((a) => a.name.includes('Hoopops')).nameCheck).toMatch(/TODO/);
  });

  it('detecta los datos mal rellenados (fuente sin https, fecha en otro formato, listas vacías)', () => {
    const app = filledApp('Mal');
    app.cells.price = { valor: 'Gratis', fuente: 'www.example.com', consultado: '20/11/2026' };
    app.url = 'example.com';
    app.better = [];
    app.fit = '';
    expect(data.validationErrors([app], '20/11/2026')).toEqual([
      'REVIEWED: fecha aaaa-mm-dd',
      'Mal · price: fuente https y fecha aaaa-mm-dd',
      'Mal · url: https',
      'Mal · better: al menos una línea',
      'Mal · fit: texto',
    ]);
  });
});

describe('borrador o publicada', () => {
  it('sitemap: fuera mientras es un borrador; dentro cuando está completa', () => {
    expect(data.includeInSitemap(`https://x.com${PATH}`, true)).toBe(false);
    expect(data.includeInSitemap(`https://x.com${PATH}`, false)).toBe(true);
    expect(data.includeInSitemap('https://x.com/guias/', true)).toBe(true);
  });

  it('la configuración, las guías, el pie y la página usan la misma constante DRAFT', () => {
    expect(readFileSync(ROOT + 'astro.config.mjs', 'utf8')).toMatch(/includeInSitemap\(page\)/);
    for (const f of ['src/pages/guias/index.astro', 'src/components/Footer.astro']) expect(readFileSync(ROOT + f, 'utf8'), f).toMatch(/!DRAFT/);
    expect(page).toMatch(/noindex=\{DRAFT\}/);
  });

  it('la página valida los datos al compilar y falla si están mal rellenados', () => {
    expect(page).toMatch(/validationErrors\(\)/);
    expect(page).toMatch(/throw new Error/);
  });

  it('el aviso de borrador cuenta bien los pendientes', () => {
    expect(data.pendingLabel(1)).toBe('Falta 1 dato por revisar');
    expect(data.pendingLabel(7)).toBe('Faltan 7 datos por revisar');
  });

  it('la fecha de actualización y el año del título salen de la revisión de los datos', () => {
    expect(data.updatedDate('TODO')).toBe(data.DRAFT_DATE);
    expect(data.updatedDate('2027-01-20')).toBe('2027-01-20');
    expect(data.titleFor('2027-01-20')).toContain('comparativa 2027');
  });

  it('title de 60 caracteres o menos y description de unos 150', () => {
    expect(data.META.title.length).toBeLessThanOrEqual(60);
    expect(data.META.description.length).toBeGreaterThan(110);
    expect(data.META.description.length).toBeLessThanOrEqual(160);
  });
});
