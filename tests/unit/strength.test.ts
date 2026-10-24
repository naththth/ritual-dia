import { describe, it, expect } from 'vitest';
import { exercisesFromNote, defaultExercises, variationOptions, suggestLoad, plannedLoad, programFor, withPlanned } from '../../src/domain/strength';
import type { Workout, StrengthExercise } from '../../src/db/types';

const ex = (p: Partial<StrengthExercise> = {}): StrengthExercise => ({ id: 'a', group: 'Pernas', name: 'Agachamento livre', sets: 3, reps: 10, loadKg: 40, ...p });
const wo = (date: string, e: StrengthExercise[], extra: Partial<Workout> = {}): Workout => ({ id: `w${date}`, kind: 'workout', date, modalityId: 'mod:musculacao', exercises: e, ...extra } as Workout);

describe('musculação', () => {
  it('monta a sessão a partir dos grupos', () => {
    expect(defaultExercises(['Pernas']).map((e) => e.group)).toEqual(['Pernas', 'Pernas']);
    expect(new Set(defaultExercises(['Corpo todo']).map((e) => e.group)).size).toBe(5);
    expect(defaultExercises([])).toEqual([]);
  });
  it('sempre dá 3 opções, com o atual primeiro, e gira ao pedir outras', () => {
    const a = variationOptions({ group: 'Peito', name: 'Flexão de braço', round: 0 });
    const b = variationOptions({ group: 'Peito', name: 'Flexão de braço', round: 1 });
    expect(a).toHaveLength(3); expect(a[0]).toBe('Flexão de braço');
    expect(b.slice(1)).not.toEqual(a.slice(1));
  });
  it('não oferece um exercício que já está na sessão', () => {
    const o = variationOptions({ group: 'Pernas', name: 'Agachamento livre' }, ['Leg press 45°']);
    expect(o).toHaveLength(3); expect(o).not.toContain('Leg press 45°');
  });
  it('sem histórico não inventa carga', () => {
    expect(suggestLoad('Agachamento livre', [])).toBeUndefined();
  });
  it('sobe 5% quando cumpriu, mantém se o esforço foi alto, baixa se faltou repetição', () => {
    const planned = { name: 'Agachamento livre', sets: 3, reps: 10, loadKg: 40 };
    expect(suggestLoad('Agachamento livre', [wo('2026-10-10', [ex({ planned })])])?.loadKg).toBe(42);
    expect(suggestLoad('Agachamento livre', [wo('2026-10-10', [ex({ planned })], { rpe: 9 })])?.loadKg).toBe(40);
    expect(suggestLoad('Agachamento livre', [wo('2026-10-10', [ex({ reps: 7, planned })])])?.loadKg).toBe(38);
  });
  it('FC média bem acima dos outros treinos segura a carga', () => {
    const done = [wo('2026-10-03', [ex()], { metrics: { source: 'fit', avgHr: 100 } }), wo('2026-10-10', [ex()], { metrics: { source: 'fit', avgHr: 130 } })];
    expect(suggestLoad('Agachamento livre', done)?.loadKg).toBe(40);
  });
  it('a carga fixada à mão depois do último treino vale; antes dele, vale a sugestão', () => {
    const done = [wo('2026-10-10', [ex()])];
    expect(plannedLoad(ex({ loadKg: 50, loadAt: '2026-10-12' }), done, '2026-10-17').loadKg).toBe(50);
    expect(plannedLoad(ex({ loadKg: 50, loadAt: '2026-10-05' }), done, '2026-10-17').loadKg).toBe(42);
  });
  it('programFor usa os exercícios do modelo ou a sessão sugerida; withPlanned guarda o programado', () => {
    const p = programFor({ muscles: ['Costas'] }, [], '2026-10-17');
    expect(p.exercises).toHaveLength(2);
    expect(withPlanned([ex()])[0].planned).toEqual({ name: 'Agachamento livre', sets: 3, reps: 10, loadKg: 40 });
  });
});

describe('roteiro escrito no treino', () => {
  const note = 'Bi-sets.\n\n1. Agachamento goblet ou livre 3x6-10\n2. Barra fixa assistida ou puxada neutra 3x6-10\n3. Flexão de braço ou supino reto 3x8-12\n4. Mesa flexora 3x10-12\n5. Elevação lateral 2x12-15\n6. Dead bug 3x8 por lado';
  it('vira os exercícios do dia, com o topo da faixa', () => {
    const e = exercisesFromNote(note);
    expect(e.map((x) => x.name)).toEqual(['Agachamento goblet', 'Barra fixa assistida', 'Flexão de braço', 'Mesa flexora', 'Elevação lateral', 'Dead bug']);
    expect(e.map((x) => x.group)).toEqual(['Pernas', 'Costas', 'Peito', 'Pernas', 'Ombros', 'Core']);
    expect(e[0]).toMatchObject({ sets: 3, reps: 10 });
    expect(e[4]).toMatchObject({ sets: 2, reps: 15 });
  });
  it('sem roteiro, cai na sessão montada pelos grupos', () => {
    expect(exercisesFromNote('só texto')).toEqual([]);
    expect(defaultExercises(['Pernas'], 'só texto')).toHaveLength(2);
    expect(defaultExercises(['Pernas'], note)).toHaveLength(6);
  });
});
