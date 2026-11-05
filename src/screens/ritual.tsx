// Rituais guiados: manhã e noite num fluxo só, passo a passo, em vez de seis telas.
// Manhã: como acordou, remédios, pele, café da manhã e o treino do dia. Noite: fechar o dia, remédios, pele e o amanhã.
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronRight, Dumbbell, Moon, Pill, Sparkles, Sun, Sunrise, Utensils, X } from 'lucide-react';
import { useAll, useByDate, useSettings } from '../db/hooks';
import { get, getMeta, setMeta } from '../db/db';
import { addDays, todayKey, WEEKDAY_LONG, isoWeekday, type DateKey } from '../lib/dates';
import { planFor, plannedFood, plannedSkin, plannedTraining } from '../domain/rules';
import { mealFromTemplate, saveSkin, skipPlanned } from '../domain/actions';
import { fmt, totals } from '../domain/nutrition';
import { dosesFor, toMin, CONTEXT_TAGS, SLIDERS, WAKE_OPTIONS, MOOD_LABEL, type Dose } from '../domain/mind';
import { markDose, saveCheckin, unmarkDose } from '../domain/mindload';
import { bedFor, sleepPlan, wakeFor } from '../domain/sleep';
import { ProductThumb } from '../ui/ProductThumb';
import { Chip } from '../ui/ui';
import { haptic } from '../state/store';
import type { MoodCheckin } from '../db/types';

type P = 'am' | 'pm';
type StepId = 'checkin' | 'doses' | 'pele' | 'cafe' | 'treino' | 'amanha';
const LABEL: Record<StepId, string> = { checkin: 'Como estou', doses: 'Remédios', pele: 'Pele', cafe: 'Café da manhã', treino: 'Treino', amanha: 'Amanhã' };
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Dados do dia, os passos do ritual e o que já foi feito em cada um (vale para retomar e para editar). */
export function useRitual(date: DateKey, p: P) {
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
  const flags = useLiveQuery(async () => ((await getMeta<Record<string, boolean>>(`ritual:${date}:${p}`)) ?? {}), [date, p]);
  if (!settings || !plans || !products || !tmpls || !mtmpls || !foods || !intakes || !logs || !skin || !meals || !skips || !extras || !extrasTomorrow || !workouts || !moods || !flags) return undefined;
  const half = (d: Dose) => (toMin(d.slot) ?? 0) < 12 * 60;
  const doses = dosesFor(intakes, logs, date).filter((d) => (p === 'am' ? half(d) : !half(d)));
  const skinLog = skin.find((s) => s.period === p);
  const skinIds = plannedSkin(planFor(plans, 'skin', date), date, p, products, false, { skips, extras });
  const cafeId = plannedFood(planFor(plans, 'food', date), date, extras).cafe;
  const cafe = cafeId ? mtmpls.find((t) => t.id === cafeId) : undefined;
  const cafeMeal = meals.find((m) => m.mealType === 'cafe' && m.items.length);
  const cafeSkipped = skips.some((s) => s.domain === 'food' && s.ref === 'cafe');
  const training = plannedTraining(planFor(plans, 'training', date), date, extras).map((id) => tmpls.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t && t.modalityId !== 'mod:descanso')
    .map((t) => ({ ...t, skipped: skips.some((s) => s.domain === 'training' && s.ref === t.id), done: workouts.some((w) => w.templateId === t.id || w.modalityId === t.modalityId) }));
  const tomorrow = addDays(date, 1);
  const tomorrowTraining = plannedTraining(planFor(plans, 'training', tomorrow), tomorrow, extrasTomorrow).map((id) => tmpls.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t && t.modalityId !== 'mod:descanso');
  const sp = sleepPlan(settings.reminders);
  const mood = moods.find((m) => m.period === p);
  const steps: StepId[] = ['checkin'];
  const done: Partial<Record<StepId, boolean>> = { checkin: !!mood };
  if (doses.length) { steps.push('doses'); done.doses = doses.every((d) => d.log); }
  if (skinIds.length || skinLog) { steps.push('pele'); done.pele = !!skinLog; }
  if (p === 'am' && (cafe || cafeMeal)) { steps.push('cafe'); done.cafe = !!cafeMeal || cafeSkipped; }
  if (p === 'am' && training.length) { steps.push('treino'); done.treino = !!flags.treino || training.every((t) => t.done || t.skipped); }
  if (p === 'pm') { steps.push('amanha'); done.amanha = !!flags.amanha; }
  const count = steps.filter((s) => done[s]).length;
  return { settings, products, foods, doses, skinLog, skinIds, cafe, cafeMeal, training, tomorrow, tomorrowTraining, sp, mood, steps, done, count, complete: count === steps.length };
}
type RitualData = NonNullable<ReturnType<typeof useRitual>>;
const flag = async (date: DateKey, p: P, k: string) => { const cur = (await getMeta<Record<string, boolean>>(`ritual:${date}:${p}`)) ?? {}; await setMeta(`ritual:${date}:${p}`, { ...cur, [k]: true }); };

