// O dia como linha do tempo: "Agora" no topo e o resto em ordem de horário.
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check as CheckIcon, Droplets, Dumbbell, Flame, Moon, NotebookPen, Sunrise, Utensils } from 'lucide-react';
import { useAll, useByDate, useSettings } from '../db/hooks';
import { planFor, plannedFood, plannedSkin, plannedTraining } from '../domain/rules';
import { nightAdjust } from '../domain/skinAdapt';
import { mealFromTemplate, saveSkin, workoutFromTemplate, addWater } from '../domain/actions';
import { fmt, totals } from '../domain/nutrition';
import { watts } from '../domain/ai';
import { addDays, todayKey, type DateKey } from '../lib/dates';
import { sleepPlan, wakeFor, bedFor, hoursLabel } from '../domain/sleep';
import type { MealItem } from '../db/types';
import { WaterSheet } from './WaterSheet';

export const DEFAULT_MEAL_TIMES: Record<string, string> = { cafe: '07:30', almoco: '12:30', lanche: '16:00', jantar: '20:00', ceia: '22:00' };
export const DEFAULT_SKIN_TIMES = { am: '07:00', pm: '21:30' };

type Mod = 'skin' | 'food' | 'training' | 'journal' | 'sleep';
export interface TLItem {
  key: string;
  time?: string;
  mod: Mod;
  icon: ReactNode;
  title: string;
  detail?: string;
  done: boolean;
  skipped?: boolean;
  /** Marco do dia (acordar): aparece na linha do tempo, mas não vira o cartão "Agora". */
  marker?: boolean;
  action?: { label: string; run: () => Promise<unknown> | void; testId?: string };
  open: string;
}

const MOD_STYLE: Record<Mod, { bg: string; ink: string; pill: string }> = {
  skin: { bg: 'var(--rose)', ink: 'var(--rose-ink)', pill: 'pa-rose' },
  food: { bg: 'var(--honey)', ink: 'var(--honey-ink)', pill: 'pa-honey' },
  training: { bg: 'var(--blue)', ink: 'var(--blue-ink)', pill: 'pa-blue' },
  journal: { bg: 'var(--wine)', ink: 'var(--wine-ink)', pill: 'pa-wine' },
  sleep: { bg: 'var(--paper-2)', ink: 'var(--ink)', pill: 'pa-ghost' }
};

function useNowMinutes() {
  const [n, setN] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  useEffect(() => { const t = setInterval(() => { const d = new Date(); setN(d.getHours() * 60 + d.getMinutes()); }, 60_000); return () => clearInterval(t); }, []);
  return n;
}
const toMin = (t?: string) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : undefined);

