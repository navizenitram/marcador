import { describe, expect, it } from 'vitest';
import { loadVoice } from '../helpers/voz.js';
import { plain } from '../helpers/core.js';

const V = loadVoice();
const players = [
  { id: 'p4', number: '4' }, { id: 'p7', number: '7' }, { id: 'p9', number: '9' }, { id: 'p10', number: '10' },
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
    expect(say('quince triple')).toMatchObject({ ok: false, reason: 'El 15 no está en pista' });
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

describe('diccionario: formas de decir cada tiro', () => {
  it.each([
    ['nueve canasta', 't2_ok'], ['9 canastas', 't2_ok'], ['nueve can asta', 't2_ok'], ['9 dobles', 't2_ok'],
    ['nueve de dos', 't2_ok'], ['nueve de dos puntos', 't2_ok'], ['9 dos puntos', 't2_ok'], ['nueve bandeja', 't2_ok'],
    ['nueve cesta', 't2_ok'], ['nueve encesta', 't2_ok'],
    ['nueve libre', 't1_ok'], ['9 libres', 't1_ok'], ['nueve tiro libre', 't1_ok'], ['nueve tiros libres', 't1_ok'],
    ['nueve de uno', 't1_ok'], ['nueve de un punto', 't1_ok'],
    ['siete triples', 't3_ok'], ['siete de tres', 't3_ok'], ['siete de tres puntos', 't3_ok'],
  ])('«%s» → %s', (text, type) => {
    expect(say(text)).toMatchObject({ ok: true, kind: 'ev', type });
  });
  it('tiros fallados con las mismas formas', () => {
    expect(say('nueve canasta fallada')).toMatchObject({ ok: true, type: 't2_ko' });
    expect(say('nueve falla de dos')).toMatchObject({ ok: true, type: 't2_ko' });
    expect(say('nueve no entra de dos')).toMatchObject({ ok: true, type: 't2_ko' });
    expect(say('nueve libre fallado')).toMatchObject({ ok: true, type: 't1_ko' });
    expect(say('nueve falla libres')).toMatchObject({ ok: true, type: 't1_ko' });
  });
  it('plurales de las demás acciones', () => {
    expect(say('diez rebotes')).toMatchObject({ type: 'reb' });
    expect(say('diez tapones')).toMatchObject({ type: 'blk' });
    expect(say('nueve perdidas')).toMatchObject({ type: 'lost' });
    expect(say('nueve asistencias')).toMatchObject({ type: 'ast' });
  });
  it('rival con «punto(s)» y «de tres»', () => {
    expect(say('rival un punto')).toEqual({ ok: true, kind: 'opp', pts: 1 });
    expect(say('rival dos puntos')).toEqual({ ok: true, kind: 'opp', pts: 2 });
    expect(say('rival de tres')).toEqual({ ok: true, kind: 'opp', pts: 3 });
  });
  it('«tiro libre» gana a «libre» sin dejar «tiro» suelto, y «de dos» no se toma por dorsal', () => {
    expect(say('nueve tiro libre')).toMatchObject({ ok: true, number: '9', type: 't1_ok' });
    expect(say('diez de dos')).toMatchObject({ ok: true, number: '10', type: 't2_ok' });
  });
});

describe('palabras que cambian el sentido: no se apunta nada', () => {
  const rejected = (text, ctx) => expect(say(text, ctx)).toMatchObject({ ok: false });
  it.each([
    'siete no ha entrado un triple', 'siete triple no ha entrado', 'siete sin canasta', 'siete canasta anulada',
    'no siete triple', 'siete no es canasta', 'siete eh triple',
  ])('negación o palabra desconocida: «%s»', (text) => {
    rejected(text);
    expect(say(text).reason).toContain('No he entendido');
  });
  it('«a siete» (la acción la recibe, no la comete) no se apunta como de siete', () => {
    rejected('tapon a siete');
    rejected('falta a siete');
    rejected('asistencia a siete');
  });
  it('«recibida» suelta no se ignora', () => {
    rejected('siete doble recibida');
  });
  it('del rival tampoco', () => {
    rejected('rival no triple');
    rejected('rival dos y siete');
  });
});

describe('lenguaje natural que sí se entiende', () => {
  const one = [{ id: 'p1', number: '1' }, { id: 'p7', number: '7' }, { id: 'p3', number: '3' }, { id: 'p20', number: '20' }, { id: 'p23', number: '23' }];
  it('relleno habitual no cambia la jugada', () => {
    expect(say('siete ha metido un triple', { players: one })).toMatchObject({ ok: true, number: '7', type: 't3_ok' });
    expect(say('siete anota una canasta', { players: one })).toMatchObject({ ok: true, number: '7', type: 't2_ok' });
    expect(say('un triple del siete', { players: one })).toMatchObject({ ok: true, number: '7', type: 't3_ok' });
  });
  it('«un» y «una» no son el dorsal 1', () => {
    expect(say('un triple', { players: one })).toMatchObject({ ok: false });
    expect(say('uno triple', { players: one })).toMatchObject({ ok: true, number: '1' });
  });
  it('«veinte y tres» es el 23, no el 20 y el 3', () => {
    expect(say('veinte y tres triple', { players: one })).toMatchObject({ ok: true, number: '23' });
    expect(say('veintitres triple', { players: one })).toMatchObject({ ok: true, number: '23' });
    expect(say('veinte triple', { players: one })).toMatchObject({ ok: true, number: '20' });
  });
  it('«de dos» / «de tres» frente a un dorsal 2 o 3 en pista', () => {
    const two = [{ id: 'p2', number: '2' }, { id: 'p3', number: '3' }];
    expect(say('dos de tres', { players: two })).toMatchObject({ ok: true, number: '2', type: 't3_ok' });
    expect(say('tres de dos', { players: two })).toMatchObject({ ok: true, number: '3', type: 't2_ok' });
  });
  it('un solo dorsal: dos números en la frase no se resuelven en silencio', () => {
    expect(say('cinco siete triple')).toMatchObject({ ok: false });
  });
  it('«rebote ataque» y «rebote defensa» sin «de»', () => {
    expect(say('siete rebote ataque')).toMatchObject({ ok: true, type: 'ro' });
    expect(say('siete rebote defensa')).toMatchObject({ ok: true, type: 'rd' });
  });
  it('el aviso de acción desactivada usa el nombre, no el código', () => {
    const r = say('siete triple', { enabled: ['t2_ok'] });
    expect(r.reason).toContain('triple');
    expect(r.reason).not.toContain('t3_ok');
  });
});
