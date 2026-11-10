import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { SITE_URL, APP_VERSION, APP_DATE, FEEDBACK_URL } from './site.config.mjs';

// Fecha de última modificación de cada página para el sitemap. Google solo se fía de <lastmod> si es
// verdad, así que sale de fechas que se mantienen a mano: la de la versión de la app (la portada la
// muestra) y el «Actualizado el…» de cada guía. Las páginas sin fecha fiable van sin <lastmod>.
const updated = (page) => {
  const date = readFileSync(new URL(`./src/pages/${page}.astro`, import.meta.url), 'utf8').match(/updated="(\d{4}-\d{2}-\d{2})"/)?.[1];
  if (!date) throw new Error(`Falta la fecha updated="AAAA-MM-DD" en src/pages/${page}.astro`);
  return date;
};
const guides = ['guias/estadisticas-minibasket', 'guias/valoracion-baloncesto', 'plantilla-estadisticas-baloncesto'];
const lastmod = {
  '/': APP_DATE,
  '/ca/': APP_DATE,
  '/minibasket-stats/': APP_DATE,
  ...Object.fromEntries(guides.map((page) => [`/${page}/`, updated(page)])),
};

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'always',
  // La compresión de Astro se come los espacios entre texto y etiquetas en línea al cambiar de línea.
  compressHTML: false,
  build: { format: 'directory' },
  // La versión de la app y el formulario de opiniones llegan a las páginas como constantes de compilación (ver src/consts.ts).
  vite: { define: { __APP_VERSION__: JSON.stringify(APP_VERSION), __APP_DATE__: JSON.stringify(APP_DATE), __FEEDBACK_URL__: JSON.stringify(FEEDBACK_URL) } },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
      // Las dos apps son HTML estático en public/: Astro no las ve, así que se añaden a mano.
      customPages: [`${SITE_URL}/minibasket-stats/`, `${SITE_URL}/marcador/`],
      serialize(item) {
        const date = lastmod[new URL(item.url).pathname];
        return date ? { ...item, lastmod: date } : item;
      },
    }),
  ],
});
