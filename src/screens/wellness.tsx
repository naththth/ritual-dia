// Sono, passos e recuperação: registro manual ou lido de prints do Garmin pela IA.
import { useEffect, useRef, useState } from 'react';
import { Camera, Moon, Pencil } from 'lucide-react';
import { useByDate } from '../db/hooks';
import { get, upsert } from '../db/db';
import { Sheet } from '../ui/ui';
import { toast } from '../state/store';
import { aiAvailable, askAI } from '../domain/ai';
import { addDays, shortLabel, todayKey, type DateKey } from '../lib/dates';
import type { Wellness } from '../db/types';

type Form = { sleepH: string; sleepScore: string; hrv: string; restingHR: string; bodyBattery: string; steps: string; stress: string; sleepStart: string; sleepEnd: string };
const EMPTY: Form = { sleepH: '', sleepScore: '', hrv: '', restingHR: '', bodyBattery: '', steps: '', stress: '', sleepStart: '', sleepEnd: '' };

const hm = (h?: number) => (h == null ? '' : `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}`);
/** Aceita "7,5", "7.5", "7h30", "7:30", "7 h 30 min". */
export function parseHours(s: string): number | undefined {
  const t = s.trim().toLowerCase().replace(',', '.');
  if (!t) return undefined;
  const m = t.match(/^(\d{1,2})\s*(?:h|:)\s*(\d{1,2})?\s*(?:m|min)?$/);
  if (m) return Math.round((Number(m[1]) + Number(m[2] ?? 0) / 60) * 100) / 100;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n < 24 ? n : undefined;
}
const num = (s: string) => { const n = Number(s.replace(/\./g, '').replace(',', '.')); return s.trim() && Number.isFinite(n) ? n : undefined; };

function toForm(w?: Partial<Wellness>): Form {
  if (!w) return EMPTY;
  const s = (v?: number) => (v == null ? '' : String(v));
  return { sleepH: hm(w.sleepH), sleepScore: s(w.sleepScore), hrv: s(w.hrv), restingHR: s(w.restingHR), bodyBattery: s(w.bodyBattery), steps: s(w.steps), stress: s(w.stress), sleepStart: w.sleepStart ?? '', sleepEnd: w.sleepEnd ?? '' };
}

/** Reduz o print para caber no envio sem perder a leitura dos números. */
async function shrink(file: File): Promise<{ mime: string; data: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.82);
  return { mime: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) };
}

/** Faixa no Hoje: mostra o que foi registrado ou convida a registrar. */
export function WellnessCard({ date }: { date: DateKey }) {
  const w = useByDate('wellness', date)?.[0];
  const [open, setOpen] = useState(false);
  const items: [string, string][] = [];
  if (w?.sleepH != null) items.push(['de sono', hm(w.sleepH)]);
  if (w?.sleepScore != null) items.push(['pontos de sono', String(w.sleepScore)]);
  if (w?.hrv != null) items.push(['VFC', `${Math.round(w.hrv)} ms`]);
  if (w?.restingHR != null) items.push(['FC repouso', String(w.restingHR)]);
  if (w?.bodyBattery != null) items.push(['Body Battery', String(w.bodyBattery)]);
  if (w?.steps != null) items.push(['passos', w.steps.toLocaleString('pt-BR')]);
  return (
    <>
      {items.length ? (
        <button className="wellness-strip tap" onClick={() => setOpen(true)} data-testid="wellness" aria-label="Editar sono e passos">
          {items.map(([l, v]) => <span key={l}><b className="num">{v}</b> {l}</span>)}
          <Pencil size={14} style={{ marginLeft: 'auto', alignSelf: 'center' }} />
        </button>
      ) : date <= todayKey() ? (
        <button className="wellness-ask tap" onClick={() => setOpen(true)} data-testid="wellness-ask">
          <Moon size={18} />
          <span className="grow"><b>Como você dormiu?</b><br /><span className="small">Sono, VFC, FC de repouso e passos. Um print do Garmin resolve.</span></span>
        </button>
      ) : null}
      <WellnessSheet open={open} date={date} onClose={() => setOpen(false)} />
    </>
  );
}

