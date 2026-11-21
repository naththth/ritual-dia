// Semana da periodização no alto do Treino: proposta para aprovar ou, depois do aprovo, onde ela está no ciclo.
import { useEffect, useState } from 'react';
import { Check, RefreshCw, Sparkles, Undo2, ChevronDown } from 'lucide-react';
import { useRecord, useSettings } from '../db/hooks';
import type { MacroCycle, ProposedSession, TrainingWeek } from '../db/types';
import { addDays, dayNum, isoWeekday, todayKey, weekStart, WEEKDAY_SHORT, type DateKey } from '../lib/dates';
import { PHASE_LABEL, countdown, isDeload, macroWeeks, phaseOf, weekIndex, weekToPropose } from '../domain/periodization';
import { MACRO_ID, approveWeek, proposeWeek, tweekId, undoWeek } from '../domain/trainingWeek';
import { aiAvailable } from '../domain/ai';
import { toast } from '../state/store';
import { StepsView } from './ai-ui';
import { MicButton, appendText } from '../ui/Dictation';

const ddmm = (d: DateKey) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Faixa do ciclo: uma barra por semana, na cor da fase; semana leve mais baixa; a atual acesa. */
function CycleBar({ m, current }: { m: MacroCycle; current: number }) {
  const n = macroWeeks(m);
  return (
    <div className="wp-bar" aria-label={`Semana ${current} de ${n}`} data-testid="cycle-bar">
      {Array.from({ length: n }, (_, i) => i + 1).map((i) => (
        <i key={i} className={`ph-${phaseOf(m, i)} ${isDeload(m, i) ? 'dl' : ''} ${i < current ? 'past' : ''} ${i === current ? 'on' : ''}`} />
      ))}
    </div>
  );
}

function Countdown({ m, from }: { m: MacroCycle; from: DateKey }) {
  const c = countdown(m, from);
  if (!c.length) return null;
  return (
    <div className="wp-goals">
      {c.map((x) => (
        <span key={x.label} className="wp-goal"><b className="num">{x.days}</b><span>{x.days === 1 ? 'dia' : 'dias'} para {x.label}</span></span>
      ))}
    </div>
  );
}

function SessionRow({ s }: { s: ProposedSession }) {
  const [open, setOpen] = useState(false);
  const fixed = !!s.templateId;
  const detail = !fixed && (s.note || s.steps?.length);
  return (
    <div className={`wp-s ${open ? 'open' : ''}`}>
      <button className="wp-s-head" onClick={() => detail && setOpen(!open)} aria-expanded={detail ? open : undefined} disabled={!detail} data-testid="wp-session">
        <span className="wp-sn">{s.name}</span>
        <span className="wp-sm num">{s.duration} min</span>
        {detail ? <ChevronDown size={16} className="wp-chev" aria-hidden /> : <span className="wp-chev" />}
      </button>
      {open && (
        <div className="wp-s-body">
          {s.note && <p className="small" style={{ margin: 0, whiteSpace: 'pre-line' }}>{s.note}</p>}
          {s.steps?.length ? <StepsView steps={s.steps} /> : null}
        </div>
      )}
    </div>
  );
}

