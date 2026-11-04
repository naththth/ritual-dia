// Área Mente: check-ins de humor, o que ela toma, café, sono em etapas, painel de 30 dias, avisos e relatório para a consulta.
// A tela abre com PIN; o Hoje mostra só o necessário (avisos, café, tomadas na linha do tempo).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Brain, Coffee, FileText, Lock, Moon, Pill, Plus, Trash2, X, ChevronRight, Eye, Wind, Music, Play, Square, ThumbsUp, ThumbsDown, RefreshCw, HeartHandshake } from 'lucide-react';
import { useAll, useByDate, useByRange, useSettings } from '../db/hooks';
import { create, get, remove, update } from '../db/db';
import { toast } from '../state/store';
import { useSync, signInWithGoogle } from '../sync/sync';
import { addDays, shortLabel, todayKey, type DateKey } from '../lib/dates';
import { Chip, Sheet, Switch, TimeInput, NumberInput, useConfirm } from '../ui/ui';
import { PageHead } from './common';
import { AreaPage } from './areas';
import type { Intake, IntakeType, MoodCheckin, SleepPlan } from '../db/types';
import {
  CONTEXT_TAGS, DEFAULT_DRINKS, MOOD_LABEL, SLIDERS, WAKE_OPTIONS, bedStageProgress, daysLeft, dosesFor, observing, scheduleLabel, slotsFor, toMin, typeLabel,
  moodBaseline, type MindAlert, type MindDay
} from '../domain/mind';
import { addCaffeine, dismissAlert, loadMind, markDose, saveCheckin, unmarkDose } from '../domain/mindload';
import { sleepPlan } from '../domain/sleep';
import { askCare, cachedCare, careFeedback, careSignal, FALLBACK, songLink, type Care } from '../domain/mindcare';
import { aiAvailable } from '../domain/ai';

