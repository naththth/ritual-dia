// O dia como linha do tempo: "Agora" no topo e o resto em ordem de horário.
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check as CheckIcon, Dumbbell, Flame, Moon, NotebookPen, Pill, Sunrise, Sun, Utensils } from 'lucide-react';
import { useAll, useByDate, useRecord, useSettings } from '../db/hooks';
import { planFor, plannedFood, plannedSkin, plannedTraining, trainingDay } from '../domain/rules';
import { nightAdjust } from '../domain/skinAdapt';
import { mealFromTemplate, saveSkin, workoutFromTemplate, addWater } from '../domain/actions';
import { fmt, mealSummary, totals } from '../domain/nutrition';
import { watts } from '../domain/ai';
import { addDays, todayKey, type DateKey } from '../lib/dates';
import { sleepPlan, wakeFor, bedFor, hoursLabel, wakeDetail } from '../domain/sleep';
import { paceLabel } from '../domain/fit';
import { WaterSheet } from './WaterSheet';
import { dosesFor, slotsFor, toMin as tmin, fromMin } from '../domain/mind';
import { markDose } from '../domain/mindload';
import { FoodThumb, MACRO_COLORS } from './food-ui';
import { PlateArt, SportScene, WaterGlass } from '../ui/art';
import { ArrowUpRight } from 'lucide-react';

export const DEFAULT_MEAL_TIMES: Record<string, string> = { cafe: '07:30', almoco: '12:30', lanche: '16:00', jantar: '20:00', ceia: '22:00' };
export const DEFAULT_SKIN_TIMES = { am: '07:00', pm: '21:30' };

type Mod = 'skin' | 'food' | 'training' | 'journal' | 'sleep' | 'mind';
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
  /** Alimentos da refeição (feita ou do plano), para mostrar as fotos. */
  foods?: any[];
}

