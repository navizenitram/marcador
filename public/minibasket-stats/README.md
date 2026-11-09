# Cantera Stats

_Estadísticas de baloncesto formativo._

SPA para recoger estadísticas de partidos de minibasket desde el móvil o la tablet, **en horizontal**.
Sin dependencias ni proceso de build: HTML + CSS + JS. Los datos se guardan en el `localStorage` del navegador.

## Funcionalidades

- **Varios equipos** (por ejemplo, uno por categoría): al abrir la app se elige con cuál recoger estadísticas; se cambia tocando el nombre del equipo arriba a la izquierda. Cada equipo tiene su plantilla, partidos, estadísticas y botones del partido.
- **Equipo**: alta de jugadores con dorsal y nombre (editar / eliminar), nombre del equipo y email por defecto.
- **Partidos**: crear partido (rival, fecha, **8 periodos** de minibasket o **4 cuartos** para categorías superiores), continuar, abrir, borrar.
  Al crear uno nuevo, si el equipo tiene partidos sin finalizar con jugadas, propone finalizarlos (solo los finalizados cuentan como victoria, derrota o empate en la temporada).
- **Partido en directo** (pensado para que quepa todo sin scroll):
  - Marcador arriba: los puntos propios se suman solos con los tiros anotados; botones **+1 / +2 / +3 / −1** para el rival.
  - Periodo actual (‹ P3 ›). Al pasar de periodo se abre el selector de quinteto.
  - Una fila por jugador en pista (máx. 5) con hasta 15 botones:
    `1✓ 1✗ 2✓ 2✗ 3✓ 3✗ | REC PÉR RO RD AS TAP TR FC FR`
    (recuperación, pérdida, rebote de ataque, rebote defensivo, asistencia, tapón, tapón recibido, falta cometida, falta recibida).
  - Los botones se eligen en **Ajustes** (cada entrenador activa solo lo que quiere apuntar).
  - Tocar el nombre del jugador → cambio con alguien del banquillo.
  - Aviso visual a las 4 faltas y jugador eliminado a las 5.
  - ↶ deshacer la última acción y listado de jugadas para borrar cualquier error.
  - Registro automático de los periodos jugados por cada jugador.
- **Estadísticas**: por partido o de temporada (totales o promedio por partido), parciales por periodo,
  líderes, tabla ordenable y valoración.
  - **Enviar**: email (`mailto:`), copiar o compartir (menú nativo del móvil). También descarga en **CSV**.
- **Ajustes**: botones del partido que se quieren usar (con vista previa), copia de seguridad y enlace de apoyo (Ko-fi).
- **Copia de seguridad**: exportar / importar todos los datos en JSON (útil para cambiar de dispositivo).
- **Modo claro / oscuro** (botón 🌙/☀️ en la barra superior o en el menú ☰ del partido). Se comparte con el marcador.
- PWA: se puede "Añadir a pantalla de inicio", funciona sin conexión y en Android se abre en horizontal y pantalla completa.
- La pantalla no se apaga mientras la app está abierta (Screen Wake Lock, en los navegadores que lo soportan).

### Valoración

```
VAL = (puntos + rebotes + asistencias + robos + tapones + faltas recibidas)
    − (tiros de campo fallados + tiros libres fallados + tapones recibidos + pérdidas + faltas cometidas)
```

Es la valoración de la ACB / Euroliga. Cada tiro fallado resta 1, sea de 1, 2 o 3 puntos.

## Privacidad

Cantera Stats no recoge, no envía y no rastrea ningún dato: no hay cuentas, cookies, publicidad ni analítica,
y no se cargan recursos de terceros (la fuente Rajdhani va incluida en `fonts/`, licencia SIL OFL 1.1).
Todo se guarda en el `localStorage` del navegador y solo sale del dispositivo si el usuario lo comparte o exporta.
El texto completo está en la propia app (`#/privacidad`, enlazado desde Ajustes y desde la pantalla de equipos).

## Desarrollo local

```bash
cd public/minibasket-stats
python3 -m http.server 8000
# abrir http://localhost:8000
```

También se sirve con el resto del sitio usando `npm run dev` desde la raíz del repositorio.

Los tests están en `tests/app/` y se lanzan con `npm test` desde la raíz (ver el README de la raíz).

## Despliegue

La app vive en `public/minibasket-stats/` y Astro la copia tal cual al compilar la web (ver el README de la raíz),
así que sigue disponible en `/minibasket-stats/` sin proceso de build propio. Las etiquetas canonical y Open Graph de
`index.html` llevan el marcador `%SITE_URL%`, que se sustituye al compilar.

## Estructura

```
index.html            Shell de la SPA
app.js                Lógica, vistas y almacenamiento
styles.css            Estilos (layout horizontal)
sw.js                 Service worker (modo sin conexión)
manifest.webmanifest  Manifest PWA (orientación horizontal)
icon.svg              Icono (y PNG para iOS/Android)
fonts/                Fuente Rajdhani incluida (sin Google Fonts)
```

Los datos viven en `localStorage` con la clave `mbstats.v1`. Borrar los datos del navegador los elimina:
exporta una copia de seguridad de vez en cuando.
