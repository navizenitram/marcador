# My Own Basketball Stats

Web de [My Own Basketball Stats](https://myownbasketballstats.com/), una app gratuita de estadísticas para minibasket y
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

## Tests

```bash
npm test               # una pasada (unos segundos)
npm run test:watch     # se repiten al guardar
npm run test:coverage  # informe de cobertura en coverage/
```

Usan [Vitest](https://vitest.dev) y [jsdom](https://github.com/jsdom/jsdom). Las apps no se modifican para probarlas:
los helpers de `tests/helpers/` cargan su `index.html` y su `app.js` reales en un DOM simulado y llaman a sus funciones
o pulsan sus botones. Si la app lanza una excepción durante un test, el test falla aunque sus comprobaciones pasen.

| Carpeta | Qué cubre |
| --- | --- |
| `tests/app/` | App de estadísticas: cálculos y valoración, datos (migración v1→v2, carga, importación), exportación (texto, CSV, JSON) y flujos de uso (equipos, plantilla, partido en directo, ajustes, estadísticas, fases de la temporada y local/visitante) |
| `tests/marcador/` | Marcador: puntos, faltas y periodos, estadísticas y gráficas (Chart.js se sustituye por un doble), reinicio y tema |
| `tests/web/` | `site.config.mjs`, `scripts/postbuild.mjs`, mismos textos en castellano y catalán, y archivos de la PWA (service worker, manifest, fuentes) |

### Tests e2e

```bash
npx playwright install chromium webkit   # solo la primera vez
npm run test:e2e                          # compila el sitio, lo sirve y pasa los tests
npx playwright test --project=android     # solo un navegador
```

Usan [Playwright](https://playwright.dev) en dos perfiles de móvil en horizontal: Chrome en un Pixel 7 (`android`) y
Safari en un iPhone 13 (`iphone`). Prueban el sitio compilado (`npm run build` y `astro preview`), así que cubren lo
que jsdom no puede: el diseño real (los 5 jugadores con sus 15 botones caben sin scroll y se pueden tocar), los
toques en pantalla, el modo sin conexión con el service worker, las recargas, la descarga del CSV, el aviso de girar el
móvil en vertical y las páginas de la web tras el build. Están en `e2e/` y no dependen de internet: se corta cualquier
petición que no vaya al servidor local.

La recarga sin conexión solo se prueba en Chrome: en el WebKit de Playwright falla con un error interno aunque el
service worker controle la página. En Safari se comprueba que el service worker toma el control y guarda la app; el
funcionamiento sin conexión en un iPhone real conviene comprobarlo a mano (modo avión y abrir la app).

### Integración continua

`.github/workflows/tests.yml` pasa los tests unitarios y los e2e en cada push, en paralelo. Si fallan los e2e, el
informe de Playwright queda como artefacto de la ejecución.

## Configuración

| Variable | Para qué | Por defecto |
| --- | --- | --- |
| `SITE_URL` | URL pública, sin barra final. Se usa en canonical, Open Graph, sitemap y robots.txt | `https://myownbasketballstats.com` |
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

## Dominio y mudanza desde `marcador-kohl.vercel.app`

El dominio es `myownbasketballstats.com`. Antes la web estaba en `marcador-kohl.vercel.app`, y esa dirección sigue
activa en el mismo proyecto de Vercel:

- **La web** (portada, guías, plantilla, privacidad…) redirige con un 301 al dominio nuevo. Lo hace la última regla de
  `vercel.json`, que solo se aplica a ese host.
- **Las apps** (`/minibasket-stats/` y `/marcador/`) no se redirigen. Sus datos viven en el `localStorage` del
  navegador, que va **por dominio**: quien ya use la app en la dirección antigua no verá sus equipos en la nueva.
  En la dirección antigua la app muestra un aviso con el botón «Llevar mis datos», que abre la app en el dominio
  nuevo con los datos en el fragmento de la URL (`#traspaso=…`, comprimido). El fragmento no se envía al servidor:
  los datos pasan de un navegador a otro. Al llegar, la app los guarda (o pregunta si quiere reemplazar los que ya
  hubiera) y quita el fragmento de la URL. En la dirección antigua no se borra nada.
- Las direcciones antiguas están en `OLD_HOSTS` (`public/minibasket-stats/app.js`). La nueva se toma de la canonical
  de la app, que sale de `SITE_URL`.
- En un iPhone con la app instalada en la pantalla de inicio, el botón abre Safari y la app instalada desde allí puede
  no ver esos datos. En ese caso hay que usar *Ajustes → Exportar* en la antigua e *Importar* en la nueva.
- Cuando ya no haya visitas a las apps en la dirección antigua, se puede quitar `/minibasket-stats` y `/marcador` de la
  exclusión de la regla de `vercel.json` para redirigirlo todo.

Si algún día se deja Vercel, hay que actualizar el texto de privacidad de la app (`public/minibasket-stats/app.js`,
que menciona a Vercel como servicio de alojamiento) y subir la versión de la caché en `sw.js`.

## Recursos generados

- `public/img/app-*.webp`: capturas reales de la app con datos de ejemplo, en un viewport de 844×390 a 2x.
- `public/og/og.png`: imagen para compartir (1200×630). Fuente: `assets-src/og.html`.
- `public/descargas/plantilla-estadisticas-baloncesto.pdf`: plantilla A4 apaisada. Fuente: `assets-src/plantilla-estadisticas.html`.

Fuentes incluidas: Rajdhani y Barlow, ambas con licencia SIL OFL 1.1 (`public/fonts/OFL-*.txt`).
