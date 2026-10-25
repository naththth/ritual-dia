import { describe, expect, it } from 'vitest';
import { addDays, addMonths, fromKey, isoWeekday, monthGrid, toKey, todayKey, weekStart } from '../../src/lib/dates';
import {
  activesTogether, completeTask, habitDoneDates, habitProgress, matchesSearch, moveTask, planFor, plannedSkin,
  plannedTraining, planSaveTarget, suggestTasks, suggestionReason, tasksForDay, daySummary
} from '../../src/domain/rules';
import type { Habit, HabitLog, Plan, Product, SuggestionLog, Task, Workout } from '../../src/db/types';

const base = { createdAt: 1, updatedAt: 1 };
const task = (p: Partial<Task>): Task => ({ ...base, id: p.id ?? 't', kind: 'task', title: 'x', categoryId: 'cat:compras', priority: 'media', status: 'pendente', tags: [], subtasks: [], history: [], ...p } as Task);

describe('datas locais', () => {
  it('não desloca o dia perto da meia-noite em Brasília', () => {
    const late = new Date(2026, 9, 19, 23, 59, 0); // 19/10 23:59 local
    expect(toKey(late)).toBe('2026-10-19');
    expect(todayKey(new Date(2026, 9, 20, 0, 1))).toBe('2026-10-20');
  });
  it('ida e volta de chave sem perder dia', () => {
    expect(toKey(fromKey('2026-02-28'))).toBe('2026-02-28');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('19/10/2026 é segunda; semana começa na segunda', () => {
    expect(isoWeekday('2026-10-19')).toBe(1);
    expect(isoWeekday('2026-10-25')).toBe(7);
    expect(weekStart('2026-10-25')).toBe('2026-10-19');
  });
  it('troca de mês preserva dia válido', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    const g = monthGrid('2026-10-16');
    expect(g[0]).toBe('2026-09-28');
    expect(g.length % 7).toBe(0);
  });
});

describe('planos por dia da semana', () => {
  const products: Product[] = [
    { ...base, id: 'fps', kind: 'product', brand: 'A', name: 'FPS', group: 'fps', area: 'rosto', period: 'am', status: 'em_uso' },
    { ...base, id: 'limp', kind: 'product', brand: 'A', name: 'Gel', group: 'limpeza', area: 'rosto', period: 'ambos', status: 'em_uso' },
    { ...base, id: 'ret', kind: 'product', brand: 'A', name: 'Retinol', group: 'tratamentos', area: 'rosto', period: 'pm', status: 'em_uso', active: true },
    { ...base, id: 'bha', kind: 'product', brand: 'A', name: 'BHA', group: 'tratamentos', area: 'rosto', period: 'pm', status: 'em_uso', active: true },
    { ...base, id: 'hid', kind: 'product', brand: 'A', name: 'Creme', group: 'hidratacao', area: 'rosto', period: 'ambos', status: 'em_uso' },
    { ...base, id: 'outra', kind: 'product', brand: 'A', name: 'De outra pessoa', group: 'hidratacao', area: 'rosto', period: 'ambos', status: 'de_outra' }
  ];
  const plan: Plan = {
    ...base, id: 'p1', kind: 'plan', domain: 'skin', validFrom: '2026-10-01',
    skin: {
      am: { base: ['fps', 'limp', 'hid'], days: {} },
      pm: { base: ['hid', 'limp', 'outra'], days: { 1: { add: ['ret'], remove: [] }, 2: { add: ['bha'], remove: [] }, 3: { add: [], remove: ['hid'] } } },
      recovery: { am: ['limp', 'hid'], pm: ['hid'] }
    }
  };
  it('segunda à noite inclui retinol, ordenado por etapa e sem produto de outra pessoa', () => {
    expect(plannedSkin(plan, '2026-10-19', 'pm', products)).toEqual(['limp', 'ret', 'hid']);
  });
  it('terça à noite tem BHA, não retinol', () => {
    expect(plannedSkin(plan, '2026-10-20', 'pm', products)).toEqual(['limp', 'bha', 'hid']);
  });
  it('remoção vale só no dia configurado', () => {
    expect(plannedSkin(plan, '2026-10-21', 'pm', products)).toEqual(['limp']);
    expect(plannedSkin(plan, '2026-10-22', 'pm', products)).toEqual(['limp', 'hid']);
  });
  it('modo recuperação troca só aquele período', () => {
    expect(plannedSkin(plan, '2026-10-19', 'pm', products, true)).toEqual(['hid']);
    expect(plannedSkin(plan, '2026-10-19', 'am', products)).toEqual(['limp', 'hid', 'fps']);
  });
  it('alerta de conferência só com dois ativos marcados por ela', () => {
    expect(activesTogether(['ret', 'hid'], products)).toEqual([]);
    expect(activesTogether(['ret', 'bha'], products).map((p) => p.id)).toEqual(['ret', 'bha']);
    const corpo = { ...products.find((p) => p.id === 'bha')!, id: 'bhac', area: 'corpo' as const };
    expect(activesTogether(['ret', 'bhac'], [...products, corpo])).toEqual([]);
  });
  it('versão vigente respeita a data: o passado mantém o plano antigo', () => {
    const v2: Plan = { ...plan, id: 'p2', validFrom: '2026-11-01', skin: { ...plan.skin!, pm: { base: ['hid'], days: {} } } };
    expect(planFor([plan, v2], 'skin', '2026-10-19')?.id).toBe('p1');
    expect(planFor([plan, v2], 'skin', '2026-11-02')?.id).toBe('p2');
    expect(planFor([plan, v2], 'skin', '2026-09-30')).toBeUndefined();
  });
  it('salvar plano antigo cria nova versão a partir de hoje', () => {
    expect(planSaveTarget(plan, '2026-10-16')).toEqual({ mode: 'create', validFrom: '2026-10-16' });
    expect(planSaveTarget({ ...plan, validFrom: '2026-10-16' }, '2026-10-16')).toEqual({ mode: 'update', id: 'p1' });
    expect(planSaveTarget(undefined, '2026-10-16')).toEqual({ mode: 'create', validFrom: '2026-10-16' });
  });
  it('treino de segunda, quarta e sexta', () => {
    const tp: Plan = { ...base, id: 'tp', kind: 'plan', domain: 'training', validFrom: '2026-10-01', training: { 1: ['musc'], 3: ['musc'], 5: ['musc'] } };
    expect(plannedTraining(tp, '2026-10-19')).toEqual(['musc']);
    expect(plannedTraining(tp, '2026-10-20')).toEqual([]);
    // avulso combinado com a treinadora entra só naquele dia
    expect(plannedTraining(tp, '2026-10-20', [{ date: '2026-10-20', ref: 'pedal-x' }, { date: '2026-10-21', ref: 'outro' }])).toEqual(['pedal-x']);
    expect(plannedTraining(tp, '2026-10-19', [{ date: '2026-10-19', ref: 'musc' }, { date: '2026-10-19', ref: 'gone', deleted: 1 }])).toEqual(['musc']);
    expect(plannedTraining(tp, '2026-10-23')).toEqual(['musc']);
  });
});

describe('hábitos sem duplicação', () => {
  const musc: Habit = { ...base, id: 'h', kind: 'habit', title: 'Musculação', freq: 'semanal', target: 3, modalityId: 'mod:musculacao', priority: 'alta', order: 1 };
  const w = (date: string): Workout => ({ ...base, id: 'w' + date, kind: 'workout', date, modalityId: 'mod:musculacao', duration: 45 });
  const l = (date: string): HabitLog => ({ ...base, id: 'l' + date, kind: 'hlog', habitId: 'h', date, done: true });
  it('treino + marcação no mesmo dia contam uma vez', () => {
    const p = habitProgress(musc, '2026-10-19', [l('2026-10-19')], [w('2026-10-19')]);
    expect(p.count).toBe(1);
  });
  it('dois treinos no mesmo dia contam uma vez', () => {
    expect(habitDoneDates(musc, '2026-10-19', '2026-10-25', [], [w('2026-10-19'), { ...w('2026-10-19'), id: 'x' }])).toEqual(['2026-10-19']);
  });
  it('conta a semana de segunda a domingo, qualquer dia', () => {
    const p = habitProgress(musc, '2026-10-22', [l('2026-10-20')], [w('2026-10-19'), w('2026-10-25'), w('2026-10-26')]);
    expect(p.count).toBe(3);
    expect(p.target).toBe(3);
  });
});

describe('tarefas', () => {
  it('prioridade não vira data: tarefa sem dia não aparece no dia', () => {
    const t = task({ id: 'a', priority: 'alta' });
    expect(tasksForDay([t], '2026-10-19')).toEqual([]);
  });
  it('escolher dia, concluir e manter histórico', () => {
    let t = task({ id: 'a' });
    t = { ...t, ...moveTask(t, '2026-10-19') };
    expect(tasksForDay([t], '2026-10-19').map((x) => x.id)).toEqual(['a']);
    t = { ...t, ...completeTask(t, '2026-10-19') };
    expect(t.completedDate).toBe('2026-10-19');
    expect(t.history.length).toBe(2);
    expect(tasksForDay([t], '2026-10-19')[0].status).toBe('concluida');
    expect(tasksForDay([t], '2026-10-20')).toEqual([]);
  });
  it('busca ignora acento e encontra por etiqueta', () => {
    const t = task({ title: 'Comprar conjunto novo de treino', tags: ['roupa'] });
    expect(matchesSearch(t, 'roupa')).toBe(true);
    expect(matchesSearch(t, 'TREINO conjunto')).toBe(true);
    expect(matchesSearch(task({ title: 'Ir à farmácia' }), 'a farmacia')).toBe(true);
    expect(matchesSearch(t, 'sapato')).toBe(false);
  });
});

describe('sugestão de tarefas', () => {
  const ts = [
    task({ id: 'b', title: 'Baixa', priority: 'baixa' }),
    task({ id: 'a', title: 'Alta', priority: 'alta' }),
    task({ id: 'm', title: 'Média', priority: 'media' }),
    task({ id: 'c', title: 'Concluída', priority: 'alta', status: 'concluida' })
  ];
  it('ordena por prioridade e ignora concluídas', () => {
    expect(suggestTasks(ts, [], '2026-10-19').map((t) => t.id)).toEqual(['a', 'm', 'b']);
  });
  it('"agora não" tira a tarefa só daquele dia', () => {
    const logs: SuggestionLog[] = [{ ...base, id: 's', kind: 'suggestion', taskId: 'a', date: '2026-10-19', action: 'adiada' }];
    expect(suggestTasks(ts, logs, '2026-10-19')[0].id).toBe('m');
    expect(suggestTasks(ts, logs, '2026-10-20')[0].id).toBe('a');
  });
  it('não sugere o que já está no dia e respeita "sem gastar"', () => {
    const t2 = [...ts, task({ id: 'caro', priority: 'alta', costEst: 500 })];
    expect(suggestTasks(t2, [], '2026-10-19', { money: 'sem_gastar' }).map((t) => t.id)).not.toContain('caro');
    const planned = [task({ id: 'a', priority: 'alta', plannedDate: '2026-10-19' })];
    expect(suggestTasks(planned, [], '2026-10-19')).toEqual([]);
  });
  it('justificativa só com dados reais', () => {
    expect(suggestionReason(task({ priority: 'alta' }), 'Alta')).toBe('Prioridade alta.');
    expect(suggestionReason(task({ priority: 'alta', nextStep: 'Pedir orçamento' }), 'Alta')).toBe('Prioridade alta. Para começar: pedir orçamento.');
  });
});

describe('resumo do dia', () => {
  it('conta apenas áreas registradas', () => {
    expect(daySummary({ skinAm: true, skinPm: false, food: true, training: false, habits: false })).toEqual({ done: 2, total: 5 });
  });
});
