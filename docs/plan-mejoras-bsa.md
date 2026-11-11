# Plan de mejoras — My Own Basketball Stats

> Estado: **aprobado el 11/11/2026**. Para las preguntas abiertas se toman de momento las propuestas del plan.
> Avance: **fases 0, 1A, 2, 1B, 4 y 3 (borrador) hechas** (ver «Avance» al final). Desde el 11/11 se aceptan cambios que rompan la
> compatibilidad mientras no haya masa crítica de usuarios. No se ha escrito código de producción.
> Fecha: 11/11/2026 · Rama: `claude/stoic-hopper-4rsg3g`
> Las referencias `archivo:línea` apuntan al commit `3454784`.

## Decisiones tomadas (11/11/2026)

| Tema | Decisión | Efecto en el plan |
| --- | --- | --- |
| Informe del jugador | **Texto por email** (y copiar o compartir), no PDF | Fase 4 rehecha; el PDF pasa al anexo A |
| Unidad de juego | **Periodos**, sin minutos ni tiempo. Es una app no profesional | Sin estimación por reloj ni duración del periodo (§2.2) |
| Partidos antiguos | **«No disponible»** para +/- y quintetos | Sin reconstrucción por `played` (§2.3) |
| +/- en el informe para familias | **Sí, muy bien explicado** | Texto propuesto en la fase 4 |
| Portugués | **pt-PT** | Fase 5 |
| Umami en la web | **Activo** | La comparativa dice «sin analítica en la app», no «sin rastreo» en general (fase 3) |
| Prioridad | **Encontrar qué 5 jugadores juntos son el mejor quinteto** | La fase 1B es el centro del plan (§3) |

Sobre «registrar qué jugadores han participado en cada cuarto»: **ya se hace**. `g.played` guarda los periodos
de cada jugador y alimenta la columna de periodos jugados. Pero eso no basta para los quintetos: si en un periodo
juegan 7 jugadores, `played` no dice qué 5 estaban juntos cuando se anotó cada canasta. Por eso sigue haciendo
falta el registro de quintetos (§2.1), que no añade ningún toque.

---

## 0. Resumen

1. **La landing vive en este mismo repo** (Astro, `src/`). La app es un SPA sin build en `public/minibasket-stats/`.
   Las mejoras 3 y 5 (parte landing) **no** necesitan un repo aparte, pero se planifican como tareas separadas.
2. **Hoy no se puede calcular el +/- ni los quintetos.** Los cambios de jugadores no se apuntan como eventos:
   solo se guarda quién está en pista *ahora* (`g.onCourt`) y en qué periodos ha estado cada jugador (`g.played`).
   Cambio mínimo: un registro aparte de quintetos (`g.lineups`), que se rellena con los toques que ya existen. En los
   partidos antiguos, +/- y quintetos salen como **«no disponible»** (decidido).
3. **La app no mide tiempo de juego.** No hay reloj en la app ni en el marcador, solo *periodos jugados*.
   Decidido: todo se mide en **periodos**. Si hay cambios dentro de un periodo, ese periodo se reparte entre los
   quintetos según las jugadas apuntadas en cada tramo, sin reloj.
4. **La app solo está en castellano.** El catalán solo está en la portada de la web. Las guías, la plantilla, la
   privacidad, la app y el marcador están en castellano. La mejora 5 parte de un idioma, no de dos.
5. **Informe del jugador: texto por email en vez de PDF** (decisión tuya del 11/11). Reutiliza lo que ya existe
   (`buildText` y el modal «Enviar» con email, copiar y compartir). No añade dependencias ni peso, y funciona sin
   conexión. La evaluación del PDF queda en el anexo A por si se retoma.
6. **Orden recomendado:** 0 (cimientos) → **1A (registrar quintetos, sin interfaz, cuanto antes)** → 2 → **1B (mejor
   quinteto, la mejora principal)** → 4 → 5 → 3.
   Es tu orden con dos cambios: el registro de quintetos va primero porque **los datos solo se acumulan desde que se
   publique**, y estamos a mitad de temporada. Además, la base de i18n (`t()`) entra en la fase 0 para que las
   mejoras 1, 2 y 4 nazcan ya traducibles.

---

## 1. Hallazgos del paso 0

### 1.1 Stack y estructura

| Parte | Ruta | Tecnología |
| --- | --- | --- |
| Portada ES/CA, guías, plantilla, privacidad | `src/` | Astro 7 + `@astrojs/sitemap`, HTML estático |
| App de estadísticas | `public/minibasket-stats/` | SPA en JS clásico (un solo `app.js`, 2367 líneas, ~113 KB), sin dependencias ni build. Astro la copia tal cual |
| Marcador | `public/marcador/index.html` | HTML con el script dentro |
| Tests unitarios | `tests/` | Vitest + jsdom. `tests/helpers/app.js` carga el `index.html` y el `app.js` reales en jsdom y llama a sus globales (`app.fn.score…`) |
| Tests e2e | `e2e/` | Playwright: Pixel 7 (Chrome) e iPhone 13 (WebKit), en horizontal, sobre el build |
| CI | `.github/workflows/tests.yml` | Unitarios y e2e en cada push |
| Despliegue | `vercel.json` (actual), `wrangler.jsonc` | Estático. `scripts/postbuild.mjs` sustituye `%SITE_URL%` |

En la app, `app.js` lo hace todo: modelo, cálculo, vistas (plantillas de texto), router por hash, acciones y
exportación. Las funciones de cálculo ya son casi puras (`blankLine`, `addEvent`, `finish`, `score`,
`periodScores`, `playerLines`, `scoreFlow`), pero están en el mismo script que el DOM. `seasonRows` usa `team()`,
que depende del estado global.

### 1.2 Modelo de datos

Hay una sola clave de `localStorage`, `mbstats.v1` (`app.js:7`), con `version: 2`:

```jsonc
{
  "version": 2,
  "currentTeamId": "t1",
  "teams": [{ "id", "name", "email", "players": [{ "id", "number", "name" }],
              "hidden": ["blkr"],        // botones desactivados en Ajustes (afecta a TODOS sus partidos)
              "phase": 1, "levels": ["", ""], "move": "" }],
  "games": [{
    "id", "createdAt", "date", "opponent", "teamId", "teamName",
    "periods": 8, "period": 3, "finished": false, "phase": 1, "venue": "home",
    "roster":  [{ "id", "number", "name" }],     // copia de la plantilla al crear el partido
    "onCourt": ["p4", "p7", …],                  // SOLO el estado actual
    "played":  { "p4": [1, 2], … },              // conjunto de periodos jugados por jugador
    "events":  [{ "id", "ts", "period", "type", "pid" },      // acción propia
                { "id", "ts", "period", "type": "opp", "pts" }] // puntos del rival (+1/+2/+3/−1)
  }]
}
```

### 1.3 Persistencia

- `load()` lee y pasa por `normalize()`. Si `normalize` cambia algo, lo guarda en el momento (`app.js:205-219`).
  `save()` hace `JSON.stringify(db)` completo en cada cambio (`app.js:221`).
- `normalize()` (`app.js:106-198`) migra de v1 a v2, sanea los identificadores (`SAFE_ID`) y **conserva los campos
  desconocidos** de partidos y eventos. Conserva también los tipos de evento desconocidos si son un nombre simple. Esto
  es importante para la compatibilidad hacia atrás (§5).
- Service worker `sw.js`: red primero y caché `mbstats-v19` con una lista fija de `ASSETS`. Cada archivo nuevo tiene
  que entrar en esa lista, y en cada versión hay que subir el número de la caché.

### 1.4 Cómo se generan los informes actuales

- `statsData(arg)` (`app.js:1048`) da el partido (`gameRows`) o la temporada o fase (`seasonRows` + `totalsRow`, y
  `averageRow` para «Por partido»).
- `viewStats` pinta un resumen (`gameSummary` con parciales y `flowRow`, o `seasonSummary` + `seasonTrend`), los
  líderes (`leaders`) y la tabla ordenable (`statsTable`, columnas en `COLS`, `app.js:1017`).
- Todo se recalcula en cada `render()`, sin memoizar. Con el tamaño actual de los datos no es un problema.

