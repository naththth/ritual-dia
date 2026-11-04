// Leitura semanal cruzada: números da semana, padrões que são só dela (calculados nos próprios registros)
// e a leitura da equipe com os ajustes da próxima semana, cada um levado à especialista que cuida dele.
import { all, byDateRange, get, upsert } from '../db/db';
import { addDays, isoWeekday, todayKey, weekStart, type DateKey } from '../lib/dates';
import { askAI } from './ai';
import { CAFFEINE_CUTOFF_H, toMin, type MindDay } from './mind';
import { loadMind } from './mindload';
import type { Review } from '../db/types';

/** Semana para ler: no domingo, a que está fechando; nos outros dias, a anterior (completa). */
export function weekToRead(today: DateKey = todayKey()): DateKey {
  return isoWeekday(today) === 7 ? weekStart(today) : addDays(weekStart(today), -7);
}

const avg = (xs: (number | undefined)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined; };
const n1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export interface WeekStats {
  from: DateKey; to: DateKey;
  sleep?: number; sleepPrev?: number;
  mood?: number; moodPrev?: number;
  trainMin: number; trainPrev: number; plannedMin: number;
  kcal?: number; protein?: number;
  doses: number; dosesDue: number;
  caffeine?: number; caffeinePrev?: number;
  weightFrom?: number; weightTo?: number;
  checkins: number;
  days: MindDay[];
}

export function weekStats(all: MindDay[], from: DateKey): WeekStats {
  const to = addDays(from, 6);
  const wk = all.filter((d) => d.date >= from && d.date <= to);
  const pv = all.filter((d) => d.date >= addDays(from, -7) && d.date < from);
  const w = wk.map((d) => d.weight).filter((x): x is number => x != null);
  return {
    from, to, days: wk,
    sleep: avg(wk.map((d) => d.sleepH)), sleepPrev: avg(pv.map((d) => d.sleepH)),
    mood: avg(wk.map((d) => d.moodPm)), moodPrev: avg(pv.map((d) => d.moodPm)),
    trainMin: wk.reduce((a, d) => a + d.trainMin, 0), trainPrev: pv.reduce((a, d) => a + d.trainMin, 0), plannedMin: wk.reduce((a, d) => a + d.plannedMin, 0),
    kcal: avg(wk.filter((d) => d.mealsLogged).map((d) => d.kcal)), protein: avg(wk.filter((d) => d.mealsLogged).map((d) => d.protein)),
    doses: wk.reduce((a, d) => a + d.dosesTaken, 0), dosesDue: wk.reduce((a, d) => a + d.dosesDue, 0),
    caffeine: avg(wk.map((d) => d.caffeineMg)), caffeinePrev: avg(pv.map((d) => d.caffeineMg)),
    weightFrom: w[0], weightTo: w[w.length - 1],
    checkins: wk.filter((d) => d.checkinPm).length
  };
}

/* ---------------- Padrões dela ---------------- */
export interface Pattern { id: string; title: string; text: string; a: number; b: number; unit: string; labelA: string; labelB: string; n: number }

/** Compara dois grupos de dias. Só vira padrão com dias suficientes em cada lado e diferença que importa. */
function compare(days: MindDay[], split: (d: MindDay) => boolean | undefined, value: (d: MindDay) => number | undefined, minN: number, minDiff: number) {
  const A: number[] = [], B: number[] = [];
  for (const d of days) { const s = split(d); const v = value(d); if (s === undefined || v == null) continue; (s ? A : B).push(v); }
  if (A.length < minN || B.length < minN) return undefined;
  const a = avg(A)!, b = avg(B)!;
  return Math.abs(a - b) >= minDiff ? { a, b, n: A.length + B.length } : undefined;
}