export function useTimeline(date: DateKey): TLItem[] | undefined {
  const settings = useSettings();
  const plans = useAll('plan');
  const products = useAll('product');
  const wt = useAll('wtemplate');
  const mt = useAll('mtemplate');
  const foods = useAll('food');
  const mods = useAll('modality');
  const skin = useByDate('skin', date);
  const meals = useByDate('meal', date);
  const workouts = useByDate('workout', date);
  const skips = useByDate('skip', date);
  const extras = useByDate('extra', date);
  const journal = useByDate('journal', date);
  if (!journal || !settings || !plans || !products || !wt || !mt || !foods || !mods || !skin || !meals || !workouts || !skips || !extras) return undefined;
  const items: TLItem[] = [];
  const sTimes = settings.skinTimes ?? DEFAULT_SKIN_TIMES;
  const mTimes = { ...DEFAULT_MEAL_TIMES, ...(settings.mealTimes ?? {}) };
  const skinPlan = planFor(plans, 'skin', date);
  const pname = (id: string) => products.find((p) => p.id === id)?.name ?? '';
  const short = (ids: string[]) => (ids.length <= 3 ? ids.map(pname).join(', ') : `${ids.slice(0, 2).map(pname).join(', ')} e mais ${ids.length - 2}`);

  for (const period of ['am', 'pm'] as const) {
    const log = skin.find((s) => s.period === period);
    let planned = plannedSkin(skinPlan, date, period, products);
    let adjustNote = '';
    if (period === 'pm' && !log) {
      const skipped = new Set(skips.filter((x) => x.domain === 'training').map((x) => x.ref));
      const adj = nightAdjust({
        plannedPm: planned, recoveryPm: skinPlan?.skin?.recovery?.pm ?? [], products, amLog: skin.find((x) => x.period === 'am'), workouts,
        plannedWorkouts: plannedTraining(planFor(plans, 'training', date), date, extras).map((id) => wt.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t && !skipped.has(t.id))
      });
      let choice: string | null = null; try { choice = localStorage.getItem(`night-adjust:${date}`); } catch { /* */ }
      if (adj?.kind === 'swap' && choice !== 'kept') {
        if (choice === 'applied') { planned = adj.useRecovery ? plannedSkin(skinPlan, date, 'pm', products, true) : planned.filter((id) => !adj.remove.includes(id)); adjustNote = 'Sem ativo hoje: '; }
        else adjustNote = 'Ajuste sugerido para hoje · ';
      }
    }
    items.push({
      key: `skin-${period}`, time: sTimes[period], mod: 'skin', icon: period === 'am' ? <Sunrise size={18} /> : <Moon size={18} />,
      title: period === 'am' ? 'Rotina da manhã' : 'Rotina da noite',
      detail: log ? (log.skipped ? 'Pulado' : (log.productIds.length === 1 ? '1 produto usado' : `${log.productIds.length} produtos usados`)) : planned.length ? adjustNote + short(planned) : 'Sem plano para hoje',
      done: !!log,
      action: !log && planned.length && !adjustNote.startsWith('Ajuste') ? { label: 'Usei tudo', run: () => saveSkin(date, period, { productIds: planned, plannedIds: planned }), testId: `act-skin-${period}` } : undefined,
      open: `/pele?p=${period}`
    });
  }

  const plannedMeals = plannedFood(planFor(plans, 'food', date), date);
  for (const m of settings.mealTypes) {
    const meal = meals.find((x) => x.mealType === m.id && x.items.length);
    const tpl = plannedMeals[m.id] ? mt.find((t) => t.id === plannedMeals[m.id]) : undefined;
    const skipped = skips.some((s) => s.domain === 'food' && s.ref === m.id);
    if (!meal && !tpl && !['cafe', 'almoco', 'jantar'].includes(m.id)) continue;
    const kc = (its: MealItem[]) => { const t = totals(its, foods); return t.n.kcal > 0 ? `, ${fmt(t.n.kcal)} kcal` : ''; };
    const names = (its: MealItem[]) => its.map((i) => `${foods.find((f) => f.id === i.foodId)?.name ?? '?'} ${i.portion}`).join(', ');
    items.push({
      key: `meal-${m.id}`, time: mTimes[m.id], mod: 'food', icon: <Utensils size={18} />, title: m.label,
      detail: meal ? names(meal.items) + kc(meal.items) : tpl && !skipped ? names(tpl.items) + kc(tpl.items) : skipped ? 'Não hoje' : 'Não registrado',
      done: !!meal, skipped,
      action: !meal && tpl && !skipped ? { label: 'Comi isso', run: () => mealFromTemplate(tpl, date, m.id, true), testId: `act-meal-${m.id}` } : !meal ? { label: 'Registrar', run: () => undefined } : undefined,
      open: `/alimentacao/refeicao?m=${m.id}`
    });
  }

  const plannedT = plannedTraining(planFor(plans, 'training', date), date, extras).map((id) => wt.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t);
  const usedWorkouts = new Set<string>();
  for (const t of plannedT) {
    const w = workouts.find((x) => x.templateId === t.id) ?? workouts.find((x) => !usedWorkouts.has(x.id) && x.modalityId === t.modalityId);
    if (w) usedWorkouts.add(w.id);
    const skipped = skips.some((s) => s.domain === 'training' && s.ref === t.id);
    const main = t.steps?.length ? [...t.steps].sort((a, b) => b.minutes - a.minutes)[0] : undefined;
    const w2 = main ? watts(main.pct, settings.ftp) : undefined;
    items.push({
      key: `tr-${t.id}`, time: t.time, mod: 'training', icon: <Dumbbell size={18} />, title: t.name,
      detail: w ? workoutLine(w, mods) : skipped ? 'Não hoje' : `${t.duration} min${main ? `, bloco principal ${main.minutes} min a ${w2 ? w2 + ' W' : main.pct + '% FTP'}` : ''}`,
      done: !!w, skipped,
      action: !w && !skipped ? { label: 'Feito', run: () => workoutFromTemplate(t, date, true), testId: 'tl-train-done' } : undefined,
      open: '/treino'
    });
  }
  for (const w of workouts) {
    if (usedWorkouts.has(w.id)) continue;
    const time = w.startTime ? new Date(w.startTime).toTimeString().slice(0, 5) : undefined;
    items.push({ key: `w-${w.id}`, time, mod: 'training', icon: <Dumbbell size={18} />, title: mods.find((m) => m.id === w.modalityId)?.name ?? 'Treino', detail: workoutLine(w, mods), done: true, open: '/treino' });
  }

  const evening = (settings.reminders?.evening ?? '21:45') || '21:45';
  const j = journal[0];
  items.push({ key: 'journal', time: evening, mod: 'journal', icon: <NotebookPen size={18} />, title: 'Fechar o dia', detail: j ? [j.energy && `energia ${j.energy}`, j.mood && `humor ${j.mood}`, j.tags.join(', ')].filter(Boolean).join(', ') || 'Registrado' : 'Energia, humor e uma linha sobre hoje', done: !!j, open: '/diario' });

  const sp = sleepPlan(settings.reminders);
  if (sp) {
    const wake = wakeFor(sp, date);
    const bed = bedFor(sp, date);
    items.push({ key: 'wake', time: wake, mod: 'sleep', icon: <Sunrise size={18} />, title: 'Acordar', detail: `Meta de ${hoursLabel(sp.hours)} de sono`, done: false, marker: true, open: '/ajustes' });
    items.push({ key: 'bed', time: bed, mod: 'sleep', icon: <Moon size={18} />, title: 'Deitar', detail: `Luz apagada para dormir ${hoursLabel(sp.hours)} e acordar às ${wakeFor(sp, addDays(date, 1))}`, done: false, open: '/ajustes' });
  }

  // Dentro do mesmo horário, o marco de acordar vem antes; o de deitar, depois.
  const order = (i: TLItem) => (toMin(i.time) ?? 24 * 60 + 1) + (i.key === 'wake' ? -0.5 : i.key === 'bed' ? 0.5 : 0);
  return items.sort((a, b) => order(a) - order(b));
}