### 1.5 Exportación y copia de seguridad

| Salida | Función | Formato |
| --- | --- | --- |
| Texto (email, copiar, compartir) | `buildText` / `shareStats` (`app.js:2188`) | Texto plano. `navigator.share({ title, text })` |
| CSV | `downloadCSV` (`app.js:2247`) | `;` como separador, coma decimal, BOM UTF-8, cabeceras fijas en castellano |
| Copia de seguridad | `actions['export-json']` (`app.js:1655`) | Volcado de `db` tal cual (`version: 2`). Sin fecha ni versión de la app |
| Importar | `importJSON` + `isBackup` (`app.js:2015-2032`) | Reemplaza todo y pasa por `normalize` |
| Traspaso entre dominios | `encodeTransfer` (`app.js:2110`) | `db` comprimido en `#traspaso=…`, con un límite de 1,5 MB |

> Inconsistencia que ya existe: en la tabla, **`PER` = periodos jugados** y `PÉR` = pérdidas (`app.js:1021, 1033`).
> En el CSV, en cambio, **`PER` = pérdidas** y los periodos van como `Periodos` (`app.js:2250`). En la fórmula de
> pérdidas por posesión que propones, PER vuelve a significar pérdidas, y en la jerga «PER» es además el índice de
> Hollinger. Propongo resolverlo en la fase 5 (abreviaturas por idioma) y no usar «PER» en los textos nuevos.

### 1.6 Landing: ¿en este repo?

Sí. `src/pages/index.astro` (ES) y `src/pages/ca/index.astro` (CA) usan `src/components/Home.astro` con los textos
de `src/i18n/home.ts`. El resto de componentes elige el idioma con ternarias (`lang === 'ca' ? … : …`) en
`Header`, `Footer`, `ActionLegend` y `Base`. Las guías, la plantilla y la privacidad solo existen en ES (el pie en CA
las marca como «(castellà)»). `Base.astro` ya admite `alternates` (hreflang) y `jsonLd`. `Guide.astro` genera
`Article` + `BreadcrumbList`.

### 1.7 ¿El log de eventos permite saber qué 5 estaban en pista en cada canasta? — **No**

Evidencia:

- Los cambios modifican `g.onCourt` **sin dejar ningún evento**: `toggle-court` (`app.js:1733-1740`), `clear-court`
  (`:1741`), `swap-in` (`:1753-1763`) y `bench-out` (`:1764-1769`). Ninguno añade nada a `g.events`.
- `g.onCourt` solo guarda el estado actual. Al cambiar de periodo (`actions.period`, `:1710`) se cambia `g.period`
  y se abre el selector de quinteto, también sin evento.
- Lo único histórico es `g.played[pid]`, que es un *conjunto* de periodos sin orden ni momento. `markPlayed()`
  (`:1580`) apunta a **todos** los que están en pista en el periodo actual en tres casos: con cada acción propia
  (`record`, `:1602`), con cada punto del rival (`recordOpp`, `:1626`) y al cerrar el selector de quinteto o entrar
  alguien de cambio (`closeModal`, `:1427`; `swap-in`, `:1761`).
- Los eventos sí guardan el orden: se añaden al final de `g.events` con `ts: Date.now()` y `period`. `undo` toma el
  `ts` máximo (`:1698`). Sabemos *cuándo* se anotó cada punto, pero no *quién estaba en pista*.
- Lo único que sabemos de cada acción propia es que su autor estaba en pista. De los puntos del rival no sabemos nada.

**Partidos antiguos: se descarta la reconstrucción.** Técnicamente se podía recuperar una parte: un periodo con
exactamente 5 jugadores en `played` tuvo el mismo quinteto en todas sus jugadas. Pero decidiste «no disponible», que
es más simple y no da datos a medias. Quedaría como mejora futura, sin cambios en los datos, si algún día interesa.

### 1.8 Premisas del encargo que el código no confirma

| Premisa | Realidad | Consecuencia |
| --- | --- | --- |
| «Registramos tiempo de juego por jugador» | Solo **periodos jugados** (`g.played`, columna `PER`). No hay reloj | Decidido: todo en periodos, sin minutos (§2.2) |
| «ES/CA en app y landing» | La app y el marcador solo están en ES. En la web, CA solo tiene la portada | La mejora 5 incluye traducir la app al **catalán** |
| «Sin analítica» | Es cierto en la **app**. La **web** carga Umami (sin cookies), que **está activo** en producción (`Base.astro`) | La comparativa y los textos de la web solo pueden decir «sin analítica» de la **app** (fase 3) |
| Las métricas avanzadas siempre tienen datos | Cada equipo puede **desactivar botones** (`t.hidden`). Sin `t1` no hay TLI, y sin `lost` no hay pérdidas | Hay que ocultar la métrica cuando falta un dato, no mostrar un 0 (§2.4) |
| Los quintetos aparecen solos | Solo si quien apunta registra los cambios en la app | Indicadores de cobertura y avisos (§4) |

---

## 2. Decisiones de modelo de datos

### 2.1 Registro de quintetos: `g.lineups` + `seq`

Una lista **aparte** de `g.events`, para no tocar `undo`, el listado de jugadas, el marcador, la evolución ni el CSV:

```jsonc
"seq": 57,                         // contador del partido: ordena eventos y quintetos entre sí
"lineupFrom": 31,                  // primer seq con registro de quintetos (lo anterior: «no disponible»)
"lineups": [
  { "seq": 31, "period": 1, "on": ["p4","p7","p10","p12","p15"] },
  { "seq": 44, "period": 1, "on": ["p4","p7","p10","p12","p21"] },
  { "seq": 52, "period": 2, "on": ["p4","p7","p10","p12","p21"] }  // cambio de periodo
],
"events": [{ "id", "seq": 45, "ts", "period", "type", "pid" }, …]
```

- **Una foto completa** del quinteto, no diferencias (entra X, sale Y). Es más robusto: un fallo no se arrastra.
- **Cuándo se escribe:** después de cada cambio de `onCourt` (`toggle-court`, `clear-court`, `swap-in`, `bench-out`)
  y de cada cambio de periodo. Son los mismos toques que hoy: **ninguno extra**.
- **Agrupación:** si la última foto es del mismo periodo y no hay ningún evento con un `seq` mayor, se **reemplaza** en
  vez de añadir otra. Así, tocar 10 veces en el selector de quinteto deja una sola entrada, y corregir un quinteto
  antes de la primera jugada no ensucia los datos.
- **`seq`:** un entero creciente por partido que ordena jugadas y quintetos entre sí. No se usa el reloj (`ts`) para
  ordenar porque puede empatar o ir hacia atrás si cambia la hora del móvil. Los quintetos no guardan `ts`: decidimos
  no medir tiempo.
- **Quinteto de una jugada:** la última foto con `seq` menor que el de la jugada.
- **Al cargar en v3** (`normalize`): los eventos sin `seq` reciben uno en el orden de la lista. Un partido sin
  `lineupFrom` es antiguo (no disponible). `normalize` no se inventa ninguna foto: un partido que estaba **a medias**
  durante la actualización (o uno finalizado que se reabre) empieza a registrar en su **siguiente cambio o periodo**.
  Lo jugado antes no cuenta.
- **Agrupación también entre periodos** (decidido al implementar): si desde la última foto no se apuntó ninguna
  jugada, se corrige esa foto aunque cambie el periodo. Así, cada foto salvo la última tiene al menos una jugada y no
  quedan periodos con un quinteto «vacío».
- **Tamaño:** de 10 a 40 fotos por partido, unos 80 bytes cada una, más unos 10 bytes de `seq` por evento. Son unos
  3–5 KB por partido (+20–25 %). Hay margen de sobra en `localStorage` y en el traspaso (lo comprobará un test).

He descartado la alternativa de guardar el quinteto *dentro de cada evento*. Es más simple de leer, pero pesa
3–4 veces más y no registra los quintetos que juegan un tramo sin que se apunte nada.

### 2.2 Unidad: periodos

Decidido: **no hay minutos ni tiempo.** La exposición de un quinteto se mide en periodos:

