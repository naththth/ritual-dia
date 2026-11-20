import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { exercisePhotoKey, PHOTO_KEYS, isPyramid, comparableHistory, compareChip, planText, sessionTotals, coverExercise, sessionGroups } from '../../src/domain/session';
import { EXERCISE_CATALOG } from '../../src/domain/strength';
import type { StrengthExercise, Workout } from '../../src/db/types';

const ex = (o: Partial<StrengthExercise>): StrengthExercise => ({ id: 'x' + Math.random(), group: 'Pernas', name: 'Agachamento livre', sets: 3, reps: 10, ...o });
const wk = (date: string, exercises: StrengthExercise[]): Workout => ({ id: 'w' + date, kind: 'workout', date, modalityId: 'mod:musculacao', exercises } as any);

describe('foto do exercício', () => {
  it('reconhece variações pelo nome, sem acento', () => {
    expect(exercisePhotoKey('Agachamento frontal')).toBe('agachamento-frontal');
    expect(exercisePhotoKey('Agachamento livre')).toBe('agachamento');
    expect(exercisePhotoKey('Stiff com halteres')).toBe('stiff-halteres');
    expect(exercisePhotoKey('Puxada de arranco')).toBe('puxada-arranco');
    expect(exercisePhotoKey('Elevação pélvica na máquina')).toBe('elevacao-pelvica');
    expect(exercisePhotoKey('Push press com barra leve')).toBe('push-press');
    expect(exercisePhotoKey('Clean (só o primeiro tempo)')).toBe('clean');
  });
  it('exercício desconhecido usa a foto do grupo', () => {
    expect(exercisePhotoKey('Movimento inventado', 'Costas')).toBe('puxada');
  });
  it('todo exercício do catálogo tem foto, e toda foto existe no app', () => {
    for (const [g, names] of Object.entries(EXERCISE_CATALOG)) for (const n of names) expect(PHOTO_KEYS).toContain(exercisePhotoKey(n, g));
    for (const k of PHOTO_KEYS) expect(existsSync(resolve('public/ex', `${k}.jpg`)), k).toBe(true);
  });
});

describe('comparação com sessões anteriores', () => {
  const hoje = ex({ name: 'Stiff com barra', sets: 3, reps: 8, loadKg: 31 });
  const hist = [
    wk('2026-01-06', [ex({ name: 'Stiff com barra', sets: 3, reps: 10, loadKg: 24, setLoads: [14, 18, 24], setReps: [10, 8, 8] })]),
    wk('2026-01-14', [ex({ name: 'Stiff com barra', sets: 3, reps: 8, loadKg: 31 })]),
    wk('2026-01-19', [ex({ name: 'Stiff com barra', sets: 1, reps: 20, loadKg: 15 })])
  ];
  it('ignora a sessão leve de muitas repetições e compara com a parecida', () => {
    const h = comparableHistory(hoje, hist, '2026-01-20');
    expect(h.map((p) => p.date)).toEqual(['2026-01-14', '2026-01-06']);
    expect(compareChip(hoje, hist, '2026-01-20')).toEqual({ text: 'Mesma carga de 14/01', tone: 'same' });
  });
  it('subiu, desceu e primeira vez', () => {
    expect(compareChip({ ...hoje, loadKg: 36 }, hist, '2026-01-20')?.text).toBe('+5 kg desde 14/01');
    expect(compareChip({ ...hoje, loadKg: 28.5 }, hist, '2026-01-20')?.text).toBe('−2,5 kg vs. 14/01');
    expect(compareChip(ex({ name: 'Cadeira flexora', loadKg: 30 }), hist, '2026-01-20')).toEqual({ text: 'Primeira vez', tone: 'new' });
  });
  it('não olha para o próprio dia nem para depois', () => {
    expect(comparableHistory(hoje, hist, '2026-01-14').map((p) => p.date)).toEqual(['2026-01-06']);
  });
});

describe('números da sessão', () => {
  const pir = ex({ sets: 6, reps: 10, setReps: [10, 6, 4, 2, 1, 1], setLoads: [31, 45, 55, 65, 75, 75], loadKg: 75 });
  const reta = ex({ name: 'Cadeira extensora', sets: 3, reps: 20, loadKg: 40 });
  it('pirâmide é carga que muda de série para série', () => {
    expect(isPyramid(pir)).toBe(true);
    expect(isPyramid(reta)).toBe(false);
  });
  it('soma séries e quilos levantados e escolhe a capa pela maior carga', () => {
    expect(sessionTotals([pir, reta])).toEqual({ exercises: 2, sets: 9, volume: 1080 + 2400 });
    expect(coverExercise([reta, pir])?.name).toBe('Agachamento livre');
    expect(sessionGroups([pir, { ...reta, group: 'LPO' }])).toBe('Pernas · LPO');
  });
  it('mostra o plano só quando ela fez diferente', () => {
    expect(planText({ ...reta, planned: { name: 'Cadeira extensora', sets: 3, reps: 20, loadKg: 40 } })).toBeUndefined();
    expect(planText({ ...reta, planned: { name: 'Cadeira extensora', sets: 3, reps: 15, loadKg: 35 } })).toBe('Plano: 3×15, 35 kg');
    expect(planText({ ...reta, planned: { name: 'Leg press 45°', sets: 3, reps: 10 } })).toBe('Plano: Leg press 45°, 3×10');
  });
});
