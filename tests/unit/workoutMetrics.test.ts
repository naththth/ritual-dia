import { describe, expect, it } from 'vitest';
import { metricCells, sportFamily, paceSec, showsPowerZones } from '../../src/domain/workoutMetrics';

const w = (o: any): any => ({ id: 'w', kind: 'workout', date: '2026-01-10', createdAt: 1, updatedAt: 1, ...o });
const labels = (x: any) => metricCells(x).map(([l]) => l);
const value = (x: any, l: string) => metricCells(x).find(([k]) => k === l)?.[1].replace(/\u00a0/g, ' ');

describe('métricas do treino conforme o esporte', () => {
  const corrida = w({ modalityId: 'mod:corrida', duration: 30, metrics: { source: 'intervals', sport: 'VirtualRun', distanceKm: 3.02, avgHr: 140, maxHr: 188, avgCadence: 60.262066, tss: 23, kcal: 215 } });

  it('corrida mostra pace e passos por minuto, sem rpm nem potência', () => {
    expect(labels(corrida)).toEqual(['Duração', 'Distância', 'Pace', 'FC média', 'FC máxima', 'Cadência', 'TSS', 'Calorias']);
    expect(value(corrida, 'Pace')).toBe('9:56 /km');
    expect(value(corrida, 'Cadência')).toBe('121 ppm');
    expect(value(corrida, 'Distância')).toBe('3,02 km');
    expect(showsPowerZones(corrida)).toBe(false);
  });

  it('usa o tempo exato em movimento quando houver', () => {
    expect(paceSec(w({ modalityId: 'mod:corrida', duration: 30, metrics: { source: 'intervals', distanceKm: 3, movingSec: 1500 } }), 1000)).toBe(500);
  });

  it('pedal mostra potência, velocidade e rpm', () => {
    const pedal = w({ modalityId: 'mod:ciclismo', duration: 31, metrics: { source: 'intervals', sport: 'VirtualRide', distanceKm: 12.31, np: 129, avgPower: 122, avgCadence: 66.01, ascentM: 23.6, kcal: 224 } });
    expect(labels(pedal)).toContain('Velocidade');
    expect(labels(pedal)).not.toContain('Pace');
    expect(value(pedal, 'Cadência')).toBe('66 rpm');
    expect(value(pedal, 'Subida')).toBe('24 m');
    expect(showsPowerZones(pedal)).toBe(true);
  });

  it('natação em metros e ritmo por 100 m', () => {
    const nado = w({ modalityId: 'mod:natacao', duration: 40, metrics: { source: 'garmin', distanceKm: 1.5, avgCadence: 28 } });
    expect(value(nado, 'Distância')).toBe('1.500 m');
    expect(value(nado, 'Ritmo')).toBe('2:40 /100m');
    expect(labels(nado)).not.toContain('Cadência');
  });

  it('musculação e LPO sem distância, pace ou cadência', () => {
    const lpo = w({ modalityId: 'mod:lpo', duration: 63, metrics: { source: 'intervals', sport: 'WeightTraining', avgHr: 107, maxHr: 156, tss: 19, kcal: 245, avgCadence: 12 } });
    expect(labels(lpo)).toEqual(['Duração', 'FC média', 'FC máxima', 'TSS', 'Calorias']);
  });

  it('a modalidade corrigida manda; o esporte do relógio só desempata', () => {
    expect(sportFamily(w({ modalityId: 'mod:lpo', metrics: { source: 'intervals', sport: 'Run' } }))).toBe('other');
    expect(sportFamily(w({ modalityId: 'mod:transicao', metrics: { source: 'intervals', sport: 'Run' } }))).toBe('run');
  });

  it('pace fora de faixa plausível não aparece (esteira sem distância certa)', () => {
    expect(labels(w({ modalityId: 'mod:corrida', duration: 30, metrics: { source: 'intervals', distanceKm: 0.05 } }))).not.toContain('Pace');
  });
});
