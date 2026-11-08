// Las apps (public/minibasket-stats y public/marcador) son HTML estático que Astro copia tal cual.
// Sus etiquetas canonical y Open Graph necesitan URLs absolutas, así que llevan el marcador
// %SITE_URL%, que aquí se sustituye por la URL real del sitio (ver site.config.mjs).
import { readFile, writeFile } from 'node:fs/promises';
import { SITE_URL } from '../site.config.mjs';

const files = ['dist/minibasket-stats/index.html', 'dist/marcador/index.html'];

for (const file of files) {
  const html = await readFile(file, 'utf8');
  const out = html.replaceAll('%SITE_URL%', SITE_URL);
  if (out.includes('%SITE_URL%')) throw new Error(`Quedan marcadores sin sustituir en ${file}`);
  await writeFile(file, out);
  console.log(`postbuild: ${file} → ${SITE_URL}`);
}
