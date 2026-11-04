// Carrega do aparelho o que o motor da Mente precisa e grava os registros da área (tomadas, check-ins, café).
import { all, byDateRange, get, remove, update, upsert, create } from '../db/db';
import { addDays, todayKey, type DateKey } from '../lib/dates';
import type { Intake, MoodCheckin } from '../db/types';
import { planFor, plannedTraining } from './rules';
import { totals } from './nutrition';
import { bedFor, sleepPlan } from './sleep';
import { buildDays, computeAlerts, hm, intakeLogId, moodId, toMin, DEFAULT_DRINKS, type MindDay, type MindAlert } from './mind';

export interface MindData { days: MindDay[]; alerts: MindAlert[]; bed?: string }

export async function loadMind(today: DateKey = todayKey(), span = 56): Promise<MindData> {
  const from = addDays(today, -span + 1);
  const [settings, wellness, moods, caffeine, meals, workouts, intakes, intakeLogs, plans, tmpls, extras, foods, changes] = await Promise.all([
    get<'settings'>('settings'), byDateRange('wellness', from, today), byDateRange('mood', from, today), byDateRange('caffeine', from, today),
    byDateRange('meal', from, today), byDateRange('workout', from, today), all('intake'), byDateRange('intakelog', from, today),
    all('plan'), all('wtemplate'), byDateRange('extra', from, today), all('food'), all('medchange')
  ]);
  const plannedMin: Record<DateKey, number> = {};
  for (let d = from; d <= today; d = addDays(d, 1)) {
    plannedMin[d] = plannedTraining(planFor(plans, 'training', d), d, extras).map((id) => tmpls.find((t) => t.id === id)).reduce((a, t) => a + (t && t.modalityId !== 'mod:descanso' ? t.duration : 0), 0);
  }
  const mealsN = meals.map((m) => { const n = totals(m.items, foods).n; return { ...m, kcal: n.kcal, protein: n.p }; });
  const now = new Date();
  const nowMin = today === todayKey() ? now.getHours() * 60 + now.getMinutes() : 24 * 60;
  const days = buildDays({ wellness, moods, caffeine, meals: mealsN, workouts, plannedMin, intakes, intakeLogs }, from, today, nowMin);
  const sp = sleepPlan(settings?.reminders);
  const bed = sp ? bedFor(sp, today) : undefined;
  const dismissed = settings?.mind?.dismissed ?? {};
  const alerts = computeAlerts(days, {
    today, nowMin, bed, targets: settings?.targets, medChanges: changes,
    caffeineSensitive: intakes.some((i) => i.active && i.caffeineSensitive)
  }).filter((a) => dismissed[a.id] !== today);
  return { days, alerts, bed };
}

/* ---------------- Gravações ---------------- */
export async function markDose(item: Intake, date: DateKey, slot: string, status: 'tomei' | 'pulei') {
  const id = intakeLogId(date, item.id, slot);
  const prev = await get<'intakelog'>(id);
  if (prev) return;
  await upsert('intakelog', id, { date, itemId: item.id, slot, status, takenAt: status === 'tomei' ? (date === todayKey() ? hm() : slot) : undefined });
  if (status === 'tomei' && item.stock != null) await update<'intake'>(item.id, { stock: Math.max(0, item.stock - (item.perDose ?? 1)) });
}

export async function unmarkDose(item: Intake, date: DateKey, slot: string) {
  const id = intakeLogId(date, item.id, slot);
  const prev = await get<'intakelog'>(id);
  if (!prev) return;
  await remove(id);
  if (prev.status === 'tomei' && item.stock != null) {
    const cur = await get<'intake'>(item.id);
    if (cur?.stock != null) await update<'intake'>(item.id, { stock: cur.stock + (item.perDose ?? 1) });
  }
}

export async function saveCheckin(date: DateKey, period: 'am' | 'pm', data: Partial<MoodCheckin>) {
  await upsert('mood', moodId(date, period), { date, period, tags: [], ...data });
}

export async function addCaffeine(date: DateKey, label: string, mg: number, time?: string) {
  return create('caffeine', { date, label, mg, time: time ?? (date === todayKey() ? hm() : '09:00') });
}

export async function drinksOf() {
  return (await get<'settings'>('settings'))?.mind?.drinks ?? DEFAULT_DRINKS;
}

export async function dismissAlert(id: string, date: DateKey = todayKey()) {
  const s = await get<'settings'>('settings');
  const prev = s?.mind?.dismissed ?? {};
  // Guarda só os da última semana.
  const keep = Object.fromEntries(Object.entries(prev).filter(([, d]) => d > addDays(date, -7)));
  await update<'settings'>('settings', { mind: { ...(s?.mind ?? {}), dismissed: { ...keep, [id]: date } } });
}

/** Horário como minutos para ordenar; quem não tem horário vai para o fim. */
export const slotOrder = (t?: string) => toMin(t) ?? 9999;
