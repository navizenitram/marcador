# My Own Basketball Stats

_Estadísticas de baloncesto formativo._

SPA para recoger estadísticas de partidos de minibasket desde el móvil o la tablet, **en horizontal**.
Sin dependencias ni proceso de build: HTML + CSS + JS. Los datos se guardan en el `localStorage` del navegador.

## Funcionalidades

- **Varios equipos** (por ejemplo, uno por categoría): al abrir la app se elige con cuál recoger estadísticas; se cambia tocando el nombre del equipo arriba a la izquierda. Cada equipo tiene su plantilla, partidos, estadísticas y botones del partido.
- **Equipo de ejemplo**: la Penya Verdinegra, con su plantilla y 7 partidos jugada a jugada y con sus quintetos, para
  ver cómo quedan los partidos y las estadísticas antes de apuntar nada. Equipo, jugadores y rivales tienen nombres
  inventados. Sale en la pantalla de equipos como uno más, con su etiqueta, y no ocupa sitio en los datos hasta que se toca:
  entonces se copia con sus partidos finalizados y desde ahí es un equipo normal. Se puede ocultar o eliminar, y
  recuperar con un botón en la pantalla de equipos o en **Ajustes**. Los datos están en `demo.js` (`MBDemo`; el formato está comentado en `app.js`), que se
  genera con `node scripts/demo.mjs <carpeta>` (ver el README de la raíz).
- **Solo marcador** (la puerta de entrada): al crear un equipo se elige cómo se va a usar, **solo marcador** (sin
  plantilla; es la opción marcada por defecto) o **con jugadores** (estadística de cada uno). Un equipo sin jugadores lleva sus partidos como cualquier app de marcador: cada
  equipo en su mitad (el local a la izquierda) con su resultado en grande, los botones del perfil debajo del propio
  (**Marcador** por defecto: los botones verdes de tiro anotado y la falta cometida; se cambian en **Ajustes** como en
  cualquier equipo) y +1 / +2 / +3 debajo del rival, con su botón de falta (por dentro, la falta recibida del equipo,
  `fr`). Sin jugadores, en **Ajustes › Tiros** se elige **anotados y fallados** o **solo anotados** (`'miss'` en
  `team.hidden`; con jugadores no cuenta): con solo anotados, las estadísticas dan los tiros anotados sin porcentajes
  ni avanzadas (salvo que haya fallados apuntados). Los dos tienen **−1** para corregir los puntos del periodo que se ve, también
  de uno pasado (se vuelve a él con ‹); el del equipo propio se guarda como una corrección (`adj`, con sus puntos en
  `pts`) que cuenta en el resultado, los parciales, los puntos y la valoración. En **minibasket (8 periodos)** cada
  periodo empieza en 0: el número grande es el del periodo y el **total del partido** se ve siempre en la barra de
  arriba; con 4 cuartos, el grande es el total y al lado va el parcial. Junto al nombre de cada equipo, sus **faltas de
  equipo** en el periodo y, con 4, **Bonus** (ver Partido en directo). La estadística es de todo el equipo: en **Estadísticas** salen los totales, sin líderes, quintetos ni
  informes. Para ir a más basta con añadir jugadores en **Equipo**: los partidos nuevos ya son por jugador y los de
  marcador siguen como estaban (en la temporada, como la fila «Equipo (marcador)»).
  Por dentro, las jugadas del marcador van a un jugador interno del partido (`_equipo`, en `roster`), así que no cambia
  el formato de los datos; `team.board` solo recuerda que se creó como «Solo marcador» (al abrirlo va a los partidos).
- **Equipo**: alta de jugadores con dorsal y nombre (editar / eliminar), nombre del equipo y email por defecto.
- **Fases de la temporada**: en minibasket la temporada se divide en dos fases independientes; según la clasificación
  de la 1ª, en la 2ª se juega contra equipos nuevos en un nivel superior, el mismo o inferior. En **Equipo** se indica
  la fase en la que está el equipo, el nivel de cada fase (texto libre: «Nivel B», «Grupo 3»…) y si en la 2ª se sube,
  se baja o se sigue en el mismo nivel. Los partidos nuevos se apuntan en la fase actual.
