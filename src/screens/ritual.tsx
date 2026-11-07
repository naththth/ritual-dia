// Rituais guiados. Manhã (antes do trabalho): como acordou, o básico, uma pergunta e o foco, a marca e a leitura do dia.
// Noite: como foi, o dia em resumo, uma pergunta e o amanhã. Não repete as áreas: lê o que elas registraram e pergunta o que elas não perguntam.
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { Bath, Check, ChevronRight, Coffee, Dumbbell, Moon, Pill, RefreshCw, Sparkles, Sun, Sunrise, Target, Utensils, X } from 'lucide-react';
import { useAll, useByDate, useRecord, useSettings } from '../db/hooks';
import { addDays, todayKey, WEEKDAY_LONG, isoWeekday, type DateKey } from '../lib/dates';
import { planFor, plannedFood, suggestTasks, tasksForDay, trainingDay } from '../domain/rules';
import { planTask } from '../domain/actions';
import { fmt } from '../domain/nutrition';
import { dosesFor, toMin, CONTEXT_TAGS, SLIDERS, WAKE_OPTIONS, MOOD_LABEL, type Dose } from '../domain/mind';
import { loadMind } from '../domain/mindload';
import { markDose, saveCheckin } from '../domain/mindload';
import { bedFor, sleepPlan, wakeFor } from '../domain/sleep';
import { brandToday, questionFor, ritualId, saveRitual } from '../domain/ritual';
import { agendaSig, askRitual, type RitualAgenda } from '../domain/ritualai';
import { Chip } from '../ui/ui';
import { haptic, toast } from '../state/store';
import type { MoodCheckin, RitualDay, Task } from '../db/types';

