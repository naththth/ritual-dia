import { describe, expect, it } from 'vitest';
import type { MacroCycle, Workout } from '../../src/db/types';
import { isDeload, levelsOf, macroWeeks, nextLevel, phaseOf, plannedBySport, skeletonFor, weekToPropose, doneBySport } from '../../src/domain/periodization';
import { hrvLow, sessionsFrom } from '../../src/domain/trainingWeek';

// Ciclo fictício: 19 semanas, pedal 50 km no sábado e corrida 10 km no domingo da última semana.
const macro: MacroCycle = {
  id: 'macro:atual', kind: 'macro', createdAt: 1, updatedAt: 1, title: 'Teste', active: true,
  start: '2030-01-07',
  events: [
    { date: '2030-05-18', sport: 'ciclismo', label: '50 km de pedal', distanceKm: 50 },
    { date: '2030-05-19', sport: 'corrida', label: '10 km de corrida', distanceKm: 10 }
  ],
  frame: {
    1: [{ key: 'strength', templateId: 'wtemplate:a' }, { key: 'yoga' }],
    2: [{ key: 'lpo', templateId: 'wtemplate:lpo' }],
    3: [{ key: 'run_main', minutes: 55 }],
    4: [{ key: 'strength', templateId: 'wtemplate:b' }, { key: 'run_easy', minutes: 25 }],
    5: [{ key: 'bike', minutes: 60 }],
    6: [{ key: 'yoga_class', templateId: 'wtemplate:yoga' }, { key: 'bike_long' }],
    7: [{ key: 'run_long' }, { key: 'yoga' }]
  },
  deloads: ['2030-02-04', '2030-03-04', '2030-03-25', '2030-04-22'],
  runLong: [35, 85],
  bikeLong: [45, 120]
};
const fixed = (id: string) => ({ 'wtemplate:a': 35, 'wtemplate:b': 35, 'wtemplate:lpo': 60, 'wtemplate:yoga': 60 } as Record<string, number>)[id];

describe('periodização', () => {
  it('conta as semanas até a semana dos desafios e divide as fases', () => {
    expect(macroWeeks(macro)).toBe(19);
    expect(phaseOf(macro, 1)).toBe('base');
    expect(phaseOf(macro, 7)).toBe('base');
    expect(phaseOf(macro, 8)).toBe('construcao');
    expect(phaseOf(macro, 13)).toBe('construcao');
    expect(phaseOf(macro, 14)).toBe('especifico');
    expect(phaseOf(macro, 17)).toBe('especifico');
    expect(phaseOf(macro, 18)).toBe('polimento');
    expect(phaseOf(macro, 19)).toBe('polimento');
  });
  it('semanas leves nas datas marcadas e nunca no polimento', () => {
    expect([5, 9, 12, 16].every((i) => isDeload(macro, i))).toBe(true);
    expect(isDeload(macro, 4)).toBe(false);
    expect(isDeload(macro, 19)).toBe(false);
    expect(levelsOf(macro)).toBe(13);
  });
  it('longos vão do começo ao pico; semana leve corta; fixas ficam como estão', () => {
    const w1 = skeletonFor(macro, 1, 0, fixed);
    const peak = skeletonFor(macro, 17, 12, fixed);
    expect(w1.days[7][0].minutes).toBe(35);
    expect(peak.days[7][0].minutes).toBe(85);
    expect(peak.days[6][1].minutes).toBe(120);
    expect(w1.days[1][0]).toMatchObject({ key: 'strength', minutes: 35, templateId: 'wtemplate:a' });
    expect(w1.days[2][0].minutes).toBe(60);
    const dl = skeletonFor(macro, 5, 3, fixed);
    expect(dl.deload).toBe(true);
    expect(dl.days[7][0].minutes).toBeLessThan(skeletonFor(macro, 6, 3, fixed).days[7][0].minutes);
    expect(dl.days[3][0].intent).toMatch(/leve/i);
  });
  it('respeita o teto de minutos do dia útil', () => {
    const peak = skeletonFor(macro, 17, 12, fixed);
    expect(peak.days[3][0].minutes).toBeLessThanOrEqual(55);
    expect(peak.days[4][1].minutes).toBeLessThanOrEqual(25);
    expect(peak.days[5][0].minutes).toBeLessThanOrEqual(60);
  });
  it('semana 2 tem o teste de limiar na corrida principal', () => {
    expect(skeletonFor(macro, 2, 1, fixed).days[3][0].intent).toMatch(/Teste de 30 min/);
  });
  it('semana dos desafios: pedal no sábado, corrida no domingo, véspera leve', () => {
    const last = skeletonFor(macro, 19, 12, fixed);
    expect(last.days[6][1].event?.label).toBe('50 km de pedal');
    expect(last.days[7][0].event?.label).toBe('10 km de corrida');
    // sexta é véspera do pedal: o pedal de sexta fica curto
    expect(last.days[5][0].minutes).toBeLessThanOrEqual(25);
  });
  it('sobe um degrau quando a semana foi cumprida', () => {
    const prev = skeletonFor(macro, 2, 1, fixed);
    const p = plannedBySport(prev);
    expect(nextLevel(macro, 3, { level: 1, skeleton: prev }, p, {})).toEqual({ level: 2, holds: [] });
  });
  it('segura com pouco treino, fadiga alta ou VFC baixa; volta um degrau se quase nada aconteceu', () => {
    const prev = skeletonFor(macro, 3, 2, fixed);
    const p = plannedBySport(prev);
    const half = { corrida: p.corrida * 0.5, ciclismo: p.ciclismo * 0.5 };
    expect(nextLevel(macro, 4, { level: 2, skeleton: prev }, half, {}).level).toBe(2);
    expect(nextLevel(macro, 4, { level: 2, skeleton: prev }, { corrida: 0, ciclismo: 10 }, {}).level).toBe(1);
    const tired = nextLevel(macro, 4, { level: 2, skeleton: prev }, p, { tsb: -30 });
    expect(tired.level).toBe(2);
    expect(tired.holds[0]).toMatch(/Fadiga/);
    expect(nextLevel(macro, 4, { level: 2, skeleton: prev }, p, { hrvLow: true }).level).toBe(2);
  });
  it('semana leve não sobe, e a seguinte volta a subir', () => {
    const w4 = skeletonFor(macro, 4, 3, fixed);
    expect(nextLevel(macro, 5, { level: 3, skeleton: w4 }, plannedBySport(w4), {}).level).toBe(3);
    const w5 = skeletonFor(macro, 5, 3, fixed);
    expect(nextLevel(macro, 6, { level: 3, skeleton: w5 }, { corrida: 0, ciclismo: 0 }, {}).level).toBe(4);
  });
  it('quando propor: domingo à tarde a próxima; começo da semana a atual; antes do ciclo, 3 dias antes', () => {
    expect(weekToPropose(macro, '2030-01-05', 10)).toBe('2030-01-07');
    expect(weekToPropose(macro, '2030-01-02', 10)).toBe(null);
    expect(weekToPropose(macro, '2030-01-13', 18)).toBe('2030-01-14');
    expect(weekToPropose(macro, '2030-01-13', 9)).toBe(null);
    expect(weekToPropose(macro, '2030-01-15', 9)).toBe('2030-01-14');
    expect(weekToPropose(macro, '2030-01-18', 9)).toBe(null);
    expect(weekToPropose(macro, '2030-05-26', 9)).toBe(null);
  });
  it('soma o feito por esporte', () => {
    const w = (m: string, d: number) => ({ id: m + d, kind: 'workout', createdAt: 1, updatedAt: 1, date: '2030-01-08', modalityId: m, duration: d } as unknown as Workout);
    expect(doneBySport([w('mod:corrida', 30), w('mod:ciclismo', 45), w('mod:musculacao', 40)])).toEqual({ corrida: 30, ciclismo: 45 });
  });
});

