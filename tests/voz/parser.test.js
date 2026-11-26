import { describe, expect, it } from 'vitest';
import { loadVoice } from '../helpers/voz.js';
import { plain } from '../helpers/core.js';

const V = loadVoice();
const players = [
  { id: 'p4', number: '4' }, { id: 'p7', number: '7' }, { id: 'p10', number: '10' },
  { id: 'p13', number: '13' }, { id: 'p23', number: '23' },
];
const say = (text, ctx = {}) => plain(V.parse(text, { players, ...ctx }));
const ev = (type, pid, number) => ({ ok: true, kind: 'ev', type, pid, number });

describe('normalización y números', () => {
  it('quita acentos, signos y mayúsculas', () => {
    expect(V.normalize('¡Siete, TRIPLE fallado!')).toBe('siete triple fallado');
    expect(V.normalize(null)).toBe('');
  });
  it('pasa palabras a cifras, simples y compuestas', () => {
    expect(plain(V.numbers('siete'))).toEqual([7]);
    expect(plain(V.numbers('veintitres'))).toEqual([23]);
    expect(plain(V.numbers('treinta y cuatro'))).toEqual([34]);
    expect(plain(V.numbers('treinta'))).toEqual([30]);
    expect(plain(V.numbers('13 3'))).toEqual([13, 3]);
  });
});

describe('jugadas de un jugador', () => {
  it('tiros anotados', () => {
    expect(say('siete canasta')).toEqual(ev('t2_ok', 'p7', '7'));
    expect(say('7 doble')).toEqual(ev('t2_ok', 'p7', '7'));
    expect(say('diez triple')).toEqual(ev('t3_ok', 'p10', '10'));
    expect(say('cuatro libre')).toEqual(ev('t1_ok', 'p4', '4'));
    expect(say('veintitrés triple')).toEqual(ev('t3_ok', 'p23', '23'));
  });
  it('tiros fallados, con «falla» delante o «fallado» detrás', () => {
    expect(say('siete falla triple')).toEqual(ev('t3_ko', 'p7', '7'));
    expect(say('siete triple fallado')).toEqual(ev('t3_ko', 'p7', '7'));
    expect(say('trece falla canasta')).toEqual(ev('t2_ko', 'p13', '13'));
  });
  it('resto de acciones', () => {
    expect(say('diez rebote defensivo')).toEqual(ev('rd', 'p10', '10'));
    expect(say('diez rebote de ataque')).toEqual(ev('ro', 'p10', '10'));
    expect(say('cuatro asistencia')).toEqual(ev('ast', 'p4', '4'));
    expect(say('siete robo')).toEqual(ev('rec', 'p7', '7'));
    expect(say('siete pérdida')).toEqual(ev('lost', 'p7', '7'));
    expect(say('trece tapón')).toEqual(ev('blk', 'p13', '13'));
    expect(say('trece tapón recibido')).toEqual(ev('blkr', 'p13', '13'));
  });
  it('«falta recibida» no cuenta también como «falta»', () => {
    expect(say('cuatro falta recibida')).toEqual(ev('fr', 'p4', '4'));
    expect(say('cuatro falta')).toEqual(ev('fc', 'p4', '4'));
  });
});

describe('puntos del rival', () => {
  it('por número, por tiro y con «menos»', () => {
    expect(say('rival dos')).toEqual({ ok: true, kind: 'opp', pts: 2 });
    expect(say('rival 3')).toEqual({ ok: true, kind: 'opp', pts: 3 });
    expect(say('rival triple')).toEqual({ ok: true, kind: 'opp', pts: 3 });
    expect(say('rival menos uno')).toEqual({ ok: true, kind: 'opp', pts: -1 });
  });
  it('no acepta otra cosa que puntos', () => {
    expect(say('rival rebote').ok).toBe(false);
    expect(say('rival falla triple').ok).toBe(false);
    expect(say('rival cinco').ok).toBe(false);
  });
});

describe('lo que no debe apuntar', () => {
  it('un dorsal que no está en pista', () => {
    expect(say('nueve triple')).toMatchObject({ ok: false, reason: 'El 9 no está en pista' });
  });
  it('dorsal parecido: 13 no se confunde con 3, ni 23 con 2', () => {
    expect(say('tres triple')).toMatchObject({ ok: false });
    expect(say('dos canasta')).toMatchObject({ ok: false });
  });
  it('sin dorsal, sin acción, vacío', () => {
    expect(say('triple')).toMatchObject({ ok: false, reason: 'No he entendido el dorsal' });
    expect(say('siete')).toMatchObject({ ok: false, reason: 'No he entendido la jugada' });
    expect(say('   ')).toMatchObject({ ok: false });
  });
  it('dos jugadas o dos dorsales en una frase', () => {
    expect(say('siete triple asistencia')).toMatchObject({ ok: false });
    expect(say('siete diez triple')).toMatchObject({ ok: false });
  });
  it('«falla» sin tiro', () => {
    expect(say('siete falla rebote')).toMatchObject({ ok: false });
  });
});

describe('ajustes del equipo', () => {
  it('una acción desactivada no se apunta', () => {
    expect(say('siete asistencia', { enabled: ['t2_ok'] })).toMatchObject({ ok: false });
  });
  it('«rebote» a secas: con botón único, REB; con dos botones, pregunta cuál', () => {
    expect(say('diez rebote', { enabled: ['reb'] })).toEqual(ev('reb', 'p10', '10'));
    expect(say('diez rebote', { enabled: ['ro', 'rd'] })).toMatchObject({ ok: false, reason: '¿Rebote de ataque o defensivo?' });
    expect(say('diez rebote', { enabled: ['rd'] })).toEqual(ev('rd', 'p10', '10'));
  });
});
