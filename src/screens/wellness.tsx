// Sono, passos e recuperação: registro manual ou lido de prints do Garmin pela IA.
import { useEffect, useRef, useState } from 'react';
import { Camera, Moon, Pencil, Watch } from 'lucide-react';
import { useByDate } from '../db/hooks';
import { get, upsert } from '../db/db';
import { Sheet } from '../ui/ui';
import { toast } from '../state/store';
import { aiAvailable, askAI } from '../domain/ai';
import { addDays, shortLabel, todayKey, type DateKey } from '../lib/dates';
import type { Wellness } from '../db/types';
import { effectiveSleep, effectiveHrv, isSuspicious } from '../domain/wellness';
import { Chip, TimeInput } from '../ui/ui';

type Form = { flag: '' | 'confirmado' | 'incompleto'; manual: string; sleepH: string; sleepScore: string; hrv: string; restingHR: string; bodyBattery: string; steps: string; stress: string; sleepStart: string; sleepEnd: string };
const EMPTY: Form = { flag: '', manual: '', sleepH: '', sleepScore: '', hrv: '', restingHR: '', bodyBattery: '', steps: '', stress: '', sleepStart: '', sleepEnd: '' };

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
  return { flag: w.sleepFlag ?? '', manual: w.sleepManualH != null ? hm(w.sleepManualH) : '', sleepH: hm(w.sleepH), sleepScore: s(w.sleepScore), hrv: s(w.hrv), restingHR: s(w.restingHR), bodyBattery: s(w.bodyBattery), steps: s(w.steps), stress: s(w.stress), sleepStart: w.sleepStart ?? '', sleepEnd: w.sleepEnd ?? '' };
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

const ESTIMATES = [5, 6, 7, 8, 9];

async function patchWellness(date: DateKey, data: Partial<Wellness>) {
  const cur = (await get<'wellness'>(`wellness:${date}`)) as Partial<Wellness> | undefined;
  await upsert('wellness', `wellness:${date}`, { ...(cur ?? {}), date, ...data } as any);
}

