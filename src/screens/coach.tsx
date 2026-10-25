// A treinadora na aba Treino: ela conta como foi, o que é diferente nos treinos e nos dias, e o app se ajusta.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, History, Plus, Send, Sparkles, Undo2, X } from 'lucide-react';
import { Sheet } from '../ui/ui';
import { useSettings } from '../db/hooks';
import { update } from '../db/db';
import { toast } from '../state/store';
import { MicButton, appendText } from '../ui/Dictation';
import { aiAvailable } from '../domain/ai';
import { approveProposal, archiveCoachChat, askCoach, loadCoachSessions, openCoachChat, saveCoachChat, undoCoach, type CoachMsg, type CoachProposal, type CoachSession } from '../domain/coach';
import type { WorkoutStep } from '../db/types';
import { PlanChat } from './specialist';

const DAYS = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const when = (t: number) => { const d = new Date(t); return `${DAYS[d.getDay() || 7]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}, ${d.toTimeString().slice(0, 5)}`; };
const EXAMPLES = [
  'Hoje não vou à yoga, monta um pedal de 45 min no lugar',
  'Toda musculação de terça e quinta à noite é LPO',
  'O pedal de hoje pesou mais do que parece, esforço 8',
  'Hoje não vou treinar, dormi mal'
];

/** Botão com o símbolo da IA, ao lado do título da aba. */
export function CoachButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="coach-btn" aria-label="Falar com a treinadora" onClick={() => (aiAvailable() ? setOpen(true) : toast('Entre com Google e conecte-se para falar com a treinadora.', undefined, 'error'))} data-testid="coach-open">
        <Sparkles size={20} />
      </button>
      <CoachSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function CoachSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useSettings();
  const [msgs, setMsgs] = useState<CoachMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [showKnown, setShowKnown] = useState(false);
  const [past, setPast] = useState<CoachSession[]>([]);
  const [viewing, setViewing] = useState<CoachSession | null>(null);
  const [showPast, setShowPast] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const opened = useRef(false);

  // A rolagem é da folha (sh-body), não da lista: desce até a última mensagem.
  const toBottom = (smooth: boolean) => {
    const box = logRef.current?.closest('.sh-body') as HTMLElement | null;
    if (!box) return;
    const go = () => box.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    go();
    requestAnimationFrame(() => requestAnimationFrame(go)); // de novo depois que o layout (e a animação da folha) assentar
  };

  useEffect(() => {
    if (!open) { opened.current = false; setViewing(null); setShowPast(false); return; }
    void (async () => { const m = await openCoachChat(); setPast(await loadCoachSessions()); setMsgs(m); })(); // nessa ordem: abrir pode encerrar a conversa parada
  }, [open]);
  useEffect(() => {
    if (!open || viewing) return;
    // Ao abrir: direto no fim, sem animação. Depois: desce suave a cada mensagem enviada ou recebida.
    toBottom(opened.current);
    opened.current = true;
  }, [msgs.length, busy, open, viewing]);

  useEffect(() => { if (viewing) (logRef.current?.closest('.sh-body') ?? document.querySelector('[data-testid="coach"] .sh-body'))?.scrollTo({ top: 0 }); }, [viewing]);

  const newChat = async () => {
    if (busy) return;
    await archiveCoachChat(msgs);
    setMsgs([]); setPast(await loadCoachSessions()); setShowPast(false); setViewing(null);
    inputRef.current?.focus();
  };

  const commit = (list: CoachMsg[]) => { setMsgs(list); void saveCoachChat(list); };

  const send = async (raw?: string) => {
    const t = (raw ?? input).trim();
    if (!t || busy) return;
    const list = [...msgs, { from: 'me' as const, text: t, at: Date.now() }];
    commit(list); setInput(''); setBusy(true);
    if (inputRef.current) inputRef.current.style.height = '';
    try {
      const reply = await askCoach(t, msgs);
      commit([...list, reply]);
    } catch (e: any) {
      commit([...list, { from: 'ai', text: `Não consegui responder agora: ${e.message}`, at: Date.now() }]);
    } finally { setBusy(false); }
  };

  const [approving, setApproving] = useState<number | null>(null);
  const approve = async (i: number) => {
    const m = msgs[i];
    if (!m.proposal || approving !== null) return;
    setApproving(i);
    try {
      const r = await approveProposal(m.proposal);
      commit(msgs.map((x, k) => (k === i ? { ...x, proposal: { ...m.proposal!, status: 'aprovado', sent: r.sent }, done: [...(x.done ?? []), ...r.done], undo: [...(x.undo ?? []), ...r.undo], undone: false } : x)));
      toast(r.sent === 'enviado' ? 'Treino no app e a caminho do MyWhoosh' : r.sent === 'falhou' ? 'Treino no app; o envio ao intervals falhou, tento de novo na próxima hora' : 'Treino no app');
    } catch (e: any) { toast(`Não consegui aplicar: ${e.message}`, undefined, 'error'); }
    finally { setApproving(null); }
  };
  const discard = (i: number) => commit(msgs.map((x, k) => (k === i && x.proposal ? { ...x, proposal: { ...x.proposal, status: 'descartado' } } : x)));

  const undo = async (i: number) => {
    await undoCoach(msgs[i]);
    commit(msgs.map((m, k) => (k === i ? { ...m, undone: true } : m)));
    toast('Desfeito');
  };

  const rules = settings?.trainingRules ?? [];
  const prefs = (settings?.aiPrefs?.training ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  const removePref = (p: string) => update<'settings'>('settings', { aiPrefs: { ...(settings?.aiPrefs ?? {}), training: prefs.filter((x) => x !== p).join('\n') || undefined } } as any);
  const removeRule = (id: string) => update<'settings'>('settings', { trainingRules: rules.filter((r) => r.id !== id) });
  const lastWithUndo = msgs.map((m) => !!m.undo?.length && !m.undone).lastIndexOf(true);

  return (
    <Sheet open={open} onClose={onClose} title="Treinadora" sub="Conte como foi e o que é diferente; eu ajusto no app" testId="coach"
      footer={viewing ? (
        <button className="btn btn-soft grow" onClick={() => setViewing(null)}><ArrowLeft size={16} /> Voltar à conversa de agora</button>
      ) : (
        <div className="composer">
          <textarea ref={inputRef} value={input} rows={1} aria-label="Mensagem para a treinadora" data-testid="coach-input" placeholder="Conte para a treinadora…"
            onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(140, e.target.scrollHeight)}px`; }}
            onFocus={() => setTimeout(() => toBottom(true), 250)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); void send(); } }} />
          <MicButton compact label="Falar" onText={(t) => setInput((x) => appendText(x, t))} />
          <button className="composer-send" onClick={() => void send()} disabled={!input.trim() || busy} aria-label="Enviar" data-testid="coach-send"><Send size={18} /></button>
        </div>
      )}>
      <div className="coach-bar">
        {(rules.length > 0 || prefs.length > 0) && !viewing && (
          <button className="link" onClick={() => setShowKnown(!showKnown)}>{showKnown ? 'Ocultar' : 'O que eu já sei'} ({rules.length + prefs.length})</button>
        )}
        <span className="grow" />
        {past.length > 0 && !viewing && <button className="link" onClick={() => setShowPast(!showPast)} data-testid="coach-past"><History size={14} style={{ verticalAlign: '-2px' }} /> Anteriores</button>}
        {msgs.some((m) => m.from === 'me') && !viewing && <button className="link" onClick={() => void newChat()} disabled={busy} data-testid="coach-new"><Plus size={14} style={{ verticalAlign: '-2px' }} /> Nova conversa</button>}
      </div>
      {showKnown && !viewing && (
        <div className="coach-known">
          <ul>
            {rules.map((r) => (
              <li key={r.id}>
                <span><b>Regra.</b> {r.text}{r.weekdays?.length ? ` · ${r.weekdays.map((d) => DAYS[d]).join(', ')}` : ''}{r.from || r.to ? ` · ${r.from ?? '00:00'}–${r.to ?? '23:59'}` : ''}</span>
                <button className="icon-btn" aria-label="Remover regra" onClick={() => removeRule(r.id)}><X size={16} /></button>
              </li>
            ))}
            {prefs.map((p) => (
              <li key={p}><span>{p}</span><button className="icon-btn" aria-label="Remover preferência" onClick={() => removePref(p)}><X size={16} /></button></li>
            ))}
          </ul>
        </div>
      )}
      {showPast && !viewing && (
        <ul className="coach-past" data-testid="coach-past-list">
          {past.map((c) => (
            <li key={c.id}>
              <button onClick={() => { setViewing(c); setShowPast(false); }}>
                <span className="small muted">{when(c.start)}</span>
                <b>{c.title || 'Conversa'}</b>
                {c.done.length ? <span className="small">{c.done.length} {c.done.length === 1 ? 'mudança' : 'mudanças'} no app</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {viewing ? (
        <div className="chat" data-testid="coach-old">
          <p className="small muted" style={{ margin: '4px 0' }}>Conversa de {when(viewing.start)}, encerrada. O que mudou no app continua valendo.</p>
          {viewing.msgs.map((m, i) => (
            <div key={i} className={`bubble ${m.from}`}>
              <p>{m.text}</p>
              {m.done?.length ? <div className="nf coach-done"><b>{m.undone ? 'Desfeito' : 'Mudei no app'}</b><ul className={m.undone ? 'struck' : ''}>{m.done.map((d, k) => <li key={k}>{d}</li>)}</ul></div> : null}
            </div>
          ))}
        </div>
      ) : (
      <div className="chat" data-testid="coach-log" ref={logRef}>
        {!msgs.length && (
          <div className="bubble ai">
            <p>Me conte o que o app precisa saber sobre os seus treinos: o que o relógio registra errado, o que muda em cada dia, como você se sentiu. Eu corrijo os registros, crio regras para as próximas vezes e guardo o que deve valer para os planos.</p>
            <div className="chips coach-ex">{EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => void send(e)}>{e}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.from}`}>
            <p>{m.text}</p>
            {m.done?.length ? (
              <div className="nf coach-done" data-testid="coach-done">
                <b>{m.undone ? 'Desfeito' : 'Mudei no app'}</b>
                <ul className={m.undone ? 'struck' : ''}>{m.done.map((d, k) => <li key={k}>{d}</li>)}</ul>
                {i === lastWithUndo && <button className="link" onClick={() => undo(i)} data-testid="coach-undo"><Undo2 size={14} style={{ verticalAlign: '-2px' }} /> Desfazer</button>}
              </div>
            ) : null}
            {m.proposal ? <ProposalCard p={m.proposal} busy={approving === i} onApprove={() => void approve(i)} onDiscard={() => discard(i)} /> : null}
            {m.failed?.length ? <div className="nf"><b>Não consegui</b><ul>{m.failed.map((d, k) => <li key={k}>{d}</li>)}</ul></div> : null}
            {m.suggestion ? (
              <div className="nf">
                <b>Para o plano</b><span>{m.suggestion}</span>
                <button className="pill-act pa-blue" style={{ alignSelf: 'flex-start' }} onClick={() => setPlanOpen(true)}>Ajustar o plano</button>
              </div>
            ) : null}
          </div>
        ))}
        {busy && <div className="bubble ai typing"><Sparkles size={15} /> Lendo seus treinos…</div>}
      </div>
      )}
      <PlanChat domain="training" open={planOpen} onClose={() => setPlanOpen(false)} />
    </Sheet>
  );
}

