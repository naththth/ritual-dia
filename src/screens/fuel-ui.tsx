// O app propõe o que comer: alvo da refeição, o que fecha a conta com os alimentos dela e, se ela quiser, pratos montados pela IA.
import { useEffect, useMemo, useState } from 'react';
import { Plus, Sparkles, Target } from 'lucide-react';
import { useAll, useByDate, useByRange, useSettings } from '../db/hooks';
import { planFor, plannedFood } from '../domain/rules';
import { addDays, todayKey, type DateKey } from '../lib/dates';
import { fmt, totals } from '../domain/nutrition';
import { M0, mealTarget, pickFoods, postWorkout, remainingOf, toMacros, usageOf, type Macros, type FoodPick } from '../domain/fuel';
import { DEFAULT_MEAL_TIMES } from './today';
import { aiAvailable, askAI } from '../domain/ai';
import { saveMeal } from '../domain/actions';
import { Sheet } from '../ui/ui';
import { toast } from '../state/store';
import type { Food, MealItem } from '../db/types';

const toMin = (t?: string) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : undefined);
function useNow() {
  const [n, setN] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  useEffect(() => { const t = setInterval(() => { const d = new Date(); setN(d.getHours() * 60 + d.getMinutes()); }, 60_000); return () => clearInterval(t); }, []);
  return n;
}

export interface Fuel {
  goal: Partial<Macros>; eaten: Macros; remaining: Macros; weightKg?: number; hasGoal: boolean;
  mealsLeft: string[]; post?: ReturnType<typeof postWorkout>; foods: Food[]; usage: Map<string, number>;
  targetFor: (mealType: string, plate?: MealItem[]) => { target: Macros; gap: Macros; picks: FoodPick[]; leftover: number };
}

/** Tudo o que o app sabe sobre a comida do dia, numa conta só. */
export function useFuel(date: DateKey): Fuel | undefined {
  const settings = useSettings();
  const meals = useByDate('meal', date);
  const workouts = useByDate('workout', date);
  const skips = useByDate('skip', date);
  const extras = useByDate('extra', date);
  const foods = useAll('food');
  const plans = useAll('plan');
  const tmpls = useAll('mtemplate');
  const recent = useByRange('meal', addDays(date, -30), addDays(date, -1));
  const wellness = useByRange('wellness', addDays(date, -30), date);
  const now = useNow();
  return useMemo(() => {
    if (!settings || !meals || !workouts || !skips || !foods || !plans || !tmpls || !recent) return undefined;
    const planned = plannedFood(planFor(plans, 'food', date), date, extras);
    const planItems = Object.values(planned).flatMap((id) => tmpls.find((t) => t.id === id)?.items ?? []);
    const planTot = planItems.length ? totals(planItems, foods).n : undefined;
    const goal = { kcal: settings.targets?.kcal ?? planTot?.kcal, p: settings.targets?.p ?? planTot?.p, c: settings.targets?.c ?? planTot?.c, f: settings.targets?.f ?? planTot?.f };
    const eaten = toMacros(totals(meals.flatMap((m) => m.items), foods).n);
    const remaining = remainingOf(goal, eaten);
    const lastW = [...(wellness ?? [])].filter((w) => (w as any).weight).sort((a, b) => (a.date < b.date ? 1 : -1))[0] as any;
    const weightKg = lastW?.weight ?? settings.profile?.weightKg;
    const times = { ...DEFAULT_MEAL_TIMES, ...(settings.mealTimes ?? {}) };
    const today = date === todayKey();
    const logged = new Set([...meals.filter((m) => m.items.length).map((m) => m.mealType), ...skips.filter((s) => s.domain === 'food').map((s) => s.ref)]);
    const mealsLeft = settings.mealTypes.filter((m) => !logged.has(m.id) && (!today || (toMin(times[m.id]) ?? 9999) >= now - 60)).map((m) => m.id);
    const post = postWorkout(workouts, meals, now, today);
    const usage = usageOf([...recent, ...meals]);
    const targetFor = (mealType: string, plate: MealItem[] = []) => {
      // O que já está neste prato ainda não foi salvo: tira da conta do dia para não contar duas vezes.
      const saved = meals.find((m) => m.mealType === mealType);
      const savedN = saved ? toMacros(totals(saved.items, foods).n) : M0;
      const rem = remainingOf(goal, { kcal: eaten.kcal - savedN.kcal, p: eaten.p - savedN.p, c: eaten.c - savedN.c, f: eaten.f - savedN.f });
      const left = Math.max(1, mealsLeft.filter((m) => m !== mealType).length + 1);
      const target = mealTarget({ remaining: rem, mealsLeft: left, weightKg, post: post ? { demanding: post.demanding } : undefined, dayKcal: goal.kcal });
      const leftover = left === 1 && rem.kcal > target.kcal + 150 ? rem.kcal - target.kcal : 0;
      const plateN = toMacros(totals(plate, foods).n);
      const gap = remainingOf(target, plateN);
      const picks = pickFoods(gap, foods, usage, new Set(plate.map((i) => i.foodId)));
      return { target, gap, picks, leftover };
    };
    return { goal, eaten, remaining, weightKg, hasGoal: !!goal.kcal || !!goal.p, mealsLeft, post, foods, usage, targetFor };
  }, [settings, meals, workouts, skips, extras, foods, plans, tmpls, recent, wellness, now, date]);
}

