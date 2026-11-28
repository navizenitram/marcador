// Carga el parser de voz (public/minibasket-stats/voz.js) en un contexto vacío, sin DOM ni window.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const FILE = fileURLToPath(new URL('../../public/minibasket-stats/voz.js', import.meta.url));
const SCRIPT = new vm.Script(readFileSync(FILE, 'utf8'), { filename: FILE });

/** Devuelve el objeto MBVoice de una carga nueva de voz.js */
export function loadVoice() {
  const ctx = vm.createContext({});
  SCRIPT.runInContext(ctx);
  return ctx.MBVoice;
}
