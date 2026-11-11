# Plan: app de Android en Google Play

> Estado: **fase 1 hecha** (ver «Avance» al final). Fecha: 11/11/2026 · Rama: `claude/inspiring-keller-2iv7lf`

## Enfoque: Trusted Web Activity (TWA)

No se reescribe la app. Se publica en Google Play la misma PWA (`/minibasket-stats/`) dentro de una **Trusted Web
Activity**: una app Android mínima que abre la web en Chrome, a pantalla completa y sin barra de direcciones. Es la
forma oficial de Google de llevar una PWA a la tienda.

| Opción | Esfuerzo | A favor | En contra |
| --- | --- | --- | --- |
| **TWA (Bubblewrap o PWABuilder)** ✅ | 1–2 días | Un solo código. Cada despliegue llega a la app sin publicar versión. Usa el almacenamiento de Chrome para el dominio: quien ya usa la PWA en Chrome ve sus equipos (comprobarlo en la fase 3) | La primera apertura necesita conexión |
| Capacitor (web dentro de un WebView) | 3–5 días | Funciona sin red desde la instalación; APIs nativas | Datos en otro almacenamiento: hay que pasarlos con Exportar → Importar. Cada cambio exige subir versión a Play |
| App nativa (Kotlin) | Semanas | — | Duplicar `core.js`, `app.js` y los tests |

**Paquete:** `com.myownbasketballstats.app`. Está en `public/.well-known/assetlinks.json` y en `ANDROID_PACKAGE`
(`public/minibasket-stats/app.js`); un test comprueba que coinciden. Se puede cambiar hasta la primera subida a Play;
después, no.

**URL de arranque de la app de Android:** `https://myownbasketballstats.com/minibasket-stats/?origen=android`.

## Fases

### 0. Cuenta de Google Play Console (la hace el dueño del proyecto)
1. Alta en Play Console: pago único de 25 USD y verificación de identidad.
2. A las cuentas personales nuevas se les pide una **prueba cerrada con al menos 12 testers durante 14 días** antes
   de publicar en producción (comprobarlo en la consola al darse de alta: la regla puede cambiar).
3. Crear la app con el paquete `com.myownbasketballstats.app` y activar **Play App Signing**.

### 1. Preparar la web ✅
- `public/.well-known/assetlinks.json` (Digital Asset Links). Las huellas (`sha256_cert_fingerprints`) están vacías
  hasta tener las claves: la de firma de Play (*Play Console → Prueba y publicación → Integridad de la app → Firma de
  apps*) y la de subida. Mientras estén vacías, la app de Android se abriría con la barra de direcciones.
- La app reconoce que se abre desde la app de Android (`?origen=android` o referrer `android-app://<paquete>/`) y lo
  recuerda en `sessionStorage` (no en `localStorage`, que comparte con Chrome). En ese caso:
  - no ofrece «Añádela a tu pantalla de inicio»;
  - no enlaza a Ko-fi (Ajustes, estadísticas y privacidad): la política de pagos de Google Play es estricta con los
    enlaces a pagos externos y no merece la pena arriesgar el rechazo;
  - la privacidad de la app explica qué hace Google Play.
- La página `/privacidad/` de la web (la URL que pide la ficha de Play) también menciona Google Play.
- Caché del service worker: `mbstats-v24`.
- Tests: `tests/app/android.test.js`, `tests/web/web.test.js` (formato de `assetlinks.json`) y dos e2e (el archivo se
  sirve como JSON sin redirección tras el build, y la app con `?origen=android` funciona sin conexión y sin Ko-fi).

### 2. Generar el proyecto Android
```bash
npx @bubblewrap/cli init --manifest https://myownbasketballstats.com/minibasket-stats/manifest.webmanifest
npx @bubblewrap/cli build   # .aab para Play y .apk para probar
```
- En `android/` de este repo (`twa-manifest.json` y el proyecto Gradle). **La keystore no se sube nunca** (añadirla
  a `.gitignore`) y se guarda una copia en un lugar seguro.
- Configuración: paquete `com.myownbasketballstats.app`, URL de arranque con `?origen=android`, `orientation:
  landscape`, `display: fullscreen`, colores `#06080a`, iconos `icon-512.png` e `icon-maskable-512.png`,
  `fallbackType: customtabs`.
- Copiar a `assetlinks.json` la huella de la clave de subida (`keytool -list -v -keystore …`) y la de Play App Signing.
- Alternativa sin terminal: PWABuilder (pwabuilder.com) genera lo mismo.

### 3. Probar en un Android real (`adb install app-release-signed.apk`)
- [ ] No aparece la barra de direcciones (las huellas de `assetlinks.json` son correctas).
- [ ] Horizontal, pantalla completa y la pantalla no se apaga.
- [ ] En modo avión, tras abrirla una vez, sigue funcionando.
- [ ] Aparecen los datos que ya había en la PWA de Chrome.
- [ ] Descargas (CSV, JSON, `.txt`), Importar, Compartir (WhatsApp) y Email.
- [ ] No aparecen «Instalar» ni Ko-fi.

### 4. Ficha de Play Store
- Textos: a partir de la portada (`src/i18n/home.ts`).
- Capturas: `public/img/app-*.webp` exportadas a PNG o JPG. Gráfico destacado 1024×500 a partir de `assets-src/og.html`.
- Privacidad: `https://myownbasketballstats.com/privacidad/`.
- Seguridad de los datos: no se recogen ni se comparten datos.
- Público objetivo: adultos (entrenadores). Marcar menores de 13 años activa la política de familias.
- Categoría: Deportes.

### 5. Publicar
Prueba interna → prueba cerrada (12 testers, 14 días) → producción.

### Después
- Los cambios de la web llegan solos a la app. Solo hay que subir versión si cambian el icono, la orientación, las
  huellas o cuando Google exija subir el `targetSdk` (`bubblewrap update`, más o menos una vez al año).
- Si se pasa a Cloudflare, comprobar que `/.well-known/assetlinks.json` se publica: algunas herramientas de
  despliegue ignoran las carpetas que empiezan por punto.
- Insignia «Disponible en Google Play» en la portada, con su evento de Umami.

## Avance

| Fase | Estado |
| --- | --- |
| 1 — Preparar la web | **Hecha** |
| 0 — Cuenta de Play Console | Pendiente (dueño del proyecto) |
| 2 a 5 | Pendientes |
