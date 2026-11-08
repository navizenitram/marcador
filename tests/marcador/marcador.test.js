import { describe, expect, it } from 'vitest';
import { openScoreboard } from '../helpers/marcador.js';

const cells = (tr) => [...tr.cells].map((td) => td.textContent);

describe('preparación del partido', () => {
  it('arranca en la pantalla de equipos con 8 periodos', () => {
    const sb = openScoreboard();
    expect(sb.screen).toBe('setup');
    expect(sb.$('.q-btn.active').dataset.q).toBe('8');
  });

  it('usa «Local» y «Visitante» si no se escriben nombres', () => {
    const sb = openScoreboard();
    sb.start();
    expect(sb.screen).toBe('scoreboard');
    expect(sb.text('#dispNameA')).toBe('Local');
    expect(sb.text('#dispNameB')).toBe('Visitante');
    expect(sb.text('#qSub')).toBe('de 8');
  });

  it('respeta los nombres y la duración elegida', () => {
    const sb = openScoreboard();
    sb.start({ nameA: ' Osos ', nameB: 'Linces', quarters: 4 });
    expect(sb.game).toMatchObject({ nameA: 'Osos', nameB: 'Linces', numQ: 4 });
    expect(sb.game.scoresA).toHaveLength(4);
    expect(sb.text('#qSub')).toBe('de 4');
  });

  it('Intro en el nombre del visitante empieza el partido', () => {
    const sb = openScoreboard();
    sb.$('#nameB').dispatchEvent(new sb.window.KeyboardEvent('keydown', { key: 'Enter' }));
    expect(sb.screen).toBe('scoreboard');
  });
});

describe('marcador', () => {
  it('suma puntos al periodo actual y al total', () => {
    const sb = openScoreboard();
    sb.start();
    sb.press("addScore('A',2)");
    sb.press("addScore('A',3)");
    sb.press("addScore('B',1)");
    expect(sb.text('#qScoreA')).toBe('5');
    expect(sb.text('#totalA')).toBe('5');
    expect(sb.text('#totalB')).toBe('1');
  });

  it('el botón − corrige, sin bajar de 0 en el periodo', () => {
    const sb = openScoreboard();
    sb.start();
    sb.press("addScore('A',2)");
    sb.press("addScore('A',-1)", 3);
    expect(sb.game.scoresA[0]).toBe(0);
  });

  it('cada periodo lleva su propio marcador y el total los suma', () => {
    const sb = openScoreboard();
    sb.start();
    sb.press("addScore('A',2)");
    sb.press('changeQ(1)');
    expect(sb.text('#qLabel')).toBe('Q2');
    expect(sb.text('#qScoreA')).toBe('0');
    sb.press("addScore('A',3)");
    expect(sb.text('#totalA')).toBe('5');
    expect([...sb.game.scoresA.slice(0, 2)]).toEqual([2, 3]);
  });

  it('no pasa del primer ni del último periodo', () => {
    const sb = openScoreboard();
    sb.start({ quarters: 4 });
    expect(sb.$('#btnPrev').disabled).toBe(true);
    sb.window.changeQ(-1);
    expect(sb.game.currentQ).toBe(0);

    sb.press('changeQ(1)', 3);
    expect(sb.text('#qLabel')).toBe('Q4');
    expect(sb.$('#btnNext').disabled).toBe(true);
    sb.window.changeQ(1);
    expect(sb.game.currentQ).toBe(3);
  });

  it('la barra de historial tiene un hueco por periodo y permite saltar a cualquiera', () => {
    const sb = openScoreboard();
    sb.start({ quarters: 4 });
    expect(sb.$$('.h-quarter')).toHaveLength(4);
    sb.$$('.h-quarter')[2].click();
    expect(sb.game.currentQ).toBe(2);
    expect(sb.$$('.h-quarter')[2].classList.contains('active')).toBe(true);
  });

  it('cuenta las faltas por periodo, de 0 a 5', () => {
    const sb = openScoreboard();
    sb.start();
    sb.press("addFoul('A',1)", 7);
    expect(sb.game.foulsA[0]).toBe(5);
    expect(sb.$$('#foulsA .foul-dot.on')).toHaveLength(5);
    sb.press("addFoul('A',-1)", 6);
    expect(sb.game.foulsA[0]).toBe(0);

    sb.press("addFoul('B',1)", 2);
    sb.press('changeQ(1)');
    expect(sb.$$('#foulsB .foul-dot.on')).toHaveLength(0);  // las faltas empiezan de cero en cada periodo
    expect(sb.window.totalFoulsOf('B')).toBe(2);
  });
});

