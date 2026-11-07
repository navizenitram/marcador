# MiniBasket Stats

SPA para recoger estadísticas de partidos de minibasket desde el móvil o la tablet, **en horizontal**.
Sin dependencias ni proceso de build: HTML + CSS + JS. Los datos se guardan en el `localStorage` del navegador.

## Funcionalidades

- **Equipo**: alta de jugadores con dorsal y nombre (editar / eliminar), nombre del equipo y email por defecto.
- **Partidos**: crear partido (rival, fecha, 4/6/8 periodos), continuar, abrir, borrar.
- **Partido en directo** (pensado para que quepa todo sin scroll):
  - Marcador arriba: los puntos propios se suman solos con los tiros anotados; botones **+1 / +2 / +3 / −1** para el rival.
  - Periodo actual (‹ P3 ›). Al pasar de periodo se abre el selector de quinteto.
  - Una fila por jugador en pista (máx. 5) con 12 botones:
    `1✓ 1✗ 2✓ 2✗ 3✓ 3✗ | REC PÉR RO RD FC FR`
    (recuperación, pérdida, rebote de ataque, rebote defensivo, falta cometida, falta recibida).
  - Tocar el nombre del jugador → cambio con alguien del banquillo.
  - Aviso visual a las 4 faltas y jugador eliminado a las 5.
  - ↶ deshacer la última acción y listado de jugadas para borrar cualquier error.
  - Registro automático de los periodos jugados por cada jugador.
- **Estadísticas**: por partido o de temporada (totales o promedio por partido), parciales por periodo,
  líderes, tabla ordenable y valoración.
  - **Enviar**: email (`mailto:`), copiar o compartir (menú nativo del móvil). También descarga en **CSV**.
- **Copia de seguridad**: exportar / importar todos los datos en JSON (útil para cambiar de dispositivo).
- PWA: se puede "Añadir a pantalla de inicio", funciona sin conexión y en Android se abre en horizontal y pantalla completa.

### Valoración

```
VAL = puntos + rebotes (RO + RD) + recuperaciones + faltas recibidas
      − tiros fallados − pérdidas − faltas cometidas
```

## Desarrollo local

```bash
cd minibasket-stats
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Despliegue en Vercel

Se publica junto con el marcador del repositorio: el proyecto de Vercel apunta a la raíz del repo
y la app queda disponible en `/minibasket-stats/` (con un enlace desde la pantalla de inicio del marcador).
No hace falta build. La configuración está en el `vercel.json` de la raíz.

## Estructura

```
index.html            Shell de la SPA
app.js                Lógica, vistas y almacenamiento
styles.css            Estilos (layout horizontal)
sw.js                 Service worker (modo sin conexión)
manifest.webmanifest  Manifest PWA (orientación horizontal)
icon.svg              Icono
```

Los datos viven en `localStorage` con la clave `mbstats.v1`. Borrar los datos del navegador los elimina:
exporta una copia de seguridad de vez en cuando.