- **Partidos**: crear partido (rival, fecha, **local o visitante** —obligatorio elegirlo—, **8 periodos** de minibasket o **4 cuartos** para categorías superiores), continuar, ver, editar (rival, fecha, campo y fase), borrar.
  Al crear uno nuevo, si el equipo tiene partidos sin finalizar con jugadas, propone finalizarlos (solo los finalizados cuentan como victoria, derrota o empate en la temporada).
  Un partido finalizado se abre **solo para consultarlo** (jugadas, quinteto y periodo bloqueados, con el aviso «Partido finalizado»); para apuntar o borrar algo hay que **reabrirlo** desde ese aviso o desde el menú.
  Cuando el equipo llega a la 2ª fase, la lista se agrupa por fase, con su nivel y su balance.
- **Partido en directo** (pensado para que quepa todo sin scroll):
  - Marcador arriba: los puntos propios se suman solos con los tiros anotados; botones **+1 / +2 / +3 / −1** para el rival.
    Como en cualquier marcador, el local va a la izquierda: de visitante, el rival sale primero (también en el resultado,
    los parciales y el texto para compartir). En los partidos antiguos sin campo elegido, el equipo propio sigue a la izquierda.
  - Rendimiento en directo: junto al marcador, la **valoración del equipo** y el **+/- del quinteto** en pista desde que
    entró (un cambio de periodo sin cambios no lo corta). En cada jugador, bajo sus puntos, su **valoración** y su **+/-**
    del partido (en verde si suma, en rojo si resta). El +/- necesita el registro de quintetos (partidos desde la v3).
  - Periodo actual (‹ P3 ›). Al pasar de periodo se abre el selector de quinteto.
  - Una fila por jugador en pista (máx. 5) con hasta 15 botones:
    `1✓ 1✗ 2✓ 2✗ 3✓ 3✗ | RO RD | REC PÉR AS TAP TR FC FR`
    (rebote de ataque, rebote defensivo, recuperación, pérdida, asistencia, tapón, tapón recibido, falta cometida, falta recibida).
    Los rebotes van justo después de los tiros; el de ataque (amarillo) y el defensivo (morado) tienen colores distintos.
  - Los botones se eligen en **Ajustes** con un **perfil** según la categoría y, si se quiere, botón a botón
    (cada entrenador activa solo lo que quiere apuntar):
    - **Marcador** (5 botones; solo en equipos sin jugadores, y el de los nuevos sin jugadores): tiros anotados y las
      faltas de los dos equipos.
    - **Escuela** (6 botones): solo puntos (tiros anotados y fallados).
    - **Pre-mini** (benjamín, 10 botones; el de los equipos nuevos): puntos, rebote con un solo botón, recuperación,
      pérdida y falta cometida.
    - **Mini** (alevín, 12 botones): lo de pre-mini con asistencias y faltas recibidas.
    - **Completo** (15 botones): todos, con rebote de ataque y defensivo.

    Si se cambia algún botón a mano y ya no coincide con ningún perfil, aparece como «Personalizado». En **Rebotes** se puede
    elegir **un solo botón** (REB) que no distingue ataque y defensa: cuenta en los rebotes totales (RT) y en la valoración.
  - Tocar el nombre del jugador → cambio con alguien del banquillo.
  - Las faltas de cada jugador se ven de un vistazo (un punto por falta bajo su dorsal), con aviso visual a las 4 y jugador eliminado a las 5.
  - **Faltas de equipo y bonus**: junto al resultado de cada equipo, sus faltas en el periodo. Las propias son las faltas
    cometidas (FC) de todos los jugadores; las del rival, las recibidas (FR). Como en las reglas FIBA (art. 41) y las de
    minibasket, con **4 faltas en un periodo** el equipo entra en **bonus** (en rojo): desde la 5ª, cada falta personal
    sobre un jugador que no está tirando son 2 tiros libres. La cuenta vuelve a 0 en cada periodo. Al apuntar una falta,
    el aviso dice cuántas lleva el equipo y si entra en bonus. Si el botón (FC o FR) no se usa, esa cuenta no se lleva.
  - ↶ deshacer la última acción y listado de jugadas para borrar cualquier error.
  - Registro automático de los periodos jugados por cada jugador.
  - **Tiempo de juego** (partidos con jugadores): 6 min por periodo en minibasket (8 periodos) y 10 min por cuarto
    (4 cuartos). Al empezar un periodo (y con el quinteto inicial) no se apunta nada: cuenta desde 0:00. En los cambios
    (tocar el nombre de un jugador, «Jugadores en pista» o «Añadir jugador») la ventana pide **el reloj del marcador**,
    que es de cuenta atrás (3:25 = quedan 3 min 25 s), y lo pide **una sola vez** aunque haya varios cambios a la vez.
    Tiene que estar dentro del periodo y no puede ir hacia atrás respecto al cambio anterior del mismo periodo. Si se
    vuelve a un periodo anterior con ‹, los cambios de ahí no apuntan tiempo (la pista es la de ahora). En
    **Estadísticas** sale la columna **MIN** (min:seg; en «Por partido», el promedio de los partidos con tiempo); los
    partidos sin registro de tiempo (anteriores a la v4) salen con «–» y no cuentan como 0. Se incluye en el CSV y en la tabla PNG.
