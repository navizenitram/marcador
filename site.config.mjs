// Única fuente de verdad para la URL pública del sitio.
// Mientras no haya dominio propio se usa la URL de Vercel. Cuando compres el dominio,
// define la variable de entorno SITE_URL en el hosting (p. ej. https://canterastats.com)
// o cambia el valor por defecto de aquí abajo.
export const SITE_URL = (process.env.SITE_URL || 'https://marcador-kohl.vercel.app').replace(/\/+$/, '');
