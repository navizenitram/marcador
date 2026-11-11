'use strict';

/* ════════════════════════════════════════════════════════════════
   My Own Basketball Stats — núcleo de cálculo.
   Funciones puras: reciben datos y devuelven resultados, sin tocar el DOM, localStorage ni el estado de app.js.
   Se carga antes que app.js y queda en el global MBCore. Los tests lo cargan solos, sin DOM (tests/helpers/core.js).
   ════════════════════════════════════════════════════════════════ */

(function (root) {
  /* Puntos de cada tiro anotado (el resto de acciones no suma) */
  const EV_PTS = Object.freeze({ t1_ok: 1, t2_ok: 2, t3_ok: 3 });

  /* Puntos de una jugada: los del rival van en e.pts; los propios, según el tipo */
  const eventPts = (e) => (e.type === 'opp' ? e.pts : EV_PTS[e.type] || 0);

  /* Periodo de una jugada, como índice dentro de los periodos del partido */
  const periodIndex = (g, e) => Math.min(Math.max((e.period || 1) - 1, 0), g.periods - 1);

  function blankLine() {
    return { t1m: 0, t1a: 0, t2m: 0, t2a: 0, t3m: 0, t3a: 0, ro: 0, rd: 0, ast: 0, blk: 0, blkr: 0, rec: 0, lost: 0, fc: 0, fr: 0 };
  }

  function addEvent(l, type) {
    switch (type) {
      case 't1_ok': l.t1m++; l.t1a++; break;
      case 't1_ko': l.t1a++; break;
      case 't2_ok': l.t2m++; l.t2a++; break;
      case 't2_ko': l.t2a++; break;
      case 't3_ok': l.t3m++; l.t3a++; break;
      case 't3_ko': l.t3a++; break;
      default: if (type in l) l[type]++;
    }
  }

  function sumLines(target, src) {
    for (const k of Object.keys(blankLine())) target[k] += src[k] || 0;
    return target;
  }

  /* Valoración (fórmula ACB / Euroliga):
     (PTS + rebotes + asistencias + robos + tapones + faltas recibidas)
     − (tiros de campo fallados + tiros libres fallados + tapones recibidos + pérdidas + faltas cometidas)
     Cada tiro fallado resta 1, sea de 1, 2 o 3. */
  function finish(l) {
    l.pts = l.t1m + 2 * l.t2m + 3 * l.t3m;
    l.reb = l.ro + l.rd;
    l.miss = (l.t1a - l.t1m) + (l.t2a - l.t2m) + (l.t3a - l.t3m);
    l.val = l.pts + l.reb + l.ast + l.blk + l.rec + l.fr - l.miss - l.blkr - l.lost - l.fc;
    return l;
  }

  function score(g) {
    let us = 0, them = 0;
    for (const e of g.events) {
      if (e.type === 'opp') them += e.pts;
      else us += eventPts(e);
    }
    return { us, them };
  }

  function periodScores(g) {
    const us = Array(g.periods).fill(0), them = Array(g.periods).fill(0);
    for (const e of g.events) {
      const i = periodIndex(g, e);
      if (e.type === 'opp') them[i] += e.pts;
      else us[i] += eventPts(e);
    }
    return { us, them };
  }

  /* Línea de estadísticas de cada jugador del partido (también de quien ya no está en la plantilla) */
  function playerLines(g) {
    const map = {};
    for (const p of g.roster) map[p.id] = blankLine();
    for (const e of g.events) {
      if (!e.pid) continue;
      if (!map[e.pid]) map[e.pid] = blankLine();
      addEvent(map[e.pid], e.type);
    }
    for (const k in map) finish(map[k]);
    return map;
  }

  /* Evolución del marcador: cómo queda tras cada anotación, en el orden del partido. Devuelve un punto por
     anotación, { period, x, us, them }, con x entre 0 y g.periods: las anotaciones de un periodo se reparten
     a lo ancho de su tramo, así el gráfico comparte columnas con la tabla de parciales. */
  function scoreFlow(g) {
    const byPeriod = Array.from({ length: g.periods }, () => []);
    for (const e of g.events) {
      const pts = eventPts(e);
      if (!pts) continue;
      byPeriod[periodIndex(g, e)].push(e.type === 'opp' ? [0, pts] : [pts, 0]);
    }
    const out = [];
    let us = 0, them = 0;
    byPeriod.forEach((list, i) => list.forEach(([a, b], k) => {
      us += a; them += b;
      out.push({ period: i + 1, x: i + (k + 1) / (list.length + 1), us, them });
    }));
    return out;
  }

  /* ── Quintetos ──
     g.lineups guarda una foto de quién está en pista cada vez que cambia ({ seq, period, on }), ordenada por seq.
     g.seq numera jugadas y fotos en el orden en que ocurren. g.lineupFrom es el seq de la primera foto: lo anterior
     (partidos de antes de la versión 3, o la parte jugada antes de actualizar la app) no tiene quinteto. */

  /* Quinteto en pista en el momento seq (una copia), o null si ese momento no tiene registro */
  function lineupAt(g, seq) {
    if (!Number.isInteger(g.lineupFrom) || !(seq > g.lineupFrom)) return null;
    let on = null;
    for (const l of g.lineups || []) {
      if (l.seq >= seq) break;
      on = l.on;
    }
    return on ? [...on] : null;
  }

  /* ── +/- y quintetos ──
     Todo se mide en periodos (no hay reloj). Un tramo es un quinteto en pista dentro de un periodo; si en un periodo
     hubo varios, el periodo (que vale 1) se reparte entre ellos según las jugadas apuntadas en cada uno (approx).
     Solo cuentan las jugadas posteriores a g.lineupFrom: los partidos sin registro no tienen +/- ni quintetos. */
  const QUINTET = 5;   // jugadores de un quinteto completo
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const bySeq = (a, b) => a.seq - b.seq;

  function stints(g) {
    if (!Number.isInteger(g.lineupFrom)) return [];
    // Una foto de un periodo anterior al más alto alcanzado es una vuelta atrás (‹) para apuntar algo olvidado: la
    // pista sigue mostrando a los de ahora, así que no se sabe quién jugaba entonces y sus jugadas no cuentan.
    let top = 0;
    const lineups = [...(g.lineups || [])].sort(bySeq).map(l => {
      const retro = l.period < top;
      top = Math.max(top, l.period);
      return { ...l, retro };
    });
    const events = g.events.filter(e => e.seq > g.lineupFrom).sort(bySeq);
    const groups = new Map();   // «jugadores|periodo» → tramo
    let i = -1;
    for (const e of events) {
      while (i + 1 < lineups.length && lineups[i + 1].seq < e.seq) i++;   // último quinteto anterior a la jugada
      if (i < 0 || lineups[i].retro) continue;
      const key = `${[...lineups[i].on].sort().join(',')}|${e.period}`;   // mismo quinteto en el mismo periodo, un tramo
      if (!groups.has(key)) groups.set(key, { period: e.period, on: [...lineups[i].on], events: 0, pf: 0, pc: 0 });
      const s = groups.get(key);
      s.events++;
      if (e.type === 'opp') s.pc += e.pts;
      else s.pf += EV_PTS[e.type] || 0;
    }
    const list = [...groups.values()];
    const perPeriod = new Map();
    for (const s of list) {
      const p = perPeriod.get(s.period) || { events: 0, n: 0 };
      p.events += s.events; p.n++;
      perPeriod.set(s.period, p);
    }
    for (const s of list) {
      const p = perPeriod.get(s.period);
      s.share = s.events / p.events;
      s.approx = p.n > 1;
    }
    return list;
  }

  /* +/- de cada jugador en un partido: { pid: { pf, pc, pm, periods } }, o null si el partido no tiene registro */
  function plusMinus(g) {
    if (!Number.isInteger(g.lineupFrom)) return null;
    const out = {};
    for (const s of stints(g)) {
      for (const pid of s.on) {
        const r = out[pid] || (out[pid] = { pf: 0, pc: 0, pm: 0, periods: 0 });
        r.pf += s.pf; r.pc += s.pc; r.pm += s.pf - s.pc; r.periods += s.share;
      }
    }
    for (const r of Object.values(out)) r.periods = r3(r.periods);
    return out;
  }

  /* Combinaciones de k elementos de una lista (k pequeño: parejas, tríos o el quinteto entero) */
  function choose(list, k, start = 0, acc = [], out = []) {
    if (acc.length === k) { out.push([...acc]); return out; }
    for (let i = start; i < list.length; i++) { acc.push(list[i]); choose(list, k, i + 1, acc, out); acc.pop(); }
    return out;
  }

  /* Quintetos (size 5), parejas (2) o tríos (3) de una lista de partidos, ordenados por periodos jugados juntos.
     Un quinteto necesita 5 en pista: los tramos con menos van a «incomplete». Las parejas y los tríos salen de
     cualquier tramo con suficientes jugadores. tracked/total: partidos con registro y partidos de la lista. */
  function combos(games, size) {
    const map = new Map();
    const incomplete = { periods: 0, pf: 0, pc: 0 };
    let tracked = 0;
    for (const g of games) {
      if (!Number.isInteger(g.lineupFrom)) continue;
      tracked++;
      for (const s of stints(g)) {
        if (size === QUINTET && s.on.length !== QUINTET) {
          incomplete.periods += s.share; incomplete.pf += s.pf; incomplete.pc += s.pc;
          continue;
        }
        for (const set of choose([...s.on].sort(), size)) {
          const key = set.join(',');
          const c = map.get(key) || { key, pids: set, periods: 0, approx: false, pf: 0, pc: 0, games: [] };
          c.periods += s.share; c.pf += s.pf; c.pc += s.pc;
          c.approx = c.approx || s.approx;
          if (!c.games.includes(g.id)) c.games.push(g.id);
          map.set(key, c);
        }
      }
    }
    const list = [...map.values()].map(c => {
      const periods = r3(c.periods);
      return { ...c, periods, pm: c.pf - c.pc, pmPer: (c.pf - c.pc) / periods, pfPer: c.pf / periods, pcPer: c.pc / periods };
    }).sort((a, b) => b.periods - a.periods || b.pm - a.pm);
    incomplete.periods = r3(incomplete.periods);
    return { list, incomplete, tracked, total: games.length };
  }

  /* Ranking: by 'pm' (+/- por periodo), 'pf' (ataque: más a favor) o 'pc' (defensa: menos en contra). Solo entran
     las combinaciones con al menos min periodos; below cuenta las que se quedan fuera. A igualdad, más periodos. */
  function rankCombos(list, { by, min }) {
    const value = (c) => (by === 'pf' ? c.pfPer : by === 'pc' ? -c.pcPer : c.pmPer);
    const ranked = list.filter(c => c.periods >= min).sort((a, b) => value(b) - value(a) || b.periods - a.periods);
    return { ranked, below: list.length - ranked.length };
  }

  /* ── Estadísticas avanzadas ──
     Solo las que permiten los datos propios (nada que necesite datos del rival). TC = tiros de campo (T2 + T3).
       efg: (TCA + 0,5·T3A) / TCI          ts:  PTS / (2·(TCI + 0,44·TLI))
       tov: PÉR / (TCI + 0,44·TLI + PÉR)   ftr: TLI / TCI
     Cada métrica: { value, den, low, hidden }. value es null sin intentos o con menos de ADV_MIN.hide; low marca
     una muestra pequeña (menos de ADV_MIN.game en un partido o ADV_MIN.season en una temporada o fase); hidden, que
     falta un dato porque su botón no se apunta. Se calculan siempre sobre totales, nunca sobre promedios. */
  const ADV_MIN = Object.freeze({ hide: 3, game: 5, season: 15 });

  function advanced(l, scope, rec) {
    const low = scope === 'season' ? ADV_MIN.season : ADV_MIN.game;
    const fga = l.t2a + l.t3a, fgm = l.t2m + l.t3m;
    const tsa = fga + 0.44 * l.t1a;
    const pts = l.t1m + 2 * l.t2m + 3 * l.t3m;
    const metric = (num, den, hidden, extra) => ({
      value: den > 0 && den >= ADV_MIN.hide ? num / den : null,
      den,
      low: den > 0 && den < low,
      hidden: !!hidden,
      ...extra,
    });
    return {
      efg: metric(fgm + 0.5 * l.t3m, fga, false, { fgOnly: !rec.t3 }),
      ts: metric(pts / 2, tsa, !rec.t1),
      tov: metric(l.lost, tsa + l.lost, !rec.lost),
      ftr: metric(l.t1a, fga, !rec.t1),
    };
  }

  /* Qué datos se apuntaron en un ámbito: el botón está activo (no está en hidden) o hay alguna jugada de ese tipo */
  function recordedOpts(total, hidden) {
    return {
      t1: !hidden.includes('t1') || total.t1a > 0,
      t3: !hidden.includes('t3') || total.t3a > 0,
      lost: !hidden.includes('lost') || total.lost > 0,
    };
  }

  root.MBCore = Object.freeze({
    EV_PTS, blankLine, addEvent, sumLines, finish, score, periodScores, playerLines, scoreFlow, lineupAt,
    ADV_MIN, advanced, recordedOpts, stints, plusMinus, combos, rankCombos,
  });
})(globalThis);
