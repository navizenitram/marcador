// Única fuente de verdad para la URL pública del sitio.
// Mientras no haya dominio propio se usa la URL de Vercel. Cuando compres el dominio,
// define la variable de entorno SITE_URL en el hosting (p. ej. https://canterastats.com)
// o cambia el valor por defecto de aquí abajo.
export const SITE_URL = (process.env.SITE_URL || 'https://marcador-kohl.vercel.app').replace(/\/+$/, '');

// Versión de la app de estadísticas y fecha en que se publicó. Se definen en la propia app (que no pasa
// por ningún build) y aquí se leen para mostrarlas en la web, en los datos estructurados y en el sitemap.
import { readFileSync } from 'node:fs';

const appJs = readFileSync(new URL('./public/minibasket-stats/app.js', import.meta.url), 'utf8');
const read = (name, pattern) => {
  const value = appJs.match(new RegExp(`^const ${name} = '(${pattern})';`, 'm'))?.[1];
  if (!value) throw new Error(`No encuentro ${name} en public/minibasket-stats/app.js`);
  return value;
};
export const APP_VERSION = read('APP_VERSION', '\\d+(?:\\.\\d+)*');
export const APP_DATE = read('APP_DATE', '\\d{4}-\\d{2}-\\d{2}');
