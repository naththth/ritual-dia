// Água do dia: somar, ver cada registro e tirar o que entrou por engano.
import { useState } from 'react';
import { X } from 'lucide-react';
import { Sheet } from '../ui/ui';
import { useByDate, useSettings } from '../db/hooks';
import { addWater } from '../domain/actions';
import { remove } from '../db/db';
import { toast } from '../state/store';
import { shortLabel, type DateKey } from '../lib/dates';

export function WaterSheet({ open, date, onClose }: { open: boolean; date: DateKey; onClose: () => void }) {
  const water = useByDate('water', date);
  const settings = useSettings();
  const [custom, setCustom] = useState('');
  const list = [...(water ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  const total = list.reduce((a, w) => a + w.ml, 0);
  const goal = settings?.waterGoalMl;
  const fmtL = (ml: number) => (ml >= 1000 ? `${(ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L` : `${ml} mL`);
  return (
    <Sheet open={open} onClose={onClose} title="Água" sub={shortLabel(date)} testId="water-sheet">
      <div style={{ textAlign: 'center', margin: '4px 0 12px' }}>
        <span className="big-num num" style={{ fontSize: 40 }}>{fmtL(total)}</span>
        {goal ? <div className="small">de {fmtL(goal)}{total < goal ? `, faltam ${fmtL(goal - total)}` : ', meta do dia batida'}</div> : null}
      </div>
      <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
        {(settings?.waterPresets ?? [200, 300, 500]).map((ml) => <button key={ml} className="pill-act pa-honey" onClick={() => addWater(date, ml)}>+{ml} mL</button>)}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Outra quantidade (mL)" aria-label="Outra quantidade de água" />
        <button className="btn btn-soft" onClick={() => { const n = Number(custom); if (n > 0) { addWater(date, n); setCustom(''); } }}>Somar</button>
      </div>
      <span className="label">Registros</span>
      {list.length === 0 && <p className="small muted">Nada registrado neste dia.</p>}
      {list.map((w) => (
        <div key={w.id} className="plate-row" style={{ minHeight: 48 }}>
          <span className="grow"><b>{w.ml} mL</b> <span className="small muted">às {new Date(w.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></span>
          <button className="icon-btn" aria-label={`Tirar ${w.ml} mL`} onClick={async () => { await remove(w.id); toast(`−${w.ml} mL`); }} data-testid="water-remove"><X size={18} /></button>
        </div>
      ))}
    </Sheet>
  );
}