function workoutLine(w: any, _mods: any[]) {
  const m = w.metrics;
  const parts = [w.duration && `${w.duration} min`, m?.distanceKm && `${m.distanceKm} km`, m?.np ? `${m.np} W NP` : m?.avgPower && `${m.avgPower} W`, m?.avgHr && `FC ${m.avgHr}`, m?.kcal && `${m.kcal} kcal`].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Feito';
}

export function NowAndTimeline({ date }: { date: DateKey }) {
  const items = useTimeline(date);
  const nav = useNavigate();
  const now = useNowMinutes();
  if (!items) return null;
  const isToday = date === todayKey();
  const pending = items.filter((i) => !i.done && !i.skipped && !i.marker);
  const next = isToday
    ? pending.find((i) => (toMin(i.time) ?? 9999) >= now - 60) ?? pending.find((i) => !i.time) ?? pending[0]
    : undefined;
  const runAction = async (i: TLItem) => {
    if (i.action?.label === 'Registrar') { nav(i.open); return; }
    await i.action?.run();
  };
  return (
    <>
      {next && (
        <section className="now-card" style={{ background: MOD_STYLE[next.mod].bg, color: MOD_STYLE[next.mod].ink }} data-testid="now-card" aria-label="Agora">
          <div className="row between">
            <span className="now-kicker">{next.time ? (toMin(next.time)! <= now ? `Agora, ${next.time}` : `Próximo, ${next.time}`) : 'Quando der'}</span>
            <span aria-hidden>{next.icon}</span>
          </div>
          <h2 className="now-title">{next.title}</h2>
          {next.detail && <p className="now-detail">{next.detail}</p>}
          <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
            {next.action && <button className={`pill-act ${MOD_STYLE[next.mod].pill}`} style={{ minHeight: 44, padding: '0 18px' }} onClick={() => runAction(next)}>{next.action.label}</button>}
            <button className="pill-act pa-ghost" style={{ minHeight: 44 }} onClick={() => nav(next.open)}>Abrir</button>
          </div>
        </section>
      )}
      <section aria-label="Linha do tempo" data-testid="timeline" style={{ marginTop: 16 }}>
        <h2 className="section-title" style={{ marginBottom: 6 }}>{isToday ? 'Seu dia' : 'O dia'}</h2>
        {items.map((i) => (
          <div key={i.key} className={`tl2 ${i.done ? 'done' : ''} ${i.skipped ? 'skipped' : ''}`} data-testid={`tl-${i.key}`}>
            <span className="tl2-time num">{i.time ?? ''}</span>
            <span className="tl2-dot" style={i.mod === 'journal' ? { background: 'var(--wine)', color: 'var(--wine-ink)' } : { background: i.done ? MOD_STYLE[i.mod].ink : MOD_STYLE[i.mod].bg, color: i.done ? 'var(--paper)' : MOD_STYLE[i.mod].ink }}>
              {i.done ? <CheckIcon size={14} strokeWidth={3} /> : i.icon}
            </span>
            <button className="tl2-body tap" onClick={() => nav(i.open)}>
              <span className="tl2-title">{i.title}</span>
              {i.detail && <span className="tl2-detail">{i.detail}</span>}
            </button>
            {i.action && !i.done && (
              <button className={`pill-act ${MOD_STYLE[i.mod].pill}`} onClick={() => runAction(i)} data-testid={i.action.testId}>{i.action.label}</button>
            )}
          </div>
        ))}
      </section>
    </>
  );
}

