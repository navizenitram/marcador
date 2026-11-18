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
compilar (`scripts/postbuild.mjs`) es el marcador `%SITE_URL%` de sus etiquetas canonical y Open Graph y, en la app de
estadísticas, `%APP_DATE%`: la fecha de la última versión que se ve en la pantalla de «Gira el dispositivo». Es la de
la variable `APP_DATE` si se define, si no la del último commit que cambió `public/minibasket-stats/` (sin su README) y,
si la compilación no tiene historial de git, la del día de la compilación.

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
| `tests/core/` | Núcleo de cálculo de la app (`core.js`) cargado solo, sin DOM: si tocara el DOM o el estado de la app, fallaría |
| `tests/app/` | App de estadísticas: cálculos y valoración, datos (migraciones v1→v2→v3, carga, importación), registro de quintetos, exportación (texto, CSV, JSON) y flujos de uso (equipos, plantilla, partido en directo, ajustes, estadísticas, fases de la temporada y local/visitante) |
| `tests/marcador/` | Marcador: puntos, faltas y periodos, estadísticas y gráficas (Chart.js se sustituye por un doble), reinicio y tema |
| `tests/web/` | `site.config.mjs`, `scripts/postbuild.mjs`, mismos textos en castellano y catalán, y archivos de la PWA (service worker, manifest, fuentes) |

La cobertura de `core.js` se mide aparte: al juntar los informes de todos los archivos de test, la cobertura V8 de
Vitest a veces lo deja fuera de la tabla.

```bash
npx vitest run tests/core --coverage --coverage.include=public/minibasket-stats/core.js
```

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

`.github/workflows/tests.yml` pasa los tests unitarios y los e2e en cada push, en paralelo. Los e2e se ejecutan en la
imagen oficial de Playwright (`mcr.microsoft.com/playwright`), que ya trae los navegadores y sus dependencias: al
actualizar `@playwright/test`, hay que subir también la versión de la imagen en el workflow. Si fallan los e2e, el
informe de Playwright queda como artefacto de la ejecución.

## Configuración

| Variable | Para qué | Por defecto |
| --- | --- | --- |
| `SITE_URL` | URL pública, sin barra final. Se usa en canonical, Open Graph, sitemap y robots.txt | `https://myownbasketballstats.com` |
| `PUBLIC_UMAMI_WEBSITE_ID` | Activa la analítica de Umami (sin cookies) en la web y las estadísticas de uso anónimas de la app (mismo ID, `scripts/postbuild.mjs` lo pone en la app) | vacía: sin analítica |
| `PUBLIC_GSC_VERIFICATION` | Código de verificación de Google Search Console (etiqueta meta) | el de la propiedad actual, en `src/consts.ts` |

Ver `.env.example`.

### Eventos que se miden en Umami

| Evento | Cuándo | Propiedad |
| --- | --- | --- |
| `abrir-app` | Clic en cualquier botón o enlace que abre la app | `origen`: portada, cabecera, final, pie, guía… |
| `abrir-marcador` | Clic en un enlace al marcador | `origen`: final, guía…, pie |
| `ver-como-funciona` | Clic en «Ver cómo funciona» de la portada | `idioma` |
| `ver-seccion` | La portada llega a una sección (su parte de arriba pasa la mitad de la pantalla). Una vez por visita | `seccion`: marcador, como-funciona, preguntas, final; `idioma` |
| `abrir-faq` | Se abre una pregunta frecuente de la portada. Una vez por pregunta y visita | `pregunta`: el `id` de `src/i18n/home.ts`; `idioma` |
| `compartir-whatsapp` | Clic en «Compartirla por WhatsApp» | `origen` |
| `descargar-plantilla` | Descarga del PDF | `origen` |
| `kofi` | Clic en «Invítame a un café» | `origen`: portada, pie |
| `x` | Clic en un enlace al perfil de X | `origen`: faq, pie, pie-proyecto |

`ver-seccion` y `abrir-faq` los envía un script de `src/components/Home.astro`; el resto, los atributos
`data-umami-event` de cada enlace. Los recorridos entre páginas no necesitan eventos: salen de las visitas (informe
*Journey* de Umami). Para medir una campaña, sus enlaces llevan `?utm_source=…&utm_campaign=…`, que Umami recoge solo.

