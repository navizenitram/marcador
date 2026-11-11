// El nombre en dos líneas, para el logotipo en pantallas estrechas
export const SITE_NAME_LINES = ['My Own', 'Basketball Stats'];
export const SITE_NAME = SITE_NAME_LINES.join(' ');
export const APP_URL = '/minibasket-stats/';
export const SCOREBOARD_URL = '/marcador/';
export const KOFI_URL = 'https://ko-fi.com/navizenitram';
export const TEMPLATE_PDF = '/descargas/plantilla-estadisticas-baloncesto.pdf';

// Analítica (Umami Cloud, sin cookies). Si no se define, no se carga ningún script.
export const UMAMI_WEBSITE_ID: string = import.meta.env.PUBLIC_UMAMI_WEBSITE_ID ?? '';
// Verificación de Google Search Console por etiqueta meta. El código no es secreto (acaba en el HTML público);
// PUBLIC_GSC_VERIFICATION lo sustituye si hace falta otro.
export const GSC_VERIFICATION: string =
  import.meta.env.PUBLIC_GSC_VERIFICATION || 'qTOcRMn6lUGbyOFyUWqL3bWUUBLumqlW4X27sp7h8to';

export type Lang = 'es' | 'ca';
