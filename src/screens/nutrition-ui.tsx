import { useAll, useByDate, useSettings } from '../db/hooks';
import { fmt, totals } from '../domain/nutrition';
import { planFor, plannedFood } from '../domain/rules';
import type { DateKey } from '../lib/dates';
import type { MealItem } from '../db/types';

/** Totais do dia comparados com a meta: metas próprias (Ajustes) ou, sem elas, o plano alimentar do dia. */
export function DayNutrition({ date }: { date: DateKey }) {
  const settings = useSettings();
  const meals = useByDate('meal', date);
  const foods = useAll('food');
  const plans = useAll('plan');
  const tmpls = useAll('mtemplate');
  if (!foods || !meals || settings?.showNutrition === false) return null;
  const eaten = totals(meals.flatMap((m) => m.items), foods);
  const planned = plannedFood(planFor(plans ?? [], 'food', date), date);
  const planItems: MealItem[] = Object.values(planned).flatMap((id) => tmpls?.find((t) => t.id === id)?.items ?? []);
  const plan = planItems.length ? totals(planItems, foods).n : undefined;
  const t = settings?.targets;
  const target = {
    kcal: t?.kcal ?? plan?.kcal, p: t?.p ?? plan?.p, c: t?.c ?? plan?.c, f: t?.f ?? plan?.f
  };
  const label = t?.kcal ? 'da meta' : plan ? 'do plano' : '';
  if (!meals.length && !target.kcal) return null;
  const bar = (v: number, max?: number) => (max ? <div className="macro-bar"><i style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /></div> : null);
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1.5px dotted rgba(91,58,8,.35)' }} data-testid="day-nutrition">
      <div className="row between">
        <span><span className="big-num num" style={{ fontSize: 26 }}>{fmt(eaten.n.kcal)}</span> <span className="small">kcal{target.kcal ? ` de ${fmt(target.kcal)} ${label}` : ''}</span></span>
      </div>
      {bar(eaten.n.kcal, target.kcal)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 6 }}>
        {([['Proteína', eaten.n.p, target.p], ['Carbo', eaten.n.c, target.c], ['Gordura', eaten.n.f, target.f]] as [string, number, number | undefined][]).map(([l, v, m]) => (
          <div key={l} className="small">
            <div style={{ fontWeight: 700 }}>{l}</div>
            <div className="num">{fmt(v)}{m ? ` / ${fmt(m)}` : ''} g</div>
            {bar(v, m)}
          </div>
        ))}
      </div>
      {eaten.missing > 0 && <div className="tiny" style={{ marginTop: 4 }}>{eaten.missing} {eaten.missing === 1 ? 'item sem dados nutricionais' : 'itens sem dados nutricionais'}, fora da conta.</div>}
    </div>
  );
}