1. **Periodo con un solo quinteto** (lo habitual en minibasket): ese quinteto suma **1 periodo**.
2. **Periodo con cambios dentro:** el periodo (que vale 1) se reparte entre sus tramos **en proporción a las jugadas
   apuntadas** en cada uno (las propias y los puntos del rival). Es lo más parecido a «cuánto jugaron» que tenemos sin
   reloj. Si en el periodo no se apuntó nada, se reparte a partes iguales. Esos valores se muestran con «≈»
   («≈ 2,5 periodos»).
3. **Ranking por +/- por periodo**, con un mínimo de periodos para entrar (§3, fase 1B).

Descartado: un cronómetro. Añade toques y no aporta en una app no profesional.

### 2.3 Partidos antiguos: «no disponible»

| Dato | Partidos con registro (v3) | Partidos antiguos, o tramo anterior a la actualización |
| --- | --- | --- |
| +/- por jugador | Exacto | «No disponible» |
| Quintetos | Exacto | No cuentan |
| Temporada o fase | Suma solo los partidos con registro | Aviso: «+/- y quintetos con N de M partidos (los anteriores a esta versión no tienen datos)» |

No se modifican los datos guardados.

### 2.4 Botones activos de cada partido: `g.hidden`

Hoy `t.hidden` es del equipo y se aplica también a los partidos ya jugados. Para saber si una métrica tiene datos:

- Al crear un partido se copia `t.hidden` en `g.hidden`.
- Un dato *se apuntó* en un ámbito si en algún partido de ese ámbito el botón estaba activo (o, en un partido
  antiguo sin `g.hidden`: si el botón está activo hoy o hay alguna jugada de ese tipo).
- Una métrica se **oculta** si le falta un dato (por ejemplo, TS% sin tiros libres), en vez de dar un valor engañoso.

### 2.5 Formato de la copia: versión 3

- `normalize()` pasa de v2 a v3: añade `seq`, `lineups`, `lineupFrom` y `g.hidden`, y valida `lineups` (identificadores
  seguros, como mucho 5 jugadores sin repetir, periodo entero, `seq` entero y ordenado). Descarta lo que no es válido.
- Exportar añade `exportedAt` y `app` (la versión de la app). Siguen siendo campos inofensivos para versiones antiguas.
- Importar una copia con `version > 3` muestra el aviso «se creó con una versión más nueva; actualiza la app antes de
  importarla», y deja importarla bajo tu responsabilidad.
- La matriz de compatibilidad está en §5.

### 2.6 Separar la lógica pura: `core.js`

Para hacer TDD sin jsdom, las funciones de cálculo pasan a `public/minibasket-stats/core.js`. Es un script clásico
(se mantiene sin build) que expone un objeto global `MBCore`, y en los tests se carga con `vm`. `app.js` conserva
declaraciones `function score(g) { return MBCore.score(g); }` para que los tests actuales (`app.fn.score`) sigan
funcionando sin cambios. Lo nuevo (+/-, quintetos, avanzadas, modelo del informe, i18n de números) nace en
`core.js` (el modelo del informe incluido).

---

## 3. Fases

Tamaño: **S** ≈ ½–1 día, **M** ≈ 2–3 días, **L** ≈ una semana o más, para una persona con el contexto del repo.
En cada tarea, primero se escriben los tests, se comprueba que fallan y después se implementa.

### Fase 0 — Cimientos (S/M, sin cambios visibles)

| # | Tarea | Archivos | Tests primero | Aceptación |
| --- | --- | --- | --- | --- |
| 0.1 | Sacar el núcleo de cálculo a `core.js` (`EV_PTS`, `blankLine`, `addEvent`, `finish`, `score`, `periodScores`, `playerLines`, `scoreFlow`) y delegar desde `app.js` | `core.js` (nuevo), `app.js`, `index.html`, `sw.js` | `tests/helpers/core.js` (carga con vm). Los tests de `tests/app/estadisticas.test.js` contra `MBCore` sin DOM | `npm test` y e2e en verde sin cambiar ningún test. `core.js` no toca `window`, `document`, `db` ni `ui` (un test lo carga en un contexto sin DOM) |
| 0.2 | El helper `openApp` ejecuta los `<script src>` de `index.html` en orden | `tests/helpers/app.js` | Un test que añade un script de prueba y comprueba que se ejecuta | Los tests existentes siguen en verde |
| 0.3 | Un test de la PWA que comprueba que todo script, CSS o fuente referenciado está en `ASSETS`. Subir `CACHE` | `tests/web/web.test.js`, `sw.js` | Falla si `core.js` no está en `ASSETS` | Funciona sin conexión con los archivos nuevos (e2e `funciona sin conexión` en verde) |
| 0.4 | Base de i18n: `i18n.js` con `t(key, vars)`, plural (`Intl.PluralRules`), `fmtNum`, `fmtPct` y `fmtDate` (`Intl`) y el diccionario `i18n/es.js` **solo con las claves nuevas**. Lo que ya existe no se extrae todavía | `i18n.js`, `i18n/es.js` | Interpolación, plurales, `0,5` y `48 %` en `es`, clave que falta → se ve la clave y un aviso en consola | Las fases 1, 2 y 4 usan `t()` para todo texto nuevo |
| 0.5 | Copia v3: `exportedAt`, `app` y aviso al importar una versión más nueva | `app.js` | `tests/app/datos.test.js`: exportar incluye los campos nuevos e importar `version: 4` muestra el aviso | Las copias v1 y v2 de los fixtures se importan igual que hoy |

### Fase 1A — Registrar quintetos sin cambiar la interfaz (M) · **publicar cuanto antes**

| # | Tarea | Archivos | Tests primero | Aceptación |
| --- | --- | --- | --- | --- |
| 1A.1 | `normalize` v2→v3: `seq` para los eventos, `lineups`, `lineupFrom` y validación | `app.js` | `datos.test.js`: un v2 sin quintetos, un partido a medias, `lineups` manipulados (ids raros, 6 jugadores, repetidos, `seq` desordenado) y que sea idempotente (normalizar dos veces da lo mismo) | Los datos v2 guardados siguen cargando. `load()` vuelve a guardar una sola vez |
| 1A.2 | `logLineup(g)` con agrupación, llamado desde las acciones de cambio y de periodo. `record` y `recordOpp` asignan `seq` | `app.js` | `flujos.test.js`: crear un partido, elegir quinteto, hacer un cambio, cambiar de periodo y sentar sin cambio dan la lista de `lineups` esperada. 10 toques en el selector sin jugadas = 1 entrada. **Deshacer tras un cambio deshace la última jugada, no el cambio** | El e2e «un partido completo» pasa **sin un solo toque más** |
| 1A.3 | `MBCore.lineupAt(g, seq)` → quinteto de una jugada, o `null` si es anterior a `lineupFrom` | `core.js` | Fixtures: el quinteto de cada jugada en un partido con cambios. Partido antiguo → `null`. Partido a medias durante la actualización → `null` hasta `lineupFrom` | Funciones puras con cobertura del 100 % |
| 1A.4 | Tamaño | — | Una temporada sintética de 30 partidos × 250 jugadas: el JSON cabe y `encodeTransfer` < `MAX_TRANSFER` | El aumento del tamaño es < 35 % |

### Fase 2 — Estadísticas avanzadas (M) · sin cambios de modelo

Fórmulas (TC = T2+T3, A = anotados, I = intentados):

| Clave | Fórmula | Nombre para familias (ES, propuesta) | Término técnico | Explicación corta |
| --- | --- | --- | --- | --- |
| `efg` | (TCA + 0,5·T3A) / TCI | **Acierto en el tiro, con el triple** | eFG% (acierto efectivo) | Como el porcentaje de tiro normal, pero un triple anotado cuenta como canasta y media, porque vale un punto más |
| `ts` | PTS / (2·(TCI + 0,44·TLI)) | **Acierto real en el tiro** | TS% (*true shooting*) | Junta tiros de campo y tiros libres: cuántos puntos saca de cada intento comparado con lo que sacaría si los metiera todos de 2 |
| `tov` | PÉR / (TCI + 0,44·TLI + PÉR) | **Balones perdidos por ataque** | % de pérdidas (TOV%) | De cada 100 ataques que termina (tirando, yendo a la línea o perdiendo el balón), en cuántos pierde el balón |
| `ftr` | TLI / TCI | **Tiros libres que provoca** | Tasa de tiros libres (FTr) | Cuántos tiros libres lanza por cada tiro de campo: mide lo que ataca el aro y provoca faltas |

