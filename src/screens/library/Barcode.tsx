// Leitor de código de barras pela câmera (Chrome no Android tem leitor nativo). Sem leitor, dá para digitar o código.
import { useEffect, useRef, useState } from 'react';
import { ScanBarcode } from 'lucide-react';
import { Sheet } from '../../ui/ui';
import { toast } from '../../state/store';
import { lookupBarcode, type OffFood } from '../../domain/nutrition';

export function BarcodeButton({ onFound, label }: { onFound: (o: OffFood) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={label ? 'btn btn-soft btn-sm' : 'icon-btn'} aria-label="Ler código de barras" onClick={() => setOpen(true)} data-testid="barcode-open">
        <ScanBarcode size={20} />{label}
      </button>
      <BarcodeSheet open={open} onClose={() => setOpen(false)} onFound={(o) => { setOpen(false); onFound(o); }} />
    </>
  );
}

function BarcodeSheet({ open, onClose, onFound }: { open: boolean; onClose: () => void; onFound: (o: OffFood) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const find = async (c: string) => {
    const clean = c.replace(/\D/g, '');
    if (clean.length < 8) { toast('Código incompleto.', undefined, 'error'); return; }
    setBusy(true); setStatus(`Procurando ${clean}…`);
    try {
      const o = await lookupBarcode(clean);
      if (o && o.name) onFound(o);
      else setStatus('Esse produto ainda não está na base. Cadastre pelo "Novo alimento" e leia a tabela nutricional pela foto.');
    } catch { setStatus('Não consegui buscar agora. Confira a internet.'); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!open || !supported) return;
    let stream: MediaStream | undefined;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const det = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        setStatus('Aponte para o código de barras.');
        const loop = async () => {
          if (stop || !video.current) return;
          try {
            const r = await det.detect(video.current);
            if (r?.[0]?.rawValue) { stop = true; navigator.vibrate?.(60); await find(r[0].rawValue); return; }
          } catch { /* quadro ruim */ }
          setTimeout(loop, 250);
        };
        loop();
      } catch { setStatus('Sem acesso à câmera. Libere a câmera para o Ritual ou digite o código.'); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Código de barras" testId="barcode-sheet">
      {supported && <video ref={video} playsInline muted style={{ width: '100%', borderRadius: 16, background: '#000', aspectRatio: '4 / 3', objectFit: 'cover' }} />}
      {status && <p className="small" style={{ marginTop: 10 }}>{status}</p>}
      <span className="label">{supported ? 'Ou digite o código' : 'Digite o número embaixo das barras'}</span>
      <div className="row" style={{ gap: 8 }}>
        <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="7896..." aria-label="Código de barras" />
        <button className="btn btn-ink" disabled={busy} onClick={() => find(code)}>Buscar</button>
      </div>
    </Sheet>
  );
}
