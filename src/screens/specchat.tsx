// A dermatologista (Cuidados) e a nutricionista (Alimentação), no mesmo molde da treinadora:
// conversa em sessões, o que ela já sabe, desfazer, e propostas que só valem depois do aprovo.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, History, Plus, Send, Sparkles, Undo2, X } from 'lucide-react';
import { Sheet } from '../ui/ui';
import { useAll, useSettings } from '../db/hooks';
import { update } from '../db/db';
import { toast } from '../state/store';
import { MicButton, appendText } from '../ui/Dictation';
import { usePhotoPicker } from '../ui/PhotoPicker';
import { shrinkImage } from '../lib/image';
import { aiAvailable } from '../domain/ai';
import { archiveSpecChat, loadSpecSessions, openSpecChat, saveSpecChat, undoSpec, type ChatDomain, type FoodProposal, type SkinProposal, type SpecMsg, type SpecSession } from '../domain/specchat';
import { askDerm, approveDerm, describeChange } from '../domain/derm';
import { askNutri, approveNutri } from '../domain/nutri';
import { fmt, portionText, totals } from '../domain/nutrition';
import { MacroLine } from './food-ui';
import { PlanChat } from './specialist';

const DAYS = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const when = (t: number) => { const d = new Date(t); return `${DAYS[d.getDay() || 7]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}, ${d.toTimeString().slice(0, 5)}`; };

const CONF: Record<ChatDomain, { title: string; sub: string; aria: string; placeholder: string; busy: string; intro: string; examples: string[]; who: string }> = {
  skin: {
    title: 'Dermatologista', who: 'a dermatologista', aria: 'Falar com a dermatologista',
    sub: 'Conte como a pele está e o que mudou; eu ajusto a rotina',
    placeholder: 'Conte para a dermatologista…', busy: 'Olhando sua pele e seus produtos…',
    intro: 'Me conte como estão rosto, corpo e cabelo, o que você comprou, o que acabou ou o que vai ser diferente nos próximos dias. Pode mandar foto. Eu mudo a rotina de um dia ou da semana, cadastro produto novo e guardo o que deve valer para as próximas rotinas. Mudança de rotina só entra depois que você aprova.',
    examples: [
      'Acordei com a pele vermelha, alivia a noite de hoje',
      'Comprei um sérum de vitamina C, encaixa na semana',
      'Acabou o meu protetor solar, o que uso até comprar?',
      'Amanhã cedo tem natação, ajusta cabelo e corpo'
    ]
  },
  food: {
    title: 'Nutricionista', who: 'a nutricionista', aria: 'Falar com a nutricionista',
    sub: 'Conte o que comeu e o que muda no dia; eu ajusto o plano',
    placeholder: 'Conte para a nutricionista…', busy: 'Olhando suas refeições e seus treinos…',
    intro: 'Me conte o que comeu, como está a fome, o que vai ser diferente hoje ou nos próximos dias. Pode mandar foto do prato ou do cardápio. Eu respondo olhando metas, treinos e o que você já comeu, troco refeições de um dia e guardo o que deve valer para os próximos planos. Troca de refeição só entra depois que você aprova.',
    examples: [
      'Vou almoçar fora hoje, monta um jantar que feche a proteína',
      'O que comer antes do pedal das 18h?',
      'Estou sem fome no café da manhã, o que faço?',
      'Hoje não vou lanchar, estou em reunião'
    ]
  }
};