const dur = (min: number) => { const t = Math.round(min * 60); return t < 60 ? `${t}s` : t % 60 ? `${Math.floor(t / 60)}min${t % 60}s` : `${t / 60} min`; };
const same = (a: WorkoutStep, b: WorkoutStep) => a.minutes === b.minutes && a.pct === b.pct && a.label === b.label;
/** Junta repetições seguidas (1 ou 2 blocos que se repetem) em "5× (30s forte / 30s leve)". */
function groupSteps(steps: WorkoutStep[]) {
  const out: { reps: number; steps: WorkoutStep[] }[] = [];
  let i = 0;
  while (i < steps.length) {
    let best = { len: 1, reps: 1 };
    for (const len of [2, 1]) {
      let reps = 1;
      while (i + (reps + 1) * len <= steps.length && steps.slice(i + reps * len, i + (reps + 1) * len).every((s, k) => same(s, steps[i + k]))) reps++;
      if (reps > 1 && reps * len > best.reps * best.len) best = { len, reps };
    }
    out.push({ reps: best.reps, steps: steps.slice(i, i + best.len) });
    i += best.reps * best.len;
  }
  return out;
}
const zone = (pct: number) => (pct < 56 ? 'Z1' : pct < 76 ? 'Z2' : pct < 91 ? 'Z3' : pct < 106 ? 'Z4' : pct < 121 ? 'Z5' : 'Z6');