export function findPatterns(days: MindDay[], bed?: string, proteinTarget?: number): Pattern[] {
  const out: Pattern[] = [];
  const byDate = new Map(days.map((d) => [d.date, d]));
  const next = (d: MindDay) => byDate.get(addDays(d.date, 1));
  const cutoff = bed ? toMin(bed)! - CAFFEINE_CUTOFF_H * 60 : 14 * 60;
  const signed = (x: number) => (x > 0 ? `+${n1(x)}` : n1(x));

  const caf = compare(days, (d) => (d.lastCaffeine ? toMin(d.lastCaffeine)! > cutoff : d.caffeineMg ? false : undefined), (d) => next(d)?.sleepH, 3, 0.25);
  if (caf) out.push({ id: 'cafe-sono', title: 'Café tarde e o seu sono', text: `Nas noites depois de café após as ${String(Math.floor(cutoff / 60)).padStart(2, '0')}:${String(cutoff % 60).padStart(2, '0')}, você dormiu ${Math.round(Math.abs(caf.a - caf.b) * 60)} min ${caf.a < caf.b ? 'a menos' : 'a mais'}.`, a: caf.a, b: caf.b, unit: 'h', labelA: 'café tarde', labelB: 'café cedo', n: caf.n });

  const sm = compare(days, (d) => (d.sleepH == null ? undefined : d.sleepH < 6.5 ? true : d.sleepH >= 7 ? false : undefined), (d) => d.moodPm, 4, 0.5);
  if (sm) out.push({ id: 'sono-humor', title: 'Sono e humor', text: `Nos dias depois de dormir menos de 6,5 h, seu humor da noite ficou em ${signed(sm.a)}, contra ${signed(sm.b)} quando dormiu 7 h ou mais.`, a: sm.a, b: sm.b, unit: '', labelA: 'menos de 6,5 h', labelB: '7 h ou mais', n: sm.n });

  const tm = compare(days, (d) => (d.checkinPm ? d.trainMin > 0 : undefined), (d) => d.moodPm, 4, 0.5);
  if (tm) out.push({ id: 'treino-humor', title: 'Treino e humor', text: `Nos dias com treino, seu humor da noite ficou em ${signed(tm.a)}; sem treino, em ${signed(tm.b)}.`, a: tm.a, b: tm.b, unit: '', labelA: 'com treino', labelB: 'sem treino', n: tm.n });

  const mm = compare(days, (d) => (d.trainStart ? d.trainStart < '12:00' : undefined), (d) => d.moodPm, 3, 0.5);
  if (mm) out.push({ id: 'manha-humor', title: 'Treino de manhã ou de tarde', text: `Treinando de manhã, seu humor da noite ficou em ${signed(mm.a)}; à tarde ou à noite, em ${signed(mm.b)}.`, a: mm.a, b: mm.b, unit: '', labelA: 'de manhã', labelB: 'depois', n: mm.n });

  if (bed) {
    const late = (t: string) => { const m = toMin(t)!; return m < 12 * 60 ? m + 1440 : m; };
    const bs = compare(days, (d) => (d.sleepStart ? late(d.sleepStart) <= toMin(bed)! + 15 : undefined), (d) => d.sleepH, 3, 0.3);
    if (bs) out.push({ id: 'deitar-sono', title: 'Deitar na meta', text: `Quando o sono começou até 15 min depois das ${bed}, você dormiu ${n1(bs.a)} h, contra ${n1(bs.b)} h nas outras noites.`, a: bs.a, b: bs.b, unit: 'h', labelA: 'na meta', labelB: 'mais tarde', n: bs.n });
  }

  if (proteinTarget) {
    const pe = compare(days, (d) => (d.mealsLogged && d.protein != null && d.energy != null ? d.protein >= proteinTarget * 0.9 : undefined), (d) => d.energy, 3, 0.5);
    if (pe) out.push({ id: 'proteina-energia', title: 'Proteína e energia', text: `Nos dias em que bateu a proteína, sua energia ficou em ${n1(pe.a)} de 4, contra ${n1(pe.b)} nos outros.`, a: pe.a, b: pe.b, unit: '', labelA: 'bateu a meta', labelB: 'abaixo', n: pe.n });
  }
  return out;
}