- **Estadísticas**: por partido, de temporada o de cada fase (totales o promedio por partido), parciales por periodo,
  líderes, tabla ordenable y valoración. La temporada y cada fase muestran también el balance de local y de visitante.
  - **Evolución del marcador**: bajo los parciales, y con sus mismas columnas, la diferencia de puntos a lo largo del
    partido. Al pasar el dedo (o el ratón) se ve cómo iba el partido en ese momento.
  - **Temporada de un vistazo**: la diferencia de puntos de cada partido, del más antiguo al más reciente. Cada columna
    lleva a las estadísticas de su partido.
  - En la tabla, los ceros se atenúan, los tiros llevan su porcentaje con una barra y, si la tabla cabe a lo ancho,
    la cabecera se queda fija al bajar.
  - **Avanzadas** (botón «Básicas · Avanzadas»): acierto en el tiro con el triple (eFG%), acierto real en el tiro (TS%),
    balones perdidos por ataque (% de pérdidas) y tiros libres que provoca (TL/TC), con un glosario para familias.
    Se calculan con los totales; con menos de 3 intentos no se dan y con pocos (menos de 5 en un partido o de 15 en la
    temporada) se marcan con *. Si un botón no se apunta, se oculta la métrica que lo necesita.
  - **Quintetos** (y parejas o tríos): en la temporada o una fase, ranking de los que han jugado al menos un mínimo
    de periodos juntos (4 por defecto, se cambia en la propia tarjeta), por +/- por periodo, ataque o defensa; en un
    partido, los quintetos usados. Toca una fila para ver en qué partidos jugó. La tabla lleva el **+/-** de cada
    jugador. Solo cuentan los partidos con registro de quintetos (desde la v3). Sin reloj: si hay cambios dentro de un
    periodo, ese periodo se reparte según las jugadas apuntadas con cada quinteto («≈»).
  - **Informe del jugador**: en la temporada o una fase, toca el nombre de un jugador. Texto para la familia con
    resumen, tiro, evolución, +/- (con el dato del equipo y qué significa) y avanzadas explicadas, para enviar por
    email, copiar, compartir (WhatsApp) o descargar en .txt.
  - **Enviar**: email (`mailto:`), copiar o compartir (menú nativo del móvil). También descarga en **CSV** (con las
    avanzadas, el +/- y los rebotes sin distinguir (REB, ya incluidos en RT) en las últimas columnas).
  - **Imagen del partido**: en **Enviar**, un partido tiene además el botón **Imagen**: una tarjeta PNG de 1080 × 1350 con el
    resultado (el local a la izquierda), los parciales y los líderes (máximo anotador, mejor valoración, más rebotes y
    más asistencias; sin líderes en los partidos de marcador), con la dirección de la web en el pie. Se dibuja en un
    `<canvas>` (`card.js`, sin dependencias y sin conexión) con los mismos datos que el resumen de Estadísticas
    (`cardModel`, en `app.js`), y sale igual con el tema claro y con el oscuro. Se prepara al abrir **Enviar**, no al tocar
    el botón, porque `navigator.share` solo funciona justo después de un toque. En los móviles se comparte con el menú
    nativo (WhatsApp…); si el navegador no comparte archivos, o lo rechaza, se descarga el PNG. La temporada, las fases y
    el informe del jugador no tienen la tarjeta.
  - **Tabla PNG**: en **Enviar**, también para la temporada y cada fase, la **tabla de estadísticas completa** como imagen
    (`tableModel`, en `app.js`, con el dibujo en `card.js`). Lleva las mismas columnas, filas y orden que la pantalla
    (`tableLayout`, que comparten la tabla y su imagen) con lo que esté elegido al abrir **Enviar**: **Totales** o **Por
    partido**, **Básicas** o **Avanzadas** y la columna por la que se ordena. Mismos valores y mismo tono: ceros
    atenuados, quien no ha jugado apagado, valoración y +/- en verde o rojo, y los tiros con su porcentaje debajo. Debajo
    van el aviso de las avanzadas (*) y la leyenda de las abreviaturas, para que se entienda sin la app. El ancho
    depende de las columnas y el alto, de la plantilla. Se comparte o se descarga como la tarjeta
    (`estadisticas-2026-10-03-vs-Rival.png`, la misma base que el CSV, solo ASCII).
  - Si en un ámbito se mezclan rebotes de ataque y defensivos con los del botón único, la tabla añade la columna
    **REB** para que RO + RD + REB cuadre con RT.
