export const SITE_NAME = 'Cantera Stats';
export const APP_URL = '/minibasket-stats/';
export const SCOREBOARD_URL = '/marcador/';
export const KOFI_URL = 'https://ko-fi.com/navizenitram';
export const TEMPLATE_PDF = '/descargas/plantilla-estadisticas-baloncesto.pdf';

// Analítica (Umami Cloud, sin cookies). Si no se define, no se carga ningún script.
export const UMAMI_WEBSITE_ID: string = import.meta.env.PUBLIC_UMAMI_WEBSITE_ID ?? '';
// Verificación de Google Search Console por etiqueta meta (opcional: mejor por DNS).
export const GSC_VERIFICATION: string = import.meta.env.PUBLIC_GSC_VERIFICATION ?? '';

export type Lang = 'es' | 'ca';
