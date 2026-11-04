// Rituais guiados: manhã e noite num fluxo só, passo a passo, em vez de seis telas.
// Manhã: como acordou, remédios, pele, café da manhã e o treino do dia. Noite: fechar o dia, remédios, pele e o amanhã.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronRight, Dumbbell, Moon, Pill, Sparkles, Sun, Sunrise, Utensils, X } from 'lucide-react';
import { useAll, useByDate, useSettings } from '../db/hooks';
import { get } from '../db/db';
import { addDays, todayKey, WEEKDAY_LONG, isoWeekday, type DateKey } from '../lib/dates';
import { planFor, plannedFood, plannedSkin, plannedTraining } from '../domain/rules';
import { mealFromTemplate, saveSkin, skipPlanned } from '../domain/actions';
import { fmt, totals } from '../domain/nutrition';
import { dosesFor, toMin, CONTEXT_TAGS, SLIDERS, WAKE_OPTIONS, MOOD_LABEL, type Dose } from '../domain/mind';
import { markDose, saveCheckin } from '../domain/mindload';
import { bedFor, sleepPlan, wakeFor } from '../domain/sleep';
import { ProductThumb } from '../ui/ProductThumb';
import { Chip } from '../ui/ui';
import { haptic } from '../state/store';
import type { MoodCheckin } from '../db/types';

type P = 'am' | 'pm';
type StepId = 'checkin' | 'doses' | 'pele' | 'cafe' | 'treino' | 'amanha';
const LABEL: Record<StepId, string> = { checkin: 'Como estou', doses: 'Remédios', pele: 'Pele', cafe: 'Café da manhã', treino: 'Treino', amanha: 'Amanhã' };
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Dados do dia para montar os passos (só entram os que têm algo a fazer). */
function useRitualData(date: DateKey, p: P) {
  const settings = useSettings();
  const plans = useAll('plan');
  const products = useAll('product');
  const tmpls = useAll('wtemplate');
  const mtmpls = useAll('mtemplate');
  const foods = useAll('food');
  const intakes = useAll('intake');
  const logs = useByDate('intakelog', date);
  const skin = useByDate('skin', date);
  const meals = useByDate('meal', date);
  const skips = useByDate('skip', date);
  const extras = useByDate('extra', date);
  const extrasTomorrow = useByDate('extra', addDays(date, 1));
  const workouts = useByDate('workout', date);
  const moods = useByDate('mood', date);
  if (!settings || !plans || !products || !tmpls || !mtmpls || !foods || !intakes || !logs || !skin || !meals || !skips || !extras || !extrasTomorrow || !workouts || !moods) return undefined;
  const half = (d: Dose) => (toMin(d.slot) ?? 0) < 12 * 60;
  const doses = dosesFor(intakes, logs, date).filter((d) => (p === 'am' ? half(d) : !half(d)));
  const skinIds = skin.some((s) => s.period === p) ? [] : plannedSkin(planFor(plans, 'skin', date), date, p, products, false, { skips, extras });
  const cafeId = plannedFood(planFor(plans, 'food', date), date, extras).cafe;
  const cafe = cafeId && !meals.some((m) => m.mealType === 'cafe' && m.items.length) && !skips.some((s) => s.domain === 'food' && s.ref === 'cafe') ? mtmpls.find((t) => t.id === cafeId) : undefined;
  const training = plannedTraining(planFor(plans, 'training', date), date, extras)
    .filter((id) => !skips.some((s) => s.domain === 'training' && s.ref === id)).map((id) => tmpls.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t && t.modalityId !== 'mod:descanso' && !workouts.some((w) => w.templateId === t.id));
  const tomorrow = addDays(date, 1);
  const tomorrowTraining = plannedTraining(planFor(plans, 'training', tomorrow), tomorrow, extrasTomorrow).map((id) => tmpls.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t && t.modalityId !== 'mod:descanso');
  const sp = sleepPlan(settings.reminders);
  return { settings, products, foods, doses, skinIds, cafe, training, tomorrow, tomorrowTraining, sp, mood: moods.find((m) => m.period === p) };
}

