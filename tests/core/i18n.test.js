// Base de i18n (i18n.js + i18n/es.js): textos con variables, plurales y formato de números por idioma.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const DIR = fileURLToPath(new URL('../../public/minibasket-stats/', import.meta.url));

/** Carga i18n.js con los diccionarios indicados (los de la app y otros de prueba) en un contexto sin DOM */
function loadI18n(extra = {}) {
  const warnings = [];
  const ctx = vm.createContext({ console: { warn: (...a) => warnings.push(a.join(' ')) } });
  for (const f of ['i18n/es.js', 'i18n.js']) vm.runInContext(readFileSync(DIR + f, 'utf8'), ctx, { filename: DIR + f });
  Object.assign(ctx.MBStrings, extra);
  return { i18n: ctx.MBI18n, strings: ctx.MBStrings, warnings };
}

describe('t', () => {
  const { i18n } = loadI18n({ xx: { 'test.hello': 'Hola, {name}', 'test.games': { one: '{n} partido', other: '{n} partidos' } } });
  i18n.setLocale('xx');

  it('sustituye las variables', () => expect(i18n.t('test.hello', { name: 'Ana' })).toBe('Hola, Ana'));
  it('deja la variable si no se pasa', () => expect(i18n.t('test.hello')).toBe('Hola, {name}'));
  it('elige singular o plural', () => {
    expect(i18n.t('test.games', { n: 1 })).toBe('1 partido');
    expect(i18n.t('test.games', { n: 3 })).toBe('3 partidos');
  });
  it('si falta en el idioma activo, usa el castellano', () => {
    expect(i18n.t('adv.efg.name')).toBe(loadI18n().strings.es['adv.efg.name']);
  });
});

describe('claves que no existen', () => {
  it('devuelven la clave y avisan por consola', () => {
    const { i18n, warnings } = loadI18n();
    expect(i18n.t('no.existe')).toBe('no.existe');
    expect(warnings.join()).toContain('no.existe');
  });
});

describe('idioma', () => {
  it('empieza en castellano e ignora idiomas sin diccionario', () => {
    const { i18n } = loadI18n();
    expect(i18n.locale()).toBe('es');
    i18n.setLocale('kl');
    expect(i18n.locale()).toBe('es');
  });
});

describe('números', () => {
  const { i18n } = loadI18n();
  it('decimales con coma en castellano', () => {
    expect(i18n.fmtNum(0.5, 2)).toBe('0,5');
    expect(i18n.fmtNum(1.256, 2)).toBe('1,26');
  });
  it('porcentajes redondeados, con el formato del idioma', () => {
    expect(i18n.fmtPct(0.4789).replace(/\s/g, ' ')).toBe('48 %');
  });
});

describe('diccionario es', () => {
  it('no tiene textos vacíos', () => {
    const { strings } = loadI18n();
    const empty = Object.entries(strings.es).filter(([, v]) => (typeof v === 'string' ? !v.trim() : !v.other));
    expect(empty).toEqual([]);
  });
});