export function WellnessSheet({ open, date: initial, onClose }: { open: boolean; date: DateKey; onClose: () => void }) {
  const [date, setDate] = useState(initial);
  const [f, setF] = useState<Form>(EMPTY);
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const load = async (d: DateKey) => { setDate(d); setF(toForm((await get<'wellness'>(`wellness:${d}`)) as any)); };
  useEffect(() => { if (open) { setNote(''); load(initial); } }, [open, initial]);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));

  const readPrints = async (files: FileList | null) => {
    if (!files?.length) return;
    setReading(true); setNote('');
    try {
      const imgs = await Promise.all(Array.from(files).slice(0, 4).map(shrink));
      const r = await askAI<any>('wellness_read', { hoje: todayKey(), data_selecionada: date }, imgs);
      let target = date;
      if (typeof r.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.data) && r.data >= addDays(todayKey(), -60) && r.data <= todayKey()) target = r.data;
      if (target !== date) await load(target);
      const s = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 10) / 10) : undefined);
      setF((x) => ({
        ...x,
        sleepH: typeof r.sono_h === 'number' ? hm(r.sono_h) : x.sleepH,
        sleepScore: s(r.sono_score) ?? x.sleepScore,
        hrv: s(r.vfc) ?? x.hrv,
        restingHR: s(r.fc_repouso) ?? x.restingHR,
        bodyBattery: s(r.body_battery) ?? x.bodyBattery,
        steps: typeof r.passos === 'number' ? String(Math.round(r.passos)) : x.steps,
        stress: s(r.estresse) ?? x.stress,
        sleepStart: typeof r.dormiu === 'string' && /^\d{2}:\d{2}$/.test(r.dormiu) ? r.dormiu : x.sleepStart,
        sleepEnd: typeof r.acordou === 'string' && /^\d{2}:\d{2}$/.test(r.acordou) ? r.acordou : x.sleepEnd
      }));
      setNote([target !== initial ? `O print é de ${shortLabel(target)}; vou salvar nesse dia.` : '', r.observacao ? String(r.observacao) : '', 'Confira os números antes de salvar.'].filter(Boolean).join(' '));
    } catch (e: any) { toast(e.message, undefined, 'error'); }
    finally { setReading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const save = async () => {
    const data = {
      date, source: 'manual',
      sleepH: parseHours(f.sleepH), sleepScore: num(f.sleepScore), hrv: num(f.hrv), restingHR: num(f.restingHR),
      bodyBattery: num(f.bodyBattery), steps: num(f.steps), stress: num(f.stress),
      sleepStart: f.sleepStart || undefined, sleepEnd: f.sleepEnd || undefined
    };
    if (f.sleepH && data.sleepH == null) { toast('Sono: escreva como 7h30 ou 7,5.', undefined, 'error'); return; }
    await upsert('wellness', `wellness:${date}`, data);
    toast(`Sono e passos de ${shortLabel(date)} salvos`);
    onClose();
  };

  const field = (k: keyof Form, label: string, ph: string, mode: 'numeric' | 'decimal' | 'text' = 'numeric') => (
    <label className="nutr-cell"><span>{label}</span><input inputMode={mode} value={f[k]} placeholder={ph} onChange={(e) => set({ [k]: e.target.value } as any)} aria-label={label} /></label>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Sono e recuperação" sub={shortLabel(date)} testId="wellness-sheet"
      footer={<button className="btn btn-ink" onClick={save} data-testid="wellness-save">Salvar</button>}>
      <button className="btn btn-wine btn-block" disabled={reading || !aiAvailable()} onClick={() => fileRef.current?.click()} data-testid="wellness-print">
        <Camera size={18} />{reading ? 'Lendo os prints…' : 'Ler prints do Garmin'}
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => readPrints(e.target.files)} data-testid="wellness-print-input" />
      <p className="field-hint">{aiAvailable() ? 'Tire print da tela de sono, de VFC e do resumo do dia no Garmin Connect. Pode mandar até 4 de uma vez.' : 'Para ler prints, entre com Google. Dá para digitar abaixo.'}</p>
      {note && <p className="small" style={{ background: 'var(--paper-2)', padding: '10px 12px', borderRadius: 14 }} data-testid="wellness-note">{note}</p>}

      <span className="label">Noite que terminou nesta manhã</span>
      <div className="nutr-grid">
        {field('sleepH', 'Sono', '7h30', 'text')}
        {field('sleepScore', 'Pontuação', '0 a 100')}
        {field('hrv', 'VFC (ms)', 'ex.: 48')}
        {field('restingHR', 'FC repouso', 'bpm')}
        {field('bodyBattery', 'Body Battery', 'ao acordar')}
        {field('stress', 'Estresse médio', '0 a 100')}
      </div>
      <div className="nutr-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 8 }}>
        <label className="nutr-cell"><span>Dormiu às</span><input type="time" value={f.sleepStart} onChange={(e) => set({ sleepStart: e.target.value })} aria-label="Dormiu às" /></label>
        <label className="nutr-cell"><span>Acordou às</span><input type="time" value={f.sleepEnd} onChange={(e) => set({ sleepEnd: e.target.value })} aria-label="Acordou às" /></label>
      </div>
      <span className="label">Dia</span>
      <div className="nutr-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {field('steps', 'Passos', 'ex.: 9500')}
      </div>
      <p className="field-hint">Passos fecham à noite. Se for registrar de manhã, use o dia anterior.</p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-soft btn-sm" onClick={() => load(addDays(date, -1))}>Dia anterior</button>
        {date < todayKey() && <button className="btn btn-soft btn-sm" onClick={() => load(addDays(date, 1))}>Dia seguinte</button>}
      </div>
    </Sheet>
  );
}