export function RitualScreen() {
  const { p: raw } = useParams();
  const p: P = raw === 'pm' ? 'pm' : 'am';
  const nav = useNavigate();
  const date = todayKey();
  const d = useRitual(date, p);
  const [cur, setCur] = useState<StepId | 'fim' | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [dir, setDir] = useState<'f' | 'b'>('f');
  // Abre no primeiro passo que falta; tudo feito, abre do começo para revisar.
  useEffect(() => { if (d && cur === null) setCur(d.steps.find((s) => !d.done[s]) ?? 'checkin'); }, [d, cur]);
  if (!d || cur === null) return <div className={`ritual r-${p}`} />;
  const idx = cur === 'fim' ? d.steps.length : Math.max(0, d.steps.indexOf(cur));
  const go = (k: number) => { setDir(k >= idx ? 'f' : 'b'); setCur(k >= d.steps.length ? 'fim' : d.steps[k]); };
  const next = (note?: string) => { haptic(); if (note) setNotes((x) => [...x.filter((y) => y !== note), note]); go(idx + 1); };
  const close = () => nav('/', { replace: true });
  return (
    <div className={`ritual r-${p}`} data-testid={`ritual-${p}`}>
      <div className="rt-top">
        <button className="icon-btn" aria-label="Fechar" onClick={close}><X size={22} /></button>
        <span className="rt-kicker">{p === 'am' ? <><Sunrise size={16} /> Ritual da manhã</> : <><Moon size={16} /> Ritual da noite</>}</span>
        <span className="rt-tally num">{d.count}/{d.steps.length}</span>
      </div>
      {/* Cada passo é um botão: dá para voltar e mexer no que já registrou. */}
      <div className="rt-progress" role="tablist" aria-label="Passos do ritual">
        {d.steps.map((s, k) => (
          <button key={s} role="tab" aria-selected={k === idx} className={`${d.done[s] ? 'on' : ''} ${k === idx ? 'cur' : ''}`} onClick={() => go(k)} data-testid={`rt-tab-${s}`}>
            <i /><span>{LABEL[s]}</span>
          </button>
        ))}
      </div>
      <div className="rt-stage">
        {cur === 'fim' ? <RitualDone p={p} notes={notes} d={d} onClose={close} onEdit={() => go(0)} /> : (
          <div key={cur} className={`rt-step ${dir === 'f' ? 'in-f' : 'in-b'}`}>
            <span className="rt-count">{idx + 1} de {d.steps.length} · {LABEL[cur]}{d.done[cur] ? ' · feito' : ''}</span>
            {cur === 'checkin' && <CheckinStep p={p} date={date} initial={d.mood} onDone={next} />}
            {cur === 'doses' && <DosesStep date={date} doses={d.doses} onDone={next} />}
            {cur === 'pele' && <SkinStep p={p} date={date} d={d} onDone={next} />}
            {cur === 'cafe' && <CafeStep date={date} d={d} onDone={next} />}
            {cur === 'treino' && <TrainingStep date={date} d={d} onDone={async (n) => { await flag(date, 'am', 'treino'); next(n); }} />}
            {cur === 'amanha' && <TomorrowStep d={d} onDone={async () => { await flag(date, 'pm', 'amanha'); next(); }} />}
            {idx > 0 && <button className="link small rt-back" onClick={() => go(idx - 1)}>Voltar</button>}
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

function CheckinStep({ p, date, initial, onDone }: { p: P; date: DateKey; initial?: MoodCheckin; onDone: (n?: string) => void }) {
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
      <Foot primary={initial ? 'Salvar e seguir' : 'Seguir'} onPrimary={() => void save()} testId="rt-checkin-save" />
    </>
  );
}

function DosesStep({ date, doses, onDone }: { date: DateKey; doses: Dose[]; onDone: (n?: string) => void }) {
  const [taken, setTaken] = useState<Set<string>>(new Set(doses.filter((d) => d.log).map((d) => d.item.id + d.slot)));
  const pending = doses.filter((d) => !taken.has(d.item.id + d.slot));
  const take = async (d: Dose) => { haptic(); await markDose(d.item, date, d.slot, 'tomei'); setTaken((x) => new Set([...x, d.item.id + d.slot])); };
  const untake = async (d: Dose) => { await unmarkDose(d.item, date, d.slot); setTaken((x) => { const n = new Set(x); n.delete(d.item.id + d.slot); return n; }); };
  return (
    <>
      <h1 className="rt-title">Remédios e vitaminas</h1>
      <p className="rt-sub">Toque para marcar ou desmarcar.</p>
      <div className="rt-list">
        {doses.map((d) => {
          const on = taken.has(d.item.id + d.slot);
          return (
            <button key={d.item.id + d.slot} className={`rt-item ${on ? 'on' : ''}`} onClick={() => (on ? void untake(d) : void take(d))} data-testid={`rt-dose-${d.item.id}`}>
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

function SkinStep({ p, date, d, onDone }: { p: P; date: DateKey; d: RitualData; onDone: (n?: string) => void }) {
  const nav = useNavigate();
  const ids = d.skinLog ? d.skinLog.productIds : d.skinIds;
  const list = ids.map((id) => d.products.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <>
      <h1 className="rt-title">{p === 'am' ? 'Pele da manhã' : 'Pele da noite'}</h1>
      <p className="rt-sub">{d.skinLog ? (d.skinLog.skipped ? 'Registrado como pulado.' : `Registrado: ${list.length} ${list.length === 1 ? 'produto' : 'produtos'}.`) : 'Na ordem de aplicação.'}</p>
      <ol className="rt-products">
        {list.map((x, k) => (
          <li key={x.id} style={{ animationDelay: `${k * 60}ms` }}>
            <ProductThumb p={x} size={40} />
            <span className="grow"><b>{x.name}</b>{x.howShort && <><br /><span className="small">{x.howShort}</span></>}</span>
          </li>
        ))}
      </ol>
      {d.skinLog
        ? <Foot primary="Seguir" onPrimary={() => onDone()} onSkip={() => nav(`/pele?p=${p}`)} skipLabel="Mudar o que usei" testId="rt-skin" />
        : <Foot primary="Usei tudo" onPrimary={async () => { await saveSkin(date, p, { productIds: d.skinIds, plannedIds: d.skinIds }); onDone(`Pele: ${d.skinIds.length} produtos`); }} onSkip={() => nav(`/pele?p=${p}`)} skipLabel="Escolher o que usei" testId="rt-skin" />}
    </>
  );
}

function CafeStep({ date, d, onDone }: { date: DateKey; d: RitualData; onDone: (n?: string) => void }) {
  const nav = useNavigate();
  const items = d.cafeMeal?.items ?? d.cafe?.items ?? [];
  const t = totals(items, d.foods).n;
  return (
    <>
      <h1 className="rt-title">Café da manhã</h1>
      <div className="rt-card">
        <span className="rt-ic big"><Utensils size={22} /></span>
        <b>{d.cafeMeal ? 'Registrado' : d.cafe?.name}</b>
        <span className="small">{items.map((i) => `${d.foods.find((f) => f.id === i.foodId)?.name ?? '?'} ${i.portion}`).join(', ')}</span>
        {t.kcal > 0 && <span className="small rt-macros"><b>{fmt(t.kcal)}</b> kcal · <b>{fmt(t.p)}</b> g de proteína</span>}
      </div>
      {d.cafeMeal || !d.cafe
        ? <Foot primary="Seguir" onPrimary={() => onDone()} onSkip={() => nav('/alimentacao/refeicao?m=cafe')} skipLabel="Editar o café" testId="rt-cafe" />
        : <Foot primary="Comi isso" onPrimary={async () => { await mealFromTemplate(d.cafe as any, date, 'cafe', true); onDone('Café da manhã'); }} onSkip={() => nav('/alimentacao/refeicao?m=cafe')} skipLabel="Comi outra coisa" testId="rt-cafe" />}
    </>
  );
}

function TrainingStep({ date, d, onDone }: { date: DateKey; d: RitualData; onDone: (n?: string) => void }) {
  const open = d.training.filter((t) => !t.done && !t.skipped);
  return (
    <>
      <h1 className="rt-title">O treino de hoje</h1>
      {d.training.map((t) => (
        <div key={t.id} className="rt-card">
          <span className="rt-ic big"><Dumbbell size={22} /></span>
          <b>{t.name}</b>
          <span className="small">{t.time ? `${t.time} · ` : ''}{t.duration} min · {t.intensity}{t.done ? ' · feito' : t.skipped ? ' · fica para outro dia' : ''}</span>
          {t.steps?.length ? <div className="rt-steps-bar">{t.steps.map((st, k) => <i key={k} style={{ flex: st.minutes, height: `${Math.max(18, Math.min(100, st.pct))}%` }} />)}</div> : null}
        </div>
      ))}
      <Foot primary="Combinado" onPrimary={() => onDone(d.training.map((t) => t.name).join(', '))}
        onSkip={open.length ? async () => { for (const t of open) await skipPlanned(date, 'training', t.id); onDone('Treino fica para outro dia'); } : undefined} skipLabel="Hoje não vai dar" testId="rt-train" />
    </>
  );
}

function TomorrowStep({ d, onDone }: { d: RitualData; onDone: () => void }) {
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

function RitualDone({ p, notes, onClose, onEdit, d }: { p: P; notes: string[]; onClose: () => void; onEdit: () => void; d: RitualData }) {
  useEffect(() => { haptic(30); }, []);
  const line = p === 'am'
    ? d.training.length ? 'O dia está montado. Agora é executar no seu ritmo.' : 'O dia está montado. Constância é isso: o básico bem feito, todo dia.'
    : 'Dia fechado. O que ficou registrado hoje vira leitura amanhã.';
  const missing = d.steps.filter((s) => !d.done[s]);
  return (
    <div className="rt-done" data-testid="ritual-done">
      <div className="rt-ring">
        <svg viewBox="0 0 120 120" className="rt-ring-svg" aria-hidden><circle cx="60" cy="60" r="52" className="rt-ring-bg" /><circle cx="60" cy="60" r="52" className="rt-ring-fg" style={{ strokeDashoffset: 327 * (1 - d.count / d.steps.length) }} /></svg>
        <Check size={44} strokeWidth={3} className="rt-ring-check" />
        {!missing.length && Array.from({ length: 10 }, (_, k) => <i key={k} className="rt-spark" style={{ ['--a' as any]: `${k * 36}deg` }} />)}
      </div>
      <h1 className="rt-title" style={{ textAlign: 'center' }}>{missing.length ? `${d.count} de ${d.steps.length} feitos` : p === 'am' ? 'Manhã pronta' : 'Boa noite'}</h1>
      <p className="rt-sub" style={{ textAlign: 'center' }}>{missing.length ? `Falta: ${missing.map((s) => LABEL[s].toLowerCase()).join(', ')}. Dá para voltar quando quiser pelo Hoje.` : line}</p>
      {notes.length > 0 && <div className="chips" style={{ justifyContent: 'center' }}>{notes.map((x) => <span key={x} className="chip on rt-done-chip"><Check size={13} /> {x}</span>)}</div>}
      <div className="rt-foot">
        <button className="rt-primary" onClick={onClose} data-testid="rt-close">Voltar ao dia <Sparkles size={16} /></button>
        <button className="link rt-skip" onClick={onEdit}>Revisar o que registrei</button>
      </div>
    </div>
  );
}

/** No Hoje: o ritual da hora em destaque enquanto não termina, e os dois sempre à mão para retomar ou editar. */
export function RitualBar({ date }: { date: DateKey }) {
  const nav = useNavigate();
  const am = useRitual(date, 'am');
  const pm = useRitual(date, 'pm');
  const [h, setH] = useState(new Date().getHours());
  useEffect(() => { const t = setInterval(() => setH(new Date().getHours()), 60_000); return () => clearInterval(t); }, []);
  if (date !== todayKey() || !am || !pm) return null;
  const active: P | undefined = h >= 4 && h < 12 && !am.complete ? 'am' : (h >= 18 || h < 4) && !pm.complete ? 'pm' : undefined;
  const r = active === 'am' ? am : pm;
  return (
    <>
      {active && (
        <button className={`ritual-hero rh-${active}`} onClick={() => nav(`/ritual/${active}`)} data-testid={`ritual-hero-${active}`}>
          <span className="rh-orb" aria-hidden />
          <span className="grow">
            <span className="rh-kicker">{r.count ? `Continuar · ${r.count} de ${r.steps.length}` : active === 'am' ? 'Começar o dia' : 'Fechar o dia'}</span>
            <b className="rh-title">{active === 'am' ? 'Ritual da manhã' : 'Ritual da noite'}</b>
            <span className="rh-sub">{r.steps.map((s) => LABEL[s].toLowerCase()).join(', ')}.</span>
            <span className="rh-dots" aria-hidden>{r.steps.map((s) => <i key={s} className={r.done[s] ? 'on' : ''} />)}</span>
          </span>
          <span className="rh-go"><ChevronRight size={22} /></span>
        </button>
      )}
      <div className={`ritual-pills ${active ? 'one' : ''}`} data-testid="ritual-pills">
        {(['am', 'pm'] as const).filter((k) => k !== active).map((k) => {
          const x = k === 'am' ? am : pm;
          return (
            <button key={k} className={`ritual-pill rp-${k} ${x.complete ? 'done' : ''}`} onClick={() => nav(`/ritual/${k}`)} data-testid={`ritual-pill-${k}`}>
              <span className="rp-ring" style={{ ['--p' as any]: `${(x.count / x.steps.length) * 360}deg` }}>{x.complete ? <Check size={14} strokeWidth={3} /> : k === 'am' ? <Sunrise size={14} /> : <Moon size={14} />}</span>
              <span className="grow"><span className="rp-k">Ritual</span><b>{k === 'am' ? 'Manhã' : 'Noite'}</b><span className="small num rp-st">{x.complete ? 'Feito · rever' : `${x.count} de ${x.steps.length}`}</span></span>
            </button>
          );
        })}
      </div>
    </>
  );
}