/** Números do dia no topo: comida, água e treino, cada um leva à sua aba. */
export function TodayStats({ date }: { date: DateKey }) {
  const nav = useNavigate();
  const settings = useSettings();
  const [waterOpen, setWaterOpen] = useState(false);
  const meals = useByDate('meal', date);
  const water = useByDate('water', date);
  const workouts = useByDate('workout', date);
  const foods = useAll('food');
  const plans = useAll('plan');
  const tmpls = useAll('mtemplate');
  if (!meals || !water || !workouts || !foods) return null;
  const eaten = totals(meals.flatMap((m) => m.items), foods).n;
  const plannedItems = Object.values(plannedFood(planFor(plans ?? [], 'food', date), date)).flatMap((id) => tmpls?.find((t) => t.id === id)?.items ?? []);
  const goal = settings?.targets?.kcal ?? (plannedItems.length ? totals(plannedItems, foods).n.kcal : undefined);
  const ml = water.reduce((a, w) => a + w.ml, 0);
  const burned = workouts.reduce((a, w) => a + (w.metrics?.kcal ?? 0), 0);
  const trainMin = workouts.reduce((a, w) => a + (w.duration ?? 0), 0);
  const showN = settings?.showNutrition !== false;
  return (
    <div className="stats-row" data-testid="today-stats">
      {showN && (
        <button className="stat-tile" onClick={() => nav('/alimentacao')} style={{ background: 'var(--honey)', color: 'var(--honey-ink)' }}>
          <Flame size={16} /><span className="v num">{fmt(eaten.kcal)}</span><span className="l">{goal ? `de ${fmt(goal)} kcal` : 'kcal'}</span>
        </button>
      )}
      <div className="stat-tile water-tile" style={{ background: 'var(--card)', border: '1.5px solid var(--line)' }}>
        <button className="tap water-open" onClick={() => setWaterOpen(true)} aria-label={`Água: ${ml} mL. Abrir registros de água`} data-testid="water-open">
          <Droplets size={16} /><span className="v num">{ml >= 1000 ? (ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L' : ml + ' mL'}</span><span className="l">{settings?.waterGoalMl ? `de ${settings.waterGoalMl / 1000} L` : 'água'}</span>
        </button>
        <button className="water-plus" onClick={() => addWater(date, settings?.waterPresets?.[0] ?? 300)} aria-label={`Somar ${settings?.waterPresets?.[0] ?? 300} mL de água`} data-testid="water">+{settings?.waterPresets?.[0] ?? 300}</button>
      </div>
      <WaterSheet open={waterOpen} date={date} onClose={() => setWaterOpen(false)} />
      <button className="stat-tile" onClick={() => nav('/treino')} style={{ background: 'var(--blue)', color: 'var(--blue-ink)' }}>
        <Dumbbell size={16} /><span className="v num">{trainMin ? `${trainMin} min` : '–'}</span><span className="l">{burned ? `${fmt(burned)} kcal no treino` : workouts.length ? 'treino feito' : 'treino'}</span>
      </button>
    </div>
  );
}

