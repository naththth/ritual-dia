import type { Workout } from '../db/types';

/** Família do esporte: decide quais números fazem sentido no card do treino. */
export type SportFamily = 'run' | 'walk' | 'bike' | 'swim' | 'other';

const BY_MODALITY: Record<string, SportFamily> = {
  'mod:corrida': 'run', 'mod:caminhada': 'walk', 'mod:ciclismo': 'bike', 'mod:natacao': 'swim',
  'mod:musculacao': 'other', 'mod:lpo': 'other', 'mod:yoga': 'other', 'mod:mobilidade': 'other', 'mod:descanso': 'other'
};

/** A modalidade do app manda (ela pode ter corrigido); o esporte do relógio só desempata (transição, modalidades novas). */
export function sportFamily(w: Pick<Workout, 'modalityId' | 'metrics'>): SportFamily {
  const byMod = BY_MODALITY[w.modalityId];
  if (byMod) return byMod;
  const s = (w.metrics?.sport ?? '').toLowerCase();
  if (/run|corrida/.test(s)) return 'run';
  if (/walk|hike|caminhada/.test(s)) return 'walk';
  if (/ride|cycl|bike|ciclismo/.test(s)) return 'bike';
  if (/swim|nata/.test(s)) return 'swim';
  return 'other';
}

const NB = '\u00a0'; // número e unidade nunca se separam na quebra de linha
const dec = (n: number, d = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const mmss = (sec: number) => { const s = Math.round(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Segundos em movimento: o exato do arquivo/intervals quando houver; senão, a duração em minutos. */
const movingSec = (w: Workout) => w.metrics?.movingSec ?? (w.duration ? w.duration * 60 : undefined);

/** Pace em segundos por km (corrida e caminhada) ou por 100 m (natação). Fora de faixa plausível, não mostra. */
export function paceSec(w: Workout, per: 1000 | 100): number | undefined {
  const km = w.metrics?.distanceKm ?? w.distanceKm;
  const sec = movingSec(w);
  if (!km || !sec) return undefined;
  const p = sec / ((km * 1000) / per);
  const [min, max] = per === 1000 ? [150, 1800] : [50, 600];
  return p >= min && p <= max ? p : undefined;
}

/**
 * Números do card conforme o esporte, na ordem em que fazem sentido para ela.
 * Corrida e caminhada: pace e passos por minuto (o relógio grava por perna, então dobra). Pedal: potência, velocidade e rpm.
 * Natação: metros e ritmo por 100 m. Musculação, LPO, ioga e aulas: só tempo, coração, carga e calorias.
 */
export function metricCells(w: Workout): [string, string][] {
  const m = w.metrics;
  const fam = sportFamily(w);
  const cells: [string, string][] = [];
  const km = m?.distanceKm ?? w.distanceKm;
  const push = (cond: unknown, label: string, value: () => string) => { if (cond) cells.push([label, value()]); };

  push(w.duration, 'Duração', () => `${w.duration}${NB}min`);
  if (fam === 'run' || fam === 'walk') {
    push(km, 'Distância', () => `${dec(km!, 2)}${NB}km`);
    const p = paceSec(w, 1000);
    push(p, 'Pace', () => `${mmss(p!)}${NB}/km`);
    push(m?.avgHr, 'FC média', () => `${m!.avgHr}${NB}bpm`);
    push(m?.maxHr, 'FC máxima', () => `${m!.maxHr}${NB}bpm`);
    push(m?.avgCadence, 'Cadência', () => `${Math.round(m!.avgCadence! * 2)}${NB}ppm`);
    push(m?.ascentM, 'Subida', () => `${Math.round(m!.ascentM!)}${NB}m`);
    push(m?.tss, 'TSS', () => `${Math.round(m!.tss!)}`);
  } else if (fam === 'bike') {
    push(km, 'Distância', () => `${dec(km!, 2)}${NB}km`);
    const sec = movingSec(w);
    const kmh = m?.avgSpeed ?? (km && sec ? km / (sec / 3600) : undefined);
    push(kmh, 'Velocidade', () => `${dec(kmh!, 1)}${NB}km/h`);
    push(m?.np, 'Potência NP', () => `${m!.np}${NB}W`);
    push(m?.avgPower, 'Potência média', () => `${m!.avgPower}${NB}W`);
    push(m?.if, 'Intensidade', () => dec(m!.if!, 2));
    push(m?.tss, 'TSS', () => `${Math.round(m!.tss!)}`);
    push(m?.avgHr, 'FC média', () => `${m!.avgHr}${NB}bpm`);
    push(m?.maxHr, 'FC máxima', () => `${m!.maxHr}${NB}bpm`);
    push(m?.best20, 'Melhor 20 min', () => `${m!.best20}${NB}W`);
    push(m?.best5, 'Melhor 5 min', () => `${m!.best5}${NB}W`);
    push(m?.avgCadence, 'Cadência', () => `${Math.round(m!.avgCadence!)}${NB}rpm`);
    push(m?.ascentM, 'Subida', () => `${Math.round(m!.ascentM!)}${NB}m`);
  } else if (fam === 'swim') {
    push(km, 'Distância', () => `${dec(Math.round(km! * 1000))}${NB}m`);
    const p = paceSec(w, 100);
    push(p, 'Ritmo', () => `${mmss(p!)}${NB}/100m`);
    push(m?.avgHr, 'FC média', () => `${m!.avgHr}${NB}bpm`);
    push(m?.maxHr, 'FC máxima', () => `${m!.maxHr}${NB}bpm`);
    push(m?.tss, 'TSS', () => `${Math.round(m!.tss!)}`);
  } else {
    push(m?.avgHr, 'FC média', () => `${m!.avgHr}${NB}bpm`);
    push(m?.maxHr, 'FC máxima', () => `${m!.maxHr}${NB}bpm`);
    push(m?.tss, 'TSS', () => `${Math.round(m!.tss!)}`);
  }
  push(m?.kcal, 'Calorias', () => `${Math.round(m!.kcal!)}${NB}kcal`);
  return cells;
}

/** Zonas de potência só fazem sentido no pedal. */
export const showsPowerZones = (w: Workout) => sportFamily(w) === 'bike';