function MacroChips({ m, muted }: { m: Macros; muted?: boolean }) {
  return (
    <div className={`fuel-chips ${muted ? 'muted' : ''}`}>
      <span><b className="num">{fmt(m.p)}</b> g proteína</span>
      <span><b className="num">{fmt(m.c)}</b> g carbo</span>
      <span><b className="num">{fmt(m.f)}</b> g gordura</span>
      <span><b className="num">{fmt(m.kcal)}</b> kcal</span>
    </div>
  );
}

/** No cartão da próxima refeição: o que é ideal agora e com quais alimentos dela. */
export function FuelNext({ fuel, mealType, label, date }: { fuel: Fuel; mealType: string; label: string; date: DateKey }) {
  const [ai, setAi] = useState(false);
  if (!fuel.hasGoal) return null;
  const { target, picks } = fuel.targetFor(mealType);
  if (target.kcal < 50 && target.p < 5) return <p className="fuel-done small">A meta do dia já fechou. Se tiver fome, prefira algo leve e rico em proteína ou fibras.</p>;
  return (
    <div className="fuel" data-testid={`fuel-${mealType}`}>
      <div className="fuel-h"><Target size={16} /><b>Ideal agora</b>{fuel.post ? <span className="fuel-tag">pós-treino</span> : null}</div>
      <MacroChips m={target} />
      {fuel.post && <p className="tiny" style={{ margin: '4px 0 0' }}>Treino terminou há {fuel.post.minsAgo} min{fuel.post.demanding ? ': proteína e carboidrato juntos ajudam a repor e recuperar.' : '.'}</p>}
      {picks.length > 0 && (
        <ul className="fuel-picks">
          {picks.map((x) => <li key={x.food.id}><span className="grow"><b>{x.food.name}</b> {x.label}</span><span className="tiny num">{fmt(x.n.p)} g P · {fmt(x.n.kcal)} kcal</span></li>)}
        </ul>
      )}
      <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
        {picks.length > 0 && <button className="pill-act pa-honey" data-testid={`fuel-use-${mealType}`} onClick={() => saveMeal(date, mealType, picks.map((x) => ({ foodId: x.food.id, portion: `${x.grams} g`, grams: x.grams })))}>Comi isso</button>}
        {aiAvailable() && <button className="pill-act pa-ghost" onClick={() => setAi(true)}><Sparkles size={15} />Montar prato com IA</button>}
      </div>
      <AIMealSheet open={ai} onClose={() => setAi(false)} fuel={fuel} mealType={mealType} label={label} date={date} onUse={(items) => saveMeal(date, mealType, items)} />
    </div>
  );
}

/** Na tela da refeição: o prato contra o ideal, enquanto ela monta, e o que acrescentar. */
export function PlateCoach({ fuel, mealType, label, date, plate, onAdd, onUse }: { fuel: Fuel; mealType: string; label: string; date: DateKey; plate: MealItem[]; onAdd: (it: MealItem) => void; onUse: (items: MealItem[]) => void }) {
  const [ai, setAi] = useState(false);
  if (!fuel.hasGoal) return null;
  const { target, gap, picks, leftover } = fuel.targetFor(mealType, plate);
  const plateN = { kcal: target.kcal - gap.kcal, p: target.p - gap.p, c: target.c - gap.c, f: target.f - gap.f };
  const over = plate.length ? toMacros(totals(plate, fuel.foods).n) : M0;
  const bar = (v: number, t: number) => (t ? Math.min(100, (v / t) * 100) : 0);
  const msg = !plate.length ? `Para ${label.toLowerCase()}, o ideal fica perto de ${fmt(target.p)} g de proteína e ${fmt(target.kcal)} kcal.`
    : gap.p >= 8 ? `Faltam ~${fmt(gap.p)} g de proteína para o ideal desta refeição.`
    : over.kcal > target.kcal * 1.2 && target.kcal ? `Este prato passa ${fmt(over.kcal - target.kcal)} kcal do ideal; o resto do dia fica mais curto.`
    : 'Prato equilibrado para o que falta no dia.';
  return (
    <section className="plate-coach" data-testid="plate-coach">
      <div className="fuel-h"><Target size={16} /><b>Ideal desta refeição</b>{fuel.post ? <span className="fuel-tag">pós-treino</span> : null}</div>
      <p className="small" style={{ margin: '4px 0 8px' }}>{msg}{leftover ? ` Sobram ~${fmt(leftover)} kcal da meta que não precisam entrar aqui: comer tudo de uma vez à noite não ajuda o sono nem a composição corporal.` : ''}</p>
      <div className="pc-bars">
        {([['Proteína', over.p, target.p], ['Carbo', over.c, target.c], ['Gordura', over.f, target.f], ['kcal', over.kcal, target.kcal]] as const).map(([l, v, t]) => (
          <div key={l} className="pc-bar"><span className="tiny">{l}</span><div className="wbar"><i style={{ width: `${bar(v, t)}%`, background: v > t * 1.15 && t ? 'var(--wine)' : 'var(--honey-ink)' }} /></div><span className="tiny num">{fmt(v)}/{fmt(t)}</span></div>
        ))}
      </div>
      {plateN && picks.length > 0 && gap.kcal > 60 && (
        <div className="pc-add">
          {picks.slice(0, 3).map((x) => (
            <button key={x.food.id} className="mini-add" onClick={() => onAdd({ foodId: x.food.id, portion: `${x.grams} g`, grams: x.grams })} data-testid="plate-coach-add"><Plus size={14} />{x.food.name} {x.label}</button>
          ))}
        </div>
      )}
      {aiAvailable() && <button className="link small" style={{ minHeight: 36 }} onClick={() => setAi(true)}><Sparkles size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Montar prato com IA</button>}
      <AIMealSheet open={ai} onClose={() => setAi(false)} fuel={fuel} mealType={mealType} label={label} date={date} plate={plate} onUse={onUse} />
    </section>
  );
}

