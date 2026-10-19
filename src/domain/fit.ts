// Leitura de arquivos .FIT (Garmin, MyWhoosh) no próprio aparelho. Nada sai do celular nesta etapa.
import FitParser from 'fit-file-parser';
import { unzipSync } from 'fflate';
import { toKey } from '../lib/dates';
import type { WorkoutMetrics } from '../db/types';

export interface ParsedActivity {
  startIso: string;
  date: string;
  sport: string;
  modalityId: string;
  minutes: number;
  metrics: WorkoutMetrics;
}

const SPORT_TO_MOD: Record<string, string> = {
  cycling: 'mod:ciclismo', running: 'mod:corrida', walking: 'mod:caminhada', swimming: 'mod:natacao',
  training: 'mod:musculacao', fitness_equipment: 'mod:musculacao', yoga: 'mod:yoga', hiking: 'mod:caminhada', multisport: 'mod:transicao', transition: 'mod:transicao'
};

function rollingBest(values: number[], window: number): number | undefined {
  if (values.length < window) return undefined;
  let sum = 0;
  let best = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) best = Math.max(best, sum / window);
  }
  return Math.round(best);
}

function normalizedPower(power: number[]): number | undefined {
  if (power.length < 30) return undefined;
  const r: number[] = [];
  let sum = 0;
  for (let i = 0; i < power.length; i++) {
    sum += power[i];
    if (i >= 30) sum -= power[i - 30];
    if (i >= 29) r.push(Math.pow(sum / 30, 4));
  }
  return Math.round(Math.pow(r.reduce((a, b) => a + b, 0) / r.length, 0.25));
}

/** Zonas de potência (Coggan) em minutos, a partir do FTP. */
export const POWER_ZONES = [
  { id: 'Z1', label: 'Z1 recuperação', max: 0.55 },
  { id: 'Z2', label: 'Z2 resistência', max: 0.75 },
  { id: 'Z3', label: 'Z3 tempo', max: 0.9 },
  { id: 'Z4', label: 'Z4 limiar', max: 1.05 },
  { id: 'Z5', label: 'Z5 VO2', max: 1.2 },
  { id: 'Z6', label: 'Z6 anaeróbio', max: Infinity }
];

/** Converte a lista de registros em série de 1 s (preenche buracos curtos com o último valor). */
function perSecond(records: any[], field: string): number[] {
  const out: number[] = [];
  let last: number | undefined;
  let prevT: number | undefined;
  for (const r of records) {
    const t = r.timestamp ? new Date(r.timestamp).getTime() / 1000 : undefined;
    const v = typeof r[field] === 'number' ? r[field] : undefined;
    if (t != null && prevT != null) {
      const gap = Math.round(t - prevT);
      for (let k = 1; k < gap && k < 10; k++) out.push(last ?? 0); // pausa curta
    }
    if (v != null) last = v;
    out.push(v ?? last ?? 0);
    if (t != null) prevT = t;
  }
  return out;
}

export async function readFitFile(file: File, ftp?: number): Promise<ParsedActivity> {
  let buf = new Uint8Array(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith('.zip') || (buf[0] === 0x50 && buf[1] === 0x4b)) {
    const files = unzipSync(buf);
    const name = Object.keys(files).find((n) => n.toLowerCase().endsWith('.fit'));
    if (!name) throw new Error('O arquivo compactado não tem um .FIT dentro.');
    buf = files[name];
  }
  const data: any = await new Promise((resolve, reject) => {
    const p = new (FitParser as any)({ force: true, speedUnit: 'km/h', lengthUnit: 'km', mode: 'list', elapsedRecordField: true });
    p.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), (err: any, d: any) => (err ? reject(new Error('Não consegui ler esse arquivo .FIT.')) : resolve(d)));
  });
  return summarize(data, ftp);
}

export function summarize(data: any, ftp?: number): ParsedActivity {
  const s = data.sessions?.[0] ?? {};
  const records: any[] = data.records ?? [];
  const startDate = new Date(s.start_time ?? records[0]?.timestamp ?? Date.now());
  const sport = String(s.sport ?? data.activity?.sport ?? 'training');
  const seconds = Number(s.total_timer_time ?? s.total_elapsed_time ?? 0);
  const power = perSecond(records, 'power');
  const hasPower = power.some((v) => v > 0);
  const np = hasPower ? (s.normalized_power ?? normalizedPower(power)) : undefined;
  const avgPower = hasPower ? Math.round(s.avg_power ?? power.reduce((a, b) => a + b, 0) / power.length) : undefined;
  const zones: Record<string, number> | undefined = hasPower && ftp ? {} : undefined;
  if (zones && ftp) {
    for (const z of POWER_ZONES) zones[z.id] = 0;
    for (const v of power) {
      const z = POWER_ZONES.find((x) => v < x.max * ftp)!;
      zones[z.id] += 1 / 60;
    }
    for (const k of Object.keys(zones)) zones[k] = Math.round(zones[k]);
  }
  const intensity = np && ftp ? np / ftp : undefined;
  const tss = np && ftp && seconds ? Math.round(((seconds * np * (np / ftp)) / (ftp * 3600)) * 100) : undefined;
  const metrics: WorkoutMetrics = {
    source: 'fit',
    sport,
    distanceKm: s.total_distance ? Math.round(s.total_distance * 100) / 100 : undefined,
    kcal: s.total_calories ? Math.round(s.total_calories) : undefined,
    avgHr: s.avg_heart_rate ? Math.round(s.avg_heart_rate) : undefined,
    maxHr: s.max_heart_rate ? Math.round(s.max_heart_rate) : undefined,
    avgPower,
    maxPower: hasPower ? Math.round(s.max_power ?? Math.max(...power)) : undefined,
    np,
    if: intensity ? Math.round(intensity * 100) / 100 : undefined,
    tss,
    best5: hasPower ? rollingBest(power, 300) : undefined,
    best20: hasPower ? rollingBest(power, 1200) : undefined,
    avgCadence: s.avg_cadence ? Math.round(s.avg_cadence) : undefined,
    ascentM: s.total_ascent ? Math.round(s.total_ascent * 1000) : undefined, // lengthUnit km
    avgSpeed: s.avg_speed ? Math.round(s.avg_speed * 10) / 10 : undefined,
    zones,
    ftpUsed: ftp,
    laps: (data.laps ?? []).slice(0, 30).map((l: any) => ({
      minutes: Math.round(((l.total_timer_time ?? 0) / 60) * 10) / 10,
      avgPower: l.avg_power ? Math.round(l.avg_power) : undefined,
      avgHr: l.avg_heart_rate ? Math.round(l.avg_heart_rate) : undefined
    }))
  };
  return {
    startIso: startDate.toISOString(),
    date: toKey(startDate),
    sport,
    modalityId: SPORT_TO_MOD[sport] ?? 'mod:musculacao',
    minutes: Math.round(seconds / 60),
    metrics
  };
}

export function intensityFrom(m: WorkoutMetrics): 'leve' | 'moderada' | 'intensa' {
  if (m.if != null) return m.if < 0.7 ? 'leve' : m.if < 0.85 ? 'moderada' : 'intensa';
  return 'moderada';
}
