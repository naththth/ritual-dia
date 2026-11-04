import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, Undo2, Repeat2, Droplets, Pencil } from 'lucide-react';
import { AreaNav } from './areas';
import { TopBar } from './common';
import { useAll, useByDate, useByRange, useSettings } from '../db/hooks';
import { useApp, toast } from '../state/store';
import { planFor, plannedFood } from '../domain/rules';
import { addDays, shortLabel, todayKey } from '../lib/dates';
import { addWater, mealFromTemplate, saveMeal, skipPlanned } from '../domain/actions';
import { lastMealOf, nextMealType } from '../domain/repeat';
import { FuelNext, useFuel } from './fuel-ui';
import { fmt, itemNutr, portionText, totals } from '../domain/nutrition';
import { MACRO_COLORS, MacroBar, MacroLine } from './food-ui';
import { remove } from '../db/db';
import { DEFAULT_MEAL_TIMES } from './today';
import { SpecialistButton } from './specchat';
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
  const extras = useByDate('extra', date);
  const recent = useByRange('meal', addDays(date, -21), addDays(date, -1));
  const fuel = useFuel(date);
  const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  useEffect(() => { const t = setInterval(() => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()); }, 60_000); return () => clearInterval(t); }, []);
  if (!settings || !meals || !foods || !tmpls || !plans || !water || !workouts || !skips) return <div className="screen"><TopBar /></div>;
  const showN = settings.showNutrition !== false;
  const planned = plannedFood(planFor(plans, 'food', date), date, extras);
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
  const nextId = date === todayKey() ? nextMealType(settings.mealTypes, times, new Set([...meals.filter((m) => m.items.length).map((m) => m.mealType), ...skips.filter((x) => x.domain === 'food').map((x) => x.ref)]), nowMin) : undefined;

  return (
    <div className="screen" data-testid="food-tab">
      <TopBar />
      <div className="row between" style={{ margin: '8px 0 10px' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Alimentação</h1>
        <SpecialistButton domain="food" />
      </div>
      <AreaNav area="alimentacao" />
      <div style={{ height: 10 }} />
      <div className="row between" style={{ margin: '0 -8px 6px' }}>
        <button className="icon-btn" aria-label="Dia anterior" onClick={() => setDate(addDays(date, -1))}><ChevronLeft size={20} /></button>
        <span style={{ fontWeight: 700 }}>{date === todayKey() ? `Hoje, ${shortLabel(date)}` : shortLabel(date)}</span>
        <button className="icon-btn" aria-label="Próximo dia" onClick={() => setDate(addDays(date, 1))}><ChevronRight size={20} /></button>
      </div>

      {showN && (
        <section className="block b-honey" data-testid="food-summary">
          {goal.kcal ? (
          <div className="kcal-eq">
              <div><span className="kv num">{goal.kcal ? fmt(goal.kcal) : '–'}</span><span className="kl">{settings.targets?.kcal ? 'meta' : 'plano'}</span></div>
              <span className="op">−</span>
              <div><span className="kv num">{fmt(eaten.n.kcal)}</span><span className="kl">consumido</span></div>
              <span className="op">=</span>
              <div><span className="kv num">{goal.kcal ? fmt(goal.kcal - eaten.n.kcal) : '–'}</span><span className="kl">restante</span></div>
            </div>
          ) : (
            <div className="kcal-solo">
              <span><span className="kv num">{fmt(eaten.n.kcal)}</span> <span className="kl">kcal hoje</span></span>
              <button className="link small" onClick={() => nav('/ajustes')}>Definir meta</button>
            </div>
          )}
          {goal.kcal ? <div className="macro-bar" style={{ height: 10 }}><i style={{ width: `${pct(eaten.n.kcal, goal.kcal)}%` }} /></div> : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
            {([['Proteína', eaten.n.p, goal.p], ['Carboidrato', eaten.n.c, goal.c], ['Gordura', eaten.n.f, goal.f]] as [string, number, number | undefined][]).map(([l, v, m]) => (
              <div key={l} className="small" style={{ minWidth: 0 }}><div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}><i className="fs-dot" style={{ background: l === 'Proteína' ? MACRO_COLORS.p : l === 'Carboidrato' ? MACRO_COLORS.c : MACRO_COLORS.f, flex: '0 0 auto' }} />{l === 'Carboidrato' ? 'Carbo' : l}</div><div className="num">{fmt(v)}{m ? ` de ${fmt(m)}` : ''} g</div>
                {m ? <div className="macro-bar"><i style={{ width: `${pct(v, m)}%` }} /></div> : null}</div>
            ))}
          </div>
          {burned > 0 && <p className="tiny" style={{ margin: '10px 0 0', opacity: .85 }}>Treinos de hoje: {fmt(burned)} kcal. Não entram na meta; o plano já considera sua rotina.</p>}
          {eaten.missing > 0 && <p className="tiny" style={{ margin: '6px 0 0' }}>{eaten.missing} {eaten.missing === 1 ? 'item sem dados nutricionais' : 'itens sem dados nutricionais'}, fora da conta.</p>}
        </section>
      )}

      <section className="water-card" data-testid="food-water">
        <div className="row between" style={{ alignItems: 'center' }}>
          <span className="row" style={{ gap: 8 }}><Droplets size={18} /><b>Água</b></span>
          <span className="num" style={{ fontWeight: 750 }}>{ml >= 1000 ? (ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L' : ml + ' mL'}{settings.waterGoalMl ? <span className="small muted"> de {(settings.waterGoalMl / 1000).toLocaleString('pt-BR')} L</span> : null}</span>
        </div>
        {settings.waterGoalMl ? <div className="wbar"><i style={{ width: `${pct(ml, settings.waterGoalMl)}%` }} /></div> : null}
        <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
          {settings.waterPresets.map((v) => <button key={v} className="pill-act pa-blue" onClick={() => addWater(date, v)}>+{v} mL</button>)}
          {lastWater && <button className="pill-act pa-ghost" aria-label="Desfazer última água" onClick={async () => { await remove(lastWater.id); toast(`−${lastWater.ml} mL`); }}><Undo2 size={15} /></button>}
        </div>
      </section>

      <h2 className="sec-h">Refeições</h2>
      {settings.mealTypes.map((mt) => {
        const meal = meals.find((m) => m.mealType === mt.id && m.items.length);
        const tpl = planned[mt.id] ? tmpls.find((t) => t.id === planned[mt.id]) : undefined;
        const skipped = skips.some((s) => s.domain === 'food' && s.ref === mt.id);
        const mtot = meal ? totals(meal.items, foods).n : undefined;
        const ttot = tpl ? totals(tpl.items, foods).n : undefined;
        const last = !meal && !skipped && recent ? lastMealOf(recent, mt.id, date) : undefined;
        const ltot = last ? totals(last.items, foods).n : undefined;
        const isNext = mt.id === nextId;
        return (
          <section key={mt.id} className={`meal-card ${meal ? 'logged' : ''} ${isNext ? 'next' : ''} ${skipped ? 'skipped' : ''}`} data-testid={`meal-sec-${mt.id}`}>
            <div className="mc-head">
              <div className="grow">
                {isNext && <span className="mc-kicker">Próxima refeição</span>}
                <h3>{mt.label} <span className="mc-time num">{times[mt.id] ?? ''}</span></h3>
              </div>
              {meal ? (showN && mtot ? <span className="mc-kcal num">{fmt(mtot.kcal)} kcal</span> : <span className="mc-chip">Registrada</span>)
                : skipped ? <span className="mc-chip">Não hoje</span> : null}
            </div>
            {showN && mtot && <div className="meal-macros" data-testid={`meal-macros-${mt.id}`}><MacroLine n={mtot} /><MacroBar n={mtot} /></div>}
            {meal && meal.items.map((i, k) => {
              const n = itemNutr(foods.find((f) => f.id === i.foodId), i);
              return (
                <button key={k} className="food-line tap" onClick={() => nav(`/alimentacao/refeicao?m=${mt.id}&edit=${encodeURIComponent(i.foodId)}`)} aria-label={`Ajustar ${fname(i.foodId)}`}>
                  <span className="grow" style={{ textAlign: 'left' }}><span style={{ fontWeight: 650 }}>{fname(i.foodId)}</span> <span className="small muted">{portionText(foods.find((f) => f.id === i.foodId), i)}</span>
                    {showN && n && <><br /><span className="tiny muted num">P {fmt(n.p)} · C {fmt(n.c)} · G {fmt(n.f)} g</span></>}</span>
                  {showN && <span className="small num">{n ? `${fmt(n.kcal)} kcal` : 'sem dados'}</span>}
                </button>
              );
            })}
            {isNext && !meal && fuel && showN && <FuelNext fuel={fuel} mealType={mt.id} label={mt.label} date={date} />}
            {!meal && !skipped && last && (
              <button className="repeat-row" onClick={() => saveMeal(date, mt.id, last.items)} data-testid={`repeat-${mt.id}`}>
                <span className="rr-ic"><Repeat2 size={18} /></span>
                <span className="grow"><b>Repetir de {shortLabel(last.date)}</b><span className="rr-s">{last.items.map((i) => fname(i.foodId)).join(', ')}{showN && ltot ? ` · ${fmt(ltot.kcal)} kcal` : ''}</span></span>
              </button>
            )}
            {!meal && tpl && !skipped && (
              <div className="food-plan">
                <div className="small" style={{ fontWeight: 700, marginBottom: 2 }}>Do seu plano{ttot && showN ? `, ${fmt(ttot.kcal)} kcal` : ''}</div>
                <div className="small">{tpl.items.map((i) => `${fname(i.foodId)} ${i.portion}`).join(', ')}</div>
                <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                  <button className="pill-act pa-honey" onClick={() => mealFromTemplate(tpl, date, mt.id, true)} data-testid={`eat-plan-${mt.id}`}>Comi isso</button>
                </div>
              </div>
            )}
            <div className="mc-acts">
              <button className="add-line" onClick={() => nav(`/alimentacao/refeicao?m=${mt.id}`)} data-testid={`add-${mt.id}`}>{meal ? <><Pencil size={15} />Editar ou adicionar</> : <><Plus size={16} />Adicionar alimento</>}</button>
              {!meal && !skipped && (tpl || isNext) && <button className="mc-skip" onClick={() => skipPlanned(date, 'food', mt.id, 'Refeição marcada como não hoje')}>Pulei</button>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
