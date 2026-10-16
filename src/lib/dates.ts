// Datas locais no formato YYYY-MM-DD. Nunca usar toISOString para datas de calendário:
// a conversão para UTC desloca o dia perto da meia-noite.

export type DateKey = string; // 'YYYY-MM-DD'

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(k: DateKey): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0); // meio-dia evita bordas de fuso
}

export function todayKey(now: Date = new Date()): DateKey {
  return toKey(now);
}

export function addDays(k: DateKey, n: number): DateKey {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function addMonths(k: DateKey, n: number): DateKey {
  const d = fromKey(k);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toKey(d);
}

/** 1 = segunda ... 7 = domingo (ISO) */
export function isoWeekday(k: DateKey): number {
  const w = fromKey(k).getDay();
  return w === 0 ? 7 : w;
}

/** Segunda-feira da semana da data */
export function weekStart(k: DateKey): DateKey {
  return addDays(k, 1 - isoWeekday(k));
}

export function weekDays(k: DateKey): DateKey[] {
  const s = weekStart(k);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

export function monthStart(k: DateKey): DateKey {
  return k.slice(0, 8) + '01';
}

export function monthEnd(k: DateKey): DateKey {
  const d = fromKey(monthStart(k));
  return toKey(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

/** Grade do mês começando na segunda, com dias de borda */
export function monthGrid(k: DateKey): DateKey[] {
  const first = monthStart(k);
  const start = weekStart(first);
  const end = addDays(weekStart(monthEnd(k)), 6);
  const out: DateKey[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function inRange(k: DateKey, from: DateKey, to: DateKey) {
  return k >= from && k <= to;
}

export const WEEKDAY_SHORT = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
export const WEEKDAY_LETTER = ['', 'S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
export const WEEKDAY_LONG = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function dayNum(k: DateKey) {
  return Number(k.slice(8, 10));
}
export function monthIdx(k: DateKey) {
  return Number(k.slice(5, 7)) - 1;
}

/** "seg, 19/10" */
export function shortLabel(k: DateKey) {
  return `${WEEKDAY_SHORT[isoWeekday(k)]}, ${k.slice(8, 10)}/${k.slice(5, 7)}`;
}

/** "19 de outubro" */
export function longDate(k: DateKey) {
  return `${dayNum(k)} de ${MONTHS[monthIdx(k)]}`;
}

export function monthTitle(k: DateKey) {
  return `${MONTHS[monthIdx(k)]} ${k.slice(0, 4)}`;
}

export function diffDays(a: DateKey, b: DateKey) {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86400000);
}