/** O treino proposto, bloco a bloco, com watts pelo FTP; só entra no app e no MyWhoosh depois do aprovo. */
function ProposalCard({ p, busy, onApprove, onDiscard }: { p: CoachProposal; busy: boolean; onApprove: () => void; onDiscard: () => void }) {
  const settings = useSettings();
  const ftp = settings?.ftp;
  const day = `${DAYS[new Date(p.date + 'T12:00:00').getDay() || 7]} ${p.date.slice(8, 10)}/${p.date.slice(5, 7)}`;
  const max = Math.max(...(p.steps ?? []).map((s) => s.pct), 100);
  const pending = !p.status;
  return (
    <div className={`nf coach-proposal${p.status === 'descartado' ? ' struck' : ''}`} data-testid="coach-proposal">
      <b>{p.status === 'aprovado' ? 'Aprovado' : p.status === 'descartado' ? 'Descartado' : 'Proposta de treino'}</b>
      <span><b>{p.name}</b> · {day}{p.time ? ` às ${p.time}` : ''} · {p.minutes} min</span>
      {p.steps?.length ? (
        <>
          <div className="cp-bars" aria-hidden="true">
            {p.steps.map((s, k) => <i key={k} style={{ flexGrow: s.minutes, height: `${Math.max(12, (s.pct / max) * 100)}%` }} className={`cp-${zone(s.pct).toLowerCase()}`} />)}
          </div>
          <ol className="cp-steps">
            {groupSteps(p.steps).map((g, k) => (
              <li key={k}>
                {g.reps > 1 && <span className="cp-reps">{g.reps}×</span>}
                {g.steps.map((s, j) => (
                  <span key={j} className={j ? 'cp-sub' : undefined}><span>{s.label}</span><span className="num">{dur(s.minutes)} · {s.pct}%{ftp ? ` · ${Math.round((ftp * s.pct) / 100)} W` : ''} · {zone(s.pct)}</span></span>
                ))}
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {p.note ? <span className="small">{p.note}</span> : null}
      {pending ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="pill-act pa-blue" onClick={onApprove} disabled={busy} data-testid="coach-approve"><Check size={14} style={{ verticalAlign: '-2px' }} /> {busy ? 'Enviando…' : p.steps?.length ? 'Aprovar e mandar pro MyWhoosh' : 'Aprovar'}</button>
          <button className="link" onClick={onDiscard} disabled={busy}>Descartar</button>
        </div>
      ) : p.status === 'aprovado' ? (
        <span className="small muted">{p.sent === 'enviado' ? 'No intervals.icu: escolha no MyWhoosh em Treinos agendados.' : p.sent === 'falhou' ? 'O envio ao intervals falhou agora; o app tenta de novo na próxima hora.' : p.steps?.length ? 'Conecte o intervals.icu em Ajustes para ir ao MyWhoosh.' : 'Está no seu dia.'}</span>
      ) : null}
      {pending && <span className="tiny muted">Quer mudar algo? É só falar abaixo que eu refaço.</span>}
    </div>
  );
}
