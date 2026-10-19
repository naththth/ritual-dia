// Horário de sono: a partir da hora de acordar e das horas de sono desejadas, calcula a hora de deitar
// e organiza os horários do dia. A mesma conta existe na função ritual-svc, que envia os lembretes.
import { addDays, isoWeekday, type DateKey } from '../lib/dates';
import type { Reminders, SleepPlan } from '../db/types';

export const DEFAULT_SLEEP: SleepPlan = { wake: '06:00', hours: 8, latency: 15, alarm: true, bed: true };

export const toMin = (t?: string) => (t && /^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : undefined);
export const fromMin = (m: number) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

export function sleepPlan(r?: Reminders): SleepPlan | undefined {
  return r?.sleep ? { ...DEFAULT_SLEEP, ...r.sleep } : undefined;
}

/** Hora de acordar no dia informado (fim de semana pode ser diferente). */
export function wakeFor(s: SleepPlan, date: DateKey) {
  return isoWeekday(date) >= 6 && s.weekendWake ? s.weekendWake : s.wake;
}

/** Hora de deitar na noite do dia informado, para acordar no horário do dia seguinte. */
export function bedFor(s: SleepPlan, date: DateKey) {
  return fromMin(toMin(wakeFor(s, addDays(date, 1)))! - s.hours * 60 - s.latency);
}

export const hoursLabel = (h: number) => `${Math.floor(h)} h${h % 1 ? ` ${Math.round((h % 1) * 60)}` : ''}`;

/** Horários do dia derivados do sono: pele e café logo depois de acordar; fechar o dia e pele da noite antes de deitar. */
export function scheduleFromSleep(s: SleepPlan, date: DateKey) {
  const wake = toMin(wakeFor(s, date))!;
  const bed = toMin(bedFor(s, date))!;
  return {
    morning: fromMin(wake + 10),
    skinAm: fromMin(wake + 20),
    cafe: fromMin(wake + 40),
    evening: fromMin(bed - 60),
    skinPm: fromMin(bed - 30)
  };
}