type P = 'am' | 'pm';
type StepId = 'acordar' | 'basico' | 'foco' | 'marca' | 'saida' | 'comofoi' | 'resumo' | 'reflexao' | 'amanha';
const LABEL: Record<StepId, string> = { acordar: 'Como acordei', basico: 'O básico', foco: 'Foco', marca: 'Marca', saida: 'O dia', comofoi: 'Como foi', resumo: 'Resumo', reflexao: 'Reflexão', amanha: 'Amanhã' };
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const short = (n: string) => n.split(/[ (]/)[0];

/** Dados do dia, os passos do ritual e o que já foi feito em cada um (vale para retomar e para editar). */
export function useRitual(date: DateKey, p: P) {
  const settings = useSettings();
  const plans = useAll('plan');
  const tmpls = useAll('wtemplate');
  const mtmpls = useAll('mtemplate');
  const foods = useAll('food');
  const intakes = useAll('intake');
  const tasks = useAll('task');
  const slogs = useAll('suggestion');
  const posts = useAll('post');
  const logs = useByDate('intakelog', date);
  const meals = useByDate('meal', date);
  const skips = useByDate('skip', date);
  const extras = useByDate('extra', date);
  const extrasTomorrow = useByDate('extra', addDays(date, 1));
  const skipsTomorrow = useByDate('skip', addDays(date, 1));
  const workoutsTomorrow = useByDate('workout', addDays(date, 1));
  const workouts = useByDate('workout', date);
  const moods = useByDate('mood', date);
  const rec = useRecord<'ritual'>(ritualId(date, p));
  const prev = useRecord<'ritual'>(ritualId(addDays(date, -1), 'pm'));
  const well = useRecord<'wellness'>(`wellness:${date}`);
  if (!settings || !plans || !tmpls || !mtmpls || !foods || !intakes || !tasks || !slogs || !posts || !logs || !meals || !skips || !extras || !extrasTomorrow || !skipsTomorrow || !workoutsTomorrow || !workouts || !moods || rec === undefined || prev === undefined || well === undefined) return undefined;
  const half = (d: Dose) => (toMin(d.slot) ?? 0) < 12 * 60;
  const doses = dosesFor(intakes, logs, date).filter((d) => (p === 'am' ? half(d) : !half(d)));
  const cafeId = plannedFood(planFor(plans, 'food', date), date, extras).cafe;
  const cafe = cafeId ? mtmpls.find((t) => t.id === cafeId) : undefined;
  const cafeMeal = meals.find((m) => m.mealType === 'cafe' && m.items.length);
  // Mesma regra da aba Treino: o que foi trocado por outro treino some; o pulado de fato fica marcado.
  const training = trainingDay(planFor(plans, 'training', date), date, extras, skips, workouts, tmpls)
    .filter((s) => s.status !== 'trocado')
    .map((s) => ({ s, t: tmpls.find((t) => t.id === s.id) }))
    .filter((x): x is { s: typeof x.s; t: NonNullable<typeof x.t> } => !!x.t && x.t.modalityId !== 'mod:descanso')
    .map(({ s, t }) => ({ ...t, skipped: s.status === 'pulado', done: s.status === 'feito' }));
  const tomorrow = addDays(date, 1);
  // Amanhã: só o que continua valendo (sem o que foi trocado ou já marcado como "hoje não").
  const tomorrowTraining = trainingDay(planFor(plans, 'training', tomorrow), tomorrow, extrasTomorrow, skipsTomorrow, workoutsTomorrow, tmpls)
    .filter((s) => s.status === 'pendente' || s.status === 'feito')
    .map((s) => tmpls.find((t) => t.id === s.id)).filter((t): t is NonNullable<typeof t> => !!t && t.modalityId !== 'mod:descanso');
  const sp = sleepPlan(settings.reminders);
  const mood = moods.find((m) => m.period === p);
  const r = rec ?? undefined;
  const seen = r?.seen ?? [];
  const brand = brandToday(settings, posts, date);
  const dayTasks = tasksForDay(tasks, date).filter((t) => t.status !== 'concluida');
  const suggested = suggestTasks(tasks, slogs, date, {}, 3).filter((t) => !dayTasks.some((x) => x.id === t.id));
  const steps: StepId[] = p === 'am'
    ? ['acordar', 'basico', 'foco', 'saida']
    : ['comofoi', 'resumo', 'reflexao', 'amanha'];
  const done: Partial<Record<StepId, boolean>> = {};
  for (const s of steps) done[s] = s === 'acordar' || s === 'comofoi' ? !!mood : seen.includes(s);
  const count = steps.filter((s) => done[s]).length;
  return { settings, foods, doses, cafe, cafeMeal, training, tomorrow, tomorrowTraining, sp, mood, r, prev: prev ?? undefined, well: well ?? undefined, brand, posts, tasks, dayTasks, suggested, workouts, steps, done, count, complete: count === steps.length };
}
type RitualData = NonNullable<ReturnType<typeof useRitual>>;

export function RitualScreen() {
  const { p: raw } = useParams();
  const p: P = raw === 'pm' ? 'pm' : 'am';
  const nav = useNavigate();
  const date = todayKey();
  const d = useRitual(date, p);
  const [cur, setCur] = useState<StepId | 'fim' | null>(null);
  const [dir, setDir] = useState<'f' | 'b'>('f');
  // Abre no primeiro passo que falta; tudo feito, abre do começo para revisar.
  useEffect(() => { if (d && cur === null) setCur(d.steps.find((s) => !d.done[s]) ?? d.steps[0]); }, [d, cur]);
  if (!d || cur === null) return <div className={`ritual r-${p}`} />;
  const idx = cur === 'fim' ? d.steps.length : Math.max(0, d.steps.indexOf(cur));
  const go = (k: number) => { setDir(k >= idx ? 'f' : 'b'); setCur(k >= d.steps.length ? 'fim' : d.steps[k]); };
  const next = async (step?: StepId) => { haptic(); if (step) await saveRitual(date, p, {}, step); go(idx + 1); };
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
        {cur === 'fim' ? <RitualDone p={p} d={d} onClose={close} onEdit={() => go(0)} /> : (
          <div key={cur} className={`rt-step ${dir === 'f' ? 'in-f' : 'in-b'}`}>
            <span className="rt-count">{idx + 1} de {d.steps.length} · {LABEL[cur]}{d.done[cur] ? ' · feito' : ''}</span>
            {cur === 'acordar' && <CheckinStep p="am" date={date} d={d} onDone={() => next()} />}
            {cur === 'comofoi' && <CheckinStep p="pm" date={date} d={d} onDone={() => next()} />}
            {cur === 'basico' && <BasicsStep date={date} d={d} onDone={() => next('basico')} />}
            {cur === 'foco' && <FocusStep date={date} d={d} onDone={() => next('foco')} />}
            {cur === 'saida' && <DayStep date={date} d={d} onDone={() => next('saida')} />}
            {cur === 'resumo' && <SummaryStep date={date} d={d} onDone={() => next('resumo')} />}
            {cur === 'reflexao' && <ReflectStep date={date} d={d} onDone={() => next('reflexao')} />}
            {cur === 'amanha' && <TomorrowStep date={date} d={d} onDone={() => next('amanha')} />}
            {idx > 0 && <button className="link small rt-back" onClick={() => go(idx - 1)}>Voltar</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function Foot({ primary, onPrimary, onSkip, skipLabel = 'Pular', testId, busy }: { primary: string; onPrimary: () => void; onSkip?: () => void; skipLabel?: string; testId?: string; busy?: boolean }) {
  return (
    <div className="rt-foot">
      <button className="rt-primary" onClick={onPrimary} disabled={busy} data-testid={testId ?? 'rt-next'}>{primary} <ChevronRight size={18} /></button>
      {onSkip && <button className="link rt-skip" onClick={onSkip}>{skipLabel}</button>}
    </div>
  );
}

function Dots({ label, value, onChange }: { label: string; value?: number; onChange: (n?: number) => void }) {
  return (
    <div className="rt-slider"><span>{label}</span>
      <div className="rt-dots">{[0, 1, 2, 3, 4].map((n) => <button key={n} aria-label={`${label} ${n}`} className={(value ?? -1) >= n ? 'on' : ''} onClick={() => onChange(value === n ? undefined : n)} />)}</div>
    </div>
  );
}

/* ---------- Como acordei / Como foi ---------- */
function CheckinStep({ p, date, d, onDone }: { p: P; date: DateKey; d: RitualData; onDone: () => void }) {
  const [st, setSt] = useState<Partial<MoodCheckin>>(d.mood ?? { tags: [] });
  const set = (x: Partial<MoodCheckin>) => setSt((y) => ({ ...y, ...x }));
  const w = d.well;
  const save = async () => {
    await saveCheckin(date, p, { mood: st.mood, energy: st.energy, irritability: st.irritability, anxiety: st.anxiety, racing: st.racing, wake: st.wake, tags: st.tags ?? [], note: d.mood?.note });
    onDone();
  };
  const carry = p === 'am' ? (d.prev?.ai?.para_amanha || d.prev?.a) : undefined;
  return (
    <>
      <h1 className="rt-title">{p === 'am' ? 'Bom dia. Como você acordou?' : 'Como foi o dia?'}</h1>
      {p === 'am' && w?.sleepH ? <p className="rt-sub">O relógio marcou {w.sleepH.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h de sono{w.sleepStart ? `, de ${w.sleepStart} a ${w.sleepEnd}` : ''}.</p> : null}
      {carry && <div className="rt-carry" data-testid="rt-carry"><span className="rt-carry-k">Do seu fechamento de ontem</span>{carry}</div>}
      {p === 'am' && <div className="chips rt-chips">{WAKE_OPTIONS.map((o) => <Chip key={o.id} on={st.wake === o.id} onClick={() => set({ wake: st.wake === o.id ? undefined : o.id })} testId={`rt-wake-${o.id}`}>{o.label}</Chip>)}</div>}
      <span className="rt-label">Humor {p === 'am' ? 'agora' : 'do dia'}</span>
      <div className="mood-scale rt-mood">{[-3, -2, -1, 0, 1, 2, 3].map((n) => <button key={n} className={`ms-btn ${st.mood === n ? 'on' : ''}`} onClick={() => { haptic(8); set({ mood: st.mood === n ? undefined : n }); }} data-testid={`rt-mood-${n}`}>{signed(n)}</button>)}</div>
      <p className="rt-hint">{st.mood != null ? MOOD_LABEL[String(st.mood)] : '0 é o seu normal'}</p>
      <div className="rt-sliders">
        {(p === 'am' ? SLIDERS.filter((s) => s.key === 'energy' || s.key === 'anxiety') : SLIDERS).map((s) => <Dots key={s.key} label={s.label} value={(st as any)[s.key]} onChange={(n) => set({ [s.key]: n } as any)} />)}
      </div>
      {p === 'pm' && <>
        <span className="rt-label">O que marcou o dia</span>
        <div className="chips rt-chips">{CONTEXT_TAGS.map((t) => <Chip key={t} on={st.tags?.includes(t)} onClick={() => set({ tags: st.tags?.includes(t) ? st.tags.filter((x) => x !== t) : [...(st.tags ?? []), t] })}>{t}</Chip>)}</div>
      </>}
      <Foot primary={d.mood ? 'Salvar e seguir' : 'Seguir'} onPrimary={() => void save()} testId="rt-checkin-save" />
    </>
  );
}

/* ---------- O básico: remédios, banho e café, um toque cada ---------- */
function Tile({ on, icon, title, sub, onClick, testId }: { on: boolean; icon: React.ReactNode; title: string; sub?: string; onClick: () => void; testId: string }) {
  return (
    <button className={`rt-tile ${on ? 'on' : ''}`} onClick={() => { haptic(10); onClick(); }} aria-pressed={on} data-testid={testId}>
      <span className="rt-tile-ic">{on ? <Check size={20} strokeWidth={3} /> : icon}</span>
      <b>{title}</b>
      {sub && <span className="small">{sub}</span>}
    </button>
  );
}

function DoseTile({ date, doses, label }: { date: DateKey; doses: Dose[]; label: string }) {
  const nav = useNavigate();
  const all = doses.length > 0 && doses.every((x) => x.log);
  // Marca só o que falta. Desfazer é na Mente, onde está o registro de cada tomada.
  const toggle = async () => {
    if (all) { toast('Já registrado na Mente', () => nav('/mente/tomo'), 'default', { label: 'Ajustar' }); return; }
    for (const x of doses.filter((y) => !y.log)) await markDose(x.item, date, x.slot, 'tomei');
  };
  return <Tile on={all} icon={<Pill size={20} />} title={label} sub={doses.map((x) => short(x.item.alias?.trim() || x.item.name)).join(', ')} onClick={() => void toggle()} testId="rt-basic-doses" />;
}

function BasicsStep({ date, d, onDone }: { date: DateKey; d: RitualData; onDone: () => void }) {
  const nav = useNavigate();
  const b = d.r?.basics ?? {};
  // O ritual só anota que você comeu; o que foi o café é registrado na Alimentação, nunca presumido pelo plano.
  const cafeOn = !!d.cafeMeal || !!b.cafe;
  const toggleCafe = () => {
    if (d.cafeMeal) { toast('Já registrado na Alimentação', () => nav('/alimentacao/refeicao?m=cafe'), 'default', { label: 'Ver' }); return; }
    void saveRitual(date, 'am', { basics: { ...b, cafe: !b.cafe } });
  };
  return (
    <>
      <h1 className="rt-title">Antes de sair</h1>
      <p className="rt-sub">Um toque em cada. Aqui só marca que foi feito; o detalhe fica nas outras áreas.</p>
      <div className="rt-tiles">
        {d.doses.length > 0 && <DoseTile date={date} doses={d.doses} label="Remédios" />}
        <Tile on={!!b.banho} icon={<Bath size={20} />} title="Banho" onClick={() => void saveRitual(date, 'am', { basics: { ...b, banho: !b.banho } })} testId="rt-basic-banho" />
        <Tile on={cafeOn} icon={<Coffee size={20} />} title="Café da manhã" sub={d.cafeMeal ? 'Na Alimentação' : b.cafe ? 'Falta dizer o quê' : undefined} onClick={toggleCafe} testId="rt-basic-cafe" />
      </div>
      {!d.cafeMeal && <button className="link small" style={{ alignSelf: 'center', marginTop: 12 }} onClick={() => nav('/alimentacao/refeicao?m=cafe')} data-testid="rt-cafe-log">Registrar o que comi</button>}
      <Foot primary="Seguir" onPrimary={onDone} testId="rt-basics" />
    </>
  );
}

/* ---------- Pergunta e foco ---------- */
function FocusStep({ date, d, onDone }: { date: DateKey; d: RitualData; onDone: () => void }) {
  const ctx = { sleepH: d.well?.sleepH, mood: d.mood?.mood, energy: d.mood?.energy };
  const [shift, setShift] = useState(0);
  const q = shift === 0 && d.r?.q ? d.r.q : questionFor('am', date, ctx, shift);
  const [a, setA] = useState(d.r?.a ?? '');
  const [focus, setFocus] = useState<string[]>(d.r?.focus ?? []);
  const options: (Task & { sugg?: boolean })[] = [...d.dayTasks, ...d.suggested.map((t) => ({ ...t, sugg: true }))].slice(0, 6);
  const toggle = (id: string) => setFocus((f) => (f.includes(id) ? f.filter((x) => x !== id) : f.length >= 3 ? f : [...f, id]));
  const save = async () => {
    for (const t of options) if (t.sugg && focus.includes(t.id)) await planTask(t, date);
    await saveRitual(date, 'am', { q, a: a.trim() || undefined, focus });
    onDone();
  };
  return (
    <>
      <h1 className="rt-title rt-q" data-testid="rt-question">{q}</h1>
      <button className="link small rt-shuffle" onClick={() => setShift((x) => x + 1)}><RefreshCw size={13} /> Outra pergunta</button>
      <textarea rows={3} className="rt-note rt-answer" value={a} onChange={(e) => setA(e.target.value)} placeholder="Escreva do seu jeito. A leitura do dia e as especialistas levam isso em conta." data-testid="rt-answer" />
      {options.length > 0 && <>
        <span className="rt-label">Até 3 para segurar o dia</span>
        <div className="rt-list">
          {options.map((t) => {
            const on = focus.includes(t.id);
            return (
              <button key={t.id} className={`rt-item ${on ? 'on' : ''}`} onClick={() => toggle(t.id)} data-testid="rt-focus">
                <span className="rt-ic"><Target size={18} /></span>
                <span className="grow"><b>{t.title}</b><br /><span className="small">{t.sugg ? 'Sugestão para hoje' : 'Já está no seu dia'}{t.minutes ? ` · ${t.minutes} min` : ''}</span></span>
                <span className={`rt-check ${on ? 'on' : ''}`}>{on && <Check size={16} strokeWidth={3} />}</span>
              </button>
            );
          })}
        </div>
      </>}
      <Foot primary="Seguir" onPrimary={() => void save()} testId="rt-focus-save" />
    </>
  );
}

/* ---------- Agenda que vai para a IA e aparece no fim da manhã ---------- */
function agendaFor(d: RitualData, date: DateKey): RitualAgenda {
  const t = d.settings.targets;
  return {
    treinos: d.training.map((t) => ({ nome: t.name, horario: t.time, minutos: t.duration, intensidade: t.intensity, feito: t.done, pulado: t.skipped })),
    tarefas: d.dayTasks.map((t) => t.title),
    foco: d.r?.focus?.map((id) => d.tasks.find((t) => t.id === id)?.title).filter((x): x is string => !!x),
    deitar: d.sp ? bedFor(d.sp, date) : undefined,
    acordar_amanha: d.sp ? wakeFor(d.sp, d.tomorrow) : undefined,
    treinos_amanha: d.tomorrowTraining.map((t) => ({ nome: t.name, horario: t.time, minutos: t.duration })),
    metas: t ? { kcal: t.kcal, proteina: t.p } : undefined
  };
}

function useAI(date: DateKey, p: P, d: RitualData) {
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<RitualDay['ai']>(d.r?.ai);
  const run = async () => { setBusy(true); setAi(await askRitual(date, p, agendaFor(d, date))); setBusy(false); };
  // Pede de novo quando ela mudou alguma resposta depois da última leitura.
  // Também quando os treinos de hoje ou de amanhã mudaram desde a leitura (troca combinada com a treinadora, "hoje não"), enquanto o dia ainda está valendo.
  useEffect(() => {
    const stale = !!d.r?.ai && !d.r.ai.offline && date >= addDays(todayKey(), -1) && d.r.ai.agenda !== agendaSig(agendaFor(d, date));
    if (!d.r?.ai || (d.r.ai.at ?? 0) < d.r.updatedAt - 2000 || stale) void run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { ai, busy, run };
}

function DayStep({ date, d, onDone }: { date: DateKey; d: RitualData; onDone: () => void }) {
  const { ai, busy, run } = useAI(date, 'am', d);
  const a = agendaFor(d, date);
  return (
    <>
      <h1 className="rt-title">Seu dia</h1>
      <div className={`rt-quote ${busy ? 'loading' : ''}`} data-testid="rt-phrase">{busy && !ai ? <span className="shimmer-line" /> : ai?.frase}</div>
      {ai?.foco && <p className="rt-read" data-testid="rt-foco">{ai.foco}</p>}
      {ai?.atencao && <p className="rt-attn">{ai.atencao}</p>}
      <div className="rt-list" style={{ marginTop: 6 }}>
        {d.training.map((t) => <div key={t.id} className="rt-item"><span className="rt-ic"><Dumbbell size={18} /></span><span className="grow"><b>{t.name}</b><br /><span className="small">{t.time ? `${t.time} · ` : ''}{t.duration} min{t.done ? ' · feito' : t.skipped ? ' · fica para outro dia' : ''}</span></span></div>)}
        {a.foco?.map((x) => <div key={x} className="rt-item"><span className="rt-ic"><Target size={18} /></span><span className="grow"><b>{x}</b></span></div>)}
        {a.deitar && <div className="rt-item"><span className="rt-ic"><Moon size={18} /></span><span className="grow"><b>Deitar às {a.deitar}</b></span></div>}
      </div>
      {!busy && <button className="link small" style={{ alignSelf: 'center', marginTop: 10 }} onClick={() => void run()}><RefreshCw size={13} style={{ verticalAlign: '-2px' }} /> Outra leitura</button>}
      <Foot primary="Começar o dia" onPrimary={onDone} testId="rt-start" />
    </>
  );
}

/* ---------- Noite: o dia em resumo ---------- */
function SummaryStep({ date, d, onDone }: { date: DateKey; d: RitualData; onDone: () => void }) {
  const nav = useNavigate();
  const m = useLiveQuery(() => loadMind(date, 1), [date]);
  const day = m?.days.find((x) => x.date === date);
  const open = d.training.filter((t) => !t.done && !t.skipped);
  const tr = d.r?.trained;
  const t = d.settings.targets;
  const done = d.tasks.filter((x) => x.completedDate === date).length;
  const planned = tasksForDay(d.tasks, date).length;
  // A resposta fica no ritual. Registrar ou tirar o treino do dia é na área Treino, com os dados reais.
  const answer = (v: 'sim' | 'nao' | 'outro') => void saveRitual(date, 'pm', { trained: d.r?.trained === v ? undefined : v });
  return (
    <>
      <h1 className="rt-title">O dia em resumo</h1>
      {d.training.length > 0 && (
        <div className="rt-card" data-testid="rt-sum-train">
          <span className="rt-sum-k"><Dumbbell size={15} /> Treino</span>
          <b>{d.training.map((x) => x.name).join(' + ')}</b>
          {open.length ? <>
            <span className="small">Conseguiu treinar?</span>
            <div className="chips" style={{ marginTop: 6 }}>
              <Chip on={tr === 'sim'} onClick={() => answer('sim')} testId="rt-trained-sim">Treinei</Chip>
              <Chip on={tr === 'nao'} onClick={() => answer('nao')} testId="rt-trained-nao">Não deu</Chip>
              <Chip on={tr === 'outro'} onClick={() => answer('outro')}>Fiz outra coisa</Chip>
            </div>
            {(tr === 'sim' || tr === 'outro') && <button className="link small" style={{ marginTop: 8, alignSelf: 'flex-start' }} onClick={() => nav('/treino')} data-testid="rt-train-log">Registrar no Treino</button>}
          </> : <span className="small">{d.training.every((x) => x.done) ? `Feito${day?.trainMin ? ` · ${day.trainMin} min` : ''}` : 'Ficou para outro dia'}</span>}
        </div>
      )}
      <div className="rt-sum-grid">
        <div className="rt-sum"><span className="rt-sum-k"><Utensils size={15} /> Comida</span><b className="num">{day?.mealsLogged ? `${fmt(day.kcal ?? 0)}` : '—'}</b><span className="small">{day?.mealsLogged ? `kcal${t?.kcal ? ` de ${fmt(t.kcal)}` : ''} · ${fmt(day.protein ?? 0)} g prot.` : 'sem registro'}</span></div>
        <div className="rt-sum"><span className="rt-sum-k"><Coffee size={15} /> Café</span><b className="num">{day?.caffeineMg ? `${day.caffeineMg}` : '0'}</b><span className="small">mg{day?.lastCaffeine ? ` · último ${day.lastCaffeine}` : ''}</span></div>
        <div className="rt-sum"><span className="rt-sum-k"><Target size={15} /> Tarefas</span><b className="num">{done}{planned ? ` de ${planned}` : ''}</b><span className="small">concluídas</span></div>
        <div className="rt-sum"><span className="rt-sum-k"><Sun size={15} /> Sono</span><b className="num">{day?.sleepH ? day.sleepH.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}</b><span className="small">h na noite passada</span></div>
      </div>
      {d.doses.length > 0 && <div className="rt-tiles one"><DoseTile date={date} doses={d.doses} label="Remédios da noite" /></div>}
      <Foot primary="Seguir" onPrimary={onDone} testId="rt-summary" />
    </>
  );
}

function ReflectStep({ date, d, onDone }: { date: DateKey; d: RitualData; onDone: () => void }) {
  const [shift, setShift] = useState(0);
  const q = shift === 0 && d.r?.q ? d.r.q : questionFor('pm', date, { mood: d.mood?.mood, energy: d.mood?.energy }, shift);
  const [a, setA] = useState(d.r?.a ?? '');
  const save = async () => {
    await saveRitual(date, 'pm', { q, a: a.trim() || undefined });
    onDone();
  };
  return (
    <>
      <h1 className="rt-title rt-q" data-testid="rt-question">{q}</h1>
      <button className="link small rt-shuffle" onClick={() => setShift((x) => x + 1)}><RefreshCw size={13} /> Outra pergunta</button>
      <textarea rows={4} className="rt-note rt-answer" value={a} onChange={(e) => setA(e.target.value)} placeholder="O que você escrever aqui entra na leitura de amanhã." data-testid="rt-answer" />
      <Foot primary="Seguir" onPrimary={() => void save()} testId="rt-reflect-save" />
    </>
  );
}

function TomorrowStep({ date, d, onDone }: { date: DateKey; d: RitualData; onDone: () => void }) {
  const { ai, busy } = useAI(date, 'pm', d);
  const bed = d.sp ? bedFor(d.sp, date) : undefined;
  const wake = d.sp ? wakeFor(d.sp, d.tomorrow) : undefined;
  return (
    <>
      <h1 className="rt-title">Amanhã, {WEEKDAY_LONG[isoWeekday(d.tomorrow)]}</h1>
      {(busy && !ai) ? <div className="rt-quote loading"><span className="shimmer-line" /></div> : <>
        {ai?.fechamento && <p className="rt-read" data-testid="rt-close-read">{ai.fechamento}</p>}
        {ai?.para_amanha && <div className="rt-carry" data-testid="rt-tomorrow-ai"><span className="rt-carry-k">Para amanhã</span>{ai.para_amanha}</div>}
        {!ai?.fechamento && ai?.frase && <div className="rt-quote">{ai.frase}</div>}
      </>}
      <div className="rt-list" style={{ marginTop: 6 }}>
        {d.tomorrowTraining.length ? d.tomorrowTraining.map((t) => (
          <div key={t.id} className="rt-item"><span className="rt-ic"><Dumbbell size={18} /></span><span className="grow"><b>{t.name}</b><br /><span className="small">{t.time ? `${t.time} · ` : ''}{t.duration} min</span></span></div>
        )) : <div className="rt-item"><span className="rt-ic"><Sun size={18} /></span><span className="grow"><b>Sem treino no plano</b><br /><span className="small">Dia de recuperação.</span></span></div>}
        {wake && <div className="rt-item"><span className="rt-ic"><Sunrise size={18} /></span><span className="grow"><b>Acordar às {wake}</b></span></div>}
      </div>
      {bed && <div className="rt-bed"><Moon size={20} /><span><b>Deitar às {bed}</b><br /><span className="small">Tela longe e luz baixa. É o que mais protege o humor e o sono.</span></span></div>}
      <Foot primary="Boa noite" onPrimary={onDone} testId="rt-night" />
    </>
  );
}

function RitualDone({ p, onClose, onEdit, d }: { p: P; onClose: () => void; onEdit: () => void; d: RitualData }) {
  useEffect(() => { haptic(30); }, []);
  const missing = d.steps.filter((s) => !d.done[s]);
  const chips = [d.mood?.mood != null ? `Humor ${signed(d.mood.mood)}` : undefined, d.r?.a ? 'Pergunta respondida' : undefined, d.r?.focus?.length ? `${d.r.focus.length} de foco` : undefined, d.r?.trained === 'sim' ? 'Treinou' : undefined].filter((x): x is string => !!x);
  return (
    <div className="rt-done" data-testid="ritual-done">
      <div className="rt-ring">
        <svg viewBox="0 0 120 120" className="rt-ring-svg" aria-hidden><circle cx="60" cy="60" r="52" className="rt-ring-bg" /><circle cx="60" cy="60" r="52" className="rt-ring-fg" style={{ strokeDashoffset: 327 * (1 - d.count / d.steps.length) }} /></svg>
        <Check size={44} strokeWidth={3} className="rt-ring-check" />
        {!missing.length && Array.from({ length: 10 }, (_, k) => <i key={k} className="rt-spark" style={{ ['--a' as any]: `${k * 36}deg` }} />)}
      </div>
      <h1 className="rt-title" style={{ textAlign: 'center' }}>{missing.length ? `${d.count} de ${d.steps.length} feitos` : p === 'am' ? 'Manhã pronta' : 'Boa noite'}</h1>
      <p className="rt-sub" style={{ textAlign: 'center' }}>{missing.length ? `Falta: ${missing.map((s) => LABEL[s].toLowerCase()).join(', ')}. Dá para voltar quando quiser pelo Hoje.` : p === 'am' ? (d.r?.ai?.frase ?? 'O dia está montado.') : 'O que você escreveu hoje entra na leitura de amanhã.'}</p>
      {chips.length > 0 && <div className="chips" style={{ justifyContent: 'center' }}>{chips.map((x) => <span key={x} className="chip on rt-done-chip"><Check size={13} /> {x}</span>)}</div>}
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
            <span className="rh-sub">{active === 'am' ? 'Antes das 8:30: como acordou, o básico e o foco do dia.' : 'Como foi, o resumo e o que leva para amanhã.'}</span>
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
