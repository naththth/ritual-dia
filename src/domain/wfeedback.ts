// Leitura de cada treino pela IA: como foi a sessão contra a intenção e contra as anteriores, recuperação e o que comer depois.
import { all, byDateRange, get, update } from '../db/db';
import { addDays, isoWeekday, type DateKey } from '../lib/dates';
import { planFor, plannedTraining } from './rules';
import { trainingLoad } from './load';
import { wellnessForAI } from './wellness';
import { totals } from './nutrition';
import { exerciseVolume, loadsPerSet, repsPerSet, topLoad } from './strength';
import { askAI } from './ai';
import { DEFAULT_MEAL_TIMES } from '../screens/today';
import type { Workout } from '../db/types';

/** O que ela lançou no treino; se mudar, a leitura pode ser refeita. */
export const feedbackBasis = (w: Workout) => [w.rpe ?? '', (w.feeling ?? '').trim().length, (w.exercises ?? []).map((e) => `${e.sets}x${e.reps}@${topLoad(e) ?? ''}`).join(','), w.metrics?.tss ?? '', w.duration ?? ''].join('|');

const inflight = new Set<string>();

export async function aiWorkoutFeedback(w: Workout): Promise<void> {
  if (inflight.has(w.id)) return;
  inflight.add(w.id);
  try {
    const date = w.date as DateKey;
    const [mods, tmpls, plans, history, wellness, meals, foods, settings, extras] = await Promise.all([
      all('modality'), all('wtemplate'), all('plan'), byDateRange('workout', addDays(date, -120), date), byDateRange('wellness', addDays(date, -6), date),
      byDateRange('meal', date, date), all('food'), get<'settings'>('settings'), byDateRange('extra', date, addDays(date, 3))
    ]);
    const modName = (id: string) => mods.find((m) => m.id === id)?.name ?? id;
    const tpl = tmpls.find((t) => t.id === w.templateId);
    const metrics = w.metrics ? { ...w.metrics, laps: undefined } : undefined;
    const exs = (x: Workout) => x.exercises?.map((e) => ({ exercicio: e.name, series: e.sets, repeticoes: repsPerSet(e), cargas_kg: loadsPerSet(e), volume_kg: exerciseVolume(e), programado: e.planned }));
    const times = { ...DEFAULT_MEAL_TIMES, ...(settings?.mealTimes ?? {}) };
    const eaten = totals(meals.flatMap((m) => m.items), foods).n;
    const goal = settings?.targets;
    const usage = new Map<string, number>();
    (await byDateRange('meal', addDays(date, -30), date)).forEach((m) => m.items.forEach((i) => usage.set(i.foodId, (usage.get(i.foodId) ?? 0) + 1)));
    const load = trainingLoad(history.filter((x) => !x.deleted), addDays(date, -120), date).slice(-1)[0];
    const r = await askAI<any>('workout_feedback', {
      data: date,
      treino: { modalidade: modName(w.modalityId), data: w.date, horario: w.startTime ? new Date(w.startTime).toTimeString().slice(0, 5) : undefined, minutos: w.duration, intensidade: w.intensity, metricas: metrics, esforco: w.rpe, como_foi: w.feeling, exercicios: exs(w) },
      o_que_estava_planejado: tpl ? { nome: tpl.name, minutos: tpl.duration, intensidade: tpl.intensity, blocos_pct_ftp: tpl.steps, roteiro: tpl.note } : null,
      ftp: settings?.ftp ?? null,
      mesma_modalidade_antes: history.filter((x) => !x.deleted && x.id !== w.id && x.modalityId === w.modalityId && x.date <= date).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 4)
        .map((x) => ({ data: x.date, minutos: x.duration, tss: x.metrics?.tss, fc_media: x.metrics?.avgHr, potencia_normalizada: x.metrics?.np, potencia_media: x.metrics?.avgPower, esforco: x.rpe, exercicios: exs(x) })),
      carga: load ? { fitness: Math.round(load.ctl), fadiga: Math.round(load.atl), forma: Math.round(load.tsb) } : null,
      sono_e_recuperacao: wellness.map(wellnessForAI),
      alimentacao_do_dia: {
        refeicoes: meals.filter((m) => m.items.length).map((m) => ({ refeicao: m.mealType, horario: times[m.mealType], itens: m.items.map((i) => `${foods.find((f) => f.id === i.foodId)?.name ?? '?'} ${i.portion}`), macros: totals(m.items, foods).n })),
        total: eaten, meta: goal ?? null,
        falta: goal ? { kcal: Math.max(0, (goal.kcal ?? 0) - eaten.kcal), p: Math.max(0, (goal.p ?? 0) - eaten.p), c: Math.max(0, (goal.c ?? 0) - eaten.c), f: Math.max(0, (goal.f ?? 0) - eaten.f) } : null
      },
      alimentos_que_ela_usa: foods.filter((f) => f.n && (usage.get(f.id) ?? 0) > 0).sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0)).slice(0, 30).map((f) => ({ nome: f.name, por_100g: f.n, medidas: f.measures })),
      proximos_treinos: [1, 2, 3].map((k) => { const d = addDays(date, k); return { data: d, dia_semana: isoWeekday(d), treinos: plannedTraining(planFor(plans, 'training', d), d, extras).map((id) => tmpls.find((t) => t.id === id)?.name).filter(Boolean) }; })
    });
    if (!r || typeof r !== 'object' || !(r.desempenho || r.titulo)) return;
    const s = (x: unknown) => (x ? String(x) : undefined);
    await update<'workout'>(w.id, { aiFeedback: { titulo: s(r.titulo), desempenho: s(r.desempenho), recuperacao: s(r.recuperacao), alimentacao: s(r.alimentacao), proximo: s(r.proximo), nota: Number(r.nota) >= 1 && Number(r.nota) <= 5 ? Math.round(Number(r.nota)) : undefined, at: Date.now(), basis: feedbackBasis(w) } });
  } finally { inflight.delete(w.id); }
}
