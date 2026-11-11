'use strict';

/* Textos en castellano. Por ahora, solo los de las funciones nuevas: el resto de la app se extraerá en la fase 5
   (docs/plan-mejoras-bsa.md). Claves agrupadas por pantalla; { one, other } para los plurales. */
(globalThis.MBStrings = globalThis.MBStrings || {}).es = {
  'stats.basic': 'Básicas',
  'stats.advanced': 'Avanzadas',

  'adv.col.fg': 'TC',
  'adv.col.fg.title': 'Tiros de campo (de 2 y triples): anotados/intentados',
  'adv.lowMark': 'Pocos tiros: tómalo con cautela',
  'adv.note': '* = pocos tiros: tómalo con cautela. «–» = sin tiros suficientes para calcularlo. Los porcentajes se calculan con los totales, también en «Por partido».',

  'adv.glossary': 'Qué significa cada dato',
  'adv.efg.name': 'Acierto en el tiro, con el triple',
  'adv.efg.abbr': 'eFG%',
  'adv.efg.term': 'eFG% (acierto efectivo)',
  'adv.efg.desc': 'Como el porcentaje de tiro normal, pero un triple anotado cuenta como canasta y media, porque vale un punto más.',
  'adv.fg.name': 'Acierto en tiros de campo',
  'adv.fg.abbr': 'TC%',
  'adv.fg.term': 'TC% (sin triples apuntados)',
  'adv.fg.desc': 'Canastas anotadas de cada 100 tiros de campo. Como no se apuntan los triples, no se puede ajustar por su valor.',
  'adv.ts.name': 'Acierto real en el tiro',
  'adv.ts.abbr': 'TS%',
  'adv.ts.term': 'TS% (true shooting)',
  'adv.ts.desc': 'Junta tiros de campo y tiros libres: cuántos puntos saca de cada intento comparado con lo que sacaría si los metiera todos de 2.',
  'adv.tov.name': 'Balones perdidos por ataque',
  'adv.tov.abbr': '%PÉR',
  'adv.tov.term': '% de pérdidas (TOV%)',
  'adv.tov.desc': 'De cada 100 ataques que termina (tirando, yendo a la línea o perdiendo el balón), en cuántos pierde el balón.',
  'adv.ftr.name': 'Tiros libres que provoca',
  'adv.ftr.abbr': 'TL/TC',
  'adv.ftr.term': 'Tasa de tiros libres (FTr)',
  'adv.ftr.desc': 'Cuántos tiros libres lanza por cada tiro de campo: mide lo que ataca el aro y provoca faltas.',
  'adv.glossaryNote': 'En minibasket no hay valores de referencia fiables: compara a cada jugador con la media del equipo y su evolución, no con el baloncesto profesional.',
};
