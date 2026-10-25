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

import { applicationOrder, layerOf, shortUse } from '../../src/domain/skinSteps';
describe('ordem de aplicação', () => {
  const P = (id: string, x: Partial<Product>) => prod(id, x);
  const list = [
    P('fps', { group: 'fps', name: 'Hyalu-Cica Water-Fit Sun Serum' }),
    P('creme', { group: 'hidratacao', name: 'Atobarrier 365 Cream' }),
    P('amp', { group: 'seruns', name: 'Madagascar Centella Ampoule' }),
    P('ton', { group: 'hidratacao', name: 'Gokujyun Lotion' }),
    P('oil', { group: 'limpeza', name: 'Gokujyun Cleansing Oil' }),
    P('gel', { group: 'limpeza', name: 'Sensibio Gel Moussant' }),
    P('ret', { group: 'tratamentos', name: 'Retinol 0.3', active: true }),
    P('ess', { group: 'seruns', name: 'Advanced Snail Radiance Dual Essence' }),
    P('eye', { group: 'olhos', name: 'K-Ox Eyes' })
  ];
  const byId = new Map(list.map((p) => [p.id, p]));
  it('segue as camadas do rosto, do banho ao protetor', () => {
    expect(applicationOrder(list.map((p) => p.id), byId)).toEqual(['oil', 'gel', 'ton', 'ess', 'amp', 'ret', 'eye', 'creme', 'fps']);
  });
  it('cabelo e corpo pelas camadas', () => {
    expect(layerOf(prod('a', { area: 'cabelo', group: 'cabelo', name: 'Genesis Bain Hydra-Fortifiant' }))).toBe('cabelo_shampoo');
    expect(layerOf(prod('b', { area: 'cabelo', group: 'cabelo', name: 'Genesis Fondant Renforçateur' }))).toBe('cabelo_condicionador');
    expect(layerOf(prod('c', { area: 'cabelo', group: 'cabelo', name: 'Genesis Défense Thermique' }))).toBe('cabelo_termico');
    expect(layerOf(prod('d', { area: 'cabelo', group: 'cabelo', name: 'Genesis Sérum Anti-Chute Fortifiant' }))).toBe('cabelo_couro');
    expect(layerOf(prod('e', { area: 'corpo', group: 'corpo', name: 'Artichaut Soin Corps Complet Gommage Corps' }))).toBe('corpo_esfoliante');
    expect(layerOf(prod('f', { area: 'corpo', group: 'corpo', name: 'Amande Sublime Huile Souplesse' }))).toBe('corpo_oleo');
  });
  it('posição definida vale dentro da camada e a camada definida vale sobre a dedução', () => {
    const a = P('a', { group: 'seruns', name: 'Sérum A', layerPos: 20 });
    const b = P('b', { group: 'seruns', name: 'Sérum B', layerPos: 10 });
    const t = P('t', { group: 'seruns', name: 'Sérum que é tônico', layer: 'rosto_tonico' });
    const m = new Map([a, b, t].map((p) => [p.id, p]));
    expect(applicationOrder(['a', 'b', 't'], m)).toEqual(['t', 'b', 'a']);
  });
  it('uso curto: o da dermatologista ou o começo do modo de uso', () => {
    expect(shortUse({ howShort: 'Duas gotas.' })).toBe('Duas gotas.');
    expect(shortUse({ info: { howToUse: 'Aplique à noite. Espere secar. Depois hidrate. Evite olhos.' } })).toBe('Aplique à noite. Espere secar.');
  });
});
