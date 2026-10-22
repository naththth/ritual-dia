// A treinadora na aba Treino: ela conta como foi, o que é diferente nos treinos e nos dias, e o app se ajusta.
import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Undo2, X } from 'lucide-react';
import { Sheet } from '../ui/ui';
import { useSettings } from '../db/hooks';
import { update } from '../db/db';
import { toast } from '../state/store';
import { MicButton, appendText } from '../ui/Dictation';
import { aiAvailable } from '../domain/ai';
import { askCoach, loadCoachChat, saveCoachChat, undoCoach, type CoachMsg } from '../domain/coach';
import { PlanChat } from './specialist';

const DAYS = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const EXAMPLES = [
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
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) void loadCoachChat().then(setMsgs); }, [open]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs.length, busy]);

  const commit = (list: CoachMsg[]) => { setMsgs(list); void saveCoachChat(list); };

  const send = async (raw?: string) => {
    const t = (raw ?? input).trim();
    if (!t || busy) return;
    const list = [...msgs, { from: 'me' as const, text: t, at: Date.now() }];
    commit(list); setInput(''); setBusy(true);
    try {
      const reply = await askCoach(t, msgs);
      commit([...list, reply]);
    } catch (e: any) {
      commit([...list, { from: 'ai', text: `Não consegui responder agora: ${e.message}`, at: Date.now() }]);
    } finally { setBusy(false); }
  };

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
    <Sheet open={open} onClose={onClose} title="Treinadora" sub="Conte como foi e o que é diferente; eu ajusto no app" testId="coach">
      {(rules.length > 0 || prefs.length > 0) && (
        <div className="coach-known">
          <button className="link" onClick={() => setShowKnown(!showKnown)}>{showKnown ? 'Ocultar' : 'O que eu já sei'} ({rules.length + prefs.length})</button>
          {showKnown && (
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
          )}
        </div>
      )}

      <div className="chat" data-testid="coach-log">
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
        <div ref={endRef} />
      </div>

      <div className="chat-input">
        <textarea value={input} rows={1} aria-label="Mensagem para a treinadora" data-testid="coach-input" placeholder="Ex.: a musculação de ontem foi LPO"
          onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(140, e.target.scrollHeight)}px`; }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); void send(); } }} />
        <MicButton compact label="Falar" onText={(t) => setInput((x) => appendText(x, t))} />
        <button className="chat-send icon" onClick={() => void send()} disabled={!input.trim() || busy} aria-label="Enviar" data-testid="coach-send"><Send size={18} /></button>
      </div>
      <PlanChat domain="training" open={planOpen} onClose={() => setPlanOpen(false)} />
    </Sheet>
  );
}
