import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Plus, ChevronRight, ChevronDown, Undo2, Repeat2, Droplets, Pencil } from 'lucide-react';
import { AreaNav } from './areas';
import { TopBar , DayStrip } from './common';
import { useAll, useByDate, useByRange, useSettings } from '../db/hooks';
import { useApp, toast } from '../state/store';
import { planFor, plannedFood } from '../domain/rules';
import { addDays, shortLabel, todayKey } from '../lib/dates';
import { addWater, mealFromTemplate, saveMeal, skipPlanned } from '../domain/actions';
import { lastMealOf, nextMealType } from '../domain/repeat';
import { FuelNext, useFuel } from './fuel-ui';
import { fmt, itemNutr, portionText, shortFoodName, totals } from '../domain/nutrition';
import { FoodStack, FoodThumb, MACRO_COLORS, MacroLine } from './food-ui';
import { WaterGlass } from '../ui/art';
import { fillFoodImages } from '../domain/foodImage';
import { remove } from '../db/db';
import { DEFAULT_MEAL_TIMES } from './today';
import { SpecialistButton } from './specchat';
import type { MealItem, Nutr } from '../db/types';

/** Anel do dia: quanto da meta já foi, com a fatia de cada macro na ordem proteína, carbo, gordura; no centro, o que falta. */
function DayRing({ eaten, goal, size = 128, stroke = 12 }: { eaten: Nutr; goal: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const parts = [['p', eaten.p * 4], ['c', eaten.c * 4], ['f', eaten.f * 9]] as const;
  const sum = parts.reduce((a, [, v]) => a + v, 0);
  // A fatia de cada macro é proporcional às calorias dele; o anel inteiro é a meta.
  const scaleK = sum > 0 ? Math.min(C, (eaten.kcal / goal) * C) / sum : 0;
  const left = goal - eaten.kcal;
  let off = 0;
  return (
    <div className="day-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round((eaten.kcal / goal) * 100)}% da meta de calorias`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--paper-2)" strokeWidth={stroke} />
        {parts.map(([k, v]) => {
          const len = v * scaleK;
          const el = len > 1 ? <circle key={k} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={MACRO_COLORS[k]} strokeWidth={stroke}
            strokeDasharray={`${Math.max(0.5, len - 2)} ${C}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="dr-seg" /> : null;
          off += len;
          return el;
        })}
      </svg>
      <div className="dr-mid">
        <b className="num">{fmt(Math.abs(left))}</b>
        <span>{left >= 0 ? 'kcal restantes' : 'kcal acima'}</span>
      </div>
    </div>
  );
}

export function FoodTab() {
  const { date } = useApp();
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
  // Refeições abertas à mão; a próxima já vem aberta, as outras ficam resumidas.
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  // Alimentos sem foto ganham uma de referência em segundo plano.
  useEffect(() => { if (foods) void fillFoodImages(foods); }, [foods?.length]);
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
        <h1 className="page-title page-big" style={{ margin: 0 }}>Dieta</h1>
        <SpecialistButton domain="food" />
      </div>
      <AreaNav area="alimentacao" />
      <div style={{ height: 10 }} />
      <DayStrip />

      {showN && (
        <section className="food-hero" data-testid="food-summary">
          {goal.kcal ? (
            <div className="fh-top">
              <DayRing eaten={eaten.n} goal={goal.kcal} />
              <div className="fh-num">
                <span className="fh-k">Consumido</span>
                <span className="fh-big num">{fmt(eaten.n.kcal)}</span>
                <span className="fh-of">de {fmt(goal.kcal)} kcal{settings.targets?.kcal ? '' : ' do plano'}</span>
              </div>
            </div>
          ) : (
            <div className="kcal-solo">
              <span><span className="kv num">{fmt(eaten.n.kcal)}</span> <span className="kl">kcal hoje</span></span>
              <button className="link small" onClick={() => nav('/ajustes')}>Definir meta</button>
            </div>
          )}
          <div className="fh-macros">
            {([['p', 'Proteína', eaten.n.p, goal.p], ['c', 'Carbo', eaten.n.c, goal.c], ['f', 'Gordura', eaten.n.f, goal.f]] as const).map(([k, l, v, m]) => (
              <div key={k} className="fh-m">
                <span className="fh-ml"><i style={{ background: MACRO_COLORS[k] }} />{l}</span>
                <span className="fh-mv num"><b>{fmt(v)}</b>{m ? ` / ${fmt(m)}` : ''} g</span>
                <span className="fh-bar">{m ? <i style={{ width: `${pct(v, m)}%`, background: MACRO_COLORS[k] }} /> : null}</span>
              </div>
            ))}
          </div>
          {burned > 0 && <p className="tiny fh-note">Treinos de hoje: {fmt(burned)} kcal. Não entram na meta; o plano já considera sua rotina.</p>}
          {eaten.missing > 0 && <p className="tiny fh-note">{eaten.missing} {eaten.missing === 1 ? 'item sem dados nutricionais' : 'itens sem dados nutricionais'}, fora da conta.</p>}
          <button className="fh-link" onClick={() => nav('/indicadores')}><span>Ver a semana em Indicadores</span><ChevronRight size={18} /></button>
        </section>
      )}

      <section className="water-card wc2" data-testid="food-water">
        <span className="wc-glass"><WaterGlass level={ml / (settings.waterGoalMl ?? 2500)} /></span>
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
        const open = opened[mt.id] ?? isNext;
        const toggle = () => setOpened((o) => ({ ...o, [mt.id]: !open }));
        const mealFoods = meal ? meal.items.map((i) => foods.find((f) => f.id === i.foodId)) : [];
        const names = [...new Set(mealFoods.map((f) => (f ? shortFoodName(f.name) : '?')))].join(', ');
        const sub = meal ? names
          : skipped ? 'Não hoje'
          : tpl ? `Do plano: ${tpl.items.map((i) => shortFoodName(fname(i.foodId))).join(', ')}${ttot && showN ? ` · ${fmt(ttot.kcal)} kcal` : ''}`
          : 'Ainda não registrada';
        return (
          <section key={mt.id} className={`meal-card ${meal ? 'logged' : ''} ${isNext ? 'next' : ''} ${skipped ? 'skipped' : ''} ${open ? 'open' : ''}`} data-testid={`meal-sec-${mt.id}`}>
            <div className="mc-head">
              <button className="mc-toggle" onClick={toggle} aria-expanded={open} data-testid={`meal-toggle-${mt.id}`}>
                <span className="mc-txt">
                  {isNext && <span className="mc-kicker">Próxima refeição</span>}
                  <span className="mc-title"><b>{mt.label}</b> <span className="mc-time num">{times[mt.id] ?? ''}</span></span>
                  {!(open && !meal) && <span className="mc-sub">{sub}</span>}
                </span>
                {meal && !open && <FoodStack foods={mealFoods} />}
                {!meal && isNext && tpl && <span className="mc-next-photos"><FoodStack foods={tpl.items.map((i) => foods.find((f) => f.id === i.foodId))} /></span>}
                <ChevronDown size={18} className="mc-chev" aria-hidden />
              </button>
              {!meal && !open && !skipped && <button className="mc-add" aria-label={`Registrar ${mt.label.toLowerCase()}`} onClick={() => nav(`/alimentacao/refeicao?m=${mt.id}`)} data-testid={`add-${mt.id}`}><Plus size={20} /></button>}
            </div>
            {showN && mtot && (
              <div className="meal-macros" data-testid={`meal-macros-${mt.id}`}>
                <b className="num mc-kcal">{fmt(mtot.kcal)} kcal</b><MacroLine n={mtot} className="tiny" />
              </div>
            )}
            {open && (
              <div className="mc-body">
                {meal && meal.items.map((i, k) => {
                  const f = foods.find((x) => x.id === i.foodId);
                  const n = itemNutr(f, i);
                  return (
                    <button key={k} className="food-line tap" onClick={() => nav(`/alimentacao/refeicao?m=${mt.id}&edit=${encodeURIComponent(i.foodId)}`)} aria-label={`Ajustar ${fname(i.foodId)}`}>
                      <FoodThumb food={f} size={48} />
                      <span className="fl-txt">
                        <span className="fl-name">{f ? shortFoodName(f.name) : '?'}</span>
                        <span className="fl-sub">{portionText(f, i)}{showN && n ? ` · P ${fmt(n.p)} · C ${fmt(n.c)} · G ${fmt(n.f)}` : ''}</span>
                      </span>
                      {showN && <span className="fl-kcal num">{n ? `${fmt(n.kcal)} kcal` : 'sem dados'}</span>}
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
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
