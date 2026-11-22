import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// O conversor da corrida mora na função ritual-svc (Deno, publicada como arquivo único).
// O teste lê o trecho marcado, transpila e testa exatamente o código que vai ao servidor.
const src = readFileSync('supabase/functions/ritual-svc/index.ts', 'utf8');
const body = src.slice(src.indexOf('/* runWorkout:início'), src.indexOf('/* runWorkout:fim */'));
const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = new Function(`${js}; return { runHrTarget, runStepName, runWorkoutText };`)() as {
  runHrTarget: (s: { label?: string; target?: string }, hr: { maxHr: number; zones?: number[] }) => string | undefined;
  runStepName: (l: string) => string;
  runWorkoutText: (s: { label: string; minutes: number; target?: string }[], hr: { maxHr: number; zones?: number[] }) => string;
};
const HR = { maxHr: 200, zones: [130, 150, 170, 185, 200] };

describe('corrida no relógio', () => {
  it('faixa em bpm vira % da FC máxima', () => {
    expect(mod.runHrTarget({ label: 'Trote', target: 'FC 140-150 bpm · esforço 4 · esteira 7,5 km/h' }, HR)).toBe('70-75% HR');
    expect(mod.runHrTarget({ label: 'Trote', target: 'FC 140 a 150' }, HR)).toBe('70-75% HR');
  });
  it('teto de FC vira faixa do repouso ao teto', () => {
    expect(mod.runHrTarget({ label: 'Trote mantendo FC abaixo de 146 bpm' }, HR)).toBe('50-73% HR');
  });
  it('zona usa as zonas do intervals', () => {
    expect(mod.runHrTarget({ label: 'Trote Z2 leve' }, HR)).toBe('Z2 HR');
    expect(mod.runHrTarget({ label: 'Contínuo', target: 'Z1-Z2' }, HR)).toBe('50-75% HR');
  });
  it('sem FC nem zona, o bloco fica livre', () => {
    expect(mod.runHrTarget({ label: 'Caminhada', target: 'esforço 2, esteira 5,5 km/h' }, HR)).toBeUndefined();
  });
  it('nome curto, sem números nem alvo', () => {
    expect(mod.runStepName('Caminhada de aquecimento (5,5 a 6,0 km/h)')).toBe('Caminhada de aquecimento');
    expect(mod.runStepName('Intervalos: 2 min trote / 2 min caminhada')).toBe('Intervalos');
    expect(mod.runStepName('Trote Z2 leve')).toBe('Trote');
    expect(mod.runStepName('trote leve mantendo FC abaixo de 145 bpm')).toBe('Trote leve');
  });
  it('repetições viram Nx e intervalos curtos ficam em segundos', () => {
    const t = mod.runWorkoutText([
      { label: 'Aquecimento', minutes: 5, target: 'FC até 130 bpm' },
      ...Array.from({ length: 4 }, () => [{ label: 'Tiro', minutes: 0.5, target: 'FC 170-180 bpm' }, { label: 'Caminhada', minutes: 1.5 }]).flat(),
      { label: 'Volta à calma', minutes: 5 }
    ], HR);
    expect(t).toBe('- Aquecimento 5m 50-65% HR\n\n4x\n- Tiro 30s 85-90% HR\n- Caminhada 1m30s\n\n- Volta à calma 5m');
  });
});
