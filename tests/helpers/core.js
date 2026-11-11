// Carga el núcleo de cálculo de la app (public/minibasket-stats/core.js) en un contexto vacío, sin DOM ni window.
// Si core.js tocara document, window, localStorage o el estado de app.js, fallaría al cargarlo o al usarlo aquí.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const FILE = fileURLToPath(new URL('../../public/minibasket-stats/core.js', import.meta.url));
const SCRIPT = new vm.Script(readFileSync(FILE, 'utf8'), { filename: FILE });

/** Devuelve el objeto MBCore de una carga nueva de core.js */
export function loadCore() {
  const ctx = vm.createContext({});
  SCRIPT.runInContext(ctx);
  return ctx.MBCore;
}

/** Copia sin prototipos de otro contexto, para comparar con toEqual */
export const plain = (v) => JSON.parse(JSON.stringify(v));
