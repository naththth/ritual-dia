// Foto do prato: a IA reconhece os alimentos e estima o peso; os nutrientes vêm da TACO. Ela revisa antes de entrar no prato.
import { useEffect, useMemo, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Sheet } from '../ui/ui';
import { MicButton, appendText } from '../ui/Dictation';
import { toast } from '../state/store';
import { aiPlate, type PlateGuess } from '../domain/ai';
import { fmt, scale, ZERO, add as addN, type TacoFood } from '../domain/nutrition';
import type { Nutr } from '../db/types';
import { MacroLine, MacroRing } from './food-ui';

export interface PlateRow extends PlateGuess { key: string; taco?: TacoFood; on: boolean }

/** Nutrientes de uma linha: TACO quando houver correspondência, senão a referência que a IA informou. */
export function rowNutr(r: PlateRow): Nutr | undefined {
  const per100 = r.taco?.n ?? (r.est ? { ...r.est } : undefined);
  return per100 && r.grams > 0 ? scale(per100 as Nutr, r.grams) : undefined;
}

export function PlateSheet({ file, mealLabel, onClose, onConfirm }: { file: File | null; mealLabel: string; onClose: () => void; onConfirm: (rows: PlateRow[]) => Promise<void> }) {
  const [preview, setPreview] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<PlateRow[] | null>(null);
  const [obs, setObs] = useState('');
  useEffect(() => {
    if (!file) return;
    setRows(null); setNote(''); setObs('');
    const u = URL.createObjectURL(file); setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const total = useMemo(() => (rows ?? []).filter((r) => r.on).reduce((a, r) => { const n = rowNutr(r); return n ? addN(a, n) : a; }, ZERO), [rows]);
  if (!file) return null;

  const analyze = async () => {
    setBusy(true);
    try {
      const { shrinkImage } = await import('../lib/image');
      const img = await shrinkImage(file, 1400);
      const r = await aiPlate([img], note, mealLabel);
      if (!r.items.length) { toast(r.note || 'Não reconheci alimentos na foto. Tente de cima, com o prato inteiro.', undefined, 'error'); return; }
      setRows(r.items.map((i, k) => ({ ...i, key: String(k), on: true, taco: i.tacoId ? r.taco.find((t) => t.id === i.tacoId) : undefined })));
      setObs(r.note);
    } catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(false); }
  };
  const setRow = (k: string, p: Partial<PlateRow>) => setRows((xs) => (xs ?? []).map((r) => (r.key === k ? { ...r, ...p } : r)));
  const chosen = (rows ?? []).filter((r) => r.on && r.grams > 0);

  return (
    <Sheet open onClose={onClose} title="Foto do prato" sub={mealLabel} testId="plate-sheet"
      footer={rows
        ? <button className="btn btn-ink grow" disabled={!chosen.length || busy} onClick={async () => { setBusy(true); try { await onConfirm(chosen); } finally { setBusy(false); } }} data-testid="plate-confirm">Adicionar ao {mealLabel.toLowerCase()} · {fmt(total.kcal)} kcal</button>
        : <button className="btn btn-ink grow" disabled={busy} onClick={analyze} data-testid="plate-analyze">{busy ? 'Analisando o prato…' : 'Calcular'}</button>}>
      {!rows ? (
        <>
          <img src={preview} alt="Foto do prato" className="plate-photo" />
          <span className="label">Quer contar algo? <span className="muted small">(opcional, melhora a conta)</span></span>
          <textarea className="pf-text" rows={2} value={note} onChange={(e) => setNote(e.target.value)} aria-label="O que tem no prato"
            placeholder="Ex.: arroz integral, frango grelhado, salada com um fio de azeite; restaurante por quilo, 480 g na balança" />
          <div style={{ marginTop: 8 }}><MicButton label="Contar por voz" onText={(t) => setNote((x) => appendText(x, t))} /></div>
          <p className="field-hint">A IA identifica cada alimento e estima o peso pela foto. Calorias e macros vêm da tabela TACO. Se o restaurante pesou o prato, diga o peso: a conta fica bem mais precisa.</p>
        </>
      ) : (
        <>
          <div className="fs-top">
            <MacroRing n={total} />
            <div style={{ minWidth: 0 }}>
              <MacroLine n={total} />
              <p className="small" style={{ margin: '8px 0 0' }}>Confira os pesos. É uma estimativa visual: ajuste o que estiver diferente.</p>
            </div>
          </div>
          {obs && <p className="small" style={{ margin: '4px 0 6px' }} data-testid="plate-obs"><b>Atenção:</b> {obs}</p>}
          <div data-testid="plate-items">
            {rows.map((r) => {
              const n = rowNutr(r);
              return (
                <div key={r.key} className={`plate-guess ${r.on ? '' : 'off'}`}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="plate-name">{r.name}{r.confidence === 'baixa' ? <span className="muted small"> · confira</span> : null}</div>
                    <div className="plate-sub">{r.taco ? `TACO: ${r.taco.name}` : 'Valores de referência (sem item na TACO)'}{r.household ? ` · ${r.household}` : ''}</div>
                    {n && r.on && <MacroLine n={n} className="tiny" />}
                  </div>
                  <label className="pg-g">
                    <input inputMode="numeric" value={r.grams || ''} onFocus={(e) => e.target.select()} onChange={(e) => setRow(r.key, { grams: Number(e.target.value.replace(/\D/g, '')) || 0 })} aria-label={`Gramas de ${r.name}`} />
                    <span>g</span>
                  </label>
                  <span className="plate-kcal num" style={{ width: 62, textAlign: 'right' }}>{n && r.on ? `${fmt(n.kcal)} kcal` : ''}</span>
                  <button className="icon-btn" aria-label={r.on ? `Tirar ${r.name}` : `Incluir ${r.name}`} onClick={() => setRow(r.key, { on: !r.on })}>{r.on ? <X size={17} /> : <span style={{ fontWeight: 800 }}>+</span>}</button>
                </div>
              );
            })}
          </div>
          <button className="link" style={{ marginTop: 12 }} onClick={() => setRows(null)}><Camera size={15} style={{ marginRight: 6, verticalAlign: '-2px' }} />Refazer com outra explicação</button>
        </>
      )}
    </Sheet>
  );
}
