import { create } from 'zustand';
import { todayKey, type DateKey } from '../lib/dates';

export interface Toast {
  id: number;
  text: string;
  undo?: () => void | Promise<void>;
  tone?: 'default' | 'error';
}

interface AppState {
  date: DateKey;
  setDate: (d: DateKey) => void;
  toasts: Toast[];
  toast: (text: string, undo?: Toast['undo'], tone?: Toast['tone']) => void;
  dismiss: (id: number) => void;
}

let seq = 1;

export const useApp = create<AppState>((set, get) => ({
  date: todayKey(),
  setDate: (date) => set({ date }),
  toasts: [],
  toast: (text, undo, tone = 'default') => {
    const id = seq++;
    set({ toasts: [...get().toasts.slice(-1), { id, text, undo, tone }] });
    setTimeout(() => get().dismiss(id), undo ? 6000 : 3200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
}));

export const toast = (text: string, undo?: Toast['undo'], tone?: Toast['tone']) => useApp.getState().toast(text, undo, tone);

export function haptic(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* sem vibração */ }
}