- **Ajustes**: perfil y botones del partido que se quieren usar (con vista previa), rebotes en dos botones o en uno, copia de seguridad y enlace de apoyo (Ko-fi).
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

No hay cuentas, cookies ni publicidad, y no se cargan recursos de terceros (las fuentes Rajdhani y Barlow van incluidas
en `fonts/`, licencia SIL OFL 1.1, y los iconos se dibujan en el propio código).
Lo que se apunta se guarda en el `localStorage` del navegador y solo sale del dispositivo si el usuario lo comparte o exporta.
El texto completo está en la propia app (`#/privacidad`, enlazado desde Ajustes y desde la pantalla de equipos).

### Estadísticas de uso anónimas

`analytics.js` (`MBAnalytics`) cuenta unos pocos hitos para saber si la gente llega a usar la app. Los envía con
`fetch` a la API de Umami (`https://cloud.umami.is/api/send`), sin cargar su script, con el mismo ID de sitio que la
web, así que en Umami se ve el recorrido completo: de la portada (`abrir-app`) a finalizar partidos.

| Evento | Cuándo | Propiedades |
| --- | --- | --- |
| `app-abierta` | Cada vez que se carga la app | `instalada` (true/false), `equipos` (`0`, `1`, `2+`; sin el de ejemplo) |
| `equipo-creado` | Al crear un equipo | `modo`: `marcador` o `jugadores` |
| `ejemplo-abierto` | Al tocar el equipo de ejemplo por primera vez | — |
| `jugadores-anadidos` | Al añadir el primer jugador a un equipo (una vez por equipo) | `equipo`: `marcador` (se creó como solo marcador) o `jugadores` |
| `partido-empezado` | Al crear un partido | `tipo` (`marcador`/`jugadores`), `periodos` (8/4), `perfil` (id o `personalizado`) |
| `partido-finalizado` | Al finalizarlo (también al proponerlo al empezar otro), una vez por partido: reabrirlo y volver a finalizarlo no cuenta. No cuentan los del ejemplo | `tipo`, `periodos`, `n`: finalizados del equipo contando este (`1`, `2-5`, `6-10`, `11+`) |
| `compartir-resultado` | Al copiar, compartir, enviar por email o descargar las estadísticas, o al compartir o descargar la imagen de un partido o de la tabla (cerrar el menú de compartir sin elegir no cuenta) | `canal` (`copiar`, `nativo`, `email`, `texto`, `csv`, `imagen`, `tabla`), `que` (`partido`, `temporada`, `fase`, `informe`) |
| `pwa-instalada` | Evento `appinstalled` del navegador | — |

Reglas:

- **Nunca** se envían nombres, rivales, resultados ni estadísticas. `track()` descarta lo que no sea un texto corto,
  un número o un booleano, y la URL es siempre `/minibasket-stats/` (las rutas llevan ids de partidos).
- Solo envía si `scripts/postbuild.mjs` ha puesto el ID (`<meta name="mbs-analytics">`, de `PUBLIC_UMAMI_WEBSITE_ID`) y
  la app está en el dominio de la canonical. En local, en las vistas previas y en la dirección antigua no envía nada.
- Se desactiva en **Ajustes › Privacidad** o en la pantalla de **Privacidad**, a la que se llega sin tener equipo
  (`localStorage['mbstats.uso'] = 'off'`). Tampoco envía si el navegador manda Global Privacy Control o Do Not Track.
- Los hitos que solo cuentan una vez llevan una clave (`fin:<partido>`, `jug:<equipo>`) que se guarda en
  `localStorage['mbstats.uso.hitos']` (las 300 últimas).
