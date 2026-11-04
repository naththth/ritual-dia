// Repetir o que ela já come: a última vez que registrou cada refeição vira um atalho de um toque.
// Ela quase nunca usa o "Comi isso" do plano; o padrão dela é repetir o próprio prato.
import type { Meal } from '../db/types';
import type { DateKey } from '../lib/dates';

/** A refeição mais recente desse tipo, com itens, antes da data. */
export function lastMealOf(meals: Meal[], mealType: string, before: DateKey): Meal | undefined {
  return meals
    .filter((m) => !m.deleted && m.mealType === mealType && m.items.length > 0 && m.date < before)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.updatedAt - a.updatedAt))[0];
}

/** Próxima refeição do dia: a primeira ainda sem registro cujo horário não passou há mais de 1 h. */
export function nextMealType(types: { id: string }[], times: Record<string, string>, logged: Set<string>, nowMin: number): string | undefined {
  const toMin = (t?: string) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : undefined);
  const open = types.filter((t) => !logged.has(t.id));
  return open.find((t) => (toMin(times[t.id]) ?? 9999) >= nowMin - 60)?.id;
}
