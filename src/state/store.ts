import { create } from 'zustand';
import { todayKey, type DateKey } from '../lib/dates';

export interface Toast {
  id: number;
  text: string;
  undo?: () => void | Promise<void>;
  tone?: 'default' | 'error';
  /** Texto do botão (padrão: "Desfazer"). */
  label?: string;
  /** Fica na tela até ela tocar. */
  sticky?: boolean;
}
/** important: aviso essencial (erro, versão nova, algo que não aconteceu e precisa de explicação).
 *  Confirmações do que ela acabou de fazer não aparecem: se fez, é porque queria; desfaz tirando a seleção. */
type ToastOpts = { label?: string; sticky?: boolean; important?: boolean };

interface AppState {
  date: DateKey;
  setDate: (d: DateKey) => void;
  toasts: Toast[];
  toast: (text: string, undo?: Toast['undo'], tone?: Toast['tone'], opts?: ToastOpts) => void;
  dismiss: (id: number) => void;
  /** Pedido para abrir uma especialista com o texto já escrito (vindo da leitura da semana ou do conselho). */
  ask?: { domain: 'training' | 'skin' | 'food' | 'mind'; text: string };
  setAsk: (a?: { domain: 'training' | 'skin' | 'food' | 'mind'; text: string }) => void;
  /** Menu lateral aberto. */
  menu: boolean;
  setMenu: (v: boolean) => void;
  /** Folha "Registrar" (o + do topo) aberta. */
  reg: boolean;
  setReg: (v: boolean) => void;
}

let seq = 1;

export const useApp = create<AppState>((set, get) => ({
  date: todayKey(),
  setDate: (date) => set({ date }),
  menu: false,
  setMenu: (menu) => set({ menu }),
  reg: false,
  setReg: (reg) => set({ reg }),
  toasts: [],
  toast: (text, undo, tone = 'default', opts = {}) => {
    if (tone !== 'error' && !opts.sticky && !opts.important) return;
    const id = seq++;
    // O aviso de versão nova (fixo) nunca é empurrado para fora por outro aviso.
    const cur = get().toasts;
    set({ toasts: [...cur.filter((t) => t.sticky), ...cur.filter((t) => !t.sticky).slice(-1), { id, text, undo, tone, ...opts }] });
    if (!opts.sticky) setTimeout(() => get().dismiss(id), undo ? 6000 : 3200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  ask: undefined,
  setAsk: (ask) => set({ ask })
}));

export const toast = (text: string, undo?: Toast['undo'], tone?: Toast['tone'], opts?: ToastOpts) => useApp.getState().toast(text, undo, tone, opts);
/** Aviso essencial que precisa aparecer mesmo sem ser erro. */
export const notice = (text: string, undo?: Toast['undo'], opts?: Omit<ToastOpts, 'important'>) => useApp.getState().toast(text, undo, 'default', { ...opts, important: true });

export function haptic(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* sem vibração */ }
}
