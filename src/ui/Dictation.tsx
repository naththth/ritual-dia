// Ditado por voz: fala e vira texto no campo (reconhecimento de voz do próprio Chrome, em português).
import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { toast } from '../state/store';

const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : undefined;
export const dictationAvailable = !!SR;

/** Botão de microfone: enquanto grava, cada frase reconhecida é somada ao texto. */
export function MicButton({ onText, label = 'Falar' }: { onText: (t: string) => void; label?: string }) {
  const [on, setOn] = useState(false);
  const rec = useRef<any>(null);
  useEffect(() => () => rec.current?.stop?.(), []);
  if (!SR) return null;
  const start = () => {
    const r = new SR();
    r.lang = 'pt-BR'; r.continuous = true; r.interimResults = false;
    r.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim());
    };
    r.onerror = (e: any) => { if (e.error === 'not-allowed') toast('Libere o microfone para o Ritual nas permissões do site.', undefined, 'error'); setOn(false); };
    r.onend = () => setOn(false);
    rec.current = r; r.start(); setOn(true);
  };
  return (
    <button type="button" className={`mic-btn ${on ? 'on' : ''}`} onClick={() => (on ? rec.current?.stop() : start())} aria-pressed={on} aria-label={on ? 'Parar de gravar' : label} data-testid="mic">
      {on ? <Square size={14} fill="currentColor" /> : <Mic size={16} />}{on ? 'Gravando… toque para parar' : label}
    </button>
  );
}

/** Junta o texto ditado ao que já estava escrito. */
export const appendText = (prev: string | undefined, t: string) => (prev?.trim() ? `${prev.trim()} ${t}` : t.charAt(0).toUpperCase() + t.slice(1));
