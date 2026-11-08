# Cantera Stats

Web de [Cantera Stats](https://marcador-kohl.vercel.app/), una app gratuita de estadísticas para minibasket y
baloncesto formativo. El repositorio contiene tres cosas:

| Ruta | Qué es | Código |
| --- | --- | --- |
| `/` y `/ca/` | Portada orientada a SEO, en castellano y catalán | Astro, en `src/` |
| `/guias/…`, `/plantilla-estadisticas-baloncesto/` | Guías y plantilla imprimible | Astro, en `src/` |
| `/minibasket-stats/` | La app de estadísticas (SPA sin dependencias) | `public/minibasket-stats/` ([README](public/minibasket-stats/README.md)) |
| `/marcador/` | El marcador de minibasket | `public/marcador/index.html` |

Las dos apps no pasan por ningún proceso de build: Astro copia `public/` tal cual. Lo único que se toca después de
compilar es el marcador `%SITE_URL%` de sus etiquetas canonical y Open Graph (`scripts/postbuild.mjs`).

## Desarrollo

Requiere Node 22.23.4 o superior (en producción se usa Node 24).

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # genera dist/
npm run preview   # sirve dist/
```

## Configuración

| Variable | Para qué | Por defecto |
| --- | --- | --- |
| `SITE_URL` | URL pública, sin barra final. Se usa en canonical, Open Graph, sitemap y robots.txt | `https://marcador-kohl.vercel.app` |
| `PUBLIC_UMAMI_WEBSITE_ID` | Activa la analítica de Umami (sin cookies) en la web. La app no lleva analítica | vacía: sin analítica |
| `PUBLIC_GSC_VERIFICATION` | Verificación de Google Search Console por etiqueta meta (mejor por DNS) | vacía |

Ver `.env.example`.

### Eventos que se miden en Umami

| Evento | Cuándo | Propiedad |
| --- | --- | --- |
| `abrir-app` | Clic en cualquier botón o enlace que abre la app | `origen`: portada, cabecera, final, pie, guía… |
| `compartir-whatsapp` | Clic en «Compartirla por WhatsApp» | `origen` |
| `descargar-plantilla` | Descarga del PDF | `origen` |
| `kofi` | Clic en «Invítame a un café» | — |

La conversión que importa de verdad (crear un equipo, terminar el primer partido) ocurre dentro de la app, que hoy no
mide nada para cumplir su promesa de «sin seguimiento».

## Despliegue

Funciona igual en Vercel y en Cloudflare. En los dos casos el build es `npm run build` y la salida, `dist/`.

### Vercel (configuración actual)

`vercel.json` ya indica el framework, el comando de build y la carpeta de salida, así que el proyecto existente sigue
funcionando sin tocar nada en el panel. Las variables se definen en *Settings → Environment Variables*.

### Cloudflare (recomendado si el proyecto deja de ser personal y sin ánimo de lucro)

1. En el panel de Cloudflare, *Workers & Pages → Create → Import a repository* y elige este repositorio.
2. Comando de build: `npm run build`. Comando de despliegue: `npx wrangler deploy` (usa `wrangler.jsonc`).
3. En *Settings → Build → Variables*, añade `SITE_URL` y `PUBLIC_UMAMI_WEBSITE_ID`.
4. Añade el dominio en *Settings → Domains & Routes*.

`public/_headers` y `public/_redirects` replican en Cloudflare lo que `vercel.json` hace en Vercel.

## Al cambiar de dominio

- Los datos de la app viven en el `localStorage` del navegador, que va **por dominio**. Quien ya la use en
  `marcador-kohl.vercel.app` no verá sus equipos en el dominio nuevo: tendrá que exportar la copia de seguridad en
  *Ajustes* e importarla allí. Mantén el despliegue de Vercel vivo durante la transición.
- Cambia `SITE_URL` en el hosting y vuelve a desplegar.
- Si dejas Vercel, actualiza el texto de privacidad de la app (`public/minibasket-stats/app.js`, que menciona a Vercel
  como servicio de alojamiento) y sube la versión de la caché en `sw.js`.

## Recursos generados

- `public/img/app-*.webp`: capturas reales de la app con datos de ejemplo, en un viewport de 844×390 a 2x.
- `public/og/cantera-stats.png`: imagen para compartir (1200×630). Fuente: `assets-src/og.html`.
- `public/descargas/plantilla-estadisticas-baloncesto.pdf`: plantilla A4 apaisada. Fuente: `assets-src/plantilla-estadisticas.html`.

Fuentes incluidas: Rajdhani y Barlow, ambas con licencia SIL OFL 1.1 (`public/fonts/OFL-*.txt`).