Reglas:

- **División por cero → `null`** → «–». No se muestra ni `NaN` ni `0 %`.
- **Muestra pequeña** (propuesta, pregunta 3): el denominador es TCI en eFG y FTr, y «intentos equivalentes»
  (TCI + 0,44·TLI) en TS y TOV. Por debajo de **5** en un partido o de **15** en una temporada o fase, el valor se
  **atenúa con un asterisco** («pocos tiros»). Por debajo de **3**, no se muestra. Los umbrales serán constantes
  probadas.
- **Las métricas se calculan con los totales, no con las medias por partido.** En el modo «Por partido»,
  `averageRow` redondea y daría ratios distintos. Se calcula sobre la fila de totales y no se promedia.
- **Sin datos de un botón** (§2.4): sin `t3`, eFG% = acierto en tiros de campo y se rotula así. Sin `t1`, se ocultan
  TS% y FTr. Sin `lost`, se oculta TOV%.
- **Sin valores de referencia de la NBA ni «bueno/malo».** En minibasket no hay referencias fiables. Se compara con
  la media del propio equipo.
- **0,44** es el coeficiente habitual (calibrado en ligas profesionales). Se mantiene por convención y se explica en
  la nota. Más adelante se puede valorar 0,5 para formación.
- **Fuera de alcance**, a propósito: Four Factors, ORB% y todo lo que necesite datos del rival.
  *Extensión posible (no incluida):* puntos por posesión **del equipo** = PTS / (TCI + 0,44·TLI + PÉR − RO), que
  solo usa datos propios. La dejo para que la decidas.

| # | Tarea | Archivos | Tests primero | Aceptación |
| --- | --- | --- | --- | --- |
| 2.1 | `MBCore.advanced(line, scope, recorded)` → `{ efg, ts, tov, ftr }`, cada una `{ value, den, low, hidden }` | `core.js` | Valores calculados a mano, denominador 0, umbral (justo por debajo y por encima), sin `t1` o `lost`, fila de equipo y **totales frente a promedio** | 100 % de cobertura en `core.js` |
| 2.2 | `g.hidden` al crear un partido y `recordedOpts(games, team)` | `app.js`, `core.js` | Partido nuevo con botones desactivados. Partido antiguo con jugadas de un tipo que hoy está desactivado | — |
| 2.3 | Interfaz: botón «Básicas · Avanzadas» en la tabla (como Totales / Por partido) y una tarjeta de glosario con el nombre para familias, el término técnico y la explicación | `app.js`, `styles.css`, `i18n/es.js` | `flujos.test.js`: el cambio de vista, «–», el asterisco y la columna oculta sin datos | La tabla avanzada cabe a lo ancho en 844×390 (e2e) |
| 2.4 | CSV: columnas nuevas **al final** (`eFG%`, `TS%`, `%PÉR`, `TL/TC`), vacías si son `null` | `app.js` | `exportar.test.js`: las columnas antiguas siguen en el mismo orden y con el mismo nombre | Una hoja de cálculo que lea las columnas por posición sigue funcionando |

### Fase 1B — El mejor quinteto (y el +/- por jugador) (M/L) · **la mejora principal**

**Objetivo:** responder a «¿qué 5 jugadores juntos nos funcionan mejor?» con los datos de la temporada (o de una
fase), sin ningún toque extra durante el partido.

**Lo que hay que tener claro antes (sé crítico conmigo si no te convence):**

- **Hacen falta repeticiones.** Con 10 jugadores hay 252 quintetos posibles. En minibasket, además, las normas de
  participación obligan a rotar. Si el entrenador repite grupos (por ejemplo, dos o tres quintetos base), en una
  fase habrá muchos periodos por quinteto y el ranking será útil. Si cada periodo es una combinación distinta, cada
  quinteto tendrá 1 o 2 periodos y el «mejor» será casualidad. **La app tiene que decirlo** en vez de coronar un
  quinteto con 1 periodo.
- **El rival no se puede descontar.** Sin datos del rival, un quinteto que jugó contra los flojos parece mejor. Se
  mitiga separando por **fase** (rivales de nivel parecido) y mostrando contra quién jugó cada quinteto.
- **En un solo partido no hay ranking.** Cada quinteto juega 1 o 2 periodos. En el partido se muestra «cómo le fue a
  cada quinteto» (lista). El ranking es para la temporada o la fase.
- **Complemento con más datos: parejas y tríos.** Cuando los quintetos se repiten poco, «qué dos o tres jugadores
  funcionan juntos» acumula muchos más periodos por combinación y sí puede dar señales. Lo propongo como pestaña
  secundaria (pregunta 2).

**Qué se muestra**

- **Tarjeta «Quintetos»** (temporada o fase), con tres órdenes:
  - **+/- por periodo** (por defecto): el mejor en conjunto.
  - **Ataque:** puntos a favor por periodo.
  - **Defensa:** puntos en contra por periodo (menos es mejor).
- **Cada fila:** los 5 dorsales con su nombre, periodos jugados juntos (≈ si hay reparto), PF–PC, +/- y +/- por
  periodo. Un indicador de muestra: «pocos datos» por debajo del mínimo, que no entra en el ranking.
- **Mínimo para entrar en el ranking:** configurable, con una propuesta de **4 periodos** (pregunta 1). Debajo:
  «Hay 23 quintetos con menos de 4 periodos que no entran».
- **Si nadie llega al mínimo:** «Todavía no hay suficientes datos: los quintetos se repiten poco. Mira las parejas o
  vuelve dentro de unos partidos».
- **Al tocar un quinteto:** en qué partidos y periodos jugó, con el parcial de cada uno.
- **En el partido:** la lista de quintetos usados con sus periodos y su parcial, y el +/- de cada jugador en la tabla.
- **Aviso de cobertura:** «Calculado con N de M partidos» (los antiguos no cuentan).
- **En la pantalla del partido en directo no cambia nada.**

| # | Tarea | Archivos | Tests primero | Aceptación |
| --- | --- | --- | --- | --- |
| 1B.1 | `MBCore.plusMinus(g)` → por jugador `{ pf, pc, pm, periods }`, o `null` en un partido sin registro | `core.js` | Fixture calculado a mano. **Invariante: Σ pm de los jugadores = 5 × (PF − PC)** cuando el quinteto está completo. `opp −1` cuenta para el quinteto en pista. Partido antiguo → `null` | — |
| 1B.2 | `MBCore.exposure(g)` (§2.2): periodos por tramo | `core.js` | Un solo quinteto = 1. Dos tramos con 6 y 2 jugadas = 0,75 y 0,25. Periodo sin jugadas → a partes iguales. **Cada periodo suma 1.** Volver a un periodo anterior para apuntar algo no rompe la suma | — |
| 1B.3 | `MBCore.units(games)`: agrupar por los 5 ids ordenados → `{ pids, periods, approx, pf, pc, pm, pmPer, pfPer, pcPer, games }`. Los tramos con menos de 5 se agrupan como «incompleto» | `core.js` | El mismo quinteto en varios partidos se suma. Un quinteto con distinto orden de ids es el mismo. Σ pf de los quintetos = puntos con registro | — |
| 1B.4 | `MBCore.rankUnits(units, { by, min })` con `by` = `pm` / `pf` / `pc` | `core.js` | Desempates (más periodos primero). Los que no llegan al mínimo se cuentan pero no entran. Sin ninguno → lista vacía con su recuento | — |
| 1B.5 | `MBCore.pairs(games, size)` (parejas y tríos), si se aprueba | `core.js` | Las mismas invariantes con `size` 2 y 3 | — |
| 1B.6 | Interfaz: la tarjeta «Quintetos» (órdenes, mínimo, «pocos datos», detalle), la lista de quintetos del partido, la columna `+/-` en la tabla y el aviso de cobertura | `app.js`, `styles.css`, `i18n/es.js` | `flujos.test.js`: el orden por cada criterio, cambiar el mínimo, el mensaje sin datos suficientes, el aviso de cobertura con partidos antiguos y el detalle de un quinteto | La tarjeta cabe en 844×390 (e2e). **Pantalla del partido en directo idéntica** (snapshot de `viewLive`) |
| 1B.7 | Explicación en la app (texto corto bajo la tarjeta): qué es el +/-, por qué depende de los compañeros y del rival, y por qué hace falta un mínimo de periodos | `i18n/es.js` | Snapshot del texto | Lo revisas tú |
| 1B.8 | CSV: `+/-` al final. CSV de quintetos aparte (pregunta 6) | `app.js` | `exportar.test.js` | Las columnas antiguas no cambian |
| 1B.9 | Rendimiento: memoizar `units` y `plusMinus` por `(g.id, g.seq)` | `core.js` | Un test de que no se recalcula si nada cambia | Estadísticas de temporada de 30 partidos en < 50 ms en el e2e de Android |

