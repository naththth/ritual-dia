import { describe, expect, it } from 'vitest';
import { plannedFood, plannedSkin, plannedTraining } from '../../src/domain/rules';
import { applyWeekChanges, productStep } from '../../src/domain/skinSteps';
import { itemFrom } from '../../src/domain/nutri';
import type { Plan, Product } from '../../src/db/types';

const base = { createdAt: 1, updatedAt: 1 };
const prod = (id: string, p: Partial<Product>): Product => ({ ...base, id, kind: 'product', brand: 'M', name: id, group: 'hidratacao', area: 'rosto', period: 'ambos', status: 'em_uso', ...p } as Product);

describe('etapas da rotina', () => {
  it('deduz banho e depois do banho pelo tipo, nome e modo de uso', () => {
    expect(productStep(prod('a', { group: 'limpeza', name: 'Gel de limpeza' }))).toBe('banho');
    expect(productStep(prod('b', { group: 'seruns', name: 'Sérum de niacinamida' }))).toBe('pos');
    expect(productStep(prod('c', { group: 'cabelo', area: 'cabelo', name: 'Shampoo suave' }))).toBe('banho');
    expect(productStep(prod('d', { group: 'cabelo', area: 'cabelo', name: 'Condicionador sem enxágue' }))).toBe('pos');
    expect(productStep(prod('e', { group: 'cabelo', area: 'cabelo', name: 'Óleo de pontas' }))).toBe('pos');
    expect(productStep(prod('f', { group: 'corpo', area: 'corpo', name: 'Loção de ureia' }))).toBe('pos');
    expect(productStep(prod('g', { group: 'corpo', area: 'corpo', name: 'Esfoliante corporal' }))).toBe('banho');
    expect(productStep(prod('h', { group: 'cabelo', area: 'cabelo', name: 'Máscara Nutritiva', info: { howToUse: 'Aplique e enxágue após 5 minutos.' } }))).toBe('banho');
    expect(productStep(prod('i', { group: 'limpeza', name: 'Creme de limpeza' }))).toBe('banho');
  });
  it('a escolha dela vale sobre a dedução', () => {
    expect(productStep(prod('a', { group: 'limpeza', name: 'Gel de limpeza', step: 'pos' }))).toBe('pos');
  });
});

describe('combinado do dia com a dermatologista', () => {
  const plan = { ...base, id: 'p', kind: 'plan', domain: 'skin', validFrom: '2026-10-01', skin: { am: { base: ['a'], days: {} }, pm: { base: ['a', 'r'], days: {} }, recovery: { am: [], pm: ['a'] } } } as Plan;
  const products = [prod('a', { group: 'limpeza' }), prod('r', { group: 'tratamentos', active: true }), prod('s', { group: 'seruns' })];
  it('tira e põe só naquela data e naquele período', () => {
    const mods = {
      skips: [{ date: '2026-10-25', domain: 'skin', ref: 'pm:r' }],
      extras: [{ date: '2026-10-25', domain: 'skin', ref: 'pm:s' }]
    };
    expect(plannedSkin(plan, '2026-10-25', 'pm', products, false, mods)).toEqual(['a', 's']);
    expect(plannedSkin(plan, '2026-10-25', 'am', products, false, mods)).toEqual(['a']);
    expect(plannedSkin(plan, '2026-10-26', 'pm', products, false, mods)).toEqual(['a', 'r']);
  });
  it('vale mesmo sem plano e ignora pulos de treino', () => {
    expect(plannedSkin(undefined, '2026-10-25', 'pm', products, false, { extras: [{ date: '2026-10-25', domain: 'skin', ref: 'pm:s' }] })).toEqual(['s']);
    expect(plannedSkin(plan, '2026-10-25', 'pm', products, false, { skips: [{ date: '2026-10-25', domain: 'training', ref: 'pm:r' }] })).toEqual(['a', 'r']);
  });
  it('avulsos de pele e de comida não viram treino', () => {
    const tp = { ...base, id: 't', kind: 'plan', domain: 'training', validFrom: '2026-10-01', training: { 7: ['w1'] } } as Plan;
    expect(plannedTraining(tp, '2026-10-25', [{ date: '2026-10-25', domain: 'skin', ref: 'pm:s' }, { date: '2026-10-25', ref: 'w2' }])).toEqual(['w1', 'w2']);
  });
});

describe('mudanças da semana', () => {
  const skin = { am: { base: ['a', 'f'], days: { 3: { add: ['x'], remove: [] } } }, pm: { base: ['a', 'm'], days: { 2: { add: ['r'], remove: ['m'] } } }, recovery: { am: [], pm: [] } };
  it('todos os dias mexe na base e limpa os dias', () => {
    const out = applyWeekChanges(skin, [{ period: 'pm', weekday: 0, add: ['r'], remove: ['m'] }]);
    expect(out.pm.base).toEqual(['a', 'r']);
    expect(out.pm.days[2]).toEqual({ add: [], remove: [] });
    expect(skin.pm.base).toEqual(['a', 'm']); // não altera o original
  });
  it('um dia: entra o que não é da base e sai o que é', () => {
    const out = applyWeekChanges(skin, [{ period: 'am', weekday: 3, add: ['v', 'a'], remove: ['f', 'x'] }, { period: 'pm', weekday: 2, add: ['m'], remove: [] }]);
    expect(out.am.days[3]).toEqual({ add: ['v'], remove: ['f'] });
    expect(out.pm.days[2]).toEqual({ add: ['r'], remove: [] });
  });
});

describe('troca de refeição do dia', () => {
  const plan = { ...base, id: 'f', kind: 'plan', domain: 'food', validFrom: '2026-10-01', food: { 7: { cafe: 'm1', almoco: 'm2' } } } as Plan;
  it('vale só na data, no lugar da refeição planejada', () => {
    const ex = [{ date: '2026-10-25', domain: 'food', ref: 'almoco:m9' }];
    expect(plannedFood(plan, '2026-10-25', ex)).toEqual({ cafe: 'm1', almoco: 'm9' });
    expect(plannedFood(plan, '2026-11-01', ex)).toEqual({ cafe: 'm1', almoco: 'm2' });
    expect(plannedFood(plan, '2026-10-25', [{ date: '2026-10-25', domain: 'training', ref: 'almoco:m9' }])).toEqual({ cafe: 'm1', almoco: 'm2' });
  });
  it('porções da IA em gramas viram gramas exatas', () => {
    expect(itemFrom('f1', null, 150)).toEqual({ foodId: 'f1', portion: '150 g', grams: 150 });
    expect(itemFrom('f1', '120 g', null)).toEqual({ foodId: 'f1', portion: '120 g', grams: 120 });
    expect(itemFrom('f1', '1 un.', null)).toEqual({ foodId: 'f1', portion: '1 un.' });
  });
});
