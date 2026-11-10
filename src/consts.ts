export const SITE_NAME = 'Cantera Stats';
export const APP_URL = '/minibasket-stats/';
export const SCOREBOARD_URL = '/marcador/';
export const KOFI_URL = 'https://ko-fi.com/navizenitram';
export const TEMPLATE_PDF = '/descargas/plantilla-estadisticas-baloncesto.pdf';

// Analítica (Umami Cloud, sin cookies). Si no se define, no se carga ningún script.
export const UMAMI_WEBSITE_ID: string = import.meta.env.PUBLIC_UMAMI_WEBSITE_ID ?? '';
// Verificación de Google Search Console por etiqueta meta (opcional: mejor por DNS).
export const GSC_VERIFICATION: string = import.meta.env.PUBLIC_GSC_VERIFICATION ?? '';

// Versión de la app y fecha de publicación (AAAA-MM-DD). Salen de public/minibasket-stats/app.js
// a través de astro.config.mjs.
declare const __APP_VERSION__: string;
declare const __APP_DATE__: string;
export const APP_VERSION: string = __APP_VERSION__;
export const APP_DATE: string = __APP_DATE__;

// Formulario externo de opiniones (FEEDBACK_URL en public/minibasket-stats/app.js). Vacío: no se enlaza.
declare const __FEEDBACK_URL__: string;
export const FEEDBACK_URL: string = __FEEDBACK_URL__;

export type Lang = 'es' | 'ca';
