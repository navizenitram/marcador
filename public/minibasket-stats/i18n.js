'use strict';

/* ════════════════════════════════════════════════════════════════
   My Own Basketball Stats — textos por idioma.
   Los diccionarios (i18n/<idioma>.js) se añaden a MBStrings; este script expone MBI18n:
     t('clave', { n: 3 })   texto con variables {n}; si el valor es { one, other }, elige según n (plural)
     fmtNum(0.5, 2)         número con el formato del idioma («0,5»)
     fmtPct(0.48)           porcentaje redondeado («48 %»)
   Si una clave no está en el idioma activo se usa la de castellano; si tampoco, se devuelve la clave y se avisa.
   ════════════════════════════════════════════════════════════════ */

(function (root) {
  const strings = () => root.MBStrings || {};
  let locale = 'es';

  function setLocale(l) { if (strings()[l]) locale = l; }

  function t(key, vars) {
    const dict = strings();
    let s = (dict[locale] && dict[locale][key]) ?? (dict.es && dict.es[key]);
    if (s == null) {
      if (root.console) root.console.warn(`Falta el texto ${key}`);
      return key;
    }
    if (typeof s === 'object') s = s[new Intl.PluralRules(locale).select(Number(vars && vars.n))] ?? s.other;
    return s.replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));
  }

  const fmtNum = (n, digits = 1) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n);
  const fmtPct = (x) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(x);

  root.MBI18n = Object.freeze({ t, setLocale, locale: () => locale, fmtNum, fmtPct });
})(globalThis);
