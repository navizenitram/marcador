// Única fuente de verdad para la URL pública del sitio.
// Se puede cambiar sin tocar el código definiendo la variable de entorno SITE_URL en el hosting.
// La dirección antigua (marcador-kohl.vercel.app) sigue sirviendo las apps para que cada usuario
// pueda llevarse sus datos (ver «Mudanza» en public/minibasket-stats/app.js y vercel.json).
export const SITE_URL = (process.env.SITE_URL || 'https://myownbasketballstats.com').replace(/\/+$/, '');