**Cuándo será útil:** solo con los partidos jugados después de publicar la fase 1A. Por eso 1A va primero y se
publica sola. Cuando llegue 1B ya habrá varias semanas de datos.

### Fase 4 — Informe del jugador en texto, por email (S/M)

Lo decidiste el 11/11: en vez de un PDF, el informe va **en texto**. Se reaprovecha el flujo de «Enviar» que ya
existe (`shareStats` → `renderShare`, `app.js:2228-2245`): **Email** (`mailto:`), **Copiar** y **Compartir**
(`navigator.share({ text })`, que en el móvil abre la hoja nativa y llega a WhatsApp). No hay librerías ni
archivos nuevos, funciona sin conexión y no sale nada del dispositivo salvo lo que el usuario envíe.

**Condiciones del formato texto**

- **Sin tablas alineadas con espacios:** los clientes de correo y WhatsApp usan fuentes proporcionales y las
  columnas se descolocan. Se usan líneas cortas tipo «Etiqueta: valor», en bloques con un título.
- **Longitud:** el cuerpo de un `mailto:` tiene límites que dependen del cliente (algunos cortan a partir de unos
  2.000 caracteres codificados en la URL). El informe tiene que ser **compacto (objetivo < 2.000 caracteres, con la explicación del +/-)**. Si
  se pasa del límite, el botón Email se sustituye por «Copiar y pegar en el correo», y un test lo comprueba. Copiar y
  Compartir no tienen ese límite.
- **Destinatario:** `team().email` (el que ya existe) o vacío. **No se guardan emails de las familias**: serían más
  datos personales ligados a menores. El entrenador elige el destinatario en su app de correo.
- **Asunto:** «Informe de <nombre> · <ámbito> · <equipo>». No se adjunta nada (`mailto:` no permite adjuntos).
- **Opcional (pregunta 5):** botón «Descargar .txt» con la misma función `download()` que el CSV, para quien quiera
  adjuntarlo a mano.

**Contenido** (en el idioma de la app):

```
Informe de #7 Bruno · Temporada 2026-27 (2ª fase · Nivel B)
Alevín A · 12 partidos (03/10 – 28/02)

RESUMEN
Partidos: 12 · Periodos jugados: 41
Puntos: 86 (7,2 por partido) · Rebotes: 40 (3,3)
Asistencias: 14 · Recuperaciones: 22 · Valoración: 95 (7,9)

TIRO
Tiros libres: 10/22 (45 %) · De 2: 30/71 (42 %) · Triples: 2/9 (22 %)

EVOLUCIÓN (puntos · valoración por partido)
03/10 vs Rival A: 6 · 5
10/10 vs Rival B: 9 · 11
…
1ª fase: 6,1 pts · 2ª fase: 8,3 pts por partido

+/- · CÓMO LE FUE AL EQUIPO CON BRUNO EN PISTA
Con Bruno jugando, el equipo metió 64 puntos y recibió 46: +18 (30 periodos en 9 partidos).
En toda la temporada el equipo va +25.
(ver la explicación completa más abajo)

ACIERTO Y CUIDADO DEL BALÓN
Acierto real en el tiro (TS%): 47 % — puntos por intento, tiros libres incluidos.
…  (* = pocos tiros, tómalo con cautela)

myownbasketballstats.com
```

**El +/- explicado para familias** (decidido: va en el informe, muy bien explicado). Propuesta de texto. Usa el nombre
del jugador en vez de pronombres y se escribe una vez por idioma:

> **¿Qué es el +/-?** Es el marcador de los ratos en los que Bruno estaba en pista: los puntos que metió el equipo
> menos los que recibió. +18 quiere decir que, mientras Bruno jugaba, el equipo sacó 18 puntos de ventaja en total.
>
> **Lo que no es:** no mide solo lo que hace Bruno. Depende también de los compañeros que jugaban a su lado, del rival
> y de la suerte de cada partido. **No sirve para comparar a dos jugadores**, porque cada uno juega con compañeros y
> rivales distintos.
>
> **Cómo leerlo:** con pocos periodos cambia mucho de un partido a otro. Tiene sentido a lo largo de la temporada y
> junto al dato del equipo (aquí, +25 en toda la temporada).
>
> Solo cuentan los partidos desde el [fecha]: los anteriores no tienen este dato.

Reglas para el +/- en el informe:

- Siempre va acompañado del **dato del equipo** en el mismo ámbito, como referencia. Nunca de una comparación con
  otro jugador ni de un ranking.
- **Con menos de 4 periodos con datos** no se da la cifra: «Todavía hay pocos datos para calcularlo».
- **El ranking de quintetos no va en el informe para familias.** Es una herramienta del entrenador.
- La explicación ocupa unos 500 caracteres. Con ella, el objetivo de longitud pasa a **< 2.000 caracteres**. Si el
  `mailto:` se queda corto, se usa «Copiar» (4.2). Alternativa: poner la explicación completa una sola vez al final.

| # | Tarea | Archivos | Tests primero | Aceptación |
| --- | --- | --- | --- | --- |
| 4.1 | `MBCore.reportModel(games, pid, scope)` → datos del informe (resumen, tiro, evolución por partido, comparación de fases, +/- con cobertura y avanzadas) | `core.js` | Jugador en dos fases, jugador sin tiros, jugador dado de baja de la plantilla, +/- sin cobertura, ámbito de una sola fase | Función pura con 100 % de cobertura |
| 4.2 | `reportText(model, t)` → texto | `core.js` | Snapshot del texto en ES. Sin `NaN` ni `undefined`. «–» cuando no hay datos. Con el informe de una temporada de 30 partidos, el `mailto` sigue por debajo del límite o cae a «Copiar» | Legible en Gmail, Apple Mail y WhatsApp (revisión manual) |
| 4.3 | Evolución compacta: con más de N partidos (propuesta: 12) se resume por fase o por mes en vez de una línea por partido | `core.js` | Con 30 partidos, la longitud se mantiene acotada | < 2.000 caracteres en el caso típico (con la explicación del +/-) |
| 4.4 | Interfaz: en temporada o fase, tocar un jugador de la tabla → «Informe» → el modal «Enviar» con su texto. Asunto propio | `app.js`, `i18n/es.js` | `flujos.test.js`: abrir el informe de un jugador, el `mailto` con el asunto y el cuerpo correctos, copiar y compartir (doble de `navigator.share`) | Funciona en modo avión (e2e de Chrome sin conexión) |
| 4.5 | (Opcional) «Descargar .txt» | `app.js` | `exportar.test.js`: nombre del archivo y contenido UTF-8 | — |

Con el texto, el riesgo de compatibilidad con iOS Safari desaparece: `mailto:`, `clipboard` y `navigator.share`
con texto ya se usan hoy y están cubiertos por los e2e.

### Fase 5A — Idiomas en la app: ES, CA, FR, IT, PT (L)

**Estrategia**

