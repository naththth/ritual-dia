import { useNavigate } from 'react-router-dom';
import { Plus, ChevronLeft, ChevronRight, Undo2 } from 'lucide-react';
import { TopBar } from './common';
import { useAll, useByDate, useSettings } from '../db/hooks';
import { useApp, toast } from '../state/store';
import { planFor, plannedFood } from '../domain/rules';
import { addDays, shortLabel, todayKey } from '../lib/dates';
import { addWater, mealFromTemplate, skipPlanned } from '../domain/actions';
import { fmt, itemNutr, totals } from '../domain/nutrition';
import { remove } from '../db/db';
import { DEFAULT_MEAL_TIMES } from './today';
import type { MealItem } from '../db/types';

export function FoodTab() {
  const { date, setDate } = useApp();
  const nav = useNavigate();
  const settings = useSettings();
  const meals = useByDate('meal', date);
  const water = useByDate('water', date);
  const workouts = useByDate('workout', date);
  const skips = useByDate('skip', date);
  const foods = useAll('food');
  const plans = useAll('plan');
  const tmpls = useAll('mtemplate');
  if (!settings || !meals || !foods || !tmpls || !plans || !water || !workouts || !skips) return <div className="screen"><TopBar /></div>;
  const showN = settings.showNutrition !== false;
  const planned = plannedFood(planFor(plans, 'food', date), date);
  const planItems: MealItem[] = Object.values(planned).flatMap((id) => tmpls.find((t) => t.id === id)?.items ?? []);
  const planTot = planItems.length ? totals(planItems, foods).n : undefined;
  const eaten = totals(meals.flatMap((m) => m.items), foods);
  const goal = { kcal: settings.targets?.kcal ?? planTot?.kcal, p: settings.targets?.p ?? planTot?.p, c: settings.targets?.c ?? planTot?.c, f: settings.targets?.f ?? planTot?.f };
  const burned = workouts.reduce((a, w) => a + (w.metrics?.kcal ?? 0), 0);
  const ml = water.reduce((a, w) => a + w.ml, 0);
  const lastWater = [...water].sort((a, b) => b.createdAt - a.createdAt)[0];
  const times = { ...DEFAULT_MEAL_TIMES, ...(settings.mealTimes ?? {}) };
  const fname = (id: string) => foods.find((f) => f.id === id)?.name ?? '?';
  const pct = (v: number, m?: number) => (m ? Math.min(100, (v / m) * 100) : 0);

  return (
    <div className="screen" data-testid="food-tab">
      <TopBar />
      <div className="row between" style={{ margin: '8px 0 10px' }}>
        <h1 className="section-title" style={{ fontSize: 32, fontWeight: 500, margin: 0 }}>Alimentação</h1>
      </div>
      <div className="row between" style={{ margin: '0 -8px 6px' }}>
        <button className="icon-btn" aria-label="Dia anterior" onClick={() => setDate(addDays(date, -1))}><ChevronLeft size={20} /></button>
        <span style={{ fontWeight: 700 }}>{date === todayKey() ? `Hoje, ${shortLabel(date)}` : shortLabel(date)}</span>
        <button className="icon-btn" aria-label="Próximo dia" onClick={() => setDate(addDays(date, 1))}><ChevronRight size={20} /></button>
      </div>

      {showN && (
        <section className="block b-honey" data-testid="food-summary">
          <div className="kcal-eq">
            <div><span className="kv num">{goal.kcal ? fmt(goal.kcal) : '–'}</span><span className="kl">{settings.targets?.kcal ? 'meta' : 'plano'}</span></div>
            <span className="op">−</span>
            <div><span className="kv num">{fmt(eaten.n.kcal)}</span><span className="kl">consumido</span></div>
            <span className="op">=</span>
            <div><span className="kv num">{goal.kcal ? fmt(goal.kcal - eaten.n.kcal) : '–'}</span><span className="kl">restante</span></div>
          </div>
          <div className="macro-bar" style={{ height: 10 }}><i style={{ width: `${pct(eaten.n.kcal, goal.kcal)}%` }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
            {([['Proteína', eaten.n.p, goal.p], ['Carboidrato', eaten.n.c, goal.c], ['Gordura', eaten.n.f, goal.f]] as [string, number, number | undefined][]).map(([l, v, m]) => (
              <div key={l} className="small"><div style={{ fontWeight: 700 }}>{l}</div><div className="num">{fmt(v)}{m ? ` de ${fmt(m)}` : ''} g</div>
                {m ? <div className="macro-bar"><i style={{ width: `${pct(v, m)}%` }} /></div> : null}</div>
            ))}
          </div>
          {burned > 0 && <p className="small" style={{ margin: '10px 0 0' }}>Gasto nos treinos de hoje: {fmt(burned)} kcal (do arquivo do relógio). O plano da nutricionista já considera sua rotina, por isso não somo isso à meta.</p>}
          {eaten.missing > 0 && <p className="tiny" style={{ margin: '6px 0 0' }}>{eaten.missing} {eaten.missing === 1 ? 'item sem dados nutricionais' : 'itens sem dados nutricionais'}, fora da conta.</p>}
        </section>
      )}

      {settings.mealTypes.map((mt) => {
        const meal = meals.find((m) => m.mealType === mt.id && m.items.length);
        const tpl = planned[mt.id] ? tmpls.find((t) => t.id === planned[mt.id]) : undefined;
        const skipped = skips.some((s) => s.domain === 'food' && s.ref === mt.id);
        const mtot = meal ? totals(meal.items, foods).n : undefined;
        const ttot = tpl ? totals(tpl.items, foods).n : undefined;
        return (
          <section key={mt.id} className="meal-sec" data-testid={`meal-sec-${mt.id}`}>
            <div className="row between">
              <h2 className="section-title" style={{ fontSize: 20 }}>{mt.label} <span className="small muted" style={{ fontFamily: 'var(--f-ui)', fontWeight: 600 }}>{times[mt.id] ?? ''}</span></h2>
              {showN && <span className="num" style={{ fontWeight: 700 }}>{mtot ? `${fmt(mtot.kcal)} kcal` : ''}</span>}
            </div>
            {meal ? meal.items.map((i, k) => {
              const n = itemNutr(foods.find((f) => f.id === i.foodId), i);
              return (
                <div key={k} className="food-line">
                  <span className="grow"><span style={{ fontWeight: 650 }}>{fname(i.foodId)}</span> <span className="small muted">{i.portion}</span></span>
                  {showN && <span className="small num">{n ? `${fmt(n.kcal)} kcal` : 'sem dados'}</span>}
                </div>
              );
            }) : tpl && !skipped ? (
              <div className="food-plan">
                <div className="small" style={{ fontWeight: 700, marginBottom: 2 }}>Do seu plano{ttot && showN ? `, ${fmt(ttot.kcal)} kcal` : ''}</div>
                <div className="small">{tpl.items.map((i) => `${fname(i.foodId)} ${i.portion}`).join(', ')}</div>
                <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                  <button className="pill-act pa-honey" onClick={() => mealFromTemplate(tpl, date, mt.id, true)} data-testid={`eat-plan-${mt.id}`}>Comi isso</button>
                  <button className="pill-act pa-ghost" onClick={() => nav(`/alimentacao/refeicao?m=${mt.id}`)}>Comi outra coisa</button>
                  <button className="pill-act pa-ghost" onClick={() => skipPlanned(date, 'food', mt.id, 'Refeição marcada como não hoje')}>Pulei</button>
                </div>
              </div>
            ) : skipped ? <div className="small muted" style={{ padding: '6px 0' }}>Não hoje.</div> : null}
            <button className="add-line" onClick={() => nav(`/alimentacao/refeicao?m=${mt.id}`)} data-testid={`add-${mt.id}`}><Plus size={16} />{meal ? 'Editar ou adicionar' : 'Adicionar alimento'}</button>
          </section>
        );
      })}

      <section className="block b-paper" style={{ marginTop: 16 }}>
        <div className="bh"><h2 style={{ fontSize: 20 }}>Água</h2><span className="big-num num">{ml >= 1000 ? (ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L' : ml + ' mL'}{settings.waterGoalMl ? <span className="small" style={{ fontFamily: 'var(--f-ui)' }}> de {settings.waterGoalMl / 1000} L</span> : null}</span></div>
        {settings.waterGoalMl ? <div className="macro-bar" style={{ background: 'var(--paper-2)' }}><i style={{ width: `${pct(ml, settings.waterGoalMl)}%`, background: 'var(--blue-ink)' }} /></div> : null}
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          {settings.waterPresets.map((v) => <button key={v} className="pill-act pa-blue" onClick={() => addWater(date, v)}>+{v} mL</button>)}
          {lastWater && <button className="pill-act pa-ghost" onClick={async () => { await remove(lastWater.id); toast(`−${lastWater.ml} mL`); }}><Undo2 size={15} />Desfazer</button>}
        </div>
      </section>
      <div className="row wrap" style={{ gap: 16, marginTop: 8 }}>
        <a className="link" href="#/plano/food">Plano de alimentação</a>
        <a className="link" href="#/biblioteca/alimentos">Meus alimentos</a>
        <a className="link" href="#/biblioteca/refeicoes">Refeições favoritas</a>
      </div>
    </div>
  );
}
