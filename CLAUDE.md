# CLAUDE.md

Guía para Claude Code en este repositorio. El detalle está en `README.md` y `public/minibasket-stats/README.md`.

## Qué es

Web de **Cantera Stats** (estadísticas de minibasket y baloncesto formativo). Tres piezas independientes:

- **Web SEO** (Astro, `src/`): portada en castellano (`/`) y catalán (`/ca/`), guías, plantilla y privacidad.
- **App de estadísticas** (`public/minibasket-stats/`): SPA en HTML + CSS + JS sin dependencias ni build. Lógica en `app.js`.
- **Marcador** (`public/marcador/index.html`): un solo HTML con el script dentro.

Las dos apps no se compilan: Astro copia `public/` tal cual y `scripts/postbuild.mjs` solo sustituye `%SITE_URL%`
en sus `index.html`.

## Comandos

```bash
npm ci                 # dependencias (Node 24 en producción; funciona con 22.23.4+)
npm test               # Vitest + jsdom, unos segundos. Pasarlo siempre antes de hacer commit
npm run build          # astro build + postbuild → dist/
npm run dev            # http://localhost:4321
npm run test:e2e       # Playwright: compila, sirve dist/ y prueba en Android (Chrome) e iPhone (WebKit)
npx playwright test --project=android --trace off   # solo Chrome (en la nube de Claude Code no hay WebKit)
```

## Convenciones

- **Todo en castellano**: textos de la interfaz, comentarios, tests y mensajes de commit (imperativo, sin prefijo,
  p. ej. «Marcador: mantener la pantalla encendida mientras está abierto»).
- **Sin dependencias en las apps**: nada de npm, frameworks ni recursos de terceros en `public/minibasket-stats/`
  (la promesa es «sin seguimiento» y sin conexión; las fuentes van incluidas). El marcador sí carga Chart.js y Google Fonts.
- `app.js` es un **script clásico**, no un módulo: sus funciones son globales y los tests las llaman así
  (`tests/helpers/app.js`). No convertirlo en módulo.
- Datos de la app en `localStorage`, clave `mbstats.v1` (con migración v1→v2 en `app.js`). Tema compartido entre las
  dos apps en `mb_theme`. Cualquier cambio de formato necesita migración y tests en `tests/app/datos.test.js`.
- **Service worker**: al cambiar cualquier archivo de la app, subir la versión `CACHE` de
  `public/minibasket-stats/sw.js` (`mbstats-vN`). Si se añade un archivo, incluirlo en `ASSETS`.
- **Textos de la portada** en `src/i18n/home.ts`: castellano y catalán deben tener las mismas claves y estructura
  (lo comprueba `tests/web/web.test.js`).
- La URL del sitio sale solo de `site.config.mjs` (`SITE_URL`). En las apps se usa el marcador `%SITE_URL%`.
- Diseño pensado para **móvil en horizontal**: los 5 jugadores con sus 15 botones deben caber sin scroll
  (lo prueban los e2e).

## Tests

- Unitarios en `tests/` (`app/`, `marcador/`, `web/`). Cargan el `index.html` y el JS reales en jsdom sin modificarlos;
  una excepción de la app hace fallar el test. Chart.js se sustituye por un doble.
- E2E en `e2e/`: cortan cualquier petición externa y fallan ante errores de JavaScript en la página.
- Al corregir un fallo, añadir un test que lo reproduzca. No desactivar ni saltarse tests.
- CI: `.github/workflows/tests.yml` pasa unitarios y e2e en cada push.