describe('estadísticas', () => {
  /*
   * Q1: Osos 3 – 3 Linces (2-0, 2-3, 3-3)
   * Q2: Osos 2 – 0 Linces (5-3)
   * Q3: Osos 0 – 4 Linces (5-5, 5-7)
   * Q4: sin puntos
   */
  const played = () => {
    const sb = openScoreboard();
    sb.start({ nameA: 'Osos', nameB: 'Linces', quarters: 4 });
    sb.press("addScore('A',2)"); sb.press("addScore('B',3)"); sb.press("addScore('A',1)");
    sb.press('changeQ(1)');
    sb.press("addScore('A',2)");
    sb.press('changeQ(1)');
    sb.press("addScore('B',2)", 2);
    sb.press('openStats()');
    return sb;
  };

  it('muestra el resultado, los periodos ganados y la tabla por periodo', () => {
    const sb = played();
    expect(sb.screen).toBe('stats');
    expect([sb.text('#sTotalA'), sb.text('#sTotalB')]).toEqual(['5', '7']);
    expect([sb.text('#qWonA'), sb.text('#qWonB')]).toEqual(['1', '1']);  // el empate del Q1 no cuenta

    const [, rowA, rowB] = sb.$$('#qTable tr');
    expect(cells(rowA)).toEqual(['Osos', '3', '2', '0', '0', '5']);
    expect(cells(rowB)).toEqual(['Linces', '3', '0', '4', '0', '7']);
    expect(rowA.cells[2].classList.contains('won')).toBe(true);
    expect(rowB.cells[3].classList.contains('won')).toBe(true);
  });

  it('cuenta cuántas canastas se anotaron yendo por delante, por detrás o empatados', () => {
    const sb = played();
    expect([sb.text('#leadValA'), sb.text('#leadValB'), sb.text('#leadValTie')]).toEqual(['2', '2', '2']);
    expect(parseFloat(sb.$('#leadFillA').style.width)).toBeCloseTo(100 / 3);
  });

  it('dibuja la evolución acumulada y los puntos por periodo', () => {
    const sb = played();
    const [line, bar] = sb.charts;
    expect(line.config.type).toBe('line');
    expect(line.config.data.datasets.map((d) => [d.label, [...d.data]])).toEqual([['Osos', [3, 5, 5, 5]], ['Linces', [3, 3, 7, 7]]]);
    expect(bar.config.type).toBe('bar');
    expect(bar.config.data.datasets.map((d) => [...d.data])).toEqual([[3, 2, 0, 0], [3, 0, 4, 0]]);
  });

  it('al volver a abrirlas sustituye las gráficas anteriores', () => {
    const sb = played();
    sb.press("showScreen('scoreboard')");
    sb.press('openStats()');
    expect(sb.charts).toHaveLength(4);
    expect(sb.charts.map((c) => c.destroyed)).toEqual([true, true, false, false]);
  });
});

describe('reiniciar', () => {
  it('«reiniciar marcador» pone todo a cero y mantiene equipos y duración', () => {
    const sb = openScoreboard();
    sb.start({ nameA: 'Osos', nameB: 'Linces', quarters: 4 });
    sb.press("addScore('A',3)");
    sb.press("addFoul('B',1)");
    sb.press('changeQ(1)');
    sb.press('showResetModal()');
    sb.press('resetScores()');
    expect(sb.game).toMatchObject({ nameA: 'Osos', nameB: 'Linces', numQ: 4, currentQ: 0, lead: { A: 0, B: 0, tie: 0 } });
    expect([...sb.game.scoresA, ...sb.game.foulsB].every((v) => v === 0)).toBe(true);
    expect(sb.$('#resetModal').style.display).toBe('none');
  });

  it('«nuevo partido» vuelve a la pantalla de equipos', () => {
    const sb = openScoreboard();
    sb.start();
    sb.press('showResetModal()');
    sb.press('resetGame()');
    expect(sb.game).toBeNull();
    expect(sb.screen).toBe('setup');
  });
});

describe('tema', () => {
  it('se guarda en la misma clave que la app de estadísticas', () => {
    const sb = openScoreboard();
    sb.press('toggleTheme()');
    expect(sb.document.body.classList.contains('light')).toBe(true);
    expect(sb.window.localStorage.getItem('mb_theme')).toBe('light');
    expect(sb.text('#themeToggleSetup')).toBe('☀️');
  });

  it('arranca en modo claro si se eligió antes', () => {
    const sb = openScoreboard({ storage: { mb_theme: 'light' } });
    expect(sb.document.body.classList.contains('light')).toBe(true);
  });
});