const MOD_STYLE: Record<Mod, { bg: string; ink: string; pill: string }> = {
  skin: { bg: 'var(--rose)', ink: 'var(--rose-ink)', pill: 'pa-rose' },
  food: { bg: 'var(--honey)', ink: 'var(--honey-ink)', pill: 'pa-honey' },
  training: { bg: 'var(--blue)', ink: 'var(--blue-ink)', pill: 'pa-blue' },
  journal: { bg: 'var(--wine)', ink: 'var(--wine-ink)', pill: 'pa-wine' },
  sleep: { bg: 'var(--paper-2)', ink: 'var(--ink)', pill: 'pa-ghost' },
  mind: { bg: 'var(--lilac)', ink: 'var(--lilac-ink)', pill: 'pa-lilac' }
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
  const intakes = useAll('intake');
  const intakeLogs = useByDate('intakelog', date);
  const moods = useByDate('mood', date);
  const well = useRecord<'wellness'>(`wellness:${date}`);
  if (well === undefined || !intakes || !intakeLogs || !moods || !journal || !settings || !plans || !products || !wt || !mt || !foods || !mods || !skin || !meals || !workouts || !skips || !extras) return undefined;
  const items: TLItem[] = [];
  const sTimes = settings.skinTimes ?? DEFAULT_SKIN_TIMES;
  const mTimes = { ...DEFAULT_MEAL_TIMES, ...(settings.mealTimes ?? {}) };
  const skinPlan = planFor(plans, 'skin', date);
  const pname = (id: string) => products.find((p) => p.id === id)?.name ?? '';
  const short = (ids: string[]) => (ids.length <= 3 ? ids.map(pname).join(', ') : `${ids.slice(0, 2).map(pname).join(', ')} e mais ${ids.length - 2}`);

  for (const period of ['am', 'pm'] as const) {
    const log = skin.find((s) => s.period === period);
    let planned = plannedSkin(skinPlan, date, period, products, false, { skips, extras });
    let adjustNote = '';
    if (period === 'pm' && !log) {
      const skipped = new Set(skips.filter((x) => x.domain === 'training').map((x) => x.ref));
      const adj = nightAdjust({
        plannedPm: planned, recoveryPm: skinPlan?.skin?.recovery?.pm ?? [], products, amLog: skin.find((x) => x.period === 'am'), workouts,
        plannedWorkouts: plannedTraining(planFor(plans, 'training', date), date, extras).map((id) => wt.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t && !skipped.has(t.id))
      });
      let choice: string | null = null; try { choice = localStorage.getItem(`night-adjust:${date}`); } catch { /* */ }
      if (adj?.kind === 'swap' && choice !== 'kept') {
        if (choice === 'applied') { planned = adj.useRecovery ? plannedSkin(skinPlan, date, 'pm', products, true, { skips, extras }) : planned.filter((id) => !adj.remove.includes(id)); adjustNote = 'Sem ativo hoje: '; }
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

  const plannedMeals = plannedFood(planFor(plans, 'food', date), date, extras);
  for (const m of settings.mealTypes) {
    const meal = meals.find((x) => x.mealType === m.id && x.items.length);
    const tpl = plannedMeals[m.id] ? mt.find((t) => t.id === plannedMeals[m.id]) : undefined;
    const skipped = skips.some((s) => s.domain === 'food' && s.ref === m.id);
    if (!meal && !tpl && !['cafe', 'almoco', 'jantar'].includes(m.id)) continue;
    items.push({
      key: `meal-${m.id}`, time: mTimes[m.id], mod: 'food', icon: <Utensils size={18} />, title: m.label,
      detail: meal ? mealSummary(meal.items, foods) : tpl && !skipped ? mealSummary(tpl.items, foods) : skipped ? 'Não hoje' : 'Não registrado',
      done: !!meal, skipped,
      action: !meal && tpl && !skipped ? { label: 'Comi isso', run: () => mealFromTemplate(tpl, date, m.id, true), testId: `act-meal-${m.id}` } : !meal ? { label: 'Registrar', run: () => undefined } : undefined,
      open: `/alimentacao/refeicao?m=${m.id}`,
      foods: (meal ? meal.items : tpl && !skipped ? tpl.items : []).map((it: { foodId: string }) => foods.find((f) => f.id === it.foodId)).filter(Boolean)
    });
  }

  // Treino trocado por outro não aparece: só o que entrou no lugar. "Não hoje" fica para o que ela pulou de fato.
  const usedWorkouts = new Set<string>();
  for (const slot of trainingDay(planFor(plans, 'training', date), date, extras, skips, workouts, wt)) {
    const t = wt.find((x) => x.id === slot.id);
    if (!t || slot.status === 'trocado') continue;
    const w = slot.workoutId ? workouts.find((x) => x.id === slot.workoutId) : undefined;
    if (w) usedWorkouts.add(w.id);
    const skipped = slot.status === 'pulado';
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

  // Fechar o dia = check-in da noite da Mente (humor, energia e o que marcou o dia).
  const evening = (settings.reminders?.evening ?? '21:45') || '21:45';
  const pm = moods.find((m) => m.period === 'pm');
  const sgn = (n?: number) => (n == null ? '' : n > 0 ? `+${n}` : String(n));
  items.push({ key: 'journal', time: evening, mod: 'journal', icon: <NotebookPen size={18} />, title: 'Fechar o dia', detail: pm ? [pm.mood != null && `humor ${sgn(pm.mood)}`, pm.energy != null && `energia ${pm.energy}`, pm.tags.join(', ')].filter(Boolean).join(', ') || 'Registrado' : 'Humor, energia e o que marcou o dia', done: !!pm, open: date === todayKey() ? '/ritual/pm' : `/mente/checkin?p=pm&d=${date}` });

  // Remédios e vitaminas, agrupados por horário.
  for (const s of slotsFor(dosesFor(intakes, intakeLogs, date))) {
    const pending = s.doses.filter((d) => !d.log);
    const names = s.doses.map((d) => d.item.name).join(', ');
    const skipped = s.doses.every((d) => d.log?.status === 'pulei');
    items.push({
      key: `dose-${s.slot}`, time: s.slot, mod: 'mind', icon: <Pill size={18} />, title: s.doses.length === 1 ? names : 'Remédios e vitaminas',
      detail: s.doses.length === 1 ? (s.doses[0].item.dose ?? s.doses[0].item.rule ?? '') : names,
      done: !pending.length && !skipped, skipped: skipped || undefined,
      action: pending.length ? { label: 'Tomei', run: async () => { for (const d of pending) await markDose(d.item, date, d.slot, 'tomei'); }, testId: `act-dose-${s.slot}` } : undefined,
      open: '/mente'
    });
  }

  const sp = sleepPlan(settings.reminders);
  if (sp) {
    const wake = wakeFor(sp, date);
    const bed = bedFor(sp, date);
    items.push({ key: 'wake', time: wake, mod: 'sleep', icon: <Sunrise size={18} />, title: 'Acordar', detail: wakeDetail(sp.hours, well ?? undefined), done: false, marker: true, open: '/ajustes' });
    const am = moods.find((m) => m.period === 'am');
    items.push({ key: 'checkin-am', time: fromMin((tmin(wake) ?? 360) + 10), mod: 'mind', icon: <Sun size={18} />, title: 'Como acordou', detail: am ? [am.wake, am.mood != null && `humor ${sgn(am.mood)}`].filter(Boolean).join(', ') || 'Registrado' : 'Sono e humor em 20 segundos', done: !!am, open: date === todayKey() ? '/ritual/am' : `/mente/checkin?p=am&d=${date}` });
    items.push({ key: 'bed', time: bed, mod: 'sleep', icon: <Moon size={18} />, title: 'Deitar', detail: sp.bedGoal ? `Meta em etapas${sp.bedFinal && sp.bedFinal !== sp.bedGoal ? `, até chegar às ${sp.bedFinal}` : ''}. Acordar às ${wakeFor(sp, addDays(date, 1))}` : `Luz apagada para dormir ${hoursLabel(sp.hours)} e acordar às ${wakeFor(sp, addDays(date, 1))}`, done: false, open: '/ajustes' });
  }

  // Dentro do mesmo horário, o marco de acordar vem antes; o de deitar, depois.
  const order = (i: TLItem) => (toMin(i.time) ?? 24 * 60 + 1) + (i.key === 'wake' ? -0.5 : i.key === 'bed' ? 0.5 : 0);
  return items.sort((a, b) => order(a) - order(b));
}

const sportOf = (t: string): 'run' | 'bike' | 'swim' | 'strength' => (/nata|swim|piscina/i.test(t) ? 'swim' : /pedal|bike|ciclis|z2 bike/i.test(t) ? 'bike' : /corr|run|trote/i.test(t) ? 'run' : 'strength');
function nextStyle(i: TLItem) {
  if (i.mod === 'food') return { background: '#F2B48C', color: '#4A1F0A' };
  if (i.mod === 'training') return { background: 'var(--blue)', color: 'var(--ink)' };
  return { background: MOD_STYLE[i.mod].bg, color: MOD_STYLE[i.mod].ink };
}

function workoutLine(w: any, _mods: any[]) {
  const m = w.metrics;
  const pace = paceLabel(w.modalityId, w.duration, m?.distanceKm);
  const parts = [w.duration && `${w.duration} min`, m?.distanceKm && `${String(m.distanceKm).replace('.', ',')} km`, pace, m?.np ? `${m.np} W NP` : m?.avgPower && `${m.avgPower} W`, m?.avgHr && `FC ${m.avgHr}`, m?.kcal && `${m.kcal} kcal`].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Feito';
}

export function NowAndTimeline({ date, hideNow }: { date: DateKey; hideNow?: boolean }) {
  const items = useTimeline(date);
  const nav = useNavigate();
  const now = useNowMinutes();
  if (!items) return null;
  const isToday = date === todayKey();
  const pending = items.filter((i) => !i.done && !i.skipped && !i.marker);
  const next = isToday && !hideNow
    ? pending.find((i) => (toMin(i.time) ?? 9999) >= now - 60) ?? pending.find((i) => !i.time) ?? pending[0]
    : undefined;
  // Linha "agora": antes do primeiro item com horário depois de agora.
  const nowLabel = `${String(Math.floor(now / 60)).padStart(2, '0')}:${String(now % 60).padStart(2, '0')}`;
  const firstAfter = items.findIndex((i) => (toMin(i.time) ?? -1) > now);
  const nowIdx = firstAfter < 0 ? items.length : firstAfter;
  const upcoming = isToday ? items.slice(nowIdx).find((i) => !i.done && !i.skipped && !i.marker && i.mod !== 'sleep' && !(i.mod === 'skin' && !i.action)) : undefined;
  const past = items.slice(0, nowIdx).filter((i) => !i.marker && i.mod !== 'sleep');
  const pastCount = past.length;
  const doneCount = past.filter((i) => i.done).length;
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
      <section aria-label="Linha do tempo" data-testid="timeline" style={{ marginTop: 18 }}>
        {/* Horários na coluna da esquerda; em hoje, a linha "agora" e o próximo passo em destaque. */}
        <div className="row between" style={{ marginBottom: 12, alignItems: 'baseline' }}>
          <h2 className="section-title">{isToday ? 'Seu dia' : 'O dia'}</h2>
          {isToday && <span className="small muted">{doneCount} de {pastCount} até agora</span>}
        </div>
        <div className="tl3">
          {items.map((i, idx) => {
            const showNow = isToday && idx === nowIdx;
            const isNext = isToday && i === upcoming;
            const st = MOD_STYLE[i.mod];
            return (
              <div key={i.key} style={{ display: 'contents' }}>
                {showNow && <div className="tl-now" aria-label={`Agora, ${nowLabel}`}><b className="num">{nowLabel}</b><i /><em /></div>}
                <div className={`tl2 ${i.done ? 'done' : ''} ${i.skipped ? 'skipped' : ''}`} data-testid={`tl-${i.key}`}>
                  <span className="tl2-time num">{i.time ?? <span className="tl2-notime">Sem<br />hora</span>}</span>
                  {isNext ? (
                    <div className="tl-next" style={nextStyle(i)}>
                      {i.mod === 'training' && <SportScene sport={sportOf(i.title)} />}
                      {i.mod === 'food' && (i.foods?.some((f) => f.image)
                        ? <span className="tn-photos">{i.foods.filter((f) => f.image).slice(0, 3).map((f, k) => <FoodThumb key={k} food={f} size={[92, 68, 60][k]} radius={999} />)}</span>
                        : <span className="tn-art"><PlateArt size={150} /></span>)}
                      <button className="tap tn-in" onClick={() => nav(i.open)} style={{ textAlign: 'left' }}>
                        <span className="tn-k" style={{ display: 'block' }}>Próximo</span>
                        <span className="tn-t tl2-title" style={{ display: 'block' }}>{i.title}</span>
                        {i.detail && <span className="tn-d tl2-detail" style={{ display: 'block' }}>{i.detail}</span>}
                      </button>
                      <div className="tn-foot">
                        {i.action ? <button className="pill-act pa-ghost" style={{ background: 'rgba(255,255,255,.7)', minHeight: 40 }} onClick={() => runAction(i)} data-testid={i.action.testId}>{i.action.label}</button> : <span />}
                        <button className="tn-go" aria-label={`Abrir ${i.title}`} onClick={() => nav(i.open)}><ArrowUpRight size={18} /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="tl2-card">
                      {i.mod === 'food' && i.done && i.foods?.find((f) => f.image) ? <span className="tl2-thumb-w"><FoodThumb food={i.foods.find((f) => f.image)} size={40} radius={14} /></span> : <span className="tl2-dot" style={i.mod === 'journal' ? { background: 'var(--wine)', color: 'var(--wine-ink)' } : { background: i.done || i.skipped ? (i.done ? st.bg : 'var(--paper-2)') : st.bg, color: st.ink }}>{i.icon}</span>}
                      <button className="tl2-body tap" onClick={() => nav(i.open)}>
                        <span className="tl2-title">{i.title}</span>
                        {i.detail && <span className="tl2-detail">{i.detail}</span>}
                      </button>
                      {i.done ? <span className="tl2-ok" aria-label="Feito"><CheckIcon size={14} strokeWidth={3} /></span>
                        : i.action ? <button className={`pill-act ${isToday && idx < nowIdx ? 'pa-late' : st.pill}`} onClick={() => runAction(i)} data-testid={i.action.testId}>{i.action.label}</button> : null}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {isToday && nowIdx === items.length && <div className="tl-now" aria-label={`Agora, ${nowLabel}`}><b className="num">{nowLabel}</b><i /><em /></div>}
        </div>
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
  const extras = useByDate('extra', date);
  if (!meals || !water || !workouts || !foods) return null;
  const eaten = totals(meals.flatMap((m) => m.items), foods).n;
  const plannedItems = Object.values(plannedFood(planFor(plans ?? [], 'food', date), date, extras)).flatMap((id) => tmpls?.find((t) => t.id === id)?.items ?? []);
  const goal = settings?.targets?.kcal ?? (plannedItems.length ? totals(plannedItems, foods).n.kcal : undefined);
  const ml = water.reduce((a, w) => a + w.ml, 0);
  const burned = workouts.reduce((a, w) => a + (w.metrics?.kcal ?? 0), 0);
  const trainMin = workouts.reduce((a, w) => a + (w.duration ?? 0), 0);
  const showN = settings?.showNutrition !== false;
  const goalMl = settings?.waterGoalMl ?? 2500;
  const preset = settings?.waterPresets?.[0] ?? 300;
  const n = eaten;
  const R = 56, C = 2 * Math.PI * R;
  const parts = [['p', n.p * 4], ['c', n.c * 4], ['f', n.f * 9]] as const;
  const sum = parts.reduce((x, [, v]) => x + v, 0);
  const k = sum > 0 && goal ? Math.min(C, (n.kcal / goal) * C) / sum : sum > 0 ? C / sum : 0;
  let off = 0;
  return (
    <div className="bento" data-testid="today-stats">
      {showN && (
        <button className="bt bt-food" onClick={() => nav('/alimentacao')}>
          <span className="bt-head"><span className="row" style={{ gap: 8 }}><span className="bt-ic" style={{ background: 'var(--honey)', color: 'var(--honey-ink)' }}><Flame size={16} /></span>Dieta</span></span>
          <span className="bt-ring" style={{ position: 'relative', width: 132, height: 132 }}>
            <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden>
              <circle cx="66" cy="66" r={R} fill="none" stroke="var(--paper-2)" strokeWidth="12" />
              {parts.map(([key, v]) => { const len = v * k; const el = len > 1 ? <circle key={key} cx="66" cy="66" r={R} fill="none" stroke={MACRO_COLORS[key]} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${Math.max(0.5, len - 4)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 66 66)" /> : null; off += len; return el; })}
            </svg>
            <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span className="bt-v num">{fmt(n.kcal)}</span><span className="small muted">{goal ? `de ${fmt(goal)} kcal` : 'kcal'}</span>
            </span>
          </span>
          <span className="bt-macros"><span><b style={{ color: MACRO_COLORS.p }}>{fmt(n.p)} g</b>proteína</span><span><b style={{ color: '#86630F' }}>{fmt(n.c)} g</b>carbo</span><span><b style={{ color: '#4A64A3' }}>{fmt(n.f)} g</b>gordura</span></span>
        </button>
      )}
      <div className="bt bt-water">
        <div className="bw-l">
          <button className="tap water-open" onClick={() => setWaterOpen(true)} aria-label={`Água: ${ml} mL. Abrir registros de água`} data-testid="water-open" style={{ textAlign: 'left' }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>Água</span>
            <span className="bt-v num" style={{ display: 'block', marginTop: 8 }}>{ml >= 1000 ? (ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : ml}{' '}<small>{ml >= 1000 ? 'L' : 'mL'}</small></span>
            <span className="bt-l">de {(goalMl / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L</span>
          </button>
          <button className="water-plus" onClick={() => addWater(date, preset)} aria-label={`Somar ${preset} mL de água`} data-testid="water">+{preset}</button>
        </div>
        <span className="bw-glass"><WaterGlass level={ml / goalMl} /></span>
      </div>
      <WaterSheet open={waterOpen} date={date} onClose={() => setWaterOpen(false)} />
      <button className="bt bt-train" onClick={() => nav('/treino')}>
        <span className="bt-head"><span>Treino</span>{workouts.length > 0 && <span className="bt-chip">{workouts.length} {workouts.length === 1 ? 'feito' : 'feitos'}</span>}</span>
        <span className="bt-v num">{trainMin ? (trainMin >= 60 ? `${Math.floor(trainMin / 60)}h${String(trainMin % 60).padStart(2, '0')}` : `${trainMin} min`) : '–'}</span>
        <span className="bt-l" style={{ whiteSpace: 'normal' }}>{burned ? `${fmt(burned)} kcal no treino` : workouts.length ? 'treino feito' : 'nada registrado ainda'}</span>
      </button>
    </div>
  );
}