/** Dois pratos montados pela IA com os alimentos dela, fechando o alvo da refeição. */
function AIMealSheet({ open, onClose, fuel, mealType, label, date, plate = [], onUse }: { open: boolean; onClose: () => void; fuel: Fuel; mealType: string; label: string; date: DateKey; plate?: MealItem[]; onUse: (items: MealItem[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  useEffect(() => {
    if (!open || res || busy) return;
    (async () => {
      setBusy(true);
      try {
        const { target } = fuel.targetFor(mealType, []);
        const name = (id: string) => fuel.foods.find((f) => f.id === id)?.name;
        const top = [...fuel.foods].filter((f) => f.n && !f.archived).sort((a, b) => (fuel.usage.get(b.id) ?? 0) - (fuel.usage.get(a.id) ?? 0)).slice(0, 60);
        setRes(await askAI('meal_advice', {
          data: date, refeicao: label,
          ja_no_prato: plate.map((i) => ({ nome: name(i.foodId), porcao: i.portion })),
          meta_do_dia: fuel.goal, consumido_hoje: fuel.eaten, falta_no_dia: fuel.remaining,
          refeicoes_que_faltam: fuel.mealsLeft.length, alvo_desta_refeicao: target, peso_kg: fuel.weightKg,
          pos_treino: fuel.post ? { minutos_desde_o_fim: fuel.post.minsAgo, exigente: fuel.post.demanding, duracao: fuel.post.w.duration, tss: fuel.post.w.metrics?.tss } : null,
          alimentos_que_ela_usa: top.map((f) => ({ id: f.id, nome: f.name, por_100g: f.n, medidas: f.measures, vezes: fuel.usage.get(f.id) ?? 0 }))
        }));
      } catch (e: any) { toast(e.message, undefined, 'error'); onClose(); } finally { setBusy(false); }
    })();
  }, [open]);
  useEffect(() => { if (!open) setRes(null); }, [open]);
  const valid = new Set(fuel.foods.map((f) => f.id));
  return (
    <Sheet open={open} onClose={onClose} title={`${label}: o que comer`} sub="Montado com os alimentos que você usa">
      {busy && <p className="small muted">Montando dois pratos para o que falta no seu dia…</p>}
      {res?.dica && <p className="notice calm">{res.dica}</p>}
      {(res?.opcoes ?? []).map((o: any, k: number) => {
        const items: MealItem[] = (o.itens ?? []).filter((i: any) => i.food_id && valid.has(i.food_id)).map((i: any) => ({ foodId: i.food_id, portion: String(i.quantidade ?? `${i.gramas} g`), grams: Number(i.gramas) || undefined }));
        return (
          <div key={k} className="ai-meal">
            <b>{o.nome || `Opção ${k + 1}`}</b>
            <ul>{(o.itens ?? []).map((i: any, j: number) => <li key={j}>{i.nome} · {i.quantidade}{i.estimado ? ' (estimado)' : ''}</li>)}</ul>
            <div className="tiny num">{fmt(o.p ?? 0)} g P · {fmt(o.c ?? 0)} g C · {fmt(o.g ?? 0)} g G · {fmt(o.kcal ?? 0)} kcal</div>
            {o.porque && <p className="small" style={{ margin: '6px 0 0' }}>{o.porque}</p>}
            {items.length > 0 && <button className="pill-act pa-honey" style={{ marginTop: 8 }} onClick={() => { onUse(items); onClose(); }}>Usar esta opção</button>}
          </div>
        );
      })}
    </Sheet>
  );
}
