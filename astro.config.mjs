import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { SITE_URL } from './site.config.mjs';

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'always',
  // La compresión de Astro se come los espacios entre texto y etiquetas en línea al cambiar de línea.
  compressHTML: false,
  build: { format: 'directory' },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
      // Las dos apps son HTML estático en public/: Astro no las ve, así que se añaden a mano.
      customPages: [`${SITE_URL}/minibasket-stats/`, `${SITE_URL}/marcador/`],
    }),
  ],
});
