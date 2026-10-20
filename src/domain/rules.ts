// Regras puras (sem banco), cobertas por testes unitários.
import { isoWeekday, weekStart, addDays, monthStart, monthEnd, type DateKey } from '../lib/dates';
import type {
  Habit, HabitLog, Plan, PlanDomain, Product, SkinPeriod, Task, SuggestionLog, Workout, Priority
} from '../db/types';
import { GROUP_RANK } from './defaults';

/* ---------------- Planos ---------------- */

/** Versão do plano vigente na data: a de maior validFrom que seja <= data. */
export function planFor(plans: Plan[], domain: PlanDomain, date: DateKey): Plan | undefined {
  return plans
    .filter((p) => p.domain === domain && p.validFrom <= date)
    .sort((a, b) => (a.validFrom < b.validFrom ? 1 : a.validFrom > b.validFrom ? -1 : b.updatedAt - a.updatedAt))[0];
}

/** Produtos planejados para a data e período, ordenados pela sequência de aplicação. */
export function plannedSkin(
  plan: Plan | undefined, date: DateKey, period: SkinPeriod, products: Product[], recovery = false
): string[] {
  if (!plan?.skin) return [];
  const byId = new Map(products.map((p) => [p.id, p]));
  let ids: string[];
  if (period === 'corpo' || period === 'cabelo') {
    const pp = period === 'corpo' ? plan.skin.body : plan.skin.hair;
    if (!pp) return [];
    const wd = isoWeekday(date);
    const day = pp.days?.[wd] ?? { add: [], remove: [] };
    // Cabelo: a rotina-base só entra nos dias de lavar; nos outros, só o que foi marcado para o dia.
    const base = period === 'cabelo' && pp.washDays && !pp.washDays.includes(wd) ? [] : pp.base;
    ids = [...base.filter((id) => !day.remove.includes(id)), ...day.add.filter((id) => !base.includes(id))];
  } else if (recovery) {
    ids = plan.skin.recovery[period] ?? [];
  } else {
    const pp = plan.skin[period];
    const day = pp.days?.[isoWeekday(date)] ?? { add: [], remove: [] };
    ids = [...pp.base.filter((id) => !day.remove.includes(id)), ...day.add.filter((id) => !pp.base.includes(id))];
  }
  const usable = ids.filter((id) => {
    const p = byId.get(id);
    return p && p.status !== 'arquivado' && p.status !== 'de_outra';
  });
  const pos = new Map(ids.map((id, i) => [id, i]));
  return usable.sort((a, b) => {
    const ga = GROUP_RANK[byId.get(a)!.group];
    const gb = GROUP_RANK[byId.get(b)!.group];
    return ga - gb || pos.get(a)! - pos.get(b)!;
  });
}

export function plannedTraining(plan: Plan | undefined, date: DateKey): string[] {
  return plan?.training?.[isoWeekday(date)] ?? [];
}

export function plannedFood(plan: Plan | undefined, date: DateKey): Record<string, string | null> {
  return plan?.food?.[isoWeekday(date)] ?? {};
}

/** Ao salvar um plano: se a versão vigente começou antes de hoje, cria nova versão a partir de hoje
 *  (o passado continua mostrando o plano antigo). Caso contrário, edita a versão de hoje. */
export function planSaveTarget(current: Plan | undefined, today: DateKey): { mode: 'update'; id: string } | { mode: 'create'; validFrom: DateKey } {
  if (current && current.validFrom >= today) return { mode: 'update', id: current.id };
  return { mode: 'create', validFrom: today };
}

/** Ativos marcados por ela que aparecem juntos no mesmo período (alerta de conferência, não regra). */
export function activesTogether(ids: string[], products: Product[]): Product[] {
  const act = products.filter((p) => p.active && ids.includes(p.id));
  return act.length >= 2 ? act : [];
}

/* ---------------- Hábitos ---------------- */

export interface HabitDayState {
  done: boolean;
  viaWorkout: boolean;
  manual: boolean;
}

export function habitDay(h: Habit, date: DateKey, logs: HabitLog[], workouts: Workout[]): HabitDayState {
  const manual = logs.some((l) => l.habitId === h.id && l.date === date && l.done);
  const viaWorkout = !!h.modalityId && workouts.some((w) => w.date === date && w.modalityId === h.modalityId);
  return { done: manual || viaWorkout, viaWorkout, manual };
}

/** Datas distintas em que o hábito foi cumprido no intervalo. Treino + marcação no mesmo dia contam uma vez. */
export function habitDoneDates(h: Habit, from: DateKey, to: DateKey, logs: HabitLog[], workouts: Workout[]): DateKey[] {
  const set = new Set<DateKey>();
  for (const l of logs) if (l.habitId === h.id && l.done && l.date >= from && l.date <= to) set.add(l.date);
  if (h.modalityId) for (const w of workouts) if (w.modalityId === h.modalityId && w.date >= from && w.date <= to) set.add(w.date);
  return [...set].sort();
}

export function habitPeriod(h: Habit, date: DateKey): { from: DateKey; to: DateKey } {
  if (h.freq === 'semanal') { const s = weekStart(date); return { from: s, to: addDays(s, 6) }; }
  if (h.freq === 'mensal') return { from: monthStart(date), to: monthEnd(date) };
  return { from: date, to: date };
}