describe('proposta da treinadora', () => {
  const sk = skeletonFor(macro, 3, 2, fixed);
  it('fixas usam o modelo de sempre; sessão que faltou vem do esqueleto; minutos fora do alvo voltam ao alvo', () => {
    const r = { sessoes: [{ dia: 3, chave: 'run_main', nome: 'Corrida contínua Z2', minutos: 200, intensidade: 'leve', blocos: [{ rotulo: 'Leve', minutos: 20, pct: 60, alvo: 'FC 130-140' }] }] };
    const s = sessionsFrom(sk, r, (id) => ({ 'wtemplate:a': 'Musculação A' } as Record<string, string>)[id]);
    const mon = s.filter((x) => x.day === 1);
    expect(mon[0]).toMatchObject({ templateId: 'wtemplate:a', name: 'Musculação A' });
    expect(mon[1]).toMatchObject({ key: 'yoga', name: 'Ioga', duration: 20 });
    const wed = s.find((x) => x.day === 3)!;
    expect(wed.name).toBe('Corrida contínua Z2');
    expect(wed.duration).toBe(sk.days[3][0].minutes);
    // blocos escalados para fechar o tempo e com o alvo da corrida
    expect(Math.round(wed.steps!.reduce((a, b) => a + b.minutes, 0))).toBe(wed.duration);
    expect(wed.steps![0].target).toBe('FC 130-140');
  });
  it('pedal não leva alvo de texto nos blocos (vira watts pelo FTP)', () => {
    const r = { sessoes: [{ dia: 5, chave: 'bike', nome: 'Sweet spot', minutos: sk.days[5][0].minutes, blocos: [{ rotulo: 'Aquecimento', minutos: 10, pct: 55, alvo: 'x' }, { rotulo: 'SS', minutos: sk.days[5][0].minutes - 10, pct: 90 }] }] };
    const fri = sessionsFrom(sk, r, () => undefined).find((x) => x.day === 5)!;
    expect(fri.steps!.every((b) => b.target === undefined)).toBe(true);
  });
  it('VFC baixa só com 3 dias seguidos abaixo de 90% da média', () => {
    const ws = Array.from({ length: 20 }, (_, i) => ({ date: `2030-01-${String(i + 1).padStart(2, '0')}`, hrv: 60 }));
    expect(hrvLow(ws, '2030-01-20')).toBe(false);
    ws[17].hrv = 50; ws[18].hrv = 50; ws[19].hrv = 50;
    expect(hrvLow(ws, '2030-01-20')).toBe(true);
    ws[18].hrv = 58;
    expect(hrvLow(ws, '2030-01-20')).toBe(false);
  });
});

describe('teste de limiar', () => {
  it('cabe aquecimento, 30 min de teste e volta à calma', () => {
    expect(skeletonFor(macro, 2, 1, fixed).days[3][0].minutes).toBe(45);
  });
});
