import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check as CheckIcon, X } from 'lucide-react';
import { useApp } from '../state/store';

/* ----- Folha inferior com integração ao botão voltar do Android ----- */
let sheetDepth = 0;
let pendingBacks = 0;
window.addEventListener('popstate', () => { if (pendingBacks > 0) pendingBacks--; });

/** Executa fn quando não houver "voltar" de folha pendente no histórico. */
export function whenHistoryIdle(fn: () => void) {
  if (pendingBacks === 0) { fn(); return; }
  const start = Date.now();
  const tick = () => (pendingBacks === 0 || Date.now() - start > 600 ? fn() : setTimeout(tick, 16));
  setTimeout(tick, 16);
}

export function Sheet({ open, onClose, title, sub, children, footer, testId }: {
  open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; testId?: string;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    sheetDepth++;
    const marker = { sheet: sheetDepth, t: Date.now() + Math.random() };
    window.history.pushState({ ...(window.history.state ?? {}), ritualSheet: marker }, '');
    let closedByBack = false;
    const onPop = () => {
      const cur = window.history.state?.ritualSheet;
      if (cur && cur.sheet >= marker.sheet) return; // ainda estou (ou uma folha acima de mim) no topo
      closedByBack = true;
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = document.getElementById('root') as (HTMLElement & { inert: boolean }) | null;
    if (root) { root.inert = true; root.setAttribute('aria-hidden', 'true'); }
    return () => {
      window.removeEventListener('popstate', onPop);
      document.body.style.overflow = prevOverflow;
      sheetDepth--;
      if (root && sheetDepth === 0) { root.inert = false; root.removeAttribute('aria-hidden'); }
      if (!closedByBack && window.history.state?.ritualSheet?.t === marker.t) { pendingBacks++; window.history.back(); }
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} data-testid={testId}>
        <div className="grab" />
        <div className="sh-head">
          <h3>{title}{sub && <span className="sub">{sub}</span>}</h3>
          <button className="icon-btn" aria-label="Fechar" onClick={onClose}><X size={22} /></button>
        </div>
        <div className="sh-body">{children}</div>
        {footer && <div className="sh-foot">{footer}</div>}
      </div>
    </>,
    document.body
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismiss);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''}`} role="status">
          <span className="grow">{t.text}</span>
          {t.undo && (
            <button onClick={async () => { dismiss(t.id); await t.undo!(); }}>{t.label ?? 'Desfazer'}</button>
          )}
          {t.sticky && <button aria-label="Fechar aviso" onClick={() => dismiss(t.id)} style={{ opacity: .7 }}>✕</button>}
        </div>
      ))}
    </div>
  );
}

export function Check({ on, round, label, onToggle }: { on: boolean; round?: boolean; label: string; onToggle: () => void }) {
  return (
    <button className="check-hit" role="checkbox" aria-checked={on} aria-label={label} onClick={onToggle}>
      <span className={`check ${on ? 'on' : ''} ${round ? 'round' : ''}`}>{on && <CheckIcon size={18} strokeWidth={3} />}</span>
    </button>
  );
}

export function Chip({ on, onClick, children, color, testId }: { on?: boolean; onClick?: () => void; children: ReactNode; color?: string; testId?: string }) {
  return (
    <button type="button" className={`chip ${on ? 'on' : ''} ${color ? 'c-' + color : ''}`} aria-pressed={!!on} onClick={onClick} data-testid={testId}>
      {children}
    </button>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Empty({ art, text, action }: { art?: ReactNode; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {art}
      <p>{text}</p>
      {action}
    </div>
  );
}

export function Stepper({ value, onChange, step = 1, min = 0, suffix, label }: { value: number; onChange: (n: number) => void; step?: number; min?: number; suffix?: string; label: string }) {
  return (
    <div className="row" aria-label={label}>
      <button className="btn btn-soft btn-sm" aria-label={`Diminuir ${label}`} onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}>−</button>
      <span className="num" style={{ minWidth: 72, textAlign: 'center', fontWeight: 700, fontSize: 18 }}>{value}{suffix}</span>
      <button className="btn btn-soft btn-sm" aria-label={`Aumentar ${label}`} onClick={() => onChange(+(value + step).toFixed(2))}>+</button>
    </div>
  );
}

/* Ilustrações de traço único para estados vazios (desenhadas para o Ritual) */
export function ArtCup() {
  return (
    <svg width="84" height="64" viewBox="0 0 84 64" fill="none" stroke="var(--wine)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 26h40v14c0 9-8 16-20 16s-20-7-20-16V26z" />
      <path d="M58 30c8 0 10 4 10 7s-3 7-10 7" />
      <path d="M30 18c0-4 4-4 4-8M40 18c0-4 4-4 4-8" />
      <path d="M8 60h68" strokeDasharray="2 5" />
    </svg>
  );
}
export function ArtLeaf() {
  return (
    <svg width="84" height="64" viewBox="0 0 84 64" fill="none" stroke="var(--wine)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 52C20 28 38 12 66 10c0 26-16 42-40 42" />
      <path d="M20 52C32 40 44 30 56 22" />
      <path d="M8 58h68" strokeDasharray="2 5" />
    </svg>
  );
}
export function ArtShoe() {
  return (
    <svg width="84" height="64" viewBox="0 0 84 64" fill="none" stroke="var(--wine)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 46V30c6 0 10-6 12-12 6 4 10 10 20 12l20 6c6 2 8 6 8 10H12z" />
      <path d="M28 26l4 4M34 22l4 4" />
      <path d="M8 58h68" strokeDasharray="2 5" />
    </svg>
  );
}

/* ----- Confirmação ----- */


export function useConfirm(): [ReactNode, (opts: { title: string; text?: string; ok: string; danger?: boolean }) => Promise<boolean>] {
  const [state, setState] = useState<null | { title: string; text?: string; ok: string; danger?: boolean; resolve: (v: boolean) => void }>(null);
  const ask = useCallback((opts: { title: string; text?: string; ok: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => setState({ ...opts, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  const el = (
    <Sheet open={!!state} onClose={() => close(false)} title={state?.title ?? ''}
      footer={<>
        <button className="btn btn-soft" onClick={() => close(false)}>Cancelar</button>
        <button className={`btn ${state?.danger ? 'btn-wine' : 'btn-ink'}`} onClick={() => close(true)} data-testid="confirm-ok">{state?.ok}</button>
      </>}>
      {state?.text && <p style={{ marginTop: 4 }}>{state.text}</p>}
    </Sheet>
  );
  return [el, ask];
}

/** Executa fn depois que a folha terminar de devolver o histórico (evita que o "voltar" desfaça a navegação). */
export function afterSheetClose(fn: () => void) {
  setTimeout(() => whenHistoryIdle(fn), 0);
}

/** Campo de horário com teclado numérico: digita "0640" e vira 06:40. Evita o relógio do sistema, que no Android
 *  não abre o teclado direto e às vezes estoura o texto. Confirma ao sair do campo. */
export function TimeInput({ value, onChange, label, style }: { value: string; onChange: (v: string) => void; label: string; style?: React.CSSProperties }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const format = (raw: string) => {
    const d = raw.replace(/\D/g, '').slice(0, 4);
    return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
  };
  const commit = () => {
    const d = v.replace(/\D/g, '');
    if (!d) { setV(value); return; }
    const h = d.length <= 2 ? Number(d) : Number(d.slice(0, d.length - 2));
    const m = d.length <= 2 ? 0 : Number(d.slice(-2));
    if (h > 23 || m > 59 || Number.isNaN(h)) { setV(value); return; }
    const out = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    setV(out);
    if (out !== value) onChange(out);
  };
  return (
    <input type="text" inputMode="numeric" autoComplete="off" placeholder="hh:mm" maxLength={5} value={v} aria-label={label} style={style}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setV(format(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}
