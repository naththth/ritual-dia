import { describe, it, expect } from 'vitest';
import { realizedExercises, progressCount, withMark, plannedSet, marksOf } from '../../src/domain/strengthLog';
import type { StrengthExercise } from '../../src/db/types';

const supino: StrengthExercise = { id: 'a', group: 'Peito', name: 'Supino', sets: 3, reps: 10, loadKg: 30, setLoads: [20, 25, 30] };
const remada: StrengthExercise = { id: 'b', group: 'Costas', name: 'Remada', sets: 3, reps: 10, loadKg: 25 };

describe('planejado × realizado', () => {
  it('série planejada vem do plano, carga por série', () => {
    expect(plannedSet(supino, 1)).toEqual({ reps: 10, kg: 25 });
  });
  it('só as séries marcadas viram o realizado, com o plano guardado', () => {
    let sets = withMark(undefined, supino, 0, { reps: 10, kg: 20 });
    sets = withMark({ sets }, supino, 2, { reps: 8, kg: 32 });
    const [r] = realizedExercises([supino, remada], { sets });
    expect(r).toMatchObject({ name: 'Supino', sets: 2, reps: 10, setReps: [10, 8], loadKg: 32, setLoads: [20, 32] });
    expect(r.planned).toMatchObject({ sets: 3, reps: 10, setLoads: [20, 25, 30] });
    expect(realizedExercises([supino, remada], { sets })).toHaveLength(1);
  });
  it('pulado não conta nem no total', () => {
    const sets = withMark(undefined, supino, 0, plannedSet(supino, 0));
    expect(progressCount([supino, remada], { sets, skipped: ['b'] })).toEqual({ done: 1, total: 3 });
    expect(realizedExercises([supino, remada], { sets, skipped: ['a'] })).toEqual([]);
  });
  it('marcas sempre com uma posição por série', () => {
    expect(marksOf({ sets: { a: [{ reps: 10 }] } }, supino)).toEqual([{ reps: 10 }, null, null]);
  });
});