/** Botão redondo com o símbolo da IA, ao lado do título da área. */
export function SpecialistButton({ domain }: { domain: ChatDomain }) {
  const [open, setOpen] = useState(false);
  const c = CONF[domain];
  return (
    <>
      <button className="coach-btn" aria-label={c.aria} onClick={() => (aiAvailable() ? setOpen(true) : toast(`Entre com Google e conecte-se para falar com ${c.who}.`, undefined, 'error'))} data-testid={`spec-open-${domain}`}>
        <Sparkles size={20} />
      </button>
      <SpecSheet domain={domain} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Atalho em texto, para dentro das telas (ex.: na rotina do dia). */
export function SpecialistLink({ domain, label }: { domain: ChatDomain; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="pill-act pa-rose spec-link" onClick={() => (aiAvailable() ? setOpen(true) : toast(`Entre com Google e conecte-se para falar com ${CONF[domain].who}.`, undefined, 'error'))} data-testid={`spec-link-${domain}`}>
        <Sparkles size={15} /> {label}
      </button>
      <SpecSheet domain={domain} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

interface Pending { file: File; thumb: string }
const thumbOf = async (f: File) => { const s = await shrinkImage(f, 240); return `data:${s.mime};base64,${s.data}`; };

function SpecSheet({ domain, open, onClose }: { domain: ChatDomain; open: boolean; onClose: () => void }) {
  const c = CONF[domain];
  const settings = useSettings();
  const [msgs, setMsgs] = useState<SpecMsg[]>([]);
  const [input, setInput] = useState('');
  const [pics, setPics] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [showKnown, setShowKnown] = useState(false);
  const [past, setPast] = useState<SpecSession[]>([]);
  const [viewing, setViewing] = useState<SpecSession | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [approving, setApproving] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const opened = useRef(false);
  const picker = usePhotoPicker({
    multiple: true, testId: `spec-photo-input-${domain}`,
    onFiles: async (fs) => {
      const add = await Promise.all(Array.from(fs).slice(0, 3).map(async (file) => ({ file, thumb: await thumbOf(file) })));
      setPics((x) => [...x, ...add].slice(0, 3));
    }
  });

  const toBottom = (smooth: boolean) => {
    const box = logRef.current?.closest('.sh-body') as HTMLElement | null;
    if (!box) return;
    const go = () => box.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    go();
    requestAnimationFrame(() => requestAnimationFrame(go));
  };
  useEffect(() => {
    if (!open) { opened.current = false; setViewing(null); setShowPast(false); return; }
    void (async () => { const m = await openSpecChat(domain); setPast(await loadSpecSessions(domain)); setMsgs(m); })();
  }, [open]);
  useEffect(() => {
    if (!open || viewing) return;
    toBottom(opened.current);
    opened.current = true;
  }, [msgs.length, busy, open, viewing]);
  useEffect(() => { if (viewing) logRef.current?.closest('.sh-body')?.scrollTo({ top: 0 }); }, [viewing]);

  const commit = (list: SpecMsg[]) => { setMsgs(list); void saveSpecChat(domain, list); };
  const newChat = async () => {
    if (busy) return;
    await archiveSpecChat(domain, msgs);
    setMsgs([]); setPast(await loadSpecSessions(domain)); setShowPast(false); setViewing(null);
    inputRef.current?.focus();
  };

  const send = async (raw?: string) => {
    const t = (raw ?? input).trim();
    const files = raw ? [] : pics;
    if ((!t && !files.length) || busy) return;
    const list = [...msgs, { from: 'me' as const, text: t, images: files.length ? files.map((p) => p.thumb) : undefined, at: Date.now() }];
    commit(list); setInput(''); setPics([]); setBusy(true);
    if (inputRef.current) inputRef.current.style.height = '';
    try {
      const imgs = files.length ? await Promise.all(files.map((p) => shrinkImage(p.file, 1280))) : undefined;
      const reply = await (domain === 'skin' ? askDerm : askNutri)(t, msgs, imgs);
      commit([...list, reply]);
    } catch (e: any) {
      commit([...list, { from: 'ai', text: `Não consegui responder agora: ${e.message}`, at: Date.now() }]);
    } finally { setBusy(false); }
  };

  const approve = async (i: number) => {
    const m = msgs[i];
    if (!m.proposal || approving !== null) return;
    setApproving(i);
    try {
      const r = m.proposal.kind === 'skin' ? await approveDerm(m.proposal) : await approveNutri(m.proposal);
      commit(msgs.map((x, k) => (k === i ? { ...x, proposal: { ...m.proposal!, status: 'aprovado' } as typeof m.proposal, done: [...(x.done ?? []), ...r.done], undo: [...(x.undo ?? []), ...r.undo], undone: false } : x)));
      toast(m.proposal.kind === 'skin' ? 'Rotina ajustada' : 'Refeições trocadas no dia');
    } catch (e: any) { toast(`Não consegui aplicar: ${e.message}`, undefined, 'error'); }
    finally { setApproving(null); }
  };
  const discard = (i: number) => commit(msgs.map((x, k) => (k === i && x.proposal ? { ...x, proposal: { ...x.proposal, status: 'descartado' } as typeof x.proposal } : x)));
  const undo = async (i: number) => {
    await undoSpec(msgs[i]);
    commit(msgs.map((m, k) => (k === i ? { ...m, undone: true } : m)));
    toast('Desfeito');
  };

  const prefs = (settings?.aiPrefs?.[domain] ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  const removePref = (p: string) => update<'settings'>('settings', { aiPrefs: { ...(settings?.aiPrefs ?? {}), [domain]: prefs.filter((x) => x !== p).join('\n') || undefined } } as any);
  const lastWithUndo = msgs.map((m) => !!m.undo?.length && !m.undone).lastIndexOf(true);

  return (
    <Sheet open={open} onClose={onClose} title={c.title} sub={c.sub} testId={`spec-${domain}-chat`}
      footer={viewing ? (
        <button className="btn btn-soft grow" onClick={() => setViewing(null)}><ArrowLeft size={16} /> Voltar à conversa de agora</button>
      ) : (
        <div className="composer-wrap">
          {pics.length > 0 && (
            <div className="composer-pics" data-testid="spec-pics">
              {pics.map((p, k) => (
                <span key={k} className="cp-pic"><img src={p.thumb} alt="" /><button aria-label="Tirar foto" onClick={() => setPics((x) => x.filter((_, j) => j !== k))}><X size={14} /></button></span>
              ))}
            </div>
          )}
          <div className="composer">
            <textarea ref={inputRef} value={input} rows={1} aria-label={`Mensagem para ${c.who}`} data-testid="spec-input" placeholder={c.placeholder}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(140, e.target.scrollHeight)}px`; }}
              onFocus={() => setTimeout(() => toBottom(true), 250)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); void send(); } }} />
            <button className="composer-icon" aria-label="Mandar foto" onClick={picker.open} disabled={busy || pics.length >= 3} data-testid="spec-photo"><Camera size={20} /></button>
            <MicButton compact label="Falar" onText={(t) => setInput((x) => appendText(x, t))} />
            <button className="composer-send" onClick={() => void send()} disabled={(!input.trim() && !pics.length) || busy} aria-label="Enviar" data-testid="spec-send"><Send size={18} /></button>
          </div>
          {picker.el}
        </div>
      )}>
      <div className="coach-bar">
        {prefs.length > 0 && !viewing && <button className="link" onClick={() => setShowKnown(!showKnown)}>{showKnown ? 'Ocultar' : 'O que eu já sei'} ({prefs.length})</button>}
        <span className="grow" />
        {past.length > 0 && !viewing && <button className="link" onClick={() => setShowPast(!showPast)} data-testid="spec-past"><History size={14} style={{ verticalAlign: '-2px' }} /> Anteriores</button>}
        {msgs.some((m) => m.from === 'me') && !viewing && <button className="link" onClick={() => void newChat()} disabled={busy} data-testid="spec-new"><Plus size={14} style={{ verticalAlign: '-2px' }} /> Nova conversa</button>}
      </div>
      {showKnown && !viewing && (
        <div className="coach-known"><ul>{prefs.map((p) => <li key={p}><span>{p}</span><button className="icon-btn" aria-label="Remover preferência" onClick={() => removePref(p)}><X size={16} /></button></li>)}</ul></div>
      )}
      {showPast && !viewing && (
        <ul className="coach-past" data-testid="spec-past-list">
          {past.map((s) => (
            <li key={s.id}><button onClick={() => { setViewing(s); setShowPast(false); }}>
              <span className="small muted">{when(s.start)}</span><b>{s.title || 'Conversa'}</b>
              {s.done.length ? <span className="small">{s.done.length} {s.done.length === 1 ? 'mudança' : 'mudanças'} no app</span> : null}
            </button></li>
          ))}
        </ul>
      )}

      {viewing ? (
        <div className="chat" data-testid="spec-old">
          <p className="small muted" style={{ margin: '4px 0' }}>Conversa de {when(viewing.start)}, encerrada. O que mudou no app continua valendo.</p>
          {viewing.msgs.map((m, i) => (
            <div key={i} className={`bubble ${m.from}`}>
              <p>{m.text}</p>
              {m.done?.length ? <div className="nf coach-done"><b>{m.undone ? 'Desfeito' : 'Mudei no app'}</b><ul className={m.undone ? 'struck' : ''}>{m.done.map((d, k) => <li key={k}>{d}</li>)}</ul></div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="chat" data-testid="spec-log" ref={logRef}>
          {!msgs.length && (
            <div className="bubble ai">
              <p>{c.intro}</p>
              <div className="chips coach-ex">{c.examples.map((e) => <button key={e} className="chip" onClick={() => void send(e)}>{e}</button>)}</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`bubble ${m.from}`}>
              {m.images?.length ? <div className="bubble-pics">{m.images.map((src, k) => <img key={k} src={src} alt="Foto enviada" />)}</div> : null}
              {m.text && <p>{m.text}</p>}
              {m.done?.length ? (
                <div className="nf coach-done" data-testid="spec-done">
                  <b>{m.undone ? 'Desfeito' : 'Mudei no app'}</b>
                  <ul className={m.undone ? 'struck' : ''}>{m.done.map((d, k) => <li key={k}>{d}</li>)}</ul>
                  {i === lastWithUndo && <button className="link" onClick={() => undo(i)} data-testid="spec-undo"><Undo2 size={14} style={{ verticalAlign: '-2px' }} /> Desfazer</button>}
                </div>
              ) : null}
              {m.proposal?.kind === 'skin' ? <SkinProposalCard p={m.proposal} busy={approving === i} onApprove={() => void approve(i)} onDiscard={() => discard(i)} /> : null}
              {m.proposal?.kind === 'food' ? <FoodProposalCard p={m.proposal} busy={approving === i} onApprove={() => void approve(i)} onDiscard={() => discard(i)} /> : null}
              {m.failed?.length ? <div className="nf"><b>Não consegui</b><ul>{m.failed.map((d, k) => <li key={k}>{d}</li>)}</ul></div> : null}
              {m.suggestion ? (
                <div className="nf">
                  <b>Para o plano</b><span>{m.suggestion}</span>
                  <button className="pill-act pa-blue" style={{ alignSelf: 'flex-start' }} onClick={() => setPlanOpen(true)}>Refazer o plano com ela</button>
                </div>
              ) : null}
            </div>
          ))}
          {busy && <div className="bubble ai typing"><Sparkles size={15} /> {c.busy}</div>}
        </div>
      )}
      <PlanChat domain={domain} open={planOpen} onClose={() => setPlanOpen(false)} />
    </Sheet>
  );
}

function ProposalActions({ pending, busy, onApprove, onDiscard, label }: { pending: boolean; busy: boolean; onApprove: () => void; onDiscard: () => void; label: string }) {
  if (!pending) return null;
  return (
    <>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="pill-act pa-blue" onClick={onApprove} disabled={busy} data-testid="spec-approve"><Check size={14} style={{ verticalAlign: '-2px' }} /> {busy ? 'Aplicando…' : label}</button>
        <button className="link" onClick={onDiscard} disabled={busy}>Descartar</button>
      </div>
      <span className="tiny muted">Quer mudar algo? É só falar abaixo que eu refaço.</span>
    </>
  );
}

/** Mudança de rotina, linha a linha: o que entra e o que sai, em cada período e dia. */
function SkinProposalCard({ p, busy, onApprove, onDiscard }: { p: SkinProposal; busy: boolean; onApprove: () => void; onDiscard: () => void }) {
  const products = useAll('product');
  const name = (id: string) => products?.find((x) => x.id === id)?.name ?? '…';
  const head = (c: SkinProposal['changes'][number]) => describeChange({ ...c, add: [], remove: [] }, name).replace(/: \.$/, '');
  return (
    <div className={`nf coach-proposal${p.status === 'descartado' ? ' struck' : ''}`} data-testid="spec-proposal">
      <b>{p.status === 'aprovado' ? 'Aprovado' : p.status === 'descartado' ? 'Descartado' : p.scope === 'dia' ? 'Proposta para o dia' : 'Proposta para a semana'}</b>
      <span><b>{p.title}</b></span>
      <ul className="rp-list">
        {p.changes.map((c, k) => (
          <li key={k}>
            <span className="rp-when">{head(c)}</span>
            {c.add.length ? <span className="rp-in"><i>Entra</i> {c.add.map(name).join(', ')}</span> : null}
            {c.remove.length ? <span className="rp-out"><i>Sai</i> {c.remove.map(name).join(', ')}</span> : null}
          </li>
        ))}
      </ul>
      {p.note ? <span className="small">{p.note}</span> : null}
      {p.status === 'aprovado' && <span className="small muted">{p.scope === 'dia' ? 'Já está na rotina do dia.' : 'Vale a partir de hoje no plano da semana.'}</span>}
      <ProposalActions pending={!p.status} busy={busy} onApprove={onApprove} onDiscard={onDiscard} label={p.scope === 'dia' ? 'Aplicar no dia' : 'Aplicar na semana'} />
    </div>
  );
}

/** Refeições propostas para o dia, com itens, porções e macros calculados pela tabela. */
function FoodProposalCard({ p, busy, onApprove, onDiscard }: { p: FoodProposal; busy: boolean; onApprove: () => void; onDiscard: () => void }) {
  const foods = useAll('food');
  const settings = useSettings();
  const label = (id: string) => settings?.mealTypes?.find((m) => m.id === id)?.label ?? id;
  const fname = (id: string) => (id.startsWith('novo:') ? id.slice(5) : foods?.find((f) => f.id === id)?.name ?? '…');
  const day = `${DAYS[new Date(p.date + 'T12:00:00').getDay() || 7]} ${p.date.slice(8, 10)}/${p.date.slice(5, 7)}`;
  const all = foods ? totals(p.meals.flatMap((m) => m.items), foods) : undefined;
  return (
    <div className={`nf coach-proposal${p.status === 'descartado' ? ' struck' : ''}`} data-testid="spec-proposal">
      <b>{p.status === 'aprovado' ? 'Aprovado' : p.status === 'descartado' ? 'Descartado' : 'Proposta de refeição'}</b>
      <span className="small muted">{day}, no lugar do plano</span>
      {p.meals.map((m, k) => {
        const n = foods ? totals(m.items, foods) : undefined;
        return (
          <div key={k} className="fp-meal">
            <span><b>{label(m.mealType)}</b> · {m.name}{n && n.n.kcal ? <span className="num"> · {fmt(n.n.kcal)} kcal</span> : null}</span>
            <ul>{m.items.map((i, j) => <li key={j}>{fname(i.foodId)} <span className="muted">{portionText(foods?.find((f) => f.id === i.foodId), i)}</span></li>)}</ul>
            {n && n.n.kcal ? <MacroLine n={n.n} className="tiny" /> : null}
          </div>
        );
      })}
      {all && all.missing > 0 ? <span className="tiny muted">{all.missing} {all.missing === 1 ? 'item sem dados nutricionais' : 'itens sem dados nutricionais'}, fora da conta.</span> : null}
      {p.note ? <span className="small">{p.note}</span> : null}
      {p.status === 'aprovado' && <span className="small muted">Já está no seu dia, na aba Alimentação.</span>}
      <ProposalActions pending={!p.status} busy={busy} onApprove={onApprove} onDiscard={onDiscard} label="Usar no dia" />
    </div>
  );
}