export function RitualScreen() {
  const { p: raw } = useParams();
  const p: P = raw === 'pm' ? 'pm' : 'am';
  const nav = useNavigate();
  const date = todayKey();
  const d = useRitualData(date, p);
  const [i, setI] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const [dir, setDir] = useState<'f' | 'b'>('f');
  // Os passos ficam fixos depois de montados: marcar algo não faz o passo sumir no meio do fluxo.
  const [steps, setSteps] = useState<StepId[] | null>(null);
  useEffect(() => {
    if (!d || steps) return;
    const s: StepId[] = ['checkin'];
    if (d.doses.some((x) => !x.log)) s.push('doses');
    if (d.skinIds.length) s.push('pele');
    if (p === 'am' && d.cafe) s.push('cafe');
    if (p === 'am' && d.training.length) s.push('treino');
    if (p === 'pm') s.push('amanha');
    setSteps(s);
  }, [d, steps]);
  if (!d || !steps) return <div className={`ritual r-${p}`} />;
  const finished = i >= steps.length;
  const step = steps[i];
  const next = (note?: string) => { haptic(); if (note) setDone((x) => [...x, note]); setDir('f'); setI(i + 1); };
  const back = () => { if (i > 0) { setDir('b'); setI(i - 1); } };
  return (
    <div className={`ritual r-${p}`} data-testid={`ritual-${p}`}>
      <div className="rt-top">
        <button className="icon-btn" aria-label="Fechar" onClick={() => nav('/', { replace: true })}><X size={22} /></button>
        <span className="rt-kicker">{p === 'am' ? <><Sunrise size={16} /> Ritual da manhã</> : <><Moon size={16} /> Ritual da noite</>}</span>
        <span style={{ width: 40 }} />
      </div>
      <div className="rt-progress" aria-label={`Passo ${Math.min(i + 1, steps.length)} de ${steps.length}`}>
        {steps.map((s, k) => <i key={s} className={k < i || finished ? 'on' : k === i ? 'cur' : ''} />)}
      </div>
      <div className="rt-stage">
        {finished ? <RitualDone p={p} done={done} onClose={() => nav('/', { replace: true })} d={d} /> : (
          <div key={step} className={`rt-step ${dir === 'f' ? 'in-f' : 'in-b'}`}>
            <span className="rt-count">{i + 1} de {steps.length} · {LABEL[step]}</span>
            {step === 'checkin' && <CheckinStep p={p} date={date} initial={d.mood} wakeInfo={d.sp ? wakeFor(d.sp, date) : undefined} onDone={next} />}
            {step === 'doses' && <DosesStep date={date} doses={d.doses} onDone={next} />}
            {step === 'pele' && <SkinStep p={p} date={date} ids={d.skinIds} products={d.products} onDone={next} />}
            {step === 'cafe' && d.cafe && <CafeStep date={date} tpl={d.cafe} foods={d.foods} onDone={next} />}
            {step === 'treino' && <TrainingStep date={date} list={d.training} onDone={next} />}
            {step === 'amanha' && <TomorrowStep d={d} onDone={next} />}
            {i > 0 && <button className="link small rt-back" onClick={back}>Voltar</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function Foot({ primary, onPrimary, onSkip, skipLabel = 'Pular', testId }: { primary: string; onPrimary: () => void; onSkip?: () => void; skipLabel?: string; testId?: string }) {
  return (
    <div className="rt-foot">
      <button className="rt-primary" onClick={onPrimary} data-testid={testId ?? 'rt-next'}>{primary} <ChevronRight size={18} /></button>
      {onSkip && <button className="link rt-skip" onClick={onSkip}>{skipLabel}</button>}
    </div>
  );
}

function CheckinStep({ p, date, initial, onDone }: { p: P; date: DateKey; initial?: MoodCheckin; wakeInfo?: string; onDone: (n?: string) => void }) {
  const [st, setSt] = useState<Partial<MoodCheckin>>(initial ?? { tags: [] });
  const [w, setW] = useState<{ h?: number; s?: string; e?: string }>({});
  useEffect(() => { void get<'wellness'>(`wellness:${date}`).then((x) => setW({ h: x?.sleepH, s: x?.sleepStart, e: x?.sleepEnd })); }, [date]);
  const set = (x: Partial<MoodCheckin>) => setSt((y) => ({ ...y, ...x }));
  const save = async () => {
    await saveCheckin(date, p, { mood: st.mood, energy: st.energy, irritability: st.irritability, anxiety: st.anxiety, racing: st.racing, wake: st.wake, tags: st.tags ?? [], note: st.note?.trim() || undefined });
    onDone(st.mood != null ? `Humor ${signed(st.mood)}` : p === 'am' ? 'Manhã registrada' : 'Dia fechado');
  };
  return (
    <>
      <h1 className="rt-title">{p === 'am' ? 'Bom dia. Como você acordou?' : 'Como foi o dia?'}</h1>
      {p === 'am' && w.h ? <p className="rt-sub">O relógio marcou {w.h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h de sono{w.s ? `, de ${w.s} a ${w.e}` : ''}.</p> : null}
      {p === 'am' && <div className="chips rt-chips">{WAKE_OPTIONS.map((o) => <Chip key={o.id} on={st.wake === o.id} onClick={() => set({ wake: st.wake === o.id ? undefined : o.id })} testId={`rt-wake-${o.id}`}>{o.label}</Chip>)}</div>}
      <span className="rt-label">Humor {p === 'am' ? 'agora' : 'do dia'}</span>
      <div className="mood-scale rt-mood">{[-3, -2, -1, 0, 1, 2, 3].map((n) => <button key={n} className={`ms-btn ${st.mood === n ? 'on' : ''}`} onClick={() => { haptic(8); set({ mood: st.mood === n ? undefined : n }); }} data-testid={`rt-mood-${n}`}>{signed(n)}</button>)}</div>
      <p className="rt-hint">{st.mood != null ? MOOD_LABEL[String(st.mood)] : '0 é o seu normal'}</p>
      {p === 'pm' && <div className="rt-sliders">
        {SLIDERS.map((s) => (
          <div key={s.key} className="rt-slider"><span>{s.label}</span>
            <div className="rt-dots">{[0, 1, 2, 3, 4].map((n) => <button key={n} aria-label={`${s.label} ${n}`} className={((st as any)[s.key] ?? -1) >= n ? 'on' : ''} onClick={() => set({ [s.key]: (st as any)[s.key] === n ? undefined : n } as any)} />)}</div>
          </div>
        ))}
      </div>}
      {p === 'pm' && <>
        <span className="rt-label">O que marcou o dia</span>
        <div className="chips rt-chips">{CONTEXT_TAGS.map((t) => <Chip key={t} on={st.tags?.includes(t)} onClick={() => set({ tags: st.tags?.includes(t) ? st.tags.filter((x) => x !== t) : [...(st.tags ?? []), t] })}>{t}</Chip>)}</div>
        <textarea rows={2} className="rt-note" value={st.note ?? ''} onChange={(e) => set({ note: e.target.value })} placeholder="Uma linha sobre hoje, se quiser" />
      </>}
      <Foot primary="Seguir" onPrimary={() => void save()} testId="rt-checkin-save" />
    </>
  );
}

function DosesStep({ date, doses, onDone }: { date: DateKey; doses: Dose[]; onDone: (n?: string) => void }) {
  const [taken, setTaken] = useState<Set<string>>(new Set(doses.filter((d) => d.log).map((d) => d.item.id + d.slot)));
  const pending = doses.filter((d) => !taken.has(d.item.id + d.slot));
  const take = async (d: Dose) => { haptic(); await markDose(d.item, date, d.slot, 'tomei'); setTaken((x) => new Set([...x, d.item.id + d.slot])); };
  return (
    <>
      <h1 className="rt-title">Remédios e vitaminas</h1>
      <div className="rt-list">
        {doses.map((d) => {
          const on = taken.has(d.item.id + d.slot);
          return (
            <button key={d.item.id + d.slot} className={`rt-item ${on ? 'on' : ''}`} onClick={() => !on && void take(d)} data-testid={`rt-dose-${d.item.id}`}>
              <span className="rt-ic"><Pill size={18} /></span>
              <span className="grow"><b>{d.item.name}</b><br /><span className="small">{d.slot}{d.item.dose ? ` · ${d.item.dose}` : ''}{d.item.rule ? ` · ${d.item.rule}` : ''}</span></span>
              <span className={`rt-check ${on ? 'on' : ''}`}>{on && <Check size={16} strokeWidth={3} />}</span>
            </button>
          );
        })}
      </div>
      <Foot primary={pending.length ? 'Tomei todos' : 'Seguir'} onPrimary={async () => { for (const d of pending) await markDose(d.item, date, d.slot, 'tomei'); onDone(`${doses.length} ${doses.length === 1 ? 'tomada' : 'tomadas'}`); }} onSkip={pending.length ? () => onDone() : undefined} skipLabel="Depois" testId="rt-doses" />
    </>
  );
}

function SkinStep({ p, date, ids, products, onDone }: { p: P; date: DateKey; ids: string[]; products: { id: string; name: string; brand: string; image?: string; howShort?: string }[]; onDone: (n?: string) => void }) {
  const nav = useNavigate();
  const list = ids.map((id) => products.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <>
      <h1 className="rt-title">{p === 'am' ? 'Pele da manhã' : 'Pele da noite'}</h1>
      <p className="rt-sub">Na ordem de aplicação.</p>
      <ol className="rt-products">
        {list.map((x, k) => (
          <li key={x.id} style={{ animationDelay: `${k * 60}ms` }}>
            <ProductThumb p={x} size={40} />
            <span className="grow"><b>{x.name}</b>{x.howShort && <><br /><span className="small">{x.howShort}</span></>}</span>
          </li>
        ))}
      </ol>
      <Foot primary="Usei tudo" onPrimary={async () => { await saveSkin(date, p, { productIds: ids, plannedIds: ids }); onDone(`Pele: ${ids.length} produtos`); }} onSkip={() => nav(`/pele?p=${p}`)} skipLabel="Ajustar o que usei" testId="rt-skin" />
    </>
  );
}

function CafeStep({ date, tpl, foods, onDone }: { date: DateKey; tpl: { id: string; name: string; items: { foodId: string; portion: string; grams?: number }[] }; foods: any[]; onDone: (n?: string) => void }) {
  const nav = useNavigate();
  const t = totals(tpl.items, foods).n;
  return (
    <>
      <h1 className="rt-title">Café da manhã</h1>
      <div className="rt-card">
        <span className="rt-ic big"><Utensils size={22} /></span>
        <b>{tpl.name}</b>
        <span className="small">{tpl.items.map((i) => `${foods.find((f) => f.id === i.foodId)?.name ?? '?'} ${i.portion}`).join(', ')}</span>
        {t.kcal > 0 && <span className="small rt-macros"><b>{fmt(t.kcal)}</b> kcal · <b>{fmt(t.p)}</b> g de proteína</span>}
      </div>
      <Foot primary="Comi isso" onPrimary={async () => { await mealFromTemplate(tpl as any, date, 'cafe', true); onDone('Café da manhã'); }} onSkip={() => nav('/alimentacao/refeicao?m=cafe')} skipLabel="Comi outra coisa" testId="rt-cafe" />
    </>
  );
}

function TrainingStep({ date, list, onDone }: { date: DateKey; list: { id: string; name: string; duration: number; intensity: string; time?: string; steps?: { minutes: number; pct: number }[] }[]; onDone: (n?: string) => void }) {
  return (
    <>
      <h1 className="rt-title">O treino de hoje</h1>
      {list.map((t) => (
        <div key={t.id} className="rt-card">
          <span className="rt-ic big"><Dumbbell size={22} /></span>
          <b>{t.name}</b>
          <span className="small">{t.time ? `${t.time} · ` : ''}{t.duration} min · {t.intensity}</span>
          {t.steps?.length ? <div className="rt-steps-bar">{t.steps.map((s, k) => <i key={k} style={{ flex: s.minutes, height: `${Math.max(18, Math.min(100, s.pct))}%` }} />)}</div> : null}
        </div>
      ))}
      <Foot primary="Combinado" onPrimary={() => onDone(list.map((t) => t.name).join(', '))} onSkip={async () => { for (const t of list) await skipPlanned(date, 'training', t.id); onDone('Treino fica para outro dia'); }} skipLabel="Hoje não vai dar" testId="rt-train" />
    </>
  );
}

function TomorrowStep({ d, onDone }: { d: NonNullable<ReturnType<typeof useRitualData>>; onDone: (n?: string) => void }) {
  const bed = d.sp ? bedFor(d.sp, todayKey()) : undefined;
  const wake = d.sp ? wakeFor(d.sp, d.tomorrow) : undefined;
  return (
    <>
      <h1 className="rt-title">Amanhã, {WEEKDAY_LONG[isoWeekday(d.tomorrow)]}</h1>
      <div className="rt-list">
        {d.tomorrowTraining.length ? d.tomorrowTraining.map((t) => (
          <div key={t.id} className="rt-item"><span className="rt-ic"><Dumbbell size={18} /></span><span className="grow"><b>{t.name}</b><br /><span className="small">{t.time ? `${t.time} · ` : ''}{t.duration} min</span></span></div>
        )) : <div className="rt-item"><span className="rt-ic"><Sun size={18} /></span><span className="grow"><b>Sem treino no plano</b><br /><span className="small">Dia de recuperação.</span></span></div>}
        {wake && <div className="rt-item"><span className="rt-ic"><Sunrise size={18} /></span><span className="grow"><b>Acordar às {wake}</b></span></div>}
      </div>
      {bed && <div className="rt-bed"><Moon size={20} /><span><b>Deitar às {bed}</b><br /><span className="small">Tela longe e luz baixa. É o que mais protege o humor e o sono.</span></span></div>}
      <Foot primary="Boa noite" onPrimary={() => onDone()} testId="rt-night" />
    </>
  );
}

function RitualDone({ p, done, onClose, d }: { p: P; done: string[]; onClose: () => void; d: NonNullable<ReturnType<typeof useRitualData>> }) {
  useEffect(() => { haptic(30); }, []);
  const line = useMemo(() => (p === 'am'
    ? d.training.length ? 'O dia está montado. Agora é executar no seu ritmo.' : 'O dia está montado. Constância é isso: o básico bem feito, todo dia.'
    : 'Dia fechado. O que ficou registrado hoje vira leitura amanhã.'), [p]);
  return (
    <div className="rt-done" data-testid="ritual-done">
      <div className="rt-ring">
        <svg viewBox="0 0 120 120" className="rt-ring-svg" aria-hidden><circle cx="60" cy="60" r="52" className="rt-ring-bg" /><circle cx="60" cy="60" r="52" className="rt-ring-fg" /></svg>
        <Check size={44} strokeWidth={3} className="rt-ring-check" />
        {Array.from({ length: 10 }, (_, k) => <i key={k} className="rt-spark" style={{ ['--a' as any]: `${k * 36}deg` }} />)}
      </div>
      <h1 className="rt-title" style={{ textAlign: 'center' }}>{p === 'am' ? 'Manhã pronta' : 'Boa noite'}</h1>
      <p className="rt-sub" style={{ textAlign: 'center' }}>{line}</p>
      {done.length > 0 && <div className="chips" style={{ justifyContent: 'center' }}>{done.map((x) => <span key={x} className="chip on rt-done-chip"><Check size={13} /> {x}</span>)}</div>}
      <div className="rt-foot"><button className="rt-primary" onClick={onClose} data-testid="rt-close">Voltar ao dia <Sparkles size={16} /></button></div>
    </div>
  );
}

/** Convite no topo do Hoje: o ritual da hora, enquanto não foi feito. */
export function RitualHero({ date }: { date: DateKey }) {
  const nav = useNavigate();
  const moods = useByDate('mood', date);
  const [h, setH] = useState(new Date().getHours());
  useEffect(() => { const t = setInterval(() => setH(new Date().getHours()), 60_000); return () => clearInterval(t); }, []);
  if (date !== todayKey() || !moods) return null;
  const p: P | undefined = h >= 4 && h < 12 && !moods.some((m) => m.period === 'am') ? 'am' : h >= 18 && !moods.some((m) => m.period === 'pm') ? 'pm' : undefined;
  if (!p) return null;
  return (
    <button className={`ritual-hero rh-${p}`} onClick={() => nav(`/ritual/${p}`)} data-testid={`ritual-hero-${p}`}>
      <span className="rh-orb" aria-hidden />
      <span className="grow">
        <span className="rh-kicker">{p === 'am' ? 'Começar o dia' : 'Fechar o dia'}</span>
        <b className="rh-title">{p === 'am' ? 'Ritual da manhã' : 'Ritual da noite'}</b>
        <span className="rh-sub">{p === 'am' ? 'Como acordou, remédios, pele, café e treino. Uns 2 minutos.' : 'Como foi o dia, remédios, pele e o amanhã. Uns 2 minutos.'}</span>
      </span>
      <span className="rh-go"><ChevronRight size={22} /></span>
    </button>
  );
}