/** Faixa no Hoje: mostra o que foi registrado, pergunta quando a noite parece incompleta e convida a registrar quando falta. */
export function WellnessCard({ date }: { date: DateKey }) {
  const w = useByDate('wellness', date)?.[0];
  const [open, setOpen] = useState(false);
  const [askHours, setAskHours] = useState(false);
  const sleep = effectiveSleep(w);
  const hrv = effectiveHrv(w);
  const items: [string, string][] = [];
  if (sleep) items.push([sleep.estimated ? 'de sono (estimado)' : 'de sono', `${sleep.estimated ? '~' : ''}${hm(sleep.h)}`]);
  else if (w?.sleepFlag === 'incompleto') items.push(['', 'sono sem registro']);
  if (sleep && !sleep.estimated && w?.sleepScore != null) items.push(['pontos de sono', String(w.sleepScore)]);
  if (hrv != null) items.push(['VFC', `${Math.round(hrv)} ms`]);
  if (w?.restingHR != null) items.push(['FC repouso', String(w.restingHR)]);
  if (w?.bodyBattery != null) items.push(['Body Battery', String(w.bodyBattery)]);
  if (w?.steps != null) items.push(['passos', w.steps.toLocaleString('pt-BR')]);
  const hasSleep = !!sleep || w?.sleepFlag === 'incompleto';
  const estimate = (h: number) => patchWellness(date, { sleepManualH: h, sleepFlag: 'incompleto' }).then(() => { setAskHours(false); toast(`Noite registrada como ~${h} h`); });

  // Noite curta vinda do relógio: pergunta antes de usar o número.
  if (isSuspicious(w)) {
    return (
      <section className="wellness-ask" style={{ display: 'block' }} data-testid="sleep-check">
        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}><Watch size={18} style={{ marginTop: 2 }} />
          <span className="grow"><b>O relógio marcou {hm(w!.sleepH)} de sono.</b><br /><span className="small">Foi isso mesmo ou o relógio saiu do pulso?</span></span></div>
        {!askHours ? (
          <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
            <button className="pill-act pa-ghost" onClick={() => patchWellness(date, { sleepFlag: 'confirmado' })} data-testid="sleep-confirm">Foi isso, dormi pouco</button>
            <button className="pill-act pa-ghost" onClick={() => setAskHours(true)} data-testid="sleep-incomplete">O relógio saiu</button>
          </div>
        ) : (
          <>
            <p className="small" style={{ margin: '10px 0 6px' }}>Quanto você dormiu, mais ou menos?</p>
            <div className="chips">
              {ESTIMATES.map((h) => <Chip key={h} onClick={() => estimate(h)}>{h} h</Chip>)}
              <Chip onClick={() => patchWellness(date, { sleepFlag: 'incompleto' }).then(() => setAskHours(false))}>Não sei</Chip>
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <>
      {items.length ? (
        <>
          <button className="wellness-strip tap" onClick={() => setOpen(true)} data-testid="wellness" aria-label="Editar sono e passos">
            {items.map(([l, v]) => <span key={l + v}><b className="num">{v}</b> {l}</span>)}
            <Pencil size={14} style={{ marginLeft: 'auto', alignSelf: 'center' }} />
          </button>
          {!hasSleep && date <= todayKey() && <NoWatchRow onPick={estimate} onMore={() => setOpen(true)} />}
        </>
      ) : date <= todayKey() ? (
        <section className="wellness-ask" style={{ display: 'block' }} data-testid="wellness-ask">
          <button className="row tap" style={{ gap: 12, width: '100%', textAlign: 'left' }} onClick={() => setOpen(true)} data-testid="wellness-open">
            <Moon size={18} />
            <span className="grow"><b>Como você dormiu?</b><br /><span className="small">Sono, VFC, FC de repouso e passos. Um print do Garmin resolve.</span></span>
          </button>
          <NoWatchRow onPick={estimate} inline />
        </section>
      ) : null}
      <WellnessSheet open={open} date={date} onClose={() => setOpen(false)} />
    </>
  );
}

/** Atalho para noite sem relógio: um toque com a estimativa. */
function NoWatchRow({ onPick, onMore, inline }: { onPick: (h: number) => void; onMore?: () => void; inline?: boolean }) {
  return (
    <div className="row wrap" style={{ gap: 6, margin: inline ? '10px 0 0' : '-6px 0 14px', alignItems: 'center' }} data-testid="no-watch">
      <span className="small" style={{ flexBasis: '100%' }}>Dormiu sem relógio? Quanto, mais ou menos:</span>
      {ESTIMATES.slice(1, 4).map((h) => <button key={h} className="pill-act pa-ghost" style={{ minHeight: 34, padding: '0 12px' }} onClick={() => onPick(h)}>~{h} h</button>)}
      {onMore && <button className="pill-act pa-ghost" style={{ minHeight: 34, padding: '0 12px' }} onClick={onMore}>Outro</button>}
    </div>
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
    const cur = (await get<'wellness'>(`wellness:${date}`)) as Partial<Wellness> | undefined;
    const data = {
      ...(cur ?? {}),
      date, source: cur?.source ?? 'manual',
      sleepFlag: f.flag || undefined, sleepManualH: f.flag === 'incompleto' ? parseHours(f.manual) : undefined,
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
        <label className="nutr-cell"><span>Dormiu às</span><TimeInput value={f.sleepStart} onChange={(v) => set({ sleepStart: v })} label="Dormiu às" /></label>
        <label className="nutr-cell"><span>Acordou às</span><TimeInput value={f.sleepEnd} onChange={(v) => set({ sleepEnd: v })} label="Acordou às" /></label>
      </div>
      <span className="label">Essa noite</span>
      <div className="chips" data-testid="sleep-flag">
        <Chip on={f.flag === ''} onClick={() => set({ flag: '' })}>Registro normal</Chip>
        <Chip on={f.flag === 'confirmado'} onClick={() => set({ flag: 'confirmado' })}>Dormi pouco mesmo</Chip>
        <Chip on={f.flag === 'incompleto'} onClick={() => set({ flag: 'incompleto' })}>Relógio saiu / sem relógio</Chip>
      </div>
      {f.flag === 'incompleto' && (
        <div className="nutr-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 8 }}>
          <label className="nutr-cell"><span>Quanto dormiu, mais ou menos</span><input value={f.manual} onChange={(e) => set({ manual: e.target.value })} placeholder="7h" aria-label="Sono estimado" /></label>
        </div>
      )}
      <p className="field-hint">Noite marcada como incompleta não entra nas médias nem na leitura da IA; se você der uma estimativa, ela vale no lugar.</p>
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
