'use strict';

/* Tarjeta de un partido para compartir como imagen (PNG): resultado, parciales y líderes.
   Se dibuja en un <canvas>, sin dependencias y sin conexión. Qué se pinta lo decide app.js (cardModel), con los mismos
   datos que el resumen y los líderes de Estadísticas; aquí solo hay presentación. Los colores y las medidas son
   propios: la tarjeta sale igual con el tema claro y con el oscuro.

   Modelo:
   {
     date: '03/10/2026', meta: 'Local · 2ª fase' (o ''),
     result: 'win' | 'loss' | 'tie' | null (sin finalizar),
     home: { name, score, us }, away: { name, score, us },       // el local primero; us: es nuestro equipo
     periods: { labels: ['P1', …], home: [...], away: [...] },
     leaders: [{ label, value, who }],                           // puede ir vacía (partidos de marcador)
     host: 'myownbasketballstats.com'
   }

   Tabla completa de estadísticas (type: 'table'): las mismas columnas, filas y orden que la pantalla. El alto depende de
   cuántos jugadores haya y el ancho, de cuántas columnas.
   {
     type: 'table', title, subtitle, fileBase, host,
     cols: [{ k, h, gs?: true (empieza un grupo: lleva una raya a la izquierda), hl?: true (destacada) }],
     rows: [{ dnp?: true (no jugó), cells: [{ text, sub?, tone?: 'pos' | 'neg' | 'zero' }] }],
     total: { cells: [...] }, legend: ['PTS Puntos', …], note: '' (aviso bajo la tabla)
   } */
