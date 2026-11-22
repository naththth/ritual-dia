import { describe, expect, it } from 'vitest';
import type { WeekSkeleton } from '../../src/db/types';
import { adjustSkeleton, sessionsFrom } from '../../src/domain/trainingWeek';

// Semana fictícia parecida com a da base: pedal e ioga na segunda, LPO terça e quinta, força sexta e sábado, longo no domingo.
const base: WeekSkeleton = {
  index: 3, total: 20, start: '2030-01-07', phase: 'base', deload: false, level: 0, levels: 4,
  days: {
    1: [{ key: 'bike', minutes: 40, intent: 'Z2' }, { key: 'yoga', minutes: 20, intent: 'mobilidade' }],
    2: [{ key: 'lpo', minutes: 60, intent: 'aula', templateId: 'wtemplate:lpo' }],
    3: [{ key: 'run_main', minutes: 30, intent: 'base' }],
    4: [{ key: 'lpo', minutes: 60, intent: 'aula', templateId: 'wtemplate:lpo' }],
    5: [{ key: 'strength', minutes: 45, intent: 'A', templateId: 'wtemplate:a' }, { key: 'run_easy', minutes: 25, intent: 'leve' }],
    6: [{ key: 'strength', minutes: 45, intent: 'B', templateId: 'wtemplate:b' }, { key: 'bike_long', minutes: 70, intent: 'longo' }],
    7: [{ key: 'run_long', minutes: 50, intent: 'longo' }]
  }
};

// Pedido: força na segunda, LPO terça e quinta, cardio na quarta, sexta de folga, competição de LPO no fim de semana.
const resposta = {
  esqueleto_ajustado: [
    { dia: 1, sessoes: [{ chave: 'strength', de_dia: 5 }] },
    { dia: 2, sessoes: [{ chave: 'lpo', de_dia: 2 }] },
    { dia: 3, sessoes: [{ chave: 'run_main', de_dia: 3, minutos: 25 }, { chave: 'run_main', de_dia: 3 }] },
    { dia: 4, sessoes: [{ chave: 'lpo', de_dia: 4 }, { chave: 'bike', de_dia: 9 }] },
    { dia: 5, sessoes: [] }, { dia: 6, sessoes: [] }, { dia: 7, sessoes: [] }
  ],
  compromissos: [
    { dia: 6, chave: 'lpo', nome: 'Competição de LPO', minutos: 240, nota: 'Aquecer bem.' },
    { dia: 7, chave: 'lpo', nome: 'Competição de LPO', minutos: 240 },
    { dia: 7, chave: 'run_long', nome: 'Longo escondido', minutos: 90 }
  ],
  sessoes: [{ dia: 3, chave: 'run_main', nome: 'Corrida · Z2 curta', minutos: 25, intensidade: 'leve' }]
};

describe('pedido que muda a estrutura da semana', () => {
  const adj = adjustSkeleton(base, resposta)!;
  const keys = (d: number) => adj.days[d].map((s) => s.key);

  it('leva, tira e encurta sessões do esqueleto, sem duplicar nem inventar', () => {
    expect(keys(1)).toEqual(['strength']);
    expect(adj.days[1][0].templateId).toBe('wtemplate:a');
    expect(keys(2)).toEqual(['lpo']);
    // A mesma sessão não entra duas vezes; referência a dia inexistente é ignorada.
    expect(keys(3)).toEqual(['run_main']);
    expect(adj.days[3][0].minutes).toBe(25);
    expect(keys(4)).toEqual(['lpo']);
    expect(keys(5)).toEqual([]);
  });

  it('compromisso vira sessão com o nome dela; só modalidades fora do ciclo de endurance', () => {
    expect(keys(6)).toEqual(['lpo']);
    expect(keys(7)).toEqual(['lpo']);
    const ss = sessionsFrom(adj, resposta, () => 'Aula de LPO');
    const sab = ss.filter((s) => s.day === 6);
    expect(sab).toHaveLength(1);
    expect(sab[0]).toMatchObject({ name: 'Competição de LPO', modalityId: 'mod:lpo', duration: 240, intensity: 'intensa' });
    expect(sab[0].templateId).toBeUndefined();
    expect(ss.find((s) => s.day === 3)?.name).toBe('Corrida · Z2 curta');
  });

  it('desafio do ciclo nunca sai do dia', () => {
    const comDesafio: WeekSkeleton = { ...base, days: { ...base.days, 7: [{ key: 'run_long', minutes: 70, intent: 'prova', event: { date: '2030-01-13', sport: 'corrida', label: '10 km', distanceKm: 10 } }] } };
    const a = adjustSkeleton(comDesafio, { esqueleto_ajustado: [{ dia: 1, sessoes: [{ chave: 'run_long', de_dia: 7 }] }] })!;
    expect(a.days[1]).toEqual([]);
    expect(a.days[7][0].event?.label).toBe('10 km');
  });

  it('sem ajuste na resposta, a semana fica como a regra calculou', () => {
    expect(adjustSkeleton(base, { sessoes: [] })).toBeUndefined();
  });
});