export function habitProgress(h: Habit, date: DateKey, logs: HabitLog[], workouts: Workout[]) {
  const { from, to } = habitPeriod(h, date);
  const count = habitDoneDates(h, from, to, logs, workouts).length;
  return { count, target: h.target, from, to };
}

/* ---------------- Sugestão de tarefas ---------------- */

export interface SuggestContext {
  time?: 'curta' | 'media' | 'longa'; // 10–15, 30, 1h+
  money?: 'sem_gastar' | 'posso_comprar';
  place?: 'em_casa' | 'na_rua' | 'tela';
}

const PRIO_SCORE: Record<Priority, number> = { alta: 30, media: 20, baixa: 10 };

export function suggestTasks(tasks: Task[], logs: SuggestionLog[], date: DateKey, ctx: SuggestContext = {}, limit = 3): Task[] {
  const recentDismiss = (id: string) =>
    logs.filter((l) => l.taskId === id && l.action === 'dispensada' && l.date <= date && l.date >= addDays(date, -6)).length;
  const deferredToday = (id: string) => logs.some((l) => l.taskId === id && l.date === date && (l.action === 'adiada' || l.action === 'dispensada'));

  const scored = tasks
    .filter((t) => t.status === 'pendente' && t.plannedDate !== date && !deferredToday(t.id))
    .filter((t) => {
      if (ctx.money === 'sem_gastar' && (t.costEst ?? 0) > 0) return false;
      if (ctx.time === 'curta' && t.minutes && t.minutes > 20) return false;
      if (ctx.time === 'media' && t.minutes && t.minutes > 45) return false;
      if (ctx.place === 'em_casa' && t.mode && !['em_casa', 'celular', 'computador'].includes(t.mode)) return false;
      if (ctx.place === 'na_rua' && t.mode && !['na_rua', 'presencial', 'celular'].includes(t.mode)) return false;
      if (ctx.place === 'tela' && t.mode && !['celular', 'computador'].includes(t.mode)) return false;
      return true;
    })
    .map((t) => {
      let s = PRIO_SCORE[t.priority];
      if (t.nextStep) s += 4; // fica mais fácil começar
      if (ctx.time === 'curta' && t.minutes && t.minutes <= 15) s += 3;
      if (t.plannedDate && t.plannedDate < date) s += 2; // já escolhida antes e não feita
      s -= recentDismiss(t.id) * 8;
      return { t, s };
    })
    .sort((a, b) => b.s - a.s || a.t.createdAt - b.t.createdAt || a.t.title.localeCompare(b.t.title));
  return scored.slice(0, limit).map((x) => x.t);
}

/** Justificativa baseada só em dados reais da tarefa. */
export function suggestionReason(t: Task, priorityLabel: string): string {
  const parts = [`Prioridade ${priorityLabel.toLowerCase()}`];
  if (t.minutes) parts.push(`cerca de ${t.minutes} min`);
  if (t.costEst) parts.push(`custo estimado R$ ${t.costEst.toLocaleString('pt-BR')}`);
  let s = parts.join(', ');
  if (t.nextStep) s += `. Para começar: ${t.nextStep.charAt(0).toLowerCase() + t.nextStep.slice(1)}`;
  return s + (s.endsWith('.') ? '' : '.');
}

/* ---------------- Tarefas ---------------- */

export function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function matchesSearch(t: Task, q: string): boolean {
  const n = normalize(q.trim());
  if (!n) return true;
  const hay = normalize([t.title, t.description, t.subcategory, t.nextStep, ...(t.tags ?? []), t.owner].filter(Boolean).join(' '));
  return n.split(/\s+/).every((w) => hay.includes(w));
}

export function completeTask(t: Task, date: DateKey): Partial<Task> {
  return {
    status: 'concluida',
    completedDate: date,
    history: [...(t.history ?? []), { at: Date.now(), text: `Concluída em ${date}` }]
  };
}

export function reopenTask(t: Task): Partial<Task> {
  return {
    status: 'pendente',
    completedDate: null,
    history: [...(t.history ?? []), { at: Date.now(), text: 'Reaberta' }]
  };
}

export function moveTask(t: Task, to: DateKey | null): Partial<Task> {
  return {
    plannedDate: to,
    history: [...(t.history ?? []), { at: Date.now(), text: to ? `Escolhida para ${to}` : 'Retirada do dia' }]
  };
}

/** Tarefas que aparecem num dia: escolhidas para ele ou concluídas nele. */
export function tasksForDay(tasks: Task[], date: DateKey): Task[] {
  return tasks
    .filter((t) => t.status !== 'arquivada' && (t.plannedDate === date || t.completedDate === date))
    .sort((a, b) => Number(a.status === 'concluida') - Number(b.status === 'concluida') || PRIO_SCORE[b.priority] - PRIO_SCORE[a.priority]);
}

/* ---------------- Resumo do dia ---------------- */

export interface DayFacts {
  skinAm: boolean; skinPm: boolean; food: boolean; training: boolean; habits: boolean;
}
export function daySummary(f: DayFacts) {
  const items = [f.skinAm, f.skinPm, f.food, f.training, f.habits];
  return { done: items.filter(Boolean).length, total: items.length };
}