(function (root) {
  const W = 1080, H = 1350;
  const PAD = 72;
  const FONT_D = "'Rajdhani', 'Barlow', system-ui, sans-serif";   // cifras y títulos
  const FONT_T = "'Barlow', system-ui, sans-serif";                // textos
  const C = {
    bg0: '#06080a', bg1: '#12171d', panel: '#161b22', line: '#242b35',
    text: '#edf1f5', muted: '#94a2b6', gray: '#6a7586', green: '#00e676', blue: '#29b6f6', amber: '#ffca28', red: '#ff5252',
  };
  const BADGE = { win: ['VICTORIA', C.green], loss: ['DERROTA', C.red], tie: ['EMPATE', C.amber], live: ['EN JUEGO', C.amber] };

  /* Rectángulo redondeado con arcTo (roundRect no está en los Safari antiguos) */
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* Pone la fuente de ctx y devuelve el texto tal cual si cabe en maxW. Si no, reduce el cuerpo hasta minPx y, si aun
     así no cabe, lo corta con «…». Así un nombre de equipo largo nunca se sale de su sitio. */
  function fit(ctx, str, maxW, weight, family, px, minPx) {
    let size = px;
    ctx.font = `${weight} ${size}px ${family}`;
    while (size > minPx && ctx.measureText(str).width > maxW) {
      size -= 2;
      ctx.font = `${weight} ${size}px ${family}`;
    }
    let t = String(str);
    if (ctx.measureText(t).width > maxW) {
      while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
      t = `${t.trimEnd()}…`;
    }
    return t;
  }

  /* Escribe un texto; font y color van en el segundo argumento */
  function write(ctx, str, x, y, { font, color, align = 'left', baseline = 'alphabetic' }) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(str, x, y);
  }

  /* Escribe un texto que se ajusta a maxW (ver fit) */
  function writeFit(ctx, str, x, y, maxW, { weight, family, px, minPx, color, align = 'left', baseline = 'alphabetic' }) {
    const shown = fit(ctx, str, maxW, weight, family, px, minPx);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(shown, x, y);
  }

  /* Cabecera: fecha y campo, y la etiqueta del resultado */
  const HEAD_H = 140;
  function drawHead(ctx, m, y) {
    const line = [m.date, m.meta].filter(Boolean).join('   ·   ');
    write(ctx, line, W / 2, y + 34, { font: `500 34px ${FONT_T}`, color: C.muted, align: 'center' });
    const [label, color] = BADGE[m.result || 'live'] || BADGE.live;
    ctx.font = `700 40px ${FONT_D}`;
    const w = ctx.measureText(label).width + 90;
    rrect(ctx, (W - w) / 2, y + 66, w, 66, 33);
    ctx.fillStyle = `${color}29`;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();
    write(ctx, label, W / 2, y + 100, { font: `700 40px ${FONT_D}`, color, align: 'center', baseline: 'middle' });
  }

  /* Resultado: el local a la izquierda, con el nombre encima de sus puntos (verde, el nuestro; azul, el rival) */
  const SCORE_H = 270;
  function drawScore(ctx, m, y) {
    const cols = [[W * 0.27, m.home], [W * 0.73, m.away]];
    for (const [cx, side] of cols) {
      writeFit(ctx, side.name.toUpperCase(), cx, y + 44, 400, {
        weight: 700, family: FONT_D, px: 48, minPx: 30, color: C.muted, align: 'center', baseline: 'middle',
      });
      write(ctx, String(side.score), cx, y + 250, {
        font: `700 220px ${FONT_D}`, color: side.us ? C.green : C.blue, align: 'center',
      });
    }
    write(ctx, '–', W / 2, y + 190, { font: `700 90px ${FONT_D}`, color: C.gray, align: 'center' });
  }

  /* Parciales: una fila por equipo, con el periodo ganado en verde o en azul */
  const ROW_H = 76;
  const PERIODS_H = 50 + 64 + ROW_H * 2;
  function drawPeriods(ctx, m, y) {
    const n = m.periods.labels.length;
    const labelW = 250, totalW = 120;
    const colW = (W - PAD * 2 - labelW - totalW) / n;
    write(ctx, 'PARCIALES', PAD, y + 26, { font: `700 28px ${FONT_D}`, color: C.muted });
    const hy = y + 50 + 32;
    m.periods.labels.forEach((l, i) => {
      write(ctx, l, PAD + labelW + colW * (i + 0.5), hy, { font: `600 30px ${FONT_D}`, color: C.muted, align: 'center', baseline: 'middle' });
    });
    write(ctx, 'TOTAL', W - PAD - totalW / 2, hy, { font: `600 30px ${FONT_D}`, color: C.muted, align: 'center', baseline: 'middle' });

    [[m.home, m.periods.home, m.periods.away], [m.away, m.periods.away, m.periods.home]].forEach(([side, mine, theirs], r) => {
      const ry = y + 50 + 64 + r * ROW_H;
      rrect(ctx, PAD, ry + 4, W - PAD * 2, ROW_H - 8, 16);
      ctx.fillStyle = C.panel;
      ctx.fill();
      const color = side.us ? C.green : C.blue;
      writeFit(ctx, side.name, PAD + 24, ry + ROW_H / 2, labelW - 40, {
        weight: 600, family: FONT_T, px: 30, minPx: 20, color: C.text, baseline: 'middle',
      });
      mine.forEach((v, i) => {
        write(ctx, String(v), PAD + labelW + colW * (i + 0.5), ry + ROW_H / 2, {
          font: `600 38px ${FONT_D}`, color: v > theirs[i] ? color : C.muted, align: 'center', baseline: 'middle',
        });
      });
      write(ctx, String(side.score), W - PAD - totalW / 2, ry + ROW_H / 2, { font: `700 46px ${FONT_D}`, color, align: 'center', baseline: 'middle' });
    });
  }

  /* Líderes del partido: tarjetas en dos columnas */
  const LEAD_CARD_H = 130, LEAD_GAP = 20;
  const leadersHeight = (n) => (n ? 50 + Math.ceil(n / 2) * LEAD_CARD_H + (Math.ceil(n / 2) - 1) * LEAD_GAP : 0);
  function drawLeaders(ctx, m, y) {
    write(ctx, 'LÍDERES', PAD, y + 26, { font: `700 28px ${FONT_D}`, color: C.muted });
    const cardW = (W - PAD * 2 - 24) / 2;
    m.leaders.forEach((l, i) => {
      const x = PAD + (i % 2) * (cardW + 24);
      const cy = y + 50 + Math.floor(i / 2) * (LEAD_CARD_H + LEAD_GAP);
      rrect(ctx, x, cy, cardW, LEAD_CARD_H, 18);
      ctx.fillStyle = C.panel;
      ctx.fill();
      write(ctx, l.label.toUpperCase(), x + 28, cy + 38, { font: `600 24px ${FONT_T}`, color: C.muted });
      const value = String(l.value);
      ctx.font = `700 70px ${FONT_D}`;
      const vw = ctx.measureText(value).width;
      write(ctx, value, x + 28, cy + 106, { font: `700 70px ${FONT_D}`, color: C.amber });
      writeFit(ctx, l.who, x + 28 + vw + 22, cy + 100, cardW - 28 - vw - 22 - 24, {
        weight: 600, family: FONT_T, px: 32, minPx: 20, color: C.text,
      });
    });
  }

  /* Pie: la dirección de la web, para quien reciba la imagen */
  function drawFooter(ctx, m) {
    ctx.fillStyle = C.line;
    ctx.fillRect(PAD, H - 124, W - PAD * 2, 2);
    write(ctx, m.host, W / 2, H - 74, { font: `700 36px ${FONT_D}`, color: C.green, align: 'center' });
    write(ctx, 'Estadísticas de baloncesto formativo', W / 2, H - 34, { font: `500 24px ${FONT_T}`, color: C.muted, align: 'center' });
  }

  /* Dibuja la tarjeta entera en un contexto 2D de W × H. Los bloques se apilan y se centran en el espacio libre, así que
     sin líderes (partidos de marcador) el resto queda centrado en vez de dejar un hueco abajo. */
  function draw(ctx, m) {
    if (m.type === 'table') return drawTable(ctx, m);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, C.bg1);
    bg.addColorStop(1, C.bg0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.green;
    ctx.fillRect(0, 0, W, 10);

    const GAP = 44;
    const blocks = [[HEAD_H, drawHead], [SCORE_H, drawScore], [PERIODS_H, drawPeriods]];
    if (m.leaders.length) blocks.push([leadersHeight(m.leaders.length), drawLeaders]);
    const total = blocks.reduce((s, [h]) => s + h, 0) + GAP * (blocks.length - 1);
    const area = H - 134 - 10;   // entre la franja de arriba y el pie
    let y = 10 + Math.max(36, (area - total) / 2);
    for (const [h, fn] of blocks) {
      fn(ctx, m, y);
      y += h + GAP;
    }
    drawFooter(ctx, m);
  }

  /* ── Tabla completa ── */
  const T_PAD = 56, T_CELL = 22, T_HEAD_H = 66, T_MIN_W = 1200, T_LEGEND_LINE = 40;
  const T_FOOT_H = 130;
  const TONE = { pos: C.green, neg: C.red, zero: '#4b5565' };
  const T_DNP = '#5a6575';

  /* Texto repartido en líneas de como mucho maxW de ancho (con la fuente ya puesta en ctx) */
  function wrapLines(ctx, str, maxW) {
    const lines = [];
    let cur = '';
    for (const word of String(str).split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && ctx.measureText(next).width > maxW) { lines.push(cur); cur = word; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /* Medidas de la tabla: ancho de cada columna (lo que ocupa su contenido), alto de fila, líneas de la leyenda y tamaño
     total de la imagen. Se calcula con el mismo ctx con el que se dibuja, porque depende de las fuentes. */
  function tableLayout(ctx, m) {
    const all = [...m.rows, m.total];
    const hasSub = all.some((r) => r.cells.some((c) => c.sub));
    const rowH = hasSub ? 80 : 62;
    const widths = m.cols.map((c, i) => {
      ctx.font = `600 30px ${FONT_D}`;
      let w = ctx.measureText(c.h).width;
      for (const r of all) {
        const cell = r.cells[i];
        ctx.font = c.k === 'name' ? `600 34px ${FONT_T}` : `600 36px ${FONT_D}`;
        w = Math.max(w, ctx.measureText(cell.text).width);
        if (cell.sub) { ctx.font = `500 24px ${FONT_T}`; w = Math.max(w, ctx.measureText(cell.sub).width); }
      }
      const min = c.k === 'name' ? 180 : c.k === 'number' ? 70 : 84;
      const max = c.k === 'name' ? 420 : Infinity;
      return Math.min(max, Math.max(min, Math.ceil(w) + T_CELL * 2));
    });
    const tableW = widths.reduce((a, b) => a + b, 0);
    const W = Math.max(T_MIN_W, tableW + T_PAD * 2);
    ctx.font = `500 26px ${FONT_T}`;
    const legend = m.legend && m.legend.length ? wrapLines(ctx, m.legend.join('   ·   '), W - T_PAD * 2) : [];
    const note = m.note ? wrapLines(ctx, m.note, W - T_PAD * 2) : [];
    const tableTop = 10 + 96 + 50 + 44;
    const totalH = rowH + 8;
    const tableH = T_HEAD_H + m.rows.length * rowH + totalH;
    const textLines = legend.length + note.length;
    const H = tableTop + tableH + 36 + textLines * T_LEGEND_LINE + (textLines ? 28 : 0) + T_FOOT_H;
    return { W, H, rowH, totalH, widths, tableW, x0: (W - tableW) / 2, tableTop, tableH, legend, note };
  }

  function drawTable(ctx, m) {
    const L = tableLayout(ctx, m);
    const { W: TW, H: TH, rowH, totalH, widths, tableW, x0, tableTop, tableH } = L;
    const bg = ctx.createLinearGradient(0, 0, 0, TH);
    bg.addColorStop(0, C.bg1);
    bg.addColorStop(1, C.bg0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, TW, TH);
    ctx.fillStyle = C.green;
    ctx.fillRect(0, 0, TW, 10);

    writeFit(ctx, m.title, T_PAD, 10 + 96, TW - T_PAD * 2, { weight: 700, family: FONT_D, px: 64, minPx: 36, color: C.text });
    writeFit(ctx, m.subtitle, T_PAD, 10 + 96 + 50, TW - T_PAD * 2, { weight: 500, family: FONT_T, px: 32, minPx: 22, color: C.muted });

    // Cabecera de la tabla
    rrect(ctx, x0, tableTop, tableW, T_HEAD_H, 16);
    ctx.fillStyle = C.panel;
    ctx.fill();
    const xs = [];
    let x = x0;
    for (const w of widths) { xs.push(x); x += w; }
    m.cols.forEach((c, i) => {
      const left = c.k === 'name';
      write(ctx, c.h, left ? xs[i] + T_CELL : xs[i] + widths[i] / 2, tableTop + T_HEAD_H / 2, {
        font: `600 30px ${FONT_D}`, color: c.hl ? C.amber : C.muted, align: left ? 'left' : 'center', baseline: 'middle',
      });
    });

    const drawCells = (row, y, h, dim) => {
      row.cells.forEach((cell, i) => {
        const c = m.cols[i];
        const tone = TONE[cell.tone];
        const main = dim ? T_DNP : tone || (c.hl ? C.amber : C.text);
        const sub = dim || cell.tone === 'zero' ? T_DNP : C.muted;
        if (c.k === 'name') {
          writeFit(ctx, cell.text, xs[i] + T_CELL, y + h / 2, widths[i] - T_CELL * 2, {
            weight: 600, family: FONT_T, px: 34, minPx: 22, color: dim ? T_DNP : C.text, baseline: 'middle',
          });
          return;
        }
        const cx = xs[i] + widths[i] / 2;
        write(ctx, cell.text, cx, y + (cell.sub ? h * 0.38 : h / 2), { font: `600 36px ${FONT_D}`, color: main, align: 'center', baseline: 'middle' });
        if (cell.sub) write(ctx, cell.sub, cx, y + h * 0.78, { font: `500 24px ${FONT_T}`, color: sub, align: 'center', baseline: 'middle' });
      });
    };

    // Filas de jugadores, con una franja de más claro en las pares para seguir la fila con la vista
    const bodyTop = tableTop + T_HEAD_H;
    m.rows.forEach((row, r) => {
      const y = bodyTop + r * rowH;
      if (r % 2 === 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.035)';
        ctx.fillRect(x0, y, tableW, rowH);
      }
      drawCells(row, y, rowH, !!row.dnp);
    });

    // Fila del equipo: con una raya verde encima
    const totalTop = bodyTop + m.rows.length * rowH;
    ctx.fillStyle = C.panel;
    ctx.fillRect(x0, totalTop, tableW, totalH);
    ctx.fillStyle = C.green;
    ctx.fillRect(x0, totalTop, tableW, 3);
    drawCells(m.total, totalTop + 4, totalH - 4, false);

    // Una raya fina donde empieza cada grupo de columnas (tiros, rebotes, balón…)
    ctx.fillStyle = C.line;
    m.cols.forEach((c, i) => { if (c.gs && i) ctx.fillRect(xs[i] - 1, tableTop + 12, 2, tableH - 12 - 4); });

    // Aviso y leyenda de las abreviaturas
    let y = tableTop + tableH + 36;
    for (const line of L.note) {
      write(ctx, line, T_PAD, y + 24, { font: `500 26px ${FONT_T}`, color: C.amber });
      y += T_LEGEND_LINE;
    }
    if (L.note.length) y += 12;
    for (const line of L.legend) {
      write(ctx, line, T_PAD, y + 24, { font: `500 26px ${FONT_T}`, color: C.muted });
      y += T_LEGEND_LINE;
    }

    ctx.fillStyle = C.line;
    ctx.fillRect(T_PAD, TH - 124, TW - T_PAD * 2, 2);
    write(ctx, m.host, TW / 2, TH - 74, { font: `700 36px ${FONT_D}`, color: C.green, align: 'center' });
    write(ctx, 'Estadísticas de baloncesto formativo', TW / 2, TH - 34, { font: `500 24px ${FONT_T}`, color: C.muted, align: 'center' });
  }

  /* Espera a las fuentes de la app (Rajdhani y Barlow) para que no se dibuje con la de reserva. Si no están, se sigue. */
  async function loadFonts() {
    const fonts = root.document && root.document.fonts;
    if (!fonts || !fonts.load) return;
    try {
      await Promise.all(['700 100px Rajdhani', '600 40px Rajdhani', '500 40px Barlow', '600 40px Barlow'].map((f) => fonts.load(f)));
    } catch (e) { /* se dibuja con la fuente de reserva */ }
  }

  /* Promesa con el PNG de la tarjeta (Blob) */
  async function toBlob(model) {
    await loadFonts();
    const canvas = root.document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Sin canvas');
    if (model.type === 'table') {
      const size = tableLayout(ctx, model);
      canvas.width = size.W;
      canvas.height = size.H;
    }
    draw(ctx, model);
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Sin imagen'))), 'image/png');
    });
  }

  /* Nombre de archivo solo ASCII: con una letra acentuada en el atributo download, Chromium descarga el archivo como
     «download», sin la extensión .png. */
  function slug(str) {
    return String(str)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  }

  /* partido-Alevin_A-Rival-03_10_2026.png */
  function fileName(m) {
    return `${slug(['partido', m.home.name, m.away.name, m.date].join('-'))}.png`;
  }

  /* estadisticas-2026-10-03-vs-Rival.png (la misma base que el CSV) */
  function tableFileName(m) {
    return `${slug(m.fileBase)}.png`;
  }

  root.MBCard = Object.freeze({ WIDTH: W, HEIGHT: H, draw, toBlob, fileName, tableFileName, tableLayout });
})(globalThis);