- **Extracción:** unas 390 líneas de `app.js` tienen texto en castellano (más la capa de `index.html`). Se pasan a
  `t('clave', { n })`. Las claves se agrupan por pantalla (`live.*`, `stats.*`, `team.*`…).
- **Detector de textos sin extraer:** una **pseudolocalización** (`qps`) que rodea cada texto con `⟦…⟧`. Un test
  recorre todas las pantallas y modales en `qps` y falla si encuentra un nodo de texto visible sin envolver (salvo
  números, dorsales y nombres).
- **Portugués: pt-PT** (decidido). `<html lang="pt-PT">`, `Intl` con `pt-PT` y vocabulario de Portugal (*minibasquete*, *equipa*…).
  Un usuario con el móvil en pt-BR recibe pt-PT.
- **Archivos:** `i18n/{es,ca,fr,it,pt}.js` (unos 25–35 KB cada uno). Solo se carga el activo, con un `<script>` que
  inyecta un pequeño script en línea de `index.html` antes de `app.js`. Todos van precacheados para cambiar de idioma
  sin conexión.
- **Detección:** `localStorage.mb_lang` (compartido con el marcador, como `mb_theme`) → `?lang=xx` (desde la web; se
  guarda y se quita de la URL) → `navigator.languages` (`ca*`→ca, `pt*`→pt, incluido pt-BR…) → `es`.
- **Selector:** en Ajustes y en la pantalla de equipos (la primera que se ve). Actualiza `<html lang>`.
- **Números y fechas:** `Intl.NumberFormat` e `Intl.DateTimeFormat` con el idioma activo. Los cinco idiomas usan coma
  decimal y día/mes/año. `MONTHS` (`app.js:309`) pasa a `Intl`. El CSV mantiene `;` y la coma decimal en los cinco.
- **Abreviaturas de los botones** (1, 2, 3, REC, PÉR, RO, RD, AS, TAP, TR, FC, FR): son de cada idioma, con un
  **presupuesto de 4 caracteres** comprobado por un test para que quepan los 15 botones. **Las de FR/IT/PT las tiene
  que validar alguien nativo que sepa de baloncesto** (TODO). No las invento.
- **Tests:** las mismas claves y los mismos marcadores (`{n}`) en todos los idiomas, longitud de las abreviaturas y
  pseudolocalización.

**Textos que dependen del reglamento** (no traducirlos como si las reglas fueran iguales en todas partes):

| Texto actual | Dónde | Por qué depende |
| --- | --- | --- |
| «8 periodos (minibasket) / 4 cuartos», «Periodo», «Cuarto», «P1/Q1» | Formulario de partido (`app.js:823`), `perAbbr`/`perName`, home.ts:34, FAQ :69 | Número y duración de los periodos según la federación |
| «Aviso a las 4 faltas, eliminado con la 5ª» | `MAX_FOULS` (`app.js:9`), `record`, home.ts:37, guía | Faltas personales en minibasket según el país |
| «Cuenta los periodos que juega cada jugador» y las normas de participación mínima | home.ts:36, guía :56 | Mínimo de periodos por jugador: según la federación |
| «Temporada en dos fases», niveles y «sube/baja» | `PHASES`, `MOVES`, Equipo, home.ts:35/72, guía :92-118 | Es la estructura de las competiciones españolas y catalanas, no universal |
| Triples (`t3`) | Botones, eFG% | La línea de 3 en minibasket no existe en todas partes |
| «Valoración ACB / Euroliga» | `app.js:1106`, `buildText`, guía de valoración | El nombre de la fórmula cambia de un país a otro (PIR, *évaluation*…) |
| Categorías («Alevín», «Benjamín») | Ejemplos y fixtures | Cada país tiene las suyas (U11, *Esordienti*, Sub-12…) |
| Texto de privacidad (menciona Vercel) | `viewPrivacy`, `/privacidad/` | Es un texto legal: hace falta una traducción revisada |

Propuesta: los números del reglamento pasan a ser **datos** (`RULES = { fouls: 5, periodOptions: [8, 4] }`) y los
textos los reciben como parámetro («Aviso a las {warn} faltas»). Ajustar las reglas de cada país queda para después;
lo que no queremos es que una traducción afirme una regla.

| # | Tarea | Tamaño | Aceptación |
| --- | --- | --- | --- |
| 5A.1 | Prueba de pseudolocalización y extracción por pantallas (Equipos, Equipo, Partidos, Directo, Ajustes, Estadísticas, Modales, Privacidad, Instalar/Girar) | L | La prueba `qps` pasa en todas las pantallas. ES se ve igual que antes (los tests existentes, en verde) |
| 5A.2 | `RULES` parametrizado | S | Cambiar `MAX_FOULS` en un test cambia los textos y el comportamiento |
| 5A.3 | Traducción CA (la revisas tú) | M | Revisión hecha |
| 5A.4 | FR, IT y PT: primer borrador marcado `// TODO revisión nativa`, con un glosario de términos para validar | M | Revisión nativa hecha antes de publicar el idioma (se puede publicar idioma a idioma) |
| 5A.5 | Detección, selector y `?lang=` | S | e2e: con `navigator.language = 'fr-FR'` se abre en FR; el selector cambia el idioma y se recuerda sin conexión |
| 5A.6 | El marcador (`/marcador/`): ¿dentro o fuera? | — | Pregunta 7 |

### Fase 5B — Idiomas en la web (M/L)

- **URLs:** `/` (ES, como hoy), `/ca/`, `/fr/`, `/it/`, `/pt/`. Cuando se traduzcan las guías, con slugs traducidos.
- **hreflang** recíprocos en cada página, con `x-default` → `/`. `og:locale` según el idioma (hoy es una ternaria
  ES/CA en `Base.astro`). `inLanguage` en el JSON-LD. Opción `i18n` de `@astrojs/sitemap` para los `xhtml:link`.
- **Refactorización:** las ternarias `lang === 'ca'` de `Header`, `Footer`, `ActionLegend` y `Base` pasan a
  diccionarios (`src/i18n/*.ts`). `Lang = 'es' | 'ca' | 'fr' | 'it' | 'pt'`. El selector de idioma del pie lista todos.
- **Enlaces a la app** con `?lang=xx`, para que se abra en el idioma de la página.
- **Alcance inicial:** solo la portada en FR, IT y PT. Las guías, la plantilla y la privacidad se marcan «(en
  castellano)», como ya hace CA (pregunta 8). **Las afirmaciones de reglamento de la portada se reescriben** para
  FR/IT/PT (ver la tabla anterior); no se traducen literalmente.
- **Tests:** `web.test.js` comprueba las mismas claves en todos los idiomas. Sobre el build: cada página tiene
  hreflang recíprocos y `x-default`. e2e: cada portada responde y su `<html lang>` es el correcto.
- Las imágenes de captura (`public/img/app-*.webp`) están en ES. Habrá que hacer capturas por idioma o aceptar las de ES.

### Fase 3 — Comparativa «alternativas» en la web (M + tu revisión)

**Una advertencia sobre el SEO:** casi todas las apps de la lista son en inglés o están pensadas para EE. UU. Es
probable que en castellano se busque poco «alternativa a GameChanger». Propongo que la página apunte a la búsqueda
genérica («apps de estadísticas de baloncesto», «… minibasket») y use los nombres de la competencia como términos
secundarios. Si el objetivo es captar búsquedas por esos nombres, una versión en inglés tendría más sentido, pero
necesitaría la app en inglés (pregunta 10).

**Propuesta de página (ES)**

- URL: `/comparativa-apps-estadisticas-baloncesto/` (enlazada desde Guías y desde el pie).
- `<title>` (≤ 60 caracteres): «Apps de estadísticas de baloncesto: comparativa 2026».
- `meta description` (~150): «Comparamos My Own Basketball Stats con GameChanger, Easy Stats, Breakthrough Stats y
  otras apps: precio, cuenta, privacidad y funciones. Revisado el [fecha].»
