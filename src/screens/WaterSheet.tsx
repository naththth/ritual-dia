// Água do dia: somar, ver cada registro e tirar o que entrou por engano.
import { WaterGlass } from '../ui/art';
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
      {/* O copo enche com o total do dia; os atalhos viram copos de tamanhos diferentes. */}
      <div className="ws-hero">
        <span className="ws-glass"><WaterGlass level={total / (goal ?? 2500)} /></span>
        <span className="ws-txt">
          <span className="big-num num">{fmtL(total)}</span>
          <span className="small">{goal ? (total < goal ? `de ${fmtL(goal)} · faltam ${fmtL(goal - total)}` : `de ${fmtL(goal)} · meta batida`) : 'hoje'}</span>
          <span className="ws-bar"><i style={{ width: `${Math.min(100, (total / (goal ?? 2500)) * 100)}%` }} /></span>
        </span>
      </div>
      <div className="ws-presets">
        {(settings?.waterPresets ?? [200, 300, 500]).map((ml, k) => (
          <button key={ml} className="ws-p tap" onClick={() => addWater(date, ml)} data-testid={`water-add-${ml}`}>
            <svg width="30" height="38" viewBox="0 0 30 38" aria-hidden><path d={`M${4 + (2 - Math.min(k, 2)) * 2} 4 H${26 - (2 - Math.min(k, 2)) * 2} L${23 - (2 - Math.min(k, 2))} 34 H${7 + (2 - Math.min(k, 2))} Z`} fill="#DCEBE6" stroke="#0D4D4F" strokeWidth="2" strokeLinejoin="round" /><path d={`M${6 + (2 - Math.min(k, 2)) * 2} ${30 - k * 7} H${24 - (2 - Math.min(k, 2)) * 2} L${23 - (2 - Math.min(k, 2))} 34 H${7 + (2 - Math.min(k, 2))} Z`} fill="#0D4D4F" /></svg>
            <b>+{ml} mL</b>
          </button>
        ))}
      </div>
      <div className="ws-custom">
        <input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Outra quantidade (mL)" aria-label="Outra quantidade de água" />
        <button className="btn btn-ink" onClick={() => { const n = Number(custom); if (n > 0) { addWater(date, n); setCustom(''); } }}>Somar</button>
      </div>
      <span className="label">Registros</span>
      {list.length === 0 && <p className="small muted">Nada registrado neste dia.</p>}
      {list.map((w) => (
        <div key={w.id} className="plate-row ws-row">
          <span className="grow"><b>{w.ml} mL</b> <span className="small muted">às {new Date(w.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></span>
          <button className="icon-btn" aria-label={`Tirar ${w.ml} mL`} onClick={async () => { await remove(w.id); toast(`−${w.ml} mL`); }} data-testid="water-remove"><X size={18} /></button>
        </div>
      ))}
    </Sheet>
  );
}
