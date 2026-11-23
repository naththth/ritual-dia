import { describe, it, expect } from 'vitest';
import { planLines, planIntro, restText } from '../../src/domain/session';
import type { StrengthExercise } from '../../src/db/types';

const ex = (id: string, name: string, group: string, sets: number, reps: number): StrengthExercise => ({ id, name, group, sets, reps });

describe('roteiro da musculação planejada', () => {
  const note = 'Execução controlada na descida. Descanse 90s entre séries.\n\n1. Supino reto com barra ou máquina 3x8-10 (meta: 30-35 kg total)\n2. Pallof press no cabo 3x10 cada lado (meta: 10 kg)';
  const exs = [ex('a', 'Supino reto com barra', 'Peito', 3, 10), ex('b', 'Pallof press no cabo', 'Core', 3, 10)];

  it('junta cada exercício à linha: nome escrito, faixa, complemento e meta', () => {
    const [s, p] = planLines(note, exs);
    expect(s).toMatchObject({ label: 'Supino reto com barra ou máquina', reps: '8-10', meta: '30-35 kg total' });
    expect(s.extra).toBeUndefined();
    expect(p).toMatchObject({ label: 'Pallof press no cabo', reps: '10', extra: 'cada lado', meta: '10 kg' });
  });

  it('exercício editado fora da faixa mostra as repetições dele', () => {
    const [s] = planLines(note, [{ ...exs[0], reps: 12 }]);
    expect(s.reps).toBe('12');
  });

  it('sem roteiro, usa o próprio exercício', () => {
    expect(planLines('Só aquecer bem.', exs)[0]).toMatchObject({ label: 'Supino reto com barra', reps: '10' });
  });

  it('texto de apoio sem as linhas numeradas e descanso lido do texto', () => {
    expect(planIntro(note)).toBe('Execução controlada na descida. Descanse 90s entre séries.');
    expect(restText(note)).toBe('90 s');
    expect(restText('Descanso de 60 a 90s.')).toBe('60–90 s');
    expect(restText('Sem pressa.')).toBeUndefined();
  });
});