/* ---------------- PIN ---------------- */
let unlockedAt = 0;
let hiddenAt = 0;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 5 * 60_000) unlockedAt = 0;
  });
}
async function hashPin(pin: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ritual-mente:${pin}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const RESET_KEY = 'mind-pin-reset';

/** Tranca a área com PIN. Sem PIN criado, pede para criar no primeiro acesso. "Esqueci" pede para entrar de novo com Google. */
function PinGate({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const session = useSync((s) => s.session);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [ok, setOk] = useState(() => unlockedAt > 0);
  const [err, setErr] = useState('');
  const hash = settings?.mind?.pinHash;

  // Volta do login feito para redefinir o PIN: login novo depois do pedido apaga o PIN antigo.
  useEffect(() => {
    let t = 0; try { t = Number(localStorage.getItem(RESET_KEY) || 0); } catch { /* */ }
    const last = session?.user?.last_sign_in_at ? new Date(session.user.last_sign_in_at).getTime() : 0;
    if (t && last > t && hash) {
      void update<'settings'>('settings', { mind: { ...(settings?.mind ?? {}), pinHash: undefined } }).then(() => { try { localStorage.removeItem(RESET_KEY); } catch { /* */ } toast('PIN apagado. Crie um novo.'); });
    }
  }, [session, hash]);

  if (!settings) return null;
  if (ok && hash) return <>{children}</>;
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);
  if (!hash) {
    const create = async () => {
      if (pin.length < 4) { setErr('Use de 4 a 6 números.'); return; }
      if (pin !== pin2) { setErr('Os dois PINs não batem.'); return; }
      await update<'settings'>('settings', { mind: { ...(settings.mind ?? {}), pinHash: await hashPin(pin) } });
      unlockedAt = Date.now(); setOk(true); toast('PIN criado');
    };
    return (
      <section className="block b-paper mind-lock" data-testid="pin-create">
        <Lock size={22} />
        <h2>Crie um PIN para a Mente</h2>
        <p className="small">É a área mais sensível do app. O PIN fica só com você: é guardado cifrado e pedido de novo depois de 5 minutos fora do app.</p>
        <input inputMode="numeric" type="password" autoComplete="new-password" placeholder="PIN de 4 a 6 números" value={pin} onChange={(e) => { setPin(digits(e.target.value)); setErr(''); }} data-testid="pin-new" />
        <input inputMode="numeric" type="password" autoComplete="new-password" placeholder="Repita o PIN" value={pin2} onChange={(e) => { setPin2(digits(e.target.value)); setErr(''); }} style={{ marginTop: 8 }} data-testid="pin-new2" />
        {err && <p className="small" style={{ color: 'var(--alert)' }}>{err}</p>}
        <button className="btn btn-ink btn-block" style={{ marginTop: 12 }} onClick={create} data-testid="pin-save">Criar PIN e entrar</button>
      </section>
    );
  }
  const check = async (v: string) => {
    setPin(v); setErr('');
    if (v.length >= 4 && (await hashPin(v)) === hash) { unlockedAt = Date.now(); setOk(true); }
    else if (v.length === 6) setErr('PIN incorreto.');
  };
  const forgot = async () => {
    try { localStorage.setItem(RESET_KEY, String(Date.now())); } catch { /* */ }
    if (!session) { await update<'settings'>('settings', { mind: { ...(settings.mind ?? {}), pinHash: undefined } }); toast('PIN apagado. Crie um novo.'); return; }
    toast('Entre de novo com Google para redefinir o PIN.');
    await signInWithGoogle();
  };
  return (
    <section className="block b-paper mind-lock" data-testid="pin-lock">
      <Lock size={22} />
      <h2>Mente</h2>
      <p className="small">Digite o seu PIN.</p>
      <input inputMode="numeric" type="password" autoComplete="off" autoFocus placeholder="PIN" value={pin} onChange={(e) => void check(digits(e.target.value))} data-testid="pin-input" />
      {err && <p className="small" style={{ color: 'var(--alert)' }}>{err}</p>}
      <button className="link small" style={{ marginTop: 12 }} onClick={forgot}>Esqueci o PIN</button>
    </section>
  );
}

/* ---------------- Dados ---------------- */
export function useMind() {
  return useLiveQuery(() => loadMind(todayKey()), []);
}

/* ---------------- Avisos ---------------- */
function AlertCard({ a, compact }: { a: MindAlert; compact?: boolean }) {
  const nav = useNavigate();
  return (
    <div className={`mind-alert ${a.level === 'importante' ? 'ma-imp' : 'ma-att'}`} data-testid={`alert-${a.id}`}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <AlertTriangle size={18} style={{ flex: '0 0 auto', marginTop: 2 }} />
        <div className="grow">
          <span className="ma-kicker">{a.level === 'importante' ? 'Importante' : 'Atenção'}</span>
          <b className="ma-title">{a.title}</b>
          {!compact && <p className="ma-text">{a.text}</p>}
          <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
            {compact && <button className="pill-act pa-ghost" style={{ minHeight: 34 }} onClick={() => nav('/mente')}>Ver</button>}
            {!compact && a.action && <button className="pill-act pa-ghost" style={{ minHeight: 34 }} onClick={() => nav(a.action!.to)}>{a.action.label}</button>}
            <button className="link small" onClick={() => void dismissAlert(a.id)}>Entendi</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Café ---------------- */
/** Folha para anotar café: abre pelo + do Hoje, pela linha de café e pela aba Mente. */
export function CoffeeSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date: DateKey }) {
  const settings = useSettings();
  const list = useByDate('caffeine', date);
  const drinks = settings?.mind?.drinks ?? DEFAULT_DRINKS;
  const sorted = [...(list ?? [])].sort((a, b) => a.time.localeCompare(b.time));
  const add = async (label: string, n: number) => { await addCaffeine(date, label, n); toast(`${label} anotado`); onClose(); };
  return (
    <Sheet open={open} onClose={onClose} title="Café" sub={date === todayKey() ? 'Anota com o horário de agora' : shortLabel(date)} testId="coffee-sheet">
      <div className="stack">
        {drinks.map((d) => (
          <button key={d.id} className="row-item tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => void add(d.label, d.mg)} data-testid={`drink-${d.id}`}>
            <Coffee size={18} />
            <span className="grow"><span className="t">{d.label}</span><span className="s"> · cerca de {d.mg} mg</span></span>
            <Plus size={18} />
          </button>
        ))}
      </div>
      {sorted.length > 0 && <>
        <span className="label">Hoje</span>
        {sorted.map((c) => (
          <div key={c.id} className="row-item">
            <span className="num" style={{ width: 48 }}>{c.time}</span>
            <span className="grow">{c.label} <span className="muted">· {c.mg} mg</span></span>
            <button className="icon-btn" aria-label="Apagar" onClick={() => void remove(c.id)}><Trash2 size={16} /></button>
          </div>
        ))}
      </>}
      <p className="tiny muted" style={{ marginTop: 12 }}>Os mg são estimativas. Você ajusta em Mente › Ajustes.</p>
    </Sheet>
  );
}

function CoffeeLine({ date }: { date: DateKey }) {
  const list = useByDate('caffeine', date);
  const [open, setOpen] = useState(false);
  if (!list) return null;
  const sorted = [...list].sort((a, b) => a.time.localeCompare(b.time));
  const mg = sorted.reduce((a, c) => a + c.mg, 0);
  const last = sorted[sorted.length - 1];
  return (
    <>
      <button className="mind-coffee tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(true)} data-testid="coffee">
        <Coffee size={18} />
        <span className="grow"><b>{sorted.length ? `${sorted.length} ${sorted.length === 1 ? 'café' : 'cafés'} · ${mg} mg` : 'Nenhum café hoje'}</b><br />
          <span className="small">{last ? `Último às ${last.time}` : 'Toque para anotar'}</span></span>
        <ChevronRight size={18} />
      </button>
      <CoffeeSheet open={open} onClose={() => setOpen(false)} date={date} />
    </>
  );
}

/* ---------------- Cuidado na hora ---------------- */
/** Respiração guiada: o círculo cresce ao inspirar, para ao segurar e encolhe ao soltar. */
function BreathPlayer({ b }: { b: Care['respiracao'] }) {
  const [run, setRun] = useState(false);
  const [i, setI] = useState(0); // fase atual, contando todos os ciclos
  const [left, setLeft] = useState(0);
  const total = b.fases.length * b.ciclos;
  useEffect(() => { if (!run) return; setLeft(b.fases[i % b.fases.length].segundos); try { navigator.vibrate?.(30); } catch { /* */ } }, [run, i]);
  useEffect(() => {
    if (!run) return;
    if (left <= 0) { if (i + 1 >= total) { setRun(false); setI(0); toast('Respiração concluída'); } else setI(i + 1); return; }
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [run, left]);
  const ph = b.fases[i % b.fases.length];
  const kindOf = (a: string) => (/inspir|puxe/i.test(a) ? 'in' : /solt|expir/i.test(a) ? 'out' : 'hold');
  // Segurar depois de inspirar fica cheio; depois de soltar, vazio.
  let kind = kindOf(ph.acao);
  for (let k = 1; kind === 'hold' && k <= b.fases.length; k++) { const prev = kindOf(b.fases[(i - k + b.fases.length * 10) % b.fases.length].acao); if (prev !== 'hold') kind = prev; }
  return (
    <div className="breath" data-testid="breath">
      <div className={`breath-circle ${run ? kind : ''}`} style={{ transitionDuration: `${ph.segundos}s` }}>
        <span>{run ? <><b>{ph.acao}</b><br /><span className="num">{left}</span></> : <b>{b.nome}</b>}</span>
      </div>
      <p className="small" style={{ margin: '10px 0 6px' }}>{b.fases.map((f) => `${f.acao.toLowerCase()} ${f.segundos} s`).join(' · ')} · {b.ciclos} vezes{run ? ` · ${Math.floor(i / b.fases.length) + 1} de ${b.ciclos}` : ''}</p>
      {b.porque && !run && <p className="tiny muted" style={{ margin: '0 0 8px' }}>{b.porque}</p>}
      <button className="pill-act pa-lilac" onClick={() => { setI(0); setRun(!run); }} data-testid="breath-run">{run ? <><Square size={14} /> Parar</> : <><Play size={14} /> Começar</>}</button>
    </div>
  );
}

function Thumbs({ item }: { item: string }) {
  const settings = useSettings();
  const f = settings?.mind?.careFeedback?.find((x) => x.item === item);
  return (
    <span className="row" style={{ gap: 2 }}>
      <button className={`icon-btn thumb ${f?.liked === true ? 'on' : ''}`} aria-label="Ajudou" onClick={() => void careFeedback(item, true)}><ThumbsUp size={15} /></button>
      <button className={`icon-btn thumb ${f?.liked === false ? 'on' : ''}`} aria-label="Não ajudou" onClick={() => void careFeedback(item, false)}><ThumbsDown size={15} /></button>
    </span>
  );
}

/** Aparece quando os check-ins ou os avisos mostram que ela não está bem; também dá para pedir a qualquer hora. */
export function CareCard({ data, force, onClose }: { data?: { days: MindDay[]; alerts: MindAlert[] }; force?: boolean; onClose?: () => void }) {
  const today = todayKey();
  const day = data?.days.find((d) => d.date === today);
  const reason = data ? careSignal(day, data.alerts) : undefined;
  const cached = useLiveQuery(async () => (await cachedCare(today)) ?? null, []);
  const [busy, setBusy] = useState(false);
  const [care, setCare] = useState<Care | undefined>();
  const want = force || !!reason;
  const why = reason ?? 'você pediu um respiro';
  const load = async (previous?: Care) => {
    if (!aiAvailable()) { setCare(FALLBACK); return; }
    setBusy(true);
    try { setCare(await askCare(why, day, day?.notes ?? [], previous)); }
    catch { setCare(FALLBACK); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!want || cached === undefined || care || busy) return;
    if (cached && (cached.reason === why || force)) setCare(cached.care);
    else void load();
  }, [want, cached]);
  if (!want) return null;
  return (
    <section className="block care-card-m" data-testid="care-card">
      <div className="bh"><h2><Wind size={20} style={{ verticalAlign: '-3px' }} /> Um respiro agora</h2>{onClose && <button className="icon-btn" aria-label="Fechar" onClick={onClose}><X size={18} /></button>}</div>
      {busy && !care && <p className="small">Escolhendo o que pode ajudar agora…</p>}
      {care && <>
        {care.leitura && <p className="small" style={{ marginTop: 0 }}>{care.leitura}</p>}
        <BreathPlayer b={care.respiracao} />
        {!care.offline && <div className="row" style={{ justifyContent: 'center', marginTop: 4 }}><span className="tiny muted">Ajudou?</span><Thumbs item={`respiração: ${care.respiracao.nome}`} /></div>}
        {care.frase && <blockquote className="care-quote" data-testid="care-quote">{care.frase}</blockquote>}
        {care.musicas.length > 0 && <>
          <span className="label" style={{ marginTop: 12 }}><Music size={15} style={{ verticalAlign: '-2px' }} /> Para ouvir</span>
          {care.musicas.map((m) => (
            <div key={m.titulo} className="row-item" style={{ minHeight: 48 }}>
              <a className="grow tap" href={songLink(m)} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                <span className="t">{m.titulo}</span>{m.artista && <span className="s"> · {m.artista}</span>}
                {m.porque && <span className="s" style={{ display: 'block' }}>{m.porque}</span>}
              </a>
              <Thumbs item={`música: ${m.titulo}${m.artista ? ` (${m.artista})` : ''}`} />
            </div>
          ))}
        </>}
        {care.pequeno_passo && <p className="notice calm" style={{ marginTop: 12 }}><b>Um passo pequeno:</b> {care.pequeno_passo}</p>}
        {!care.offline && <button className="link small" style={{ marginTop: 10 }} disabled={busy} onClick={() => void load(care)} data-testid="care-again"><RefreshCw size={13} style={{ verticalAlign: '-2px' }} /> {busy ? 'Buscando…' : 'Outra sugestão'}</button>}
        {care.offline && <p className="tiny muted" style={{ marginTop: 8 }}>Sem conexão com a IA agora: esta é uma respiração pronta.</p>}
      </>}
    </section>
  );
}

/* ---------------- Card do Hoje ---------------- */
export function MindTodayCard({ date }: { date: DateKey }) {
  const data = useMind();
  const nav = useNavigate();
  if (date !== todayKey()) return null;
  const alerts = data?.alerts ?? [];
  const reason = data ? careSignal(data.days.find((d) => d.date === date), alerts) : undefined;
  return (
    <section className="mind-today" data-testid="mind-today" aria-label="Mente">
      <div className="row between" style={{ marginBottom: 8 }}>
        <button className="row tap" style={{ gap: 8 }} onClick={() => nav('/mente')}><Brain size={18} /><b>Mente</b></button>
        <button className="link small" onClick={() => nav('/mente')}>Abrir <ChevronRight size={14} style={{ verticalAlign: '-2px' }} /></button>
      </div>
      {reason && (
        <button className="mind-care-teaser tap" onClick={() => nav('/mente')} data-testid="care-teaser">
          <Wind size={18} /><span className="grow"><b>Separei um respiro para agora</b><br /><span className="small">Respiração guiada, uma frase e músicas.</span></span><ChevronRight size={18} />
        </button>
      )}
      {alerts.map((a) => <AlertCard key={a.id} a={a} compact />)}
      <CoffeeLine date={date} />
    </section>
  );
}

/* ---------------- Tomadas ---------------- */
function DosesBlock({ date }: { date: DateKey }) {
  const items = useAll('intake');
  const logs = useByDate('intakelog', date);
  const nav = useNavigate();
  if (!items || !logs) return null;
  const slots = slotsFor(dosesFor(items, logs, date));
  return (
    <section className="block b-paper" data-testid="doses">
      <div className="bh"><h2>Hoje você toma</h2><button className="link" onClick={() => nav('/mente/tomo', { replace: true })}>Gerenciar</button></div>
      {!slots.length && <p className="small">Nada cadastrado ainda. <button className="link" onClick={() => nav('/mente/tomo')}>Cadastrar</button></p>}
      {slots.map((s) => (
        <div key={s.slot} className="dose-slot">
          <span className="num dose-time">{s.slot}</span>
          <div className="grow">
            {s.doses.map((d) => {
              const st = d.log?.status;
              return (
                <div key={d.item.id + d.slot} className={`dose-row ${st ?? ''}`} data-testid={`dose-${d.item.id}-${d.slot}`}>
                  <span className="grow"><b>{d.item.name}</b>{d.item.dose ? <span className="muted"> · {d.item.dose}</span> : null}
                    {d.item.rule ? <><br /><span className="tiny muted">{d.item.rule}</span></> : null}
                    {st === 'tomei' && d.log?.takenAt ? <><br /><span className="tiny">Tomei às {d.log.takenAt}</span></> : null}
                    {st === 'pulei' ? <><br /><span className="tiny">Não tomei</span></> : null}
                  </span>
                  {st ? (
                    <button className="link small" onClick={() => void unmarkDose(d.item, date, d.slot)}>Desfazer</button>
                  ) : (
                    <>
                      <button className="pill-act pa-lilac" style={{ minHeight: 36 }} onClick={() => void markDose(d.item, date, d.slot, 'tomei')} data-testid="dose-take">Tomei</button>
                      <button className="link small" onClick={() => void markDose(d.item, date, d.slot, 'pulei')}>Não tomei</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {items.filter((i) => i.active).map((i) => ({ i, left: daysLeft(i) })).filter((x) => x.left != null && x.left <= 7).map((x) => (
        <p key={x.i.id} className="notice" style={{ marginTop: 10 }}>{x.i.name}: {x.left === 0 ? 'acabou o estoque' : `restam cerca de ${x.left} ${x.left === 1 ? 'dia' : 'dias'}`}. Hora de repor.</p>
      ))}
    </section>
  );
}

/* ---------------- Check-ins ---------------- */
function CheckinTiles({ date }: { date: DateKey }) {
  const moods = useByDate('mood', date);
  const nav = useNavigate();
  if (!moods) return null;
  const am = moods.find((m) => m.period === 'am'), pm = moods.find((m) => m.period === 'pm');
  const tile = (p: 'am' | 'pm', m?: MoodCheckin) => (
    <button className={`tile ${m ? 't-lilac' : 'mind-tile-empty'}`} style={{ minHeight: 100 }} onClick={() => nav(`/mente/checkin?p=${p}&d=${date}`)} data-testid={`checkin-${p}`}>
      <span className="tile-ic">{p === 'am' ? <Eye size={18} /> : <Moon size={18} />}</span>
      <span className="tile-l">{p === 'am' ? 'Manhã' : 'Noite'}</span>
      <span className="tile-s">{m ? (m.mood != null ? `Humor ${m.mood > 0 ? '+' : ''}${m.mood}${p === 'am' && m.wake ? `, ${WAKE_OPTIONS.find((w) => w.id === m.wake)?.label.toLowerCase()}` : ''}` : 'Registrado') : p === 'am' ? 'Como acordou, 20 s' : 'Humor do dia, 30 s'}</span>
    </button>
  );
  return <div className="tile-grid" style={{ marginBottom: 14 }}>{tile('am', am)}{tile('pm', pm)}</div>;
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function CheckinScreen() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const period = (sp.get('p') === 'am' ? 'am' : 'pm') as 'am' | 'pm';
  const date = (sp.get('d') ?? todayKey()) as DateKey;
  const [st, setSt] = useState<Partial<MoodCheckin>>({ tags: [] });
  const [loaded, setLoaded] = useState(false);
  const wellness = useByDate('wellness', date);
  useEffect(() => { void get<'mood'>(`mood:${date}:${period}`).then((m) => { setSt(m ?? { tags: [] }); setLoaded(true); }); }, [date, period]);
  const set = (p: Partial<MoodCheckin>) => setSt((x) => ({ ...x, ...p }));
  const save = async () => {
    await saveCheckin(date, period, { mood: st.mood, energy: st.energy, irritability: st.irritability, anxiety: st.anxiety, racing: st.racing, wake: st.wake, tags: st.tags ?? [], note: st.note?.trim() || undefined });
    toast(period === 'am' ? 'Manhã registrada' : 'Dia fechado');
    nav(-1);
  };
  const w = wellness?.[0];
  if (!loaded) return null;
  return (
    <div className="screen no-nav" data-testid="checkin-screen">
      <PageHead title={period === 'am' ? 'Como acordou' : 'Fechar o dia'} withDate={false} />
      <PinGate>
        <p className="small muted" style={{ marginTop: -4 }}>{date === todayKey() ? 'Hoje' : shortLabel(date)}{period === 'am' && w?.sleepH ? ` · o relógio marcou ${w.sleepH.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h de sono${w.sleepStart ? `, de ${w.sleepStart} a ${w.sleepEnd}` : ''}` : ''}</p>
        {period === 'am' && <>
          <span className="label">Como você acordou?</span>
          <div className="chips">{WAKE_OPTIONS.map((o) => <Chip key={o.id} on={st.wake === o.id} onClick={() => set({ wake: st.wake === o.id ? undefined : o.id })} testId={`wake-${o.id}`}>{o.label}</Chip>)}</div>
        </>}
        <span className="label">{period === 'am' ? 'Humor agora' : 'Humor do dia'}</span>
        <div className="mood-scale" role="radiogroup" aria-label="Humor de −3 a +3">
          {[-3, -2, -1, 0, 1, 2, 3].map((n) => (
            <button key={n} role="radio" aria-checked={st.mood === n} className={`ms-btn ${st.mood === n ? 'on' : ''} ${n < 0 ? 'neg' : n > 0 ? 'pos' : 'zero'}`} onClick={() => set({ mood: st.mood === n ? undefined : n })} data-testid={`mood-${n}`}>{signed(n)}</button>
          ))}
        </div>
        <p className="small muted" style={{ margin: '6px 0 0', minHeight: 20 }}>{st.mood != null ? MOOD_LABEL[String(st.mood)] : 'De −3 (muito para baixo) a +3 (muito acelerada). 0 é o seu normal.'}</p>
        {period === 'pm' && <>
          {SLIDERS.map((s) => (
            <div key={s.key}>
              <span className="label" style={{ marginTop: 14 }}>{s.label}</span>
              <div className="mood-scale small-scale">
                {[0, 1, 2, 3, 4].map((n) => (
                  <button key={n} className={`ms-btn ${(st as any)[s.key] === n ? 'on' : ''}`} onClick={() => set({ [s.key]: (st as any)[s.key] === n ? undefined : n } as any)} data-testid={`${s.key}-${n}`}>{n}</button>
                ))}
              </div>
            </div>
          ))}
          <p className="tiny muted" style={{ marginTop: 6 }}>0 é nada, 4 é muito.</p>
        </>}
        <span className="label">O que marcou {period === 'am' ? 'a noite' : 'o dia'}</span>
        <div className="chips">{CONTEXT_TAGS.map((t) => <Chip key={t} on={st.tags?.includes(t)} onClick={() => set({ tags: st.tags?.includes(t) ? st.tags.filter((x) => x !== t) : [...(st.tags ?? []), t] })}>{t}</Chip>)}</div>
        <span className="label">Uma linha, se quiser</span>
        <textarea rows={2} value={st.note ?? ''} onChange={(e) => set({ note: e.target.value })} placeholder="A especialista da Mente lê; as outras, não" data-testid="checkin-note" />
        <button className="btn btn-ink btn-block" style={{ marginTop: 18 }} onClick={save} data-testid="checkin-save">Salvar</button>
      </PinGate>
    </div>
  );
}

/* ---------------- Sono em etapas ---------------- */
function SleepStage() {
  const settings = useSettings();
  const wellness = useByRange('wellness', addDays(todayKey(), -7), todayKey());
  const sp = sleepPlan(settings?.reminders);
  const prog = useMemo(() => bedStageProgress(sp, wellness ?? [], todayKey()), [sp, wellness]);
  if (!sp || !prog || !settings) return null;
  const advance = () => update<'settings'>('settings', { reminders: { ...settings.reminders!, sleep: { ...(settings.reminders!.sleep as SleepPlan), bedGoal: prog.final } } }).then(() => toast(`Meta de deitar agora é ${prog.final}`));
  return (
    <section className="block b-paper" data-testid="sleep-stage">
      <div className="bh"><h2>Deitar às {prog.goal}</h2><Moon size={20} /></div>
      <p className="small" style={{ margin: 0 }}>
        {prog.nights ? `${prog.onTime} de ${prog.nights} noites na meta nesta semana${prog.avgStart ? `; em média o sono começou às ${prog.avgStart}` : ''}.` : 'O relógio ainda não mandou as noites desta semana.'}
        {prog.final && prog.final !== prog.goal ? ` Próxima etapa: ${prog.final}, quando 5 noites da semana baterem a meta.` : ''}
        {' '}Café só até as {String(Math.floor(((toMin(prog.goal)! - 8 * 60) + 1440) % 1440 / 60)).padStart(2, '0')}:{String(((toMin(prog.goal)! - 8 * 60) + 1440) % 60).padStart(2, '0')}.
      </p>
      {prog.ready && <button className="pill-act pa-lilac" style={{ marginTop: 10 }} onClick={() => void advance()} data-testid="bed-advance">Passar para {prog.final}</button>}
    </section>
  );
}

/* ---------------- Painel de 30 dias ---------------- */
export function MindChart({ days }: { days: MindDay[] }) {
  const d30 = days.slice(-30);
  const W = 340, H = 206, L = 26, R = 6, top = 8, moodH = 84, sleepTop = 118, sleepH = 56, adhY = 184;
  const step = (W - L - R) / Math.max(1, d30.length);
  const x = (i: number) => L + step * i + step / 2;
  const yMood = (m: number) => top + ((3 - m) / 6) * moodH;
  const pts = d30.map((d, i) => (d.moodPm ?? d.moodAm) != null ? [x(i), yMood((d.moodPm ?? d.moodAm)!)] as const : null);
  const segs: string[] = []; let cur = '';
  pts.forEach((p) => { if (p) cur += `${cur ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`; else if (cur) { segs.push(cur); cur = ''; } });
  if (cur) segs.push(cur);
  const maxS = 10;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mind-chart" role="img" aria-label="Humor, sono e remédios nos últimos 30 dias">
      {[3, 0, -3].map((m) => <g key={m}><line x1={L} x2={W - R} y1={yMood(m)} y2={yMood(m)} className={m === 0 ? 'mc-zero' : 'mc-grid'} /><text x={L - 4} y={yMood(m) + 3.5} className="mc-ax" textAnchor="end">{m > 0 ? `+${m}` : m}</text></g>)}
      {segs.map((s, i) => <path key={i} d={s} className="mc-line" />)}
      {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={2.6} className="mc-dot" />)}
      {d30.map((d, i) => d.tags.length ? <circle key={`t${i}`} cx={x(i)} cy={top + moodH + 12} r={2} className="mc-tag" /> : null)}
      <text x={L - 4} y={sleepTop + 4} className="mc-ax" textAnchor="end">10h</text>
      <line x1={L} x2={W - R} y1={sleepTop + sleepH - (7 / maxS) * sleepH} y2={sleepTop + sleepH - (7 / maxS) * sleepH} className="mc-grid" />
      <text x={L - 4} y={sleepTop + sleepH - (7 / maxS) * sleepH + 3.5} className="mc-ax" textAnchor="end">7h</text>
      {d30.map((d, i) => d.sleepH != null ? <rect key={`s${i}`} x={x(i) - step * 0.32} width={step * 0.64} y={sleepTop + sleepH - (Math.min(d.sleepH, maxS) / maxS) * sleepH} height={(Math.min(d.sleepH, maxS) / maxS) * sleepH} rx={1.5} className="mc-sleep" /> : null)}
      {d30.map((d, i) => d.dosesDue ? <rect key={`a${i}`} x={x(i) - step * 0.36} width={step * 0.72} y={adhY} height={8} rx={2} className={d.dosesTaken >= d.dosesDue ? 'mc-adh-ok' : d.dosesTaken > 0 ? 'mc-adh-part' : 'mc-adh-no'} /> : null)}
      <text x={L} y={H - 2} className="mc-ax">{shortLabel(d30[0]?.date ?? todayKey())}</text>
      <text x={W - R} y={H - 2} className="mc-ax" textAnchor="end">hoje</text>
    </svg>
  );
}

function Panel({ days }: { days: MindDay[] }) {
  const base = moodBaseline(days, todayKey());
  const last7 = days.slice(-7);
  const avg = (xs: (number | undefined)[]) => { const v = xs.filter((n): n is number => n != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined; };
  const sl = avg(last7.map((d) => d.sleepH));
  const md = avg(last7.map((d) => d.moodPm));
  const due = last7.reduce((a, d) => a + d.dosesDue, 0), taken = last7.reduce((a, d) => a + d.dosesTaken, 0);
  const caf = avg(last7.map((d) => d.caffeineMg));
  return (
    <section className="block b-paper" data-testid="mind-panel">
      <div className="bh"><h2>Últimos 30 dias</h2></div>
      <MindChart days={days} />
      <div className="mc-legend tiny"><span><i className="lg-line" />humor</span><span><i className="lg-sleep" />sono</span><span><i className="lg-adh" />remédios em dia</span><span><i className="lg-tag" />evento marcado</span></div>
      <div className="mind-stats">
        <div><b className="num">{sl != null ? `${sl.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h` : '–'}</b><span>sono médio, 7 dias</span></div>
        <div><b className="num">{md != null ? (md > 0 ? '+' : '') + md.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '–'}</b><span>humor médio</span></div>
        <div><b className="num">{due ? `${Math.round((taken / due) * 100)}%` : '–'}</b><span>doses tomadas</span></div>
        <div><b className="num">{caf != null ? `${Math.round(caf)} mg` : '–'}</b><span>café por dia</span></div>
      </div>
      {!base.ready && <p className="tiny muted" style={{ marginTop: 10 }} data-testid="baseline">Linha de base do humor: {base.nights} de 20 noites registradas{base.first ? `, ${base.daysSinceFirst} de 28 dias` : ''}. Até lá, os avisos de humor ficam desligados; os de sono, remédios, café e alimentação já valem.</p>}
    </section>
  );
}

/* ---------------- Abas da Mente ---------------- */
export function MindScreen() {
  const data = useMind();
  const changes = useAll('medchange');
  const [care, setCare] = useState(false);
  const today = todayKey();
  const obs = changes ? observing(changes, today) : undefined;
  const signal = data ? careSignal(data.days.find((d) => d.date === today), data.alerts) : undefined;
  return (
    <AreaPage area="mente" testId="mind-screen">
      <PinGate>
        {obs && <p className="notice calm" style={{ marginBottom: 14 }} data-testid="observing"><b>Modo observação até {shortLabel(addDays(obs.date, 14))}.</b> Houve ajuste do médico em {shortLabel(obs.date)}: capriche nos check-ins e anote efeitos colaterais. Tudo entra no relatório.</p>}
        {data && <CareCard data={data} force={care} onClose={!signal && care ? () => setCare(false) : undefined} />}
        {data?.alerts.map((a) => <AlertCard key={a.id} a={a} />)}
        <CheckinTiles date={today} />
        {!signal && !care && <button className="lib-item" style={{ marginBottom: 14 }} onClick={() => setCare(true)} data-testid="care-open"><span className="lib-icon"><HeartHandshake size={20} /></span><span className="grow"><b>Preciso de um respiro</b><br /><span className="small muted">Respiração guiada, uma frase e músicas para agora</span></span><ChevronRight size={18} /></button>}
        <DosesBlock date={today} />
        <section className="block b-paper"><div className="bh"><h2>Café</h2></div><CoffeeLine date={today} /></section>
        <SleepStage />
      </PinGate>
    </AreaPage>
  );
}

export function MindPanelPage() {
  const data = useMind();
  const nav = useNavigate();
  return (
    <AreaPage area="mente" testId="mind-panel-page">
      <PinGate>
        {data && <Panel days={data.days} />}
        <button className="lib-item" onClick={() => nav('/mente/relatorio')} data-testid="open-report"><span className="lib-icon"><FileText size={20} /></span><span className="grow"><b>Relatório para a consulta</b><br /><span className="small muted">30, 60 ou 90 dias, para imprimir ou salvar em PDF</span></span><ChevronRight size={18} /></button>
      </PinGate>
    </AreaPage>
  );
}

export function MindSettingsPage() {
  const settings = useSettings();
  const [ask, confirm] = useConfirm();
  if (!settings) return null;
  const drinks = settings.mind?.drinks ?? DEFAULT_DRINKS;
  const setDrinks = (d: typeof drinks) => update<'settings'>('settings', { mind: { ...(settings.mind ?? {}), drinks: d } });
  const r = settings.reminders;
  const sp = r?.sleep;
  const setSleep = (p: Partial<SleepPlan>) => r && sp && update<'settings'>('settings', { reminders: { ...r, sleep: { ...sp, ...p } } });
  const fb = settings.mind?.careFeedback ?? [];
  return (
    <AreaPage area="mente" testId="mind-settings">
      <PinGate>
        <section className="block b-paper">
          <div className="bh"><h2>Cafés</h2><Coffee size={20} /></div>
          <p className="small" style={{ marginTop: 0 }}>Os que aparecem para anotar, com a cafeína estimada de cada um.</p>
          {drinks.map((d, i) => (
            <div key={d.id} style={{ marginBottom: 12 }}>
              <input value={d.label} onChange={(e) => setDrinks(drinks.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} aria-label="Nome do café" style={{ marginBottom: 6 }} />
              <div className="row">
                <NumberInput value={d.mg} int min={0} max={600} onChange={(v) => setDrinks(drinks.map((x, k) => (k === i ? { ...x, mg: v ?? 0 } : x)))} label="mg" style={{ width: 84 }} />
                <span className="small">mg</span>
                <span className="grow" />
                <button className="link small" onClick={() => setDrinks(drinks.filter((_, k) => k !== i))}>Tirar</button>
              </div>
            </div>
          ))}
          <button className="link" onClick={() => setDrinks([...drinks, { id: `d${Date.now().toString(36)}`, label: 'Novo café', mg: 80 }])}>Acrescentar café</button>
        </section>

        {sp && (
          <section className="block b-paper">
            <div className="bh"><h2>Meta de deitar</h2><Moon size={20} /></div>
            <div className="row" style={{ gap: 12 }}>
              <div className="grow"><span className="label" style={{ marginTop: 0 }}>Agora</span><TimeInput value={sp.bedGoal ?? ''} label="Meta de deitar agora" onChange={(v) => void setSleep({ bedGoal: v })} /></div>
              <div className="grow"><span className="label" style={{ marginTop: 0 }}>Aonde quero chegar</span><TimeInput value={sp.bedFinal ?? ''} label="Meta final de deitar" onChange={(v) => void setSleep({ bedFinal: v })} /></div>
            </div>
            <p className="tiny muted">O lembrete de deitar segue a meta de agora. O café fica até 8 h antes dela.</p>
          </section>
        )}

        <section className="block b-paper">
          <div className="bh"><h2>Lembretes</h2></div>
          {r && <Switch on={r.meds !== false} onChange={(v) => void update<'settings'>('settings', { reminders: { ...r, meds: v } })} label="Remédios e vitaminas" hint="No horário e de novo 1 h depois, se você não marcar. Item com apelido aparece pelo apelido na tela bloqueada." />}
        </section>

        <section className="block b-paper">
          <div className="bh"><h2>Privacidade</h2><Lock size={20} /></div>
          <p className="small" style={{ marginTop: 0 }}>A especialista da Mente lê tudo, inclusive o que você escreve nos check-ins. As outras especialistas recebem só números e avisos, sem o que você escreve e sem os nomes dos remédios psiquiátricos.</p>
          <button className="link" onClick={async () => {
            if (await confirm({ title: 'Trocar o PIN?', text: 'Você cria um novo no próximo acesso.', ok: 'Trocar' })) {
              await update<'settings'>('settings', { mind: { ...(settings.mind ?? {}), pinHash: undefined } }); unlockedAt = 0; toast('Crie o novo PIN ao abrir a Mente.');
            }
          }}>Trocar o PIN</button>
        </section>

        {fb.length > 0 && (
          <section className="block b-paper">
            <div className="bh"><h2>O que ajudou</h2></div>
            {fb.slice().reverse().map((f) => (
              <div key={f.item} className="row-item" style={{ minHeight: 44 }}>
                {f.liked ? <ThumbsUp size={15} /> : <ThumbsDown size={15} />}
                <span className="grow small">{f.item}</span>
                <button className="icon-btn" aria-label="Tirar" onClick={() => void update<'settings'>('settings', { mind: { ...(settings.mind ?? {}), careFeedback: fb.filter((x) => x.item !== f.item) } })}><X size={15} /></button>
              </div>
            ))}
          </section>
        )}
        {ask}
      </PinGate>
    </AreaPage>
  );
}

/* ---------------- O que eu tomo ---------------- */
const TYPES: { id: IntakeType; label: string }[] = [{ id: 'medicamento', label: 'Medicamento' }, { id: 'vitamina', label: 'Vitamina' }, { id: 'suplemento', label: 'Suplemento' }];

export function IntakeScreen() {
  const items = useAll('intake');
  const changes = useAll('medchange');
  const [edit, setEdit] = useState<Intake | 'new' | null>(null);
  const [chg, setChg] = useState(false);
  const sorted = (items ?? []).sort((a, b) => Number(b.active) - Number(a.active) || a.order - b.order);
  return (
    <AreaPage area="mente" testId="intake-screen">
      <PinGate>
        {sorted.map((i) => {
          const left = daysLeft(i);
          return (
            <button key={i.id} className="row-item tap" style={{ width: '100%', textAlign: 'left', opacity: i.active ? 1 : 0.55 }} onClick={() => setEdit(i)} data-testid={`intake-${i.id}`}>
              <Pill size={18} />
              <span className="grow">
                <span className="t">{i.name}{i.dose ? <span className="muted"> · {i.dose}</span> : null}</span>
                <span className="s" style={{ display: 'block' }}>{typeLabel(i.type)} · {scheduleLabel(i)}{i.rule ? ` · ${i.rule}` : ''}{left != null ? ` · estoque para ${left} dias` : ''}{!i.active ? ' · pausado' : ''}</span>
              </span>
              <ChevronRight size={18} />
            </button>
          );
        })}
        <button className="btn btn-ink btn-block" style={{ marginTop: 14 }} onClick={() => setEdit('new')} data-testid="intake-new"><Plus size={18} /> Acrescentar</button>

        <div className="section"><h2 className="section-title">Mudanças do médico</h2><button className="link" onClick={() => setChg(true)}>Anotar</button></div>
        <p className="small muted" style={{ marginTop: -6 }}>Cada mudança abre 14 dias de observação e aparece no relatório. A IA só lê; quem muda é o médico.</p>
        {(changes ?? []).sort((a, b) => b.date.localeCompare(a.date)).map((c) => (
          <div key={c.id} className="row-item">
            <span className="num small" style={{ width: 70 }}>{shortLabel(c.date)}</span>
            <span className="grow">{c.text}{c.itemId ? <span className="muted"> · {items?.find((i) => i.id === c.itemId)?.name}</span> : null}</span>
            <button className="icon-btn" aria-label="Apagar" onClick={() => void remove(c.id)}><Trash2 size={16} /></button>
          </div>
        ))}
      </PinGate>
      <IntakeSheet item={edit} onClose={() => setEdit(null)} count={items?.length ?? 0} />
      <ChangeSheet open={chg} onClose={() => setChg(false)} items={items ?? []} />
    </AreaPage>
  );
}

function IntakeSheet({ item, onClose, count }: { item: Intake | 'new' | null; onClose: () => void; count: number }) {
  const [f, setF] = useState<Partial<Intake>>({});
  const [ask, confirm] = useConfirm();
  useEffect(() => { if (item) setF(item === 'new' ? { type: 'medicamento', times: ['08:00'], active: true, perDose: 1 } : { ...item }); }, [item]);
  const set = (p: Partial<Intake>) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    if (!f.name?.trim()) { toast('Dê um nome.', undefined, 'error'); return; }
    const data = { name: f.name.trim(), freq: f.freq ?? 'diaria', days: f.freq === 'semanal' ? f.days ?? [] : undefined, alias: f.alias?.trim() || undefined, type: f.type ?? 'medicamento', dose: f.dose?.trim() || undefined, times: (f.times ?? []).filter((t) => toMin(t) != null).sort(), rule: f.rule?.trim() || undefined, stock: f.stock, perDose: f.perDose ?? 1, caffeineSensitive: !!f.caffeineSensitive, shareCare: !!f.shareCare, note: f.note?.trim() || undefined, active: f.active !== false };
    if (item === 'new') await create('intake', { ...data, order: count + 1 });
    else if (item) await update<'intake'>(item.id, data);
    toast('Salvo'); onClose();
  };
  const del = async () => {
    if (item && item !== 'new' && await confirm({ title: `Apagar ${item.name}?`, text: 'O histórico de tomadas continua no relatório. Se só parou de tomar, prefira pausar.', ok: 'Apagar', danger: true })) { await remove(item.id); onClose(); }
  };
  return (
    <Sheet open={!!item} onClose={onClose} title={item === 'new' ? 'Novo item' : 'Editar'} testId="intake-sheet"
      footer={<button className="btn btn-ink grow" onClick={save} data-testid="intake-save">Salvar</button>}>
      <span className="label" style={{ marginTop: 0 }}>Nome</span>
      <input value={f.name ?? ''} onChange={(e) => set({ name: e.target.value })} data-testid="intake-name" />
      <span className="label">Tipo</span>
      <div className="chips">{TYPES.map((t) => <Chip key={t.id} on={f.type === t.id} onClick={() => set({ type: t.id })}>{t.label}</Chip>)}</div>
      <span className="label">Dose (como está na receita)</span>
      <input value={f.dose ?? ''} onChange={(e) => set({ dose: e.target.value })} placeholder="Ex.: 1 cápsula de 20 mg" />
      <span className="label">Frequência</span>
      <div className="chips">
        <Chip on={f.freq !== 'semanal'} onClick={() => set({ freq: 'diaria' })}>Todo dia</Chip>
        <Chip on={f.freq === 'semanal'} onClick={() => set({ freq: 'semanal', days: f.days ?? [] })} testId="freq-weekly">Semanal</Chip>
      </div>
      {f.freq === 'semanal' && <div className="chips" style={{ marginTop: 8 }}>{[1, 2, 3, 4, 5, 6, 7].map((d) => <Chip key={d} on={f.days?.includes(d)} onClick={() => set({ days: f.days?.includes(d) ? f.days.filter((x) => x !== d) : [...(f.days ?? []), d].sort() })}>{['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'][d]}</Chip>)}</div>}
      <span className="label">Horários</span>
      {(f.times ?? []).map((t, i) => (
        <div key={i} className="row" style={{ marginBottom: 8 }}>
          <TimeInput value={t} label={`Horário ${i + 1}`} onChange={(v) => set({ times: (f.times ?? []).map((x, k) => (k === i ? v : x)) })} />
          <button className="icon-btn" aria-label="Tirar horário" onClick={() => set({ times: (f.times ?? []).filter((_, k) => k !== i) })}><X size={16} /></button>
        </div>
      ))}
      <button className="link" onClick={() => set({ times: [...(f.times ?? []), '20:00'] })}>Acrescentar horário</button>
      <span className="label">Regra que o médico passou</span>
      <input value={f.rule ?? ''} onChange={(e) => set({ rule: e.target.value })} placeholder="Ex.: com comida; em jejum; longe do café" />
      <div className="row" style={{ gap: 12 }}>
        <div className="grow"><span className="label">Unidades em casa</span><NumberInput value={f.stock} optional int min={0} onChange={(v) => set({ stock: v })} label="Estoque" /></div>
        <div className="grow"><span className="label">Por tomada</span><NumberInput value={f.perDose ?? 1} int min={1} onChange={(v) => set({ perDose: v ?? 1 })} label="Por tomada" /></div>
      </div>
      <span className="label">Apelido para a IA (opcional)</span>
      <input value={f.alias ?? ''} onChange={(e) => set({ alias: e.target.value })} placeholder="Ex.: remédio da noite" />
      <div style={{ marginTop: 12 }}>
        <Switch on={!!f.caffeineSensitive} onChange={(v) => set({ caffeineSensitive: v })} label="Sensível a mudanças de café" hint="Marque só se o seu médico orientou. Liga o aviso de mudança brusca no consumo." />
        {f.type === 'medicamento' && <Switch on={!!f.shareCare} onChange={(v) => set({ shareCare: v })} label="Dermatologista e nutricionista podem ver" hint="Vitaminas e suplementos elas já veem. Remédios, só se você ligar aqui." />}
        <Switch on={f.active !== false} onChange={(v) => set({ active: v })} label="Tomando agora" />
      </div>
      {item !== 'new' && <button className="link" style={{ color: 'var(--alert)', marginTop: 12 }} onClick={del}>Apagar</button>}
      {ask}
    </Sheet>
  );
}

function ChangeSheet({ open, onClose, items }: { open: boolean; onClose: () => void; items: Intake[] }) {
  const [text, setText] = useState('');
  const [itemId, setItemId] = useState<string | undefined>();
  const [date, setDate] = useState(todayKey());
  useEffect(() => { if (open) { setText(''); setItemId(undefined); setDate(todayKey()); } }, [open]);
  const save = async () => {
    if (!text.trim()) return;
    await create('medchange', { date, itemId, text: text.trim() });
    toast('Mudança anotada. Começa o modo observação.'); onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Mudança do médico" testId="change-sheet" footer={<button className="btn btn-ink grow" onClick={save}>Salvar</button>}>
      <span className="label" style={{ marginTop: 0 }}>O que mudou</span>
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: dose da noite passou para 750 mg" />
      <span className="label">Item</span>
      <div className="chips">{items.map((i) => <Chip key={i.id} on={itemId === i.id} onClick={() => setItemId(itemId === i.id ? undefined : i.id)}>{i.name}</Chip>)}</div>
      <span className="label">Data</span>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayKey())} />
    </Sheet>
  );
}

/* ---------------- Relatório ---------------- */
export function ReportScreen() {
  const [span, setSpan] = useState(30);
  const data = useLiveQuery(() => loadMind(todayKey(), Math.max(span, 56)), [span]);
  const items = useAll('intake');
  const changes = useAll('medchange');
  const today = todayKey();
  const from = addDays(today, -span + 1);
  const logs = useByRange('intakelog', from, today);
  const moods = useByRange('mood', from, today);
  if (!data || !items || !changes || !logs || !moods) return null;
  const days = data.days.filter((d) => d.date >= from);
  const avg = (xs: (number | undefined)[]) => { const v = xs.filter((n): n is number => n != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined; };
  const f1 = (n?: number) => (n == null ? '–' : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
  const adherence = items.filter((i) => i.times.length).map((i) => {
    const due = days.reduce((a, d) => a + (d.date >= (new Date(i.createdAt).toISOString().slice(0, 10)) && i.active ? i.times.length : 0), 0);
    const taken = logs.filter((l) => l.itemId === i.id && l.status === 'tomei').length;
    const effects = logs.filter((l) => l.itemId === i.id && l.sideEffect).map((l) => `${shortLabel(l.date)}: ${l.sideEffect}`);
    return { i, due, taken, effects };
  });
  const tagCount = new Map<string, number>();
  for (const d of days) for (const t of new Set(d.tags)) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const moodDays = days.filter((d) => d.moodPm != null);
  const notes = moods.filter((m) => m.note).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="screen no-nav report" data-testid="report-screen">
      <div className="no-print"><PageHead title="Relatório" withDate={false} /></div>
      <PinGate>
        <div className="row no-print" style={{ gap: 8, marginBottom: 10 }}>
          {[30, 60, 90].map((n) => <Chip key={n} on={span === n} onClick={() => setSpan(n)}>{n} dias</Chip>)}
        </div>
        <button className="btn btn-ink btn-block no-print" style={{ marginBottom: 14 }} onClick={() => window.print()} data-testid="print"><FileText size={18} /> Imprimir ou salvar em PDF</button>
        <h1 className="report-title">Humor, sono e medicação</h1>
        <p className="small">{shortLabel(from)} a {shortLabel(today)} · registrado no app Ritual</p>
        <MindChart days={days.length > 30 ? days : data.days.slice(-30)} />
        <h2 className="report-h">Resumo</h2>
        <ul className="report-list">
          <li>Humor da noite registrado em {moodDays.length} de {days.length} dias; média {f1(avg(moodDays.map((d) => d.moodPm)))} (escala de −3 a +3). Dias com humor ≥ +2: {moodDays.filter((d) => d.moodPm! >= 2).length}. Dias com humor ≤ −2: {moodDays.filter((d) => d.moodPm! <= -2).length}.</li>
          <li>Sono médio {f1(avg(days.map((d) => d.sleepH)))} h; noites abaixo de 6 h: {days.filter((d) => d.sleepH != null && d.sleepH < 6).length}.</li>
          <li>Energia média {f1(avg(days.map((d) => d.energy)))}, irritabilidade {f1(avg(days.map((d) => d.irritability)))}, ansiedade {f1(avg(days.map((d) => d.anxiety)))}, pensamento acelerado {f1(avg(days.map((d) => d.racing)))} (de 0 a 4).</li>
          <li>Café anotado em {days.filter((d) => d.caffeineMg > 0).length} dias; média de {Math.round(avg(days.filter((d) => d.caffeineMg > 0).map((d) => d.caffeineMg)) ?? 0)} mg nesses dias.</li>
        </ul>
        <h2 className="report-h">Medicação e suplementos</h2>
        <table className="report-table"><thead><tr><th>Item</th><th>Horários</th><th>Tomadas</th></tr></thead><tbody>
          {adherence.map(({ i, due, taken }) => <tr key={i.id}><td>{i.name}{i.dose ? ` (${i.dose})` : ''}</td><td>{i.times.join(', ')}</td><td>{due ? `${taken} de ${due}` : `${taken}`}</td></tr>)}
        </tbody></table>
        {adherence.some((a) => a.effects.length) && <><h2 className="report-h">Efeitos colaterais anotados</h2><ul className="report-list">{adherence.flatMap((a) => a.effects.map((e) => <li key={a.i.id + e}>{a.i.name}, {e}</li>))}</ul></>}
        {changes.length > 0 && <><h2 className="report-h">Mudanças do médico</h2><ul className="report-list">{[...changes].sort((a, b) => a.date.localeCompare(b.date)).filter((c) => c.date >= addDays(from, -30)).map((c) => <li key={c.id}>{shortLabel(c.date)}: {c.text}</li>)}</ul></>}
        {tagCount.size > 0 && <><h2 className="report-h">Eventos marcados</h2><p className="small">{Array.from(tagCount.entries()).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} (${n})`).join(', ')}</p></>}
        {notes.length > 0 && <><h2 className="report-h">Anotações</h2><ul className="report-list">{notes.map((m) => <li key={m.id}>{shortLabel(m.date)}{m.period === 'am' ? ', manhã' : ''}: {m.note}</li>)}</ul></>}
        <p className="tiny muted" style={{ marginTop: 18 }}>Registro feito pela própria paciente. Não substitui avaliação clínica.</p>
      </PinGate>
    </div>
  );
}

/** Para a linha do tempo do Hoje: tomadas do dia agrupadas por horário. */
export function useDoseSlots(date: DateKey) {
  const items = useAll('intake');
  const logs = useByDate('intakelog', date);
  return items && logs ? slotsFor(dosesFor(items, logs, date)) : undefined;
}
