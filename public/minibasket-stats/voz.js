'use strict';

/* ════════════════════════════════════════════════════════════════════
   My Own Basketball Stats — dictado por voz: del texto reconocido a una jugada.
   Funciones puras: reciben el texto que devuelve el reconocimiento de voz y quiénes están en pista, y devuelven la
   jugada o el motivo por el que no se ha entendido. Sin DOM, sin localStorage y sin estado de app.js.
   Se carga antes que app.js y queda en el global MBVoice. Los tests lo cargan solo, sin DOM (tests/helpers/voz.js).

   Frases que entiende (una jugada por frase; los números, dichos en palabras o en cifras):
     «siete canasta»  «siete doble»  «siete triple»  «siete libre»      tiros anotados (1, 2 y 3 puntos); más formas en VOCAB
     «siete falla triple»  «siete triple fallado»                       tiros fallados
     «diez rebote»  «diez rebote de ataque»  «diez rebote defensivo»
     «tres asistencia»  «cuatro robo»  «cinco pérdida»  «ocho tapón»  «ocho tapón recibido»
     «seis falta»  «seis falta recibida»
     «rival dos»  «rival triple»  «rival menos uno»                     puntos del rival
   El dorsal solo se busca entre los jugadores que están en pista. Las acciones van con palabras (no «siete dos»)
   para que un número nunca se confunda con el dorsal.
   ════════════════════════════════════════════════════════════════════ */