/* ---------------- Leitura da equipe ---------------- */
export async function weekData(from: DateKey) {
  const mind = await loadMind(todayKey(), 70);
  const settings = await get<'settings'>('settings');
  const stats = weekStats(mind.days, from);
  const patterns = findPatterns(mind.days, settings?.reminders?.sleep?.bedGoal, settings?.targets?.p);
  return { mind, stats, patterns, settings };
}

export async function aiWeekCross(from: DateKey): Promise<Review> {
  const { stats, patterns, settings, mind } = await weekData(from);
  const to = addDays(from, 6);
  const [workouts, skin, mods, changes] = await Promise.all([byDateRange('workout', from, to), byDateRange('skin', from, to), all('modality'), all('medchange')]);
  const r = await askAI<any>('week_cross', {
    semana: `${from} a ${to}`,
    dias: stats.days.map((d) => ({
      data: d.date, humor: d.moodPm, energia: d.energy, ansiedade: d.anxiety, irritabilidade: d.irritability, eventos: d.tags.length ? d.tags : undefined, o_que_ela_escreveu: d.notes?.length ? d.notes : undefined,
      sono_h: d.sleepH, inicio_sono: d.sleepStart, vfc: d.hrv, cafeina_mg: d.caffeineMg || undefined, ultimo_cafe: d.lastCaffeine,
      treino_min: d.trainMin || undefined, treino_planejado_min: d.plannedMin || undefined, kcal: d.mealsLogged ? Math.round(d.kcal ?? 0) : undefined, proteina_g: d.mealsLogged ? Math.round(d.protein ?? 0) : undefined,
      peso: d.weight, doses: d.dosesDue ? `${d.dosesTaken} de ${d.dosesDue}` : undefined
    })),
    resumo: {
      sono_medio_h: stats.sleep, sono_semana_anterior_h: stats.sleepPrev, humor_medio: stats.mood, humor_semana_anterior: stats.moodPrev,
      treino_min: stats.trainMin, treino_planejado_min: stats.plannedMin, treino_semana_anterior_min: stats.trainPrev,
      kcal_media: stats.kcal, proteina_media_g: stats.protein, meta: settings?.targets, cafeina_media_mg: stats.caffeine,
      peso_inicio: stats.weightFrom, peso_fim: stats.weightTo, doses: `${stats.doses} de ${stats.dosesDue}`, checkins_da_noite: stats.checkins
    },
    treinos: workouts.map((w) => ({ data: w.date, modalidade: mods.find((m) => m.id === w.modalityId)?.name, minutos: w.duration, tss: w.metrics?.tss, esforco: w.rpe, como_foi: w.feeling })),
    pele: skin.map((s) => ({ data: s.date, periodo: s.period, condicao: s.condition })),
    padroes_dela: patterns.map((p) => ({ padrao: p.title, leitura: p.text, dias_comparados: p.n })),
    avisos_ativos: mind.alerts.map((a) => a.title),
    mudancas_do_medico: changes.filter((c) => c.date >= addDays(from, -14)).map((c) => ({ data: c.date, o_que: c.text })),
    objetivo: settings?.profile?.goal, peso_objetivo: settings?.profile?.weightGoal
  });
  const areas = ['treino', 'alimentacao', 'mente', 'cuidados', 'sono'] as const;
  return upsert('review', `review:cross:${from}`, {
    date: from, scope: 'cruzada',
    title: String(r?.titulo ?? '').trim() || undefined,
    text: String(r?.leitura ?? '').trim(),
    highlights: (Array.isArray(r?.funcionou) ? r.funcionou : []).map(String).slice(0, 4),
    weighed: (Array.isArray(r?.pesou) ? r.pesou : []).map(String).slice(0, 4),
    focus: [],
    next: (Array.isArray(r?.proxima_semana) ? r.proxima_semana : []).map((x: any) => ({ area: areas.includes(x?.area) ? x.area : 'mente', acao: String(x?.acao ?? '').trim(), por_que: x?.por_que ? String(x.por_que) : undefined })).filter((x: any) => x.acao).slice(0, 4)
  });
}