- **Modo de depuración:** abrir la app con `?uso=debug` escribe en la consola cada evento con sus propiedades y si se
  enviaría o por qué no (dominio, ID, GPC/DNT, desactivado, ya contado). Sirve en local y en las vistas previas, donde
  no se envía nada. `?uso=normal` lo quita.
- Sin conexión, los eventos esperan en `localStorage['mbstats.uso.cola']` (30 como mucho) y se envían al volver la
  conexión o al abrir la app otra vez. Umami los registra con la hora del envío, no con la del hito.
- Un evento nuevo tiene que añadirse a la lista de `app.js`, a la de la pantalla de Privacidad y a esta tabla.

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
core.js               Núcleo de cálculo: funciones puras sin DOM (MBCore). Se carga antes que app.js
i18n.js, i18n/        Textos por idioma (MBI18n.t). Por ahora solo los nuevos, en castellano
demo.js               Equipo de ejemplo (generado por scripts/demo.mjs)
analytics.js          Estadísticas de uso anónimas (MBAnalytics): cola, envío a Umami y desactivación
app.js                Vistas, acciones y almacenamiento
styles.css            Estilos (layout horizontal)
sw.js                 Service worker (modo sin conexión)
manifest.webmanifest  Manifest PWA (orientación horizontal)
icon.svg              Icono (y PNG para iOS/Android)
fonts/                Fuentes incluidas (sin Google Fonts): Rajdhani para rótulos y cifras, Barlow para los textos
```

Los datos viven en `localStorage` con la clave `mbstats.v1`. Borrar los datos del navegador los elimina:
exporta una copia de seguridad de vez en cuando.

### Formato de los datos (versión 4)

La clave se sigue llamando `mbstats.v1`, pero el formato lleva su propia versión (`version`, hoy 4). Al abrir datos o
importar una copia de una versión anterior, `normalize()` los pasa al formato actual y los guarda.

- **v2:** varios equipos, fases y local/visitante.
- **v3:** registro de quintetos, para el +/- y los mejores quintetos. Cada partido tiene un contador `seq` que
  numera, en el orden en que ocurren, sus jugadas (`events[].seq`) y las fotos de quién está en pista
  (`lineups: [{ seq, period, on: [ids] }]`). Una foto se añade al cambiar el quinteto o el periodo, con los toques de
  siempre; si desde la anterior no se apuntó ninguna jugada, se corrige esa en vez de añadir otra. `lineupFrom` es
  el `seq` de la primera foto: los partidos anteriores a la v3 no lo tienen, y su +/- y sus quintetos no están
  disponibles. Un partido sin finalizar de antes de la v3 empieza a registrar en su siguiente cambio o periodo.

- **v4:** tiempo de juego. `shifts: [{ period, t, on: [ids] }]`, en el orden en que ocurren: quién está en pista desde
  el segundo `t` (**transcurrido**, no el del reloj) del periodo. Cada periodo empieza con una entrada `t = 0`; el resto
  son los cambios. Es un registro aparte de `lineups` porque aquel funde fotos sin jugadas entre medias. Solo lo llevan
  los partidos creados con la v4 (sin `shifts` no hay minutos). `MBCore.secondsPlayed(g)` suma los tramos: los
  periodos anteriores al último cuentan enteros y el último, hasta su final si el partido está finalizado y, si no,
  hasta el último cambio. Duración: `MBCore.periodSecs(g)` (360 con 8 periodos, 600 con 4; con otro número, sin tiempo).

La copia de seguridad es el mismo JSON con `exportedAt` (fecha de la exportación). Si una copia es de un formato más
nuevo que el de la app, se avisa antes de importarla.

## Diseño

- **Colores**: verde para el equipo propio y la acción principal, azul para el rival y ámbar para lo destacado. Están
  definidos como variables al principio de `styles.css`, una vez por tema (oscuro y claro).
- **Botones del partido**: cada familia de acciones tiene su color (`--c`), del que salen el fondo, el borde y el texto.
- **Iconos**: son SVG en línea (`ICONS` en `app.js`); para añadir uno basta con su trazo en una rejilla de 24.
- **Gráficos**: usan tonos propios (`--c-us`, `--c-them`, `--c-win`, `--c-loss`), elegidos para distinguirse también
  con daltonismo; además, la posición (arriba o abajo de la línea central) y el signo dicen lo mismo que el color.