- Encabezados:
  - **H1** Apps de estadísticas de baloncesto: comparativa honesta
  - Entradilla + «Revisado el dd/mm/aaaa» + **quién la escribe** (el autor de My Own Basketball Stats) + método (qué
    se ha probado y qué sale de las webs oficiales)
  - **H2** Resumen en una tabla. Filas: precio · cuenta obligatoria · instalar o web · plataformas · sin conexión ·
    dónde se guardan los datos · analítica/seguimiento · idiomas · estadísticas por jugador · +/- y quintetos ·
    estadísticas del rival · vídeo o retransmisión · varios equipos · exportación · formato de minibasket
  - **H2** por app: Basketball Stats Assistant · GameChanger · Easy Stats · Breakthrough Stats · Hoopops / SportEasy
    - H3 En qué es mejor · H3 Para quién encaja · H3 Diferencias con My Own Basketball Stats · enlace a la fuente oficial
  - **H2** Cuándo **no** te conviene My Own Basketball Stats (sin sincronización entre dispositivos, sin
    estadísticas del rival, sin vídeo, sin tienda de apps, datos solo en el móvil si no haces copia, por ahora solo
    en ES)
  - **H2** Cuándo sí: sin cuenta, sin instalar, sin seguimiento en la app, gratis y con el formato de minibasket
  - **H2** Preguntas frecuentes
  - **H2** Fuentes y fecha de consulta
- **Datos estructurados:** `Article` (`datePublished`, `dateModified`) + `BreadcrumbList`, con `Guide.astro`.
  Opcionalmente, un `ItemList` con nombre y URL de cada app. **Sin `Review`, `AggregateRating` ni `Offer` de la
  competencia** (reseñas de terceros escritas por una parte interesada). `FAQPage` es opcional: Google ya no
  suele mostrarlo como resultado enriquecido.
- **Marcas:** se nombran solo para identificar cada app, sin logos ni capturas de la competencia.
- **Privacidad, con Umami activo:** la página dice «la **app** no tiene analítica, cookies ni cuentas». De la web
  dice la verdad: «la web usa una analítica sin cookies (Umami) para contar visitas». No se usa «sin rastreo» en
  general. En la fila «analítica/seguimiento» de la tabla, nuestra celda distingue entre la app y la web. Un test
  comprueba que la página no contiene «sin rastreo» ni «sin seguimiento» sin precisar que se refiere a la app.

**Datos de la competencia: todos quedan como TODO para que los revises tú.** No escribiré ninguna celda sin fuente.
La plantilla de cada celda es `{ valor: 'TODO', fuente: 'TODO (URL oficial)', consultado: 'TODO (fecha)' }`.

**Datos propios** (verificables en el código; se rellenan ya): gratis, sin cuenta (no hay inicio de sesión), web
instalable como PWA (`manifest.webmanifest`), sin conexión (`sw.js`), datos solo en el dispositivo (`localStorage`),
sin analítica en la app, sin estadísticas del rival (solo sus puntos), 8 periodos o 4 cuartos, faltas 4/5,
exportación CSV/JSON, varios equipos y, cuando estén publicadas, +/-, **mejor quinteto**, avanzadas e informe por jugador. El mejor quinteto sin toques
extra es un argumento propio fuerte: conviene comprobar (TODO) qué apps de la lista lo ofrecen y con qué esfuerzo.

| # | Tarea | Aceptación |
| --- | --- | --- |
| 3.1 | Página con la estructura, la tabla generada desde un archivo de datos (`src/data/comparativa.ts`) y todas las celdas ajenas en TODO | Build en verde |
| 3.2 | **Protección:** mientras quede un `TODO` en los datos, la página lleva `noindex` y se excluye del sitemap. Un test lo comprueba | No se puede publicar una comparativa a medias por descuido |
| 3.3 | Revisas y rellenas los datos (con fuente y fecha) | Ningún TODO |
| 3.4 | Enlaces internos (Guías, pie) y la versión CA (opcional) | hreflang si hay CA |

---

## 4. Riesgos

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Quien apunta no registra los cambios (solo apunta el marcador del rival) | +/- y quintetos falsos | Avisos fuera del directo: «hubo jugadas con menos de 5 en pista», «el quinteto no cambió en 3 periodos seguidos». Cobertura visible |
| Corregir el quinteto *después* de haber apuntado jugadas | Esas jugadas se atribuyen al quinteto equivocado | Se documenta. La agrupación cubre las correcciones hechas antes de la primera jugada |
| `−1` del rival en otro momento | Pequeño error en el +/- | El `−1` solo corrige el periodo actual (`recordOpp`); se documenta |
| Reparto de un periodo por jugadas cuando hay cambios dentro | Un tramo con pocas jugadas cuenta menos de lo que jugó | Cada periodo suma 1, marca «≈» y, en minibasket, la mayoría de periodos tienen un solo quinteto |
| **Quintetos que se repiten poco** | Un «mejor quinteto» que es casualidad | Mínimo de periodos, recuento de los que no llegan, mensaje de «faltan datos», separación por fase y parejas o tríos como complemento (fase 1B) |
| **+/- individual de niños leído por las familias** | Comparaciones injustas: depende de los compañeros y las muestras son pequeñas | Explicación completa en el informe, siempre junto al dato del equipo y sin cifra con menos de 4 periodos. El ranking de quintetos nunca va en el informe para familias |
| Muestras pequeñas en las avanzadas | Porcentajes extremos (100 %, 0 %) | Umbrales, asterisco y ocultación |
| Extracción de i18n en un archivo de 2.400 líneas | Regresiones visuales y textos sin traducir | Pseudolocalización, tests actuales, e2e y extracción por pantallas en PR separados |
| Calidad de FR/IT/PT | Pérdida de credibilidad | Revisión nativa obligatoria antes de publicar cada idioma |
| Informe demasiado largo para `mailto:` | El cliente de correo corta el cuerpo | Informe compacto (< 2.000 caracteres), resumen por fase o mes con muchos partidos, y «Copiar» como alternativa (4.2, 4.3) |
| Datos de la competencia que se quedan viejos | Comparativa engañosa | Fecha visible, fuentes y revisión semestral (recordatorio en el README) |
| Versiones antiguas de la app en caché | Ediciones sin `seq` ni registro | El SW es de red primero: solo pasa sin conexión. `normalize` asigna `seq` a lo que llegue sin él (§5) |

---

## 5. Compatibilidad

**Copias de seguridad y traspaso**

| Caso | Resultado |
| --- | --- |
| La app nueva importa v1 o v2 | `normalize` migra a v3. Partidos antiguos: +/- y quintetos «no disponible». Tests con los fixtures de hoy |
| La app nueva importa v3 | Directo, con validación de `lineups` |
| **La app antigua (v2) importa v3** | Funciona: `normalize` conserva los campos que no conoce (`lineups`, `seq`, `lineupFrom`, `hidden` del partido) y marca `version: 2`. Si se siguen apuntando jugadas en la app antigua, esos eventos no tendrán `seq` y los cambios no se registrarán. Al volver a la nueva, reciben `seq` al final y se atribuyen al último quinteto. Caso raro; se documenta |
| Copia de una versión **futura** (v4+) en la nueva | Aviso y opción de importarla |
| Traspaso `#traspaso=` | Es la misma estructura. Un test (1A.4) garantiza que cabe |

**CSV**

- Las columnas actuales **no cambian de orden ni de nombre** en ES. Las nuevas van al final.
- Con i18n, las cabeceras se traducen al idioma activo (pregunta 6: ¿o se dejan fijas en ES para no romper las hojas
  de cálculo?).
- El nombre de archivo de la copia (`minibasket-stats-AAAA-MM-DD.json`) no cambia.

**Texto para compartir:** se mantiene igual. Lo único nuevo sería, de forma opcional, el +/- en el texto de un partido.

---

## 6. Peso y rendimiento sin conexión

| Archivo | Hoy | Después (estimación) | Carga |
| --- | --- | --- | --- |
| `app.js` | ~113 KB | ~105–120 KB (crece con las vistas nuevas y pierde los textos) | Al arrancar |
| `core.js` | — | ~12–18 KB (parte se mueve desde `app.js`) | Al arrancar |
| `i18n.js` + `i18n/<idioma>.js` | — | ~2 KB + ~25–35 KB del idioma activo | Al arrancar (solo uno) |
| Los otros 4 idiomas | — | ~100–140 KB | Solo precache del SW |
| Informe en texto | — | ~3–5 KB dentro de `core.js` y `app.js` | Al arrancar |