export function WeekPlanCard() {
  const macro = useRecord<'macro'>(MACRO_ID);
  const today = todayKey();
  const ws = weekStart(today);
  const next = addDays(ws, 7);
  const cur = useRecord<'tweek'>(tweekId(ws));
  const nxt = useRecord<'tweek'>(tweekId(next));
  const settings = useSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [pedido, setPedido] = useState('');
  const [more, setMore] = useState(false);
  const active = macro && macro.active && !macro.deleted ? macro : undefined;

  const propose = async (monday: DateKey, text?: string, silent = false) => {
    setBusy(text ? 'Refazendo a semana com o seu pedido…' : 'A treinadora está montando a semana…');
    try { await proposeWeek(monday, text); setAsking(false); setPedido(''); }
    catch (e: any) { if (!silent) toast(e.message, undefined, 'error'); }
    finally { setBusy(null); }
  };

  // Domingo à tarde (ou no começo da semana, se ela não abriu no domingo), a proposta sai sozinha.
  useEffect(() => {
    if (!active || cur === undefined || nxt === undefined || busy || !aiAvailable()) return;
    const target = weekToPropose(active, today, new Date().getHours());
    if (!target) return;
    const have = target === ws ? cur : target === next ? nxt : undefined;
    if (have) return;
    if (target !== ws && target !== next && target !== active.start) return;
    const k = `auto-week:${target}`;
    try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch { /* */ }
    void propose(target, undefined, true);
  }, [active?.id, cur, nxt, today]);

  if (!active || cur === undefined || nxt === undefined) return null;
  const total = macroWeeks(active);
  const pending: TrainingWeek | undefined = [cur, nxt].find((t): t is TrainingWeek => !!t && t.status === 'proposta');
  const idxNow = Math.min(total, Math.max(1, weekIndex(active, today)));

  if (busy) {
    return (
      <section className="block wp wp-busy" data-testid="week-plan-busy">
        <div className="wp-k">Semana {idxNow} de {total}</div>
        <p className="wp-msg" style={{ margin: '6px 0 0' }}><Sparkles size={16} className="wp-pulse" /> {busy}</p>
      </section>
    );
  }

  if (pending) {
    const sk = pending.skeleton;
    const days = Array.from({ length: 7 }, (_, i) => i + 1);
    const approve = async () => {
      setBusy('Colocando a semana no plano…');
      try {
        const done = await approveWeek(pending);
        toast(settings?.intervals?.connected ? 'Semana aprovada. Os pedais vão para o MyWhoosh em instantes.' : 'Semana aprovada e no plano.', async () => { await undoWeek(done); });
      } catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(null); }
    };
    return (
      <section className="block wp" data-testid="week-plan">
        <div className="wp-k">Semana {sk.index} de {sk.total} · {PHASE_LABEL[sk.phase]}{sk.deload ? ' · semana leve' : ''}</div>
        <h2 className="wp-t">Sua semana de {ddmm(pending.date)} a {ddmm(addDays(pending.date, 6))}</h2>
        <CycleBar m={active} current={sk.index} />
        <Countdown m={active} from={today} />
        {pending.mensagem && <p className="wp-msg" data-testid="week-msg">{pending.mensagem}</p>}
        {pending.holds.length > 0 && (
          <div className="wp-holds" data-testid="week-holds">
            {pending.holds.map((h) => <p key={h} className="small" style={{ margin: 0 }}>{h}</p>)}
          </div>
        )}
        {pending.planId && <p className="tiny muted" style={{ margin: '0 0 8px' }}>A versão aprovada antes continua no plano até você aprovar esta.</p>}
        <div className="wp-days">
          {days.map((d) => {
            const date = addDays(pending.date, d - 1);
            const ss = pending.sessions.filter((s) => s.day === d);
            return (
              <div key={d} className={`wp-day ${date === today ? 'today' : ''}`} data-testid="wp-day">
                <span className="wp-dl"><b>{WEEKDAY_SHORT[isoWeekday(date)]}</b><span className="num">{dayNum(date)}</span></span>
                <div className="wp-ss">
                  {ss.length ? ss.map((s, i) => <SessionRow key={`${d}-${i}`} s={s} />) : <span className="small muted wp-rest">Descanso</span>}
                </div>
              </div>
            );
          })}
        </div>
        {asking && (
          <div className="wp-ask">
            <div className="composer">
              <textarea value={pedido} onChange={(e) => setPedido(e.target.value)} rows={2} placeholder="Ex.: quinta não consigo; quero o longo de corrida no sábado" aria-label="O que mudar na semana" data-testid="week-ask-input" />
              <MicButton compact label="Falar" onText={(t) => setPedido((cur) => appendText(cur, t))} />
            </div>
            <button className="btn btn-ink btn-block" disabled={!pedido.trim() || !aiAvailable()} onClick={() => propose(pending.date, pedido.trim())} data-testid="week-ask-send"><RefreshCw size={17} />Refazer com isso</button>
          </div>
        )}
        <div className="wp-actions">
          <button className="btn btn-ink grow" onClick={approve} data-testid="week-approve"><Check size={18} />Aprovar semana</button>
          <button className="btn btn-soft" onClick={() => setAsking(!asking)} data-testid="week-adjust">Pedir ajuste</button>
        </div>
        <p className="tiny muted" style={{ margin: '10px 0 0' }}>Pedais vão para o MyWhoosh depois do aprovo; corrida e ioga ficam no app.</p>
      </section>
    );
  }

  // Sem proposta pendente: onde ela está no ciclo. Com a semana seguinte já aprovada (domingo), mostra ela.
  const before = today < active.start;
  const approved = nxt?.status === 'aprovada' ? nxt : cur?.status === 'aprovada' ? cur : undefined;
  const idx = approved ? approved.skeleton.index : before ? 1 : idxNow;
  const phase = phaseOf(active, idx);
  const inCycle = !before && weekIndex(active, today) <= total;
  const redoWeek = approved?.date ?? ws;
  const title = approved ? (approved.date > today ? `Semana aprovada · começa ${ddmm(approved.date)}` : 'Semana aprovada') : inCycle ? 'Semana ainda sem proposta' : active.title;
  return (
    <section className="block wp wp-compact" data-testid="week-plan-compact">
      <button className="wp-compact-head" onClick={() => setMore(!more)} aria-expanded={more}>
        <span>
          <span className="wp-k">{before && !approved ? `Ciclo começa ${ddmm(active.start)}` : `Semana ${idx} de ${total} · ${PHASE_LABEL[phase]}${isDeload(active, idx) ? ' · semana leve' : ''}`}</span>
          <b className="wp-t sm">{title}</b>
        </span>
        <ChevronDown size={18} className="wp-chev" aria-hidden />
      </button>
      <CycleBar m={active} current={idx} />
      <Countdown m={active} from={today} />
      {more && (
        <div style={{ marginTop: 10 }}>
          {approved?.mensagem && <p className="wp-msg">{approved.mensagem}</p>}
          {approved?.holds.map((h) => <p key={h} className="small" style={{ margin: '0 0 6px' }}>{h}</p>)}
          <div className="wp-actions">
            {(inCycle || approved) && <button className="btn btn-soft grow" disabled={!aiAvailable()} onClick={() => propose(redoWeek)} data-testid="week-redo"><RefreshCw size={17} />{approved ? 'Refazer a semana' : 'Montar a semana'}</button>}
            {approved && <button className="btn btn-soft" onClick={async () => { await undoWeek(approved); toast('Aprovo desfeito: o plano voltou ao de antes.'); }} data-testid="week-undo"><Undo2 size={17} />Desfazer</button>}
          </div>
        </div>
      )}
    </section>
  );
}
