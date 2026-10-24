// Ajustes do app com o Claude: uma aba lateral em toda tela abre a sessão; ela conta o que mudar e finaliza.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, ExternalLink, ImagePlus, RefreshCw, Send, Trash2, Wrench, X } from 'lucide-react';
import { Sheet } from '../ui/ui';
import { useAll, useSettings } from '../db/hooks';
import { toast } from '../state/store';
import { MicButton, appendText } from '../ui/Dictation';
import { useSync, syncNow } from '../sync/sync';
import { usePhotoPicker } from '../ui/PhotoPicker';
import { addDevMessage, discardDevRequest, finishDevRequest, screenName, startDevRequest } from '../domain/dev';
import type { DevRequest } from '../db/types';

const STATUS: Record<DevRequest['status'], string> = {
  aberta: 'Em aberto', finalizada: 'Na fila', em_andamento: 'Claude ajustando', feito: 'Publicado', precisa_voce: 'Claude perguntou', falhou: 'Não deu certo'
};
const when = (t: number) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function DevAssist() {
  const loc = useLocation();
  const settings = useSettings();
  const reqs = useAll('devreq');
  const [open, setOpen] = useState(false);
  const active = (reqs ?? []).some((r) => r.status === 'finalizada' || r.status === 'em_andamento');
  const asks = (reqs ?? []).some((r) => r.status === 'precisa_voce');
  if (settings?.devAssist?.hidden) return null;
  return (
    <>
      <button className={`dev-tab${active ? ' busy' : ''}${asks ? ' asks' : ''}`} aria-label="Ajustar esta tela com o Claude" onClick={() => setOpen(true)} data-testid="dev-open">
        <Wrench size={17} />
      </button>
      <DevSheet open={open} onClose={() => setOpen(false)} route={loc.pathname + loc.search} />
    </>
  );
}