- El precache crece unos 150–200 KB en total, casi todo por los idiomas (hoy: app + CSS + 6 fuentes + iconos ≈ 400 KB). Es aceptable una sola vez.
- El arranque añade 2 scripts pequeños y síncronos. No hace falta un proceso de build. Si algún día se quiere
  minificar, sería una tarea aparte.
- El cálculo de quintetos y +/- de una temporada de unas 7.500 jugadas es lineal y está memoizado (1B.9).
- Todo archivo nuevo entra en `ASSETS` y cada versión sube `CACHE` (lo comprueba el test de 0.3).

---

## 7. Preguntas abiertas

Ya decididas (ver la tabla del principio): unidad en periodos, partidos antiguos «no disponible», +/- en el informe
con explicación, pt-PT y Umami activo.

1. **Mínimo para el ranking de quintetos:** propuesta de **4 periodos** juntos en la temporada o fase,
   configurable. ¿Vale?
2. **Parejas y tríos** como complemento a los quintetos (1B.5): ¿los incluimos? Dan señales antes, cuando los
   quintetos se repiten poco.
3. **Umbrales de muestra pequeña** en las avanzadas: < 3 se oculta y < 5 (partido) o < 15 (temporada) se atenúa.
   ¿Ocultar o atenuar?
4. **Texto del +/- para familias** (fase 4): ¿te vale el borrador? ¿Va completo en cada informe o una sola vez al
   final?
5. **Informe en texto:** ¿nombre de pila o solo el dorsal? ¿Añadimos el botón «Descargar .txt» (4.5)? ¿Hace falta
   un «enviar a todos» (sería un email por jugador, porque `mailto:` no admite varios cuerpos)?
6. **CSV:** ¿añadimos las columnas avanzadas y el +/-? ¿Cabeceras traducidas o fijas en ES? ¿Un CSV de quintetos?
7. **¿El marcador (`/marcador/`) también se traduce?**
8. **Web en FR, IT y PT:** ¿solo la portada o también las guías, la plantilla y la privacidad? (Para la privacidad,
   ¿quién revisa la traducción legal?)
9. **Reglamento por país:** ¿investigamos el formato de minibasket de FR, IT y PT (periodos, faltas, línea de 3,
   participación mínima) antes de publicar la web en esos idiomas? ¿Quién hace la revisión nativa?
10. **Comparativa:** ¿solo en ES, también en CA o en EN?
11. **Puntos por posesión del equipo** (solo con datos propios): ¿lo añadimos a la fase 2 o lo dejamos fuera?
12. **Orden:** ¿apruebas 0 → 1A → 2 → 1B → 4 → 5A → 5B → 3, publicando 1A en cuanto esté para que se empiecen a
    acumular quintetos esta temporada?

---

## Anexo A — Evaluación del PDF (descartada el 11/11 en favor del texto)

Se conserva por si en algún momento se retoma.

**Comparativa de opciones**

| Criterio | CSS de impresión + `window.print()` | jsPDF / pdf-lib (vendorizado) | **Generador propio mínimo** |
| --- | --- | --- | --- |
| Peso | 0 KB (más CSS) | Cientos de KB minificados (a medir en 4.0; los paquetes npm pesan 30 y 19 MB desempaquetados, que no es el tamaño final) | **~15–20 KB** sin minificar, con la tabla de anchos de Helvetica |
| Build | No hace falta | Hay que vendorizar un UMD; la app no tiene build | No hace falta |
| Archivo compartible | **No**: el usuario tiene que elegir «Guardar como PDF» y luego compartirlo él | Sí | **Sí**: `File` → `navigator.share({ files })` |
| iOS Safari | `window.print()` en una PWA instalada en la pantalla de inicio ha fallado en algunas versiones (**comprobar en un iPhone real**). El navegador añade cabeceras con URL y fecha | Funciona | `navigator.share` con archivos funciona en iOS reciente; `canShare` y descarga como alternativa |
| Calidad | Vectorial, con las fuentes de la app | Vectorial | Vectorial; texto seleccionable; Helvetica (no Barlow ni Rajdhani) |
| Acentos ES/CA/FR/IT/PT | Sí | Sí, con las fuentes estándar | Sí: WinAnsi (cp1252) cubre á à ç ã õ œ « » · (l·l). Los emojis de los nombres se quitan |
| Mantenimiento | Bajo, pero la app es horizontal con la capa `#rotate` y hay que rehacer el layout para A4 | Bajo | Medio: la maquetación va por coordenadas; se mitiga con tests del modelo y del escritor |

**Recomendación: generador propio** (`pdf.js`). Se carga **bajo demanda** al pulsar «Informe PDF» y está en la caché
del SW para funcionar sin conexión. Si no hay `navigator.canShare({ files })`, se descarga. Si algún día hace falta
algo más complejo (imágenes, otras fuentes), se reevalúa pdf-lib.

---

## Avance

| Fase | Estado | Notas |
| --- | --- | --- |
| 0 — Cimientos | **Hecha** (salvo 0.4) | `core.js` (núcleo puro, `MBCore`) con un 100 % de cobertura. Helper de tests que carga los scripts de `index.html` en orden. Test de que el SW guarda todos los scripts. Copia v3 con `exportedAt` y aviso de versión más nueva. **0.4 (i18n) pasa al inicio de la fase 2** |
| 1A — Registrar quintetos | **Hecha** | `seq` en jugadas, `lineups`, `lineupFrom`, `logLineup` en crear partido, selector de quinteto, cambio, sentar, vaciar y periodo. `MBCore.lineupAt`. Sin cambios visibles: e2e de Android en verde sin tocar los tests. Tamaño: < 35 % más y la temporada cabe en el traspaso |
| 2 — Avanzadas | **Hecha** | Base de i18n (`i18n.js`, `i18n/es.js`, solo con los textos nuevos). `MBCore.advanced` y `recordedOpts`. Vista «Básicas · Avanzadas» con glosario, CSV con 4 columnas al final. **Simplificación** (se permiten cambios que rompen): sin `g.hidden` por partido; un dato se considera apuntado si su botón está activo hoy o si hay alguna jugada de ese tipo en el ámbito |
| 1B — Mejor quinteto | **Hecha** | `MBCore.stints`, `plusMinus`, `combos` (quintetos, parejas y tríos) y `rankCombos`. Tarjeta «Quintetos» en temporada o fase (ranking por +/-, ataque o defensa; mínimo por equipo en `t.minUnit`, 4 por defecto) y en cada partido (lista sin ranking). Columna `+/-` en la tabla y al final del CSV; se oculta si ningún partido del ámbito tiene registro. Sin memoizar: el cálculo es lineal (un recorrido por partido) y no hace falta |
| 4 — Informe en texto | **Hecha** | `MBCore.reportModel` y `reportText`. En temporada o fase, tocar el nombre de un jugador abre su informe en el modal «Enviar» (email, copiar, compartir y «Descargar .txt»). Si el enlace de email supera 8.000 caracteres, se propone copiarlo. Con más de 8 partidos, la evolución se resume por mes. +/- solo con 4 periodos o más, siempre con el dato del equipo y la explicación para familias. Nombre y dorsal en el informe (como en el resto de textos que se comparten) |
| 3 — Comparativa | **Hecha (borrador)** | `/comparativa-apps-estadisticas-baloncesto/` con los datos en `src/data/comparativa.mjs`: nuestras celdas con su evidencia en el código; las de las 5 apps, en TODO con `fuente` y `consultado`. Mientras quede algún TODO: `noindex`, fuera del sitemap, sin enlaces (guías y pie) y aviso de borrador; se publica sola al completar los datos. Tests: datos completos o en TODO, nunca sin fuente; sin «sin rastreo»; e2e del borrador |
| 5A, 5B | Pendientes | — |

Conocido: al juntar la cobertura de todos los archivos de test, la cobertura V8 de Vitest a veces deja `core.js` fuera
de la tabla (fallo de la herramienta al fusionar informes). Se mide aparte (ver el README).
