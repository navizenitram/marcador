// Contexto 2D falso para probar la tarjeta del partido sin navegador: jsdom no dibuja en <canvas> (getContext avisa de que
// no está implementado). Apunta cada texto que se escribe, con su posición, su fuente y su color, y mide el texto a
// razón de media altura de fuente por carácter, que basta para comprobar que un nombre largo se recorta.

/** Cuerpo de una fuente CSS en píxeles: «700 48px Rajdhani» → 48 */
const fontPx = (font) => parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '10');

/**
 * @param {object[]} [texts] donde se apuntan los textos escritos: { text, x, y, font, fillStyle, textAlign }
 */
export function fakeContext(texts = []) {
  const noop = () => {};
  const ctx = {
    font: '10px sans-serif',
    fillStyle: '#000',
    textAlign: 'start',
    createLinearGradient: () => ({ addColorStop: noop }),
    measureText: (t) => ({ width: String(t).length * fontPx(ctx.font) * 0.5 }),
    fillText(text, x, y) {
      texts.push({ text: String(text), x, y, font: ctx.font, fillStyle: ctx.fillStyle, textAlign: ctx.textAlign });
    },
  };
  for (const op of ['beginPath', 'moveTo', 'arcTo', 'closePath', 'fill', 'stroke', 'fillRect']) ctx[op] = noop;
  return ctx;
}

/** Solo los textos escritos, en el orden en que se dibujaron */
export const written = (texts) => texts.map((t) => t.text);
