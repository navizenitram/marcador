// Comparativa con otras apps (fase 3 de docs/plan-mejoras-bsa.md). Los datos de la competencia los rellena a mano
// quien mantiene la web, con su fuente oficial y la fecha de consulta; mientras quede algún TODO, la página no se
// indexa, no está en el sitemap y no se enlaza.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as data from '../../src/data/comparativa.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const page = readFileSync(ROOT + 'src/pages/comparativa-apps-estadisticas-baloncesto.astro', 'utf8');

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

  it('no hay datos de la competencia sin fuente: cada celda es TODO o lleva fuente oficial y fecha', () => {
    expect(data.invalidCells()).toEqual([]);
  });

  it('cuenta lo que falta por revisar (hoy, todo lo de la competencia)', () => {
    expect(data.pendingTodos()).toBeGreaterThan(0);
  });

  it('la privacidad se dice con precisión: sin analítica en la app y Umami (sin cookies) en la web', () => {
    expect(data.OURS.analytics.valor).toMatch(/app/i);
    expect(data.OURS.analytics.valor).toMatch(/Umami/);
    const all = JSON.stringify(data.OURS) + page;
    expect(all).not.toMatch(/sin rastreo/i);
  });
});

describe('página', () => {
  it('mientras quede algún TODO, noindex y aviso de borrador', () => {
    expect(page).toMatch(/noindex=\{draft\}/);
    expect(page).toMatch(/draft &&/);
  });

  it('el sitemap deja fuera la página mientras sea un borrador', async () => {
    const config = readFileSync(ROOT + 'astro.config.mjs', 'utf8');
    expect(config).toContain('pendingTodos');
    expect(config).toContain('COMPARISON_PATH');
  });

  it('las guías y el pie solo la enlazan cuando está completa', () => {
    for (const f of ['src/pages/guias/index.astro', 'src/components/Footer.astro']) {
      const src = readFileSync(ROOT + f, 'utf8');
      expect(src, f).toContain('COMPARISON_PATH');
      expect(src, f).toContain('pendingTodos()');
    }
  });

  it('tiene title de 60 caracteres o menos y una description de unos 150', () => {
    expect(data.META.title.length).toBeLessThanOrEqual(60);
    expect(data.META.description.length).toBeGreaterThan(110);
    expect(data.META.description.length).toBeLessThanOrEqual(160);
  });
});