(function (root) {
  const UNITS = {
    cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
    diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
    diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
    veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  };
  const TENS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };

  /* Minúsculas, sin acentos ni signos: «¡Siete, triple fallado!» → «siete triple fallado» */
  function normalize(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Palabras → números: «treinta y cuatro» → 34, «veintitrés» → 23, «7» → 7. Devuelve la lista de números en el orden en
     que se dicen (un número compuesto cuenta como uno solo). */
  function numbers(text) {
    const tokens = text.split(' ').filter(Boolean);
    const out = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (/^\d{1,2}$/.test(t)) { out.push(parseInt(t, 10)); continue; }
      if (t in TENS) {
        const unit = tokens[i + 1] === 'y' ? UNITS[tokens[i + 2]] : undefined;
        if (unit !== undefined && unit >= 1 && unit <= 9) { out.push(TENS[t] + unit); i += 2; } else out.push(TENS[t]);
        continue;
      }
      if (t in UNITS) out.push(UNITS[t]);
    }
    return out;
  }

  /* ── Diccionario ──
     Cada acción con las palabras que la nombran. Todo en minúsculas y SIN acentos (el texto se normaliza antes).
     Para añadir una palabra que el reconocimiento oye mal, basta con ponerla en su lista. El plural («canastas», «libres»,
     «tapones») se entiende solo. Orden: de la acción más específica a la más general, porque lo que se reconoce se quita del
     texto y la siguiente ya no lo ve («falta recibida» no cuenta también como «falta»). */
  const VOCAB = [
    ['blkr', ['tapon recibido', 'tapon recibe', 'recibe tapon', 'recibe un tapon', 'le ponen tapon', 'le ponen un tapon', 'tapon en contra']],
    ['blk', ['tapon', 'tapona', 'taponazo']],
    ['fr', ['falta recibida', 'falta recibe', 'recibe falta', 'recibe una falta', 'falta a favor']],
    ['fc', ['falta', 'falta cometida', 'comete falta', 'comete una falta']],
    ['ro', ['rebote de ataque', 'rebote ofensivo', 'rebote en ataque', 'rebote atacante']],
    ['rd', ['rebote defensivo', 'rebote de defensa', 'rebote en defensa']],
    ['reb', ['rebote']],
    ['ast', ['asistencia', 'asiste', 'asistio', 'pase de gol']],
    ['rec', ['robo', 'roba', 'robado', 'recupera', 'recuperacion', 'recuperado', 'balon robado', 'recupero']],
    ['lost', ['perdida', 'pierde', 'perdio', 'balon perdido', 'pierde balon', 'perdio balon', 'pierde el balon']],
    // Tiros: «de tres» y «de dos» valen aunque no se diga «puntos»; «canasta» a secas es de 2 (las de 1 y 3 se nombran)
    ['t3', ['triple', 'de tres puntos', 'tres puntos', 'de tres']],
    ['t2', ['doble', 'canasta', 'can asta', 'cesta', 'encesta', 'bandeja', 'de dos puntos', 'dos puntos', 'de dos']],
    ['t1', ['tiro libre', 'libre', 'de un punto', 'un punto', 'de uno']],
  ];
  // «falla triple», «triple fallado»…
  const MISS_WORDS = ['falla', 'fallo', 'fallado', 'fallada', 'falle', 'fallan', 'erra', 'erro', 'errado', 'errada', 'no entra', 'no entro'];
  const RIVAL_WORDS = ['rival', 'ellos', 'contrario'];

  /* Palabras → expresión regular: cada palabra admite plural («s» o «es») y las frases se buscan enteras, de la más larga a
     la más corta para que «tiro libre» gane a «libre» */
  const wordRe = (w) => (w.length >= 4 && !w.endsWith('s') ? `${w}(?:es|s)?` : w);
  const listRe = (words) => new RegExp(`\\b(?:${[...words].sort((x, y) => y.length - x.length).map((p) => p.split(' ').map(wordRe).join('\\s+')).join('|')})\\b`);
  const PATTERNS = VOCAB.map(([key, words]) => [key, listRe(words)]);
  const MISS = listRe(MISS_WORDS);
  const RIVAL = listRe(RIVAL_WORDS);
  const SHOT_PTS = { t1: 1, t2: 2, t3: 3 };

  const fail = (reason, heard) => ({ ok: false, reason, heard });
  const NAMES = {
    t1: 'tiro libre', t2: 'canasta de 2', t3: 'triple', rec: 'recuperación', lost: 'pérdida', ro: 'rebote de ataque',
    rd: 'rebote defensivo', reb: 'rebote', fc: 'falta cometida', fr: 'falta recibida', ast: 'asistencia', blk: 'tapón',
    blkr: 'tapón recibido',
  };

  /**
   * Convierte lo que se ha oído en una jugada.
   *
   * @param {string} text texto del reconocimiento de voz
   * @param {{players: {id: string, number: string}[], enabled?: string[]}} ctx jugadores en pista y acciones que
   *   el equipo tiene activadas en Ajustes (tipos de jugada: t1_ok, ro, fc…); sin `enabled`, todas
   * @returns {{ok: true, kind: 'ev', type: string, pid: string, number: string}
   *   | {ok: true, kind: 'opp', pts: number}
   *   | {ok: false, reason: string, heard: string}}
   */
  function parse(text, ctx) {
    const heard = normalize(text);
    if (!heard) return fail('No he oído nada', heard);
    const players = (ctx && ctx.players) || [];
    const enabled = ctx && Array.isArray(ctx.enabled) ? new Set(ctx.enabled) : null;
    const on = (type) => !enabled || enabled.has(type);

    // 1. Las acciones, quitándolas del texto según se encuentran
    let rest = ' ' + heard + ' ';
    const found = [];
    for (const [key, re] of PATTERNS) {
      const m = re.exec(rest);
      if (!m) continue;
      found.push(key);
      rest = rest.replace(new RegExp(re.source, 'g'), ' ');
    }
    const miss = MISS.test(rest);
    rest = rest.replace(new RegExp(MISS.source, 'g'), ' ');
    const rival = RIVAL.test(rest);
    rest = rest.replace(new RegExp(RIVAL.source, 'g'), ' ');
    if (found.length > 1) return fail('Di una sola jugada cada vez', heard);

    // 2. Puntos del rival: «rival dos», «rival triple», «rival menos uno»
    if (rival) {
      if (found.length && !(found[0] in SHOT_PTS)) return fail('Del rival solo se apuntan puntos', heard);
      if (miss) return fail('Del rival solo se apuntan puntos', heard);
      let pts = found.length ? SHOT_PTS[found[0]] : null;
      if (pts === null) {
        const nums = numbers(rest.replace(/\bmenos\b/g, ' '));
        if (nums.length !== 1 || nums[0] < 1 || nums[0] > 3) return fail('Rival: di 1, 2 o 3 puntos', heard);
        pts = /\bmenos\b/.test(rest) ? -nums[0] : nums[0];
      }
      return { ok: true, kind: 'opp', pts };
    }

    // 3. La acción del jugador
    if (!found.length) return fail(miss ? 'Di qué tiro ha fallado' : 'No he entendido la jugada', heard);
    let type = found[0];
    if (type in SHOT_PTS) type = `${type}_${miss ? 'ko' : 'ok'}`;
    else if (miss) return fail('«Falla» solo vale con un tiro', heard);
    else if (type === 'reb') {
      const options = ['ro', 'rd'].filter(on);
      if (on('reb')) type = 'reb';
      else if (options.length === 1) type = options[0];
      else if (options.length === 2) return fail('¿Rebote de ataque o defensivo?', heard);
    }
    if (!on(type)) return fail(`«${NAMES[type] || type}» está desactivado en Ajustes`, heard);

    // 4. El dorsal: solo entre quienes están en pista
    const nums = numbers(rest);
    if (!nums.length) return fail('No he entendido el dorsal', heard);
    const hits = [];
    for (const n of nums) {
      const p = players.find((x) => parseInt(x.number, 10) === n);
      if (p && !hits.includes(p)) hits.push(p);
    }
    if (hits.length > 1) return fail('He entendido dos dorsales: di solo uno', heard);
    if (!hits.length) return fail(`El ${nums[0]} no está en pista`, heard);
    return { ok: true, kind: 'ev', type, pid: hits[0].id, number: String(hits[0].number) };
  }

  root.MBVoice = Object.freeze({ parse, normalize, numbers });
})(globalThis);