La app manda sus propios eventos anónimos (crear un equipo, empezar y finalizar partidos…) con el mismo ID, y se
pueden desactivar en sus Ajustes. La lista y las reglas están en el [README de la app](public/minibasket-stats/README.md#estadísticas-de-uso-anónimas).

### Embudos y objetivos en Umami

Se crean a mano en *Reports* (Umami no los guarda en el código):

| Informe | Pasos o eventos | Qué responde |
| --- | --- | --- |
| Embudo «Portada» | `/` → `ver-seccion` (como-funciona) → `ver-seccion` (final) → `abrir-app` | En qué parte de la portada se pierde la gente |
| Embudo «Guías» | `/guias/estadisticas-minibasket/` o `/guias/valoracion-baloncesto/` → `abrir-app` | Qué contenido de SEO lleva a la app |
| Embudo «Plantilla» | `/plantilla-estadisticas-baloncesto/` → `descargar-plantilla` → `abrir-app` | Si quien quiere el papel acaba probando la app |
| Embudo «Activación» | `abrir-app` → `app-abierta` → `equipo-creado` → `partido-empezado` → `partido-finalizado` | La conversión que importa: de la web a terminar un partido |
| Embudo «Marcador → jugadores» | `equipo-creado` → `jugadores-anadidos` | Si el «marcador vitaminado» lleva a la estadística por jugador (filtrar por `modo`/`equipo`) |
| Objetivos | `abrir-app`, `descargar-plantilla`, `compartir-whatsapp`, `partido-finalizado`, `compartir-resultado` | Conversiones por `origen` y por fuente de tráfico |
| Propiedades de `partido-finalizado` | Reparto de `n` | Cuántos equipos siguen usándola (2-5, 6-10, 11+ partidos) |

Ojo con los embudos que cruzan la web y la app: Umami une los pasos por sesión, y una app instalada (PWA) se abre sin
pasar por la web, así que el primer paso solo lo dan quienes llegan desde el navegador.

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
  nuevo con los datos en el fragmento de la URL (`#traspaso=…`, comprimido). El fragmento no se envía al servidor,
  aunque la URL completa sí puede quedar en el historial del navegador. Al llegar, la app pide confirmación siempre
  (cualquiera puede fabricar un enlace así), guarda los datos y quita el fragmento de la URL. En la dirección antigua
  no se borra nada.
- Las direcciones antiguas están en `OLD_HOSTS` (`public/minibasket-stats/app.js`). La nueva se toma de la canonical
  de la app, que sale de `SITE_URL`.
- En un iPhone con la app instalada en la pantalla de inicio, el botón abre Safari y la app instalada desde allí puede
  no ver esos datos. En ese caso hay que usar *Ajustes → Exportar* en la antigua e *Importar* en la nueva.
- Cuando ya no haya visitas a las apps en la dirección antigua, se puede quitar `/minibasket-stats` y `/marcador` de la
  exclusión de la regla de `vercel.json` para redirigirlo todo.

Si algún día se deja Vercel, hay que actualizar el texto de privacidad de la app (`public/minibasket-stats/app.js`,
que menciona a Vercel como servicio de alojamiento) y subir la versión de la caché en `sw.js`.

## Recursos generados

- `public/img/app-*.webp`: capturas reales de la app con datos de ejemplo, en un viewport de 844×390 a 2x y en modo
  oscuro. Se rehacen con `node scripts/capturas.mjs` (Chromium de Playwright; los datos de ejemplo, con un equipo en
  el perfil mini y otro de solo marcador, se generan en el propio script y salen siempre iguales). Si cambian, revisa
  los textos alternativos (`heroAlt` del partido con jugadores, `growAlt` del marcador, `miniAlt` y `statsAlt` en
  `src/i18n/home.ts`).
- `public/minibasket-stats/demo.js`: el equipo de ejemplo de la app (Penya Verdinegra). Son las jugadas reales del
  Joventut Badalona en la Liga Endesa 2026-27 con nombres inventados para el equipo, los jugadores y los rivales
  (`FICCION` en `scripts/demo.mjs`). Se rehace con `node scripts/demo.mjs <carpeta>` para añadir las jornadas nuevas:
  descarga de acb.com la plantilla, la lista de partidos y el jugada a jugada de cada partido terminado (las páginas
  quedan en la carpeta y el jugada a jugada no se vuelve a pedir), y comprueba cada partido contra las estadísticas de
  la propia ACB antes de escribir nada. Si aparece un jugador o un rival nuevo, se para hasta que tenga un nombre
  inventado en `FICCION`. Después hay que subir la versión de la caché en `sw.js`.
- `public/og/og.png`: imagen para compartir (1200×630). Fuente: `assets-src/og.html`.
- `public/descargas/plantilla-estadisticas-baloncesto.pdf`: plantilla A4 apaisada. Fuente: `assets-src/plantilla-estadisticas.html`.

Fuentes incluidas: Rajdhani y Barlow, ambas con licencia SIL OFL 1.1 (`public/fonts/OFL-*.txt`).
