// Ações com desfazer. Toda gravação passa por aqui ou pelo repositório.
import { create, db, get, remove, restore, update, upsert, uid } from '../db/db';
import type { AnyRecord, Habit, Meal, MealItem, Plan, PlanDomain, SkinLog, SkinPeriod, Task, Workout, WorkoutTemplate, MealTemplate } from '../db/types';
import type { DateKey } from '../lib/dates';
import { haptic, toast } from '../state/store';
import { completeTask, moveTask, reopenTask, planSaveTarget } from './rules';
import { todayKey, shortLabel } from '../lib/dates';

async function snapshot(id: string) {
  return (await db.records.get(id)) as AnyRecord | undefined;
}

export async function withUndo(id: string, text: string, fn: () => Promise<unknown>) {
  const before = await snapshot(id);
  await fn();
  haptic();
  toast(text, () => restore(before, id));
}

/* ---------- Tarefas ---------- */
export async function toggleTaskDone(t: Task, date: DateKey) {
  const done = t.status === 'concluida';
  await withUndo(t.id, done ? 'Tarefa reaberta' : `Concluída em ${shortLabel(date)}`, () =>
    update<'task'>(t.id, done ? reopenTask(t) : { ...completeTask(t, date), plannedDate: t.plannedDate ?? date })
  );
}

export async function planTask(t: Task, date: DateKey | null) {
  await withUndo(t.id, date ? `Adicionada a ${shortLabel(date)}` : 'Retirada do dia', () => update<'task'>(t.id, moveTask(t, date)));
}

export async function logSuggestion(taskId: string, date: DateKey, action: 'aceita' | 'adiada' | 'dispensada') {
  await create('suggestion', { taskId, date, action });
}

/* ---------- Hábitos ---------- */
export async function toggleHabit(h: Habit, date: DateKey, currentlyManual: boolean) {
  const id = `hlog:${h.id}:${date}`;
  await withUndo(id, currentlyManual ? `${h.title} desmarcado` : `${h.title} feito`, () =>
    upsert('hlog', id, { habitId: h.id, date, done: !currentlyManual })
  );
}

/* ---------- Água ---------- */
export async function addWater(date: DateKey, ml: number) {
  const rec = await create('water', { date, ml });
  haptic();
  toast(`+${ml} mL`, () => remove(rec.id));
}

/* ---------- Treinos ---------- */
export async function saveWorkout(w: Omit<Workout, 'id' | 'kind' | 'createdAt' | 'updatedAt'> & { id?: string }) {
  if (w.id) {
    await withUndo(w.id, 'Treino atualizado', () => update<'workout'>(w.id!, w));
    return;
  }
  const rec = await create('workout', w);
  haptic();
  toast('Treino registrado', () => remove(rec.id));
}

export async function workoutFromTemplate(t: WorkoutTemplate, date: DateKey, fromPlan: boolean) {
  await saveWorkout({ date, modalityId: t.modalityId, duration: t.duration, intensity: t.intensity, muscles: t.muscles, distanceKm: t.distanceKm, templateId: t.id, fromPlan });
}

export async function deleteRecord(id: string, text: string) {
  const before = await snapshot(id);
  await remove(id);
  haptic();
  toast(text, () => restore(before, id));
}

/* ---------- Pulos de plano ---------- */
export async function skipPlanned(date: DateKey, domain: PlanDomain, ref: string, text = 'Marcado como não hoje') {
  const id = `skip:${date}:${domain}:${ref}`;
  await withUndo(id, text, () => upsert('skip', id, { date, domain, ref }));
}

/* ---------- Pele ---------- */
export const skinId = (date: DateKey, period: SkinPeriod) => `skin:${date}:${period}`;

export async function saveSkin(date: DateKey, period: SkinPeriod, data: Partial<SkinLog>) {
  const id = skinId(date, period);
  await withUndo(id, 'Pele registrada', () => upsert('skin', id, { date, period, signals: {}, productIds: [], plannedIds: [], ...data }));
}

/* ---------- Refeições ---------- */
export const mealId = (date: DateKey, type: string) => `meal:${date}:${type}`;

export async function saveMeal(date: DateKey, mealType: string, items: MealItem[], extra: Partial<Meal> = {}) {
  const id = mealId(date, mealType);
  await withUndo(id, 'Refeição salva', () => upsert('meal', id, { date, mealType, items, ...extra }));
}

export async function mealFromTemplate(t: MealTemplate, date: DateKey, mealType: string, fromPlan: boolean) {
  await saveMeal(date, mealType, t.items, { templateId: t.id, fromPlan });
}

/** Copia refeições de outro dia sem substituir as já registradas. */
export async function copyMealsFrom(from: DateKey, to: DateKey): Promise<number> {
  const src = (await db.records.where('[kind+date]').equals(['meal', from]).toArray()).filter((r) => !r.deleted) as Meal[];
  let n = 0;
  for (const m of src) {
    const id = mealId(to, m.mealType);
    if (await get(id)) continue;
    await upsert('meal', id, { date: to, mealType: m.mealType, items: m.items, templateId: m.templateId });
    n++;
  }
  return n;
}

/* ---------- Planos ---------- */
export async function savePlan(domain: PlanDomain, current: Plan | undefined, data: Partial<Plan>) {
  const target = planSaveTarget(current, todayKey());
  if (target.mode === 'update') {
    await update<'plan'>(target.id, data);
  } else {
    await create('plan', { domain, validFrom: target.validFrom, ...data, id: uid('plan') } as any);
  }
  haptic();
  if (domain === 'training') import('../sync/services').then((m) => m.pushTrainingSoon());
  toast(target.mode === 'create' && current ? 'Plano salvo. Vale a partir de hoje; dias anteriores mantêm o plano antigo.' : 'Plano salvo');
}
