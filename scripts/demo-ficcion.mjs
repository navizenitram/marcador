// Nombres inventados del equipo de ejemplo de la app (scripts/demo.mjs). Se separan aquí para que los tests puedan
// comprobar que ninguno de los nombres reales (las claves) llega a public/minibasket-stats/demo.js.
//
// Ningún nombre inventado puede contener el real: así un nombre real que se cuele en demo.js siempre se detecta.

/* Nombres inventados, reconocibles pero no reales: el del equipo, los de cada jugador y los de cada rival. Un jugador o
   un rival que no esté aquí para la generación: hay que inventarle un nombre antes. */
export const FICCION = {
  equipo: 'Penya Verdinegra',
  jugadores: {
    'Yannick Kraag': 'Yanick Kraan', 'Boogie Ellis': 'Bugi Elliot', 'Eli Ndiaye': 'Elí Ndiago', 'Ricky Rubio': 'Riky Rubino',
    'Nico Laprovittola': 'Nico Laprovita', 'Ludde Hakanson': 'Lude Haakonsen', 'Álex Reyes': 'Álex Reina',
    'Emir Sulejmanovic': 'Emir Suljanović', 'Adrián Torres': 'Adrián Torrent', 'Nikola Radicevic': 'Nikola Radicek',
    'Isaac Nogués': 'Isaac Noguera', 'Dani Osayi': 'Dani Osaye', 'Diego Niebla': 'Diego Neblina',
    'Simon Birgander': 'Simon Bergander', 'Ante Tomic': 'Ante Tomasić', 'Kwan Cheatham': 'Kwan Cheetham',
    'Ferran Mauri': 'Ferran Maurell',
  },
  rivales: {
    'Río Breogán': 'Río Lucense', 'Kosner Baskonia': 'Baskoia Gasteiz', 'MoraBanc Andorra': 'MontBanc Andorra',
    'Barça': 'Barcino', 'FIATC Girona': 'Gerunda Bàsquet', 'Surne Bilbao': 'Botxo Bilbao',
    'La Laguna Tenerife': 'Laguna Canarias', 'Casademont Zaragoza': 'Cesaraugusta Zaragoza', 'Real Madrid': 'Castellana Madrid',
    'Recoletas Salud San Pablo Burgos': 'Burgos Cidiano', 'Valencia Basket': 'Turia Valencia', 'Monbus Obradoiro': 'Compostela Bàsquet',
    'Unicaja': 'Malacitana', 'Kids&Us Manresa': 'Bages Manresa', 'UCAM Murcia': 'Segura Murcia', 'Leyma Coruña': 'Herculina Coruña',
    'iLERNA Lleida': 'Ilerda Lleida',
  },
};
