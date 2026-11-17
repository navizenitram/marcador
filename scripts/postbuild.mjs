// Las apps (public/minibasket-stats y public/marcador) son HTML estático que Astro copia tal cual.
// Sus etiquetas canonical y Open Graph necesitan URLs absolutas, así que llevan el marcador
// %SITE_URL%, que aquí se sustituye por la URL real del sitio (ver site.config.mjs).
//
// La app de estadísticas enseña en la pantalla de «Gira el dispositivo» la fecha de su última versión (%APP_DATE%,
// aaaa-mm-dd): la variable APP_DATE si está; si no, la del último commit de la rama que cambió la app (sin contar su
// README). Con --first-parent, en main es la fecha en que se fusionó el cambio (cuando se publicó), no la del commit en
// su rama. Si no hay historial de git (una copia sin .git), la de hoy en España, que es la del despliegue.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { SITE_URL } from '../site.config.mjs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/* Hoy en España (aaaa-mm-dd): de madrugada la fecha UTC aún es la del día anterior */
function today(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function appDate() {
  if (ISO_DATE.test(process.env.APP_DATE || '')) return process.env.APP_DATE;
  try {
    const out = execFileSync('git', ['log', '-1', '--first-parent', '--format=%cs', '--', 'public/minibasket-stats', ':!public/minibasket-stats/README.md'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (ISO_DATE.test(out)) return out;
  } catch { /* sin git o fuera de un repositorio */ }
  return today();
}

const APP_DATE = appDate();
const files = ['dist/minibasket-stats/index.html', 'dist/marcador/index.html'];

for (const file of files) {
  const html = await readFile(file, 'utf8');
  const out = html.replaceAll('%SITE_URL%', SITE_URL).replaceAll('%APP_DATE%', APP_DATE);
  if (/%(SITE_URL|APP_DATE)%/.test(out)) throw new Error(`Quedan marcadores sin sustituir en ${file}`);
  await writeFile(file, out);
  console.log(`postbuild: ${file} → ${SITE_URL}${html.includes('%APP_DATE%') ? ` · versión del ${APP_DATE}` : ''}`);
}