function DevSheet({ open, onClose, route }: { open: boolean; onClose: () => void; route: string }) {
  const reqs = useAll('devreq');
  const settings = useSettings();
  const session = useSync((s) => s.session);
  const nav = useNavigate();
  const [viewId, setViewId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const picker = usePhotoPicker({ multiple: true, onFiles: (fs) => setFiles((x) => [...x, ...Array.from(fs)].slice(0, 3)), testId: 'dev-photo' });

  const list = useMemo(() => [...(reqs ?? [])].sort((a, b) => b.createdAt - a.createdAt), [reqs]);
  const current = list.find((r) => r.id === viewId) ?? list.find((r) => r.status === 'aberta' || r.status === 'precisa_voce');
  const waiting = list.some((r) => r.status === 'finalizada' || r.status === 'em_andamento');

  // Enquanto o Claude trabalha, busca as respostas dele.
  useEffect(() => {
    if (!open) return;
    void syncNow();
    if (!waiting) return;
    const t = setInterval(() => void syncNow(), 20000);
    return () => clearInterval(t);
  }, [open, waiting]);
  useEffect(() => { if (!open) { setViewId(null); setFiles([]); } }, [open]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [current?.messages.length, current?.status]);

  const start = async () => { const r = await startDevRequest(route.split('?')[0]); setViewId(r.id); };
  const send = async () => {
    if (!current || (!input.trim() && !files.length) || busy) return;
    setBusy(true);
    try { await addDevMessage(current.id, input || '(print)', files); setInput(''); setFiles([]); }
    catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(false); }
  };
  const finish = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      if (input.trim() || files.length) { await addDevMessage(current.id, input || '(print)', files); setInput(''); setFiles([]); }
      const r = await finishDevRequest(current.id);
      toast(r.fired ? 'Ajuste enviado ao Claude' : !session ? 'Ajuste salvo. Entre com Google para enviar ao Claude.' : settings?.devAssist?.connected ? `Ajuste salvo; não consegui chamar o Claude agora (${r.error}). Vai junto no próximo.` : 'Ajuste salvo. Conecte o Claude em Ajustes para ele começar.', undefined, r.fired ? undefined : 'error');
      setViewId(current.id);
    } catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(false); }
  };

  const writable = current && (current.status === 'aberta' || current.status === 'precisa_voce');
  const past = list.filter((r) => r.id !== current?.id).slice(0, 8);

  return (
    <Sheet open={open} onClose={onClose} title="Ajuste com Claude" sub={current ? `Tela: ${current.screen}` : `Tela: ${screenName(route.split('?')[0])}`} testId="dev">
      {!settings?.devAssist?.connected && (
        <div className="nf dev-warn"><span className="small">O Claude ainda não está conectado. Você já pode registrar ajustes; para ele começar a fazer, conecte em Ajustes.</span>
          <button className="link" onClick={() => { onClose(); nav('/ajustes'); }}>Conectar</button></div>
      )}

      {!current ? (
        <div className="bubble ai">
          <p>Me conte o que mudar nesta tela: o que está estranho, o que falta, como você queria que funcionasse. Pode mandar várias mensagens e prints. Quando terminar, toque em <b>Finalizar ajuste</b>: eu faço a mudança, testo e publico, e respondo aqui.</p>
          <button className="btn btn-ink btn-sm" onClick={() => void start()} data-testid="dev-start"><Wrench size={15} /> Iniciar sessão nesta tela</button>
        </div>
      ) : (
        <div className="chat" data-testid="dev-log">
          {current.messages.length === 0 && <div className="bubble ai"><p>Sessão aberta na tela <b>{current.screen}</b>. O que você quer ajustar?</p></div>}
          {current.messages.map((m, i) => (
            <div key={i} className={`bubble ${m.from === 'ela' ? 'me' : 'ai'}`}>
              {m.text && m.text !== '(print)' && <p>{m.text}</p>}
              {m.images?.length ? <div className="dev-imgs">{m.images.map((src, k) => <img key={k} src={src} alt="Print enviado" />)}</div> : null}
            </div>
          ))}
          {!writable && (
            <div className={`dev-status st-${current.status}`} data-testid="dev-status">
              <b>{STATUS[current.status]}</b>
              <span className="small">
                {current.status === 'finalizada' ? 'O Claude pega em instantes.' : current.status === 'em_andamento' ? 'Mexendo no código, testando e publicando. Pode fechar; a resposta aparece aqui.' : current.status === 'feito' ? 'Já está no app. Recarregue para ver.' : current.summary ?? ''}
              </span>
              <div className="row wrap" style={{ gap: 8 }}>
                {current.status === 'feito' && <button className="btn btn-ink btn-sm" onClick={() => window.location.reload()}><RefreshCw size={15} /> Recarregar o app</button>}
                {current.claudeUrl && <a className="link" href={current.claudeUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} style={{ verticalAlign: '-2px' }} /> Acompanhar no Claude</a>}
                {(current.status === 'feito' || current.status === 'falhou') && <button className="link" onClick={() => void start()}>Nova sessão</button>}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      {writable && (
        <>
          {files.length > 0 && (
            <div className="dev-pending">{files.map((f, i) => <span key={i} className="chip">{f.name.slice(0, 18)}<button aria-label="Tirar print" onClick={() => setFiles(files.filter((_, k) => k !== i))}><X size={12} /></button></span>)}</div>
          )}
          <div className="chat-input">
            <textarea value={input} rows={1} aria-label="O que ajustar" data-testid="dev-input" placeholder={current!.status === 'precisa_voce' ? 'Responda ao Claude' : 'Ex.: o botão de salvar fica escondido'}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(140, e.target.scrollHeight)}px`; }} />
            <button className="icon-btn" aria-label="Anexar print" onClick={picker.open}><ImagePlus size={20} /></button>
            <MicButton compact label="Falar" onText={(t) => setInput((x) => appendText(x, t))} />
            <button className="chat-send icon" onClick={() => void send()} disabled={(!input.trim() && !files.length) || busy} aria-label="Enviar" data-testid="dev-send"><Send size={18} /></button>
          </div>
          {picker.el}
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn btn-ink grow" onClick={() => void finish()} disabled={busy || (!current!.messages.some((m) => m.from === 'ela') && !input.trim() && !files.length)} data-testid="dev-finish"><Check size={16} /> Finalizar ajuste</button>
            {current!.status === 'aberta' && !current!.messages.some((m) => m.from === 'claude') && <button className="btn btn-soft" aria-label="Descartar sessão" onClick={async () => { await discardDevRequest(current!.id); setViewId(null); }}><Trash2 size={16} /></button>}
          </div>
        </>
      )}

      {past.length > 0 && (
        <div className="dev-history">
          <h3 className="small muted">Sessões anteriores</h3>
          {past.map((r) => (
            <button key={r.id} className="dev-hist-row" onClick={() => setViewId(r.id)}>
              <span className="grow"><b>{r.screen}</b> · <span className="muted">{when(r.createdAt)}</span><br /><span className="small">{(r.messages.find((m) => m.from === 'ela')?.text ?? '').slice(0, 70)}</span></span>
              <span className={`dev-chip st-${r.status}`}>{STATUS[r.status]}</span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
