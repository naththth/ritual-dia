// Peso: onde está, para onde vai, em que ritmo. As pesagens vêm do Garmin/intervals ou do registro aqui.
import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Target } from 'lucide-react';
import { useAll, useSettings } from '../db/hooks';
import { get, update, upsert } from '../db/db';
import { Sheet, Chip } from '../ui/ui';
import { toast } from '../state/store';
import { addDays, shortLabel, todayKey, type DateKey } from '../lib/dates';
import type { Profile, Wellness } from '../db/types';
import { weighIns, weightStatus, type WeighIn } from '../domain/weight';
import { PageHead } from './common';

const kg = (n: number, d = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const num = (v: string) => { const n = Number(v.replace(',', '.')); return v.trim() && n > 0 ? n : undefined; };
const RANGES = [{ id: 90, label: '3 meses' }, { id: 180, label: '6 meses' }, { id: 365, label: '1 ano' }, { id: 0, label: 'Tudo' }];

async function saveWeight(date: DateKey, value: number | undefined, profile?: Profile, latest?: DateKey) {
  const cur = (await get<'wellness'>(`wellness:${date}`)) as Partial<Wellness> | undefined;
  await upsert('wellness', `wellness:${date}`, { ...(cur && !cur.deleted ? cur : {}), date, weight: value, deleted: 0 } as any);
  // A pesagem mais recente alimenta o perfil, que é o peso que a IA usa nas contas.
  if (value && (!latest || date >= latest)) await update<'settings'>('settings', { profile: { ...(profile ?? {}), weightKg: value } } as any);
}

function Chart({ list, target, days }: { list: WeighIn[]; target?: number; days: number }) {
  const pts = days ? list.filter((w) => w.date >= addDays(todayKey(), -days)) : list;
  if (pts.length < 2) return <p className="small">Poucas pesagens neste período para desenhar a curva.</p>;
  const W = 340, H = 170, P = { l: 34, r: 8, t: 10, b: 22 };
  const t0 = new Date(pts[0].date + 'T12:00').getTime(), t1 = new Date(pts[pts.length - 1].date + 'T12:00').getTime();
  const vals = pts.map((p) => p.kg).concat(target != null ? [target] : []);
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  const x = (d: DateKey) => P.l + ((new Date(d + 'T12:00').getTime() - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r);
  const y = (v: number) => P.t + ((hi - v) / Math.max(1, hi - lo)) * (H - P.t - P.b);
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Curva de peso" data-testid="weight-chart" className="weight-chart">
      {ticks.map((t) => <g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="wc-grid" /><text x={P.l - 6} y={y(t) + 4} textAnchor="end" className="wc-lbl">{t}</text></g>)}
      {target != null && <><line x1={P.l} x2={W - P.r} y1={y(target)} y2={y(target)} className="wc-target" /><text x={W - P.r} y={y(target) - 5} textAnchor="end" className="wc-lbl">objetivo {kg(target)}</text></>}
      <path d={path} className="wc-line" />
      {pts.length <= 60 && pts.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r={2.6} className="wc-dot" />)}
      <text x={P.l} y={H - 5} className="wc-lbl">{shortLabel(pts[0].date)}</text>
      <text x={W - P.r} y={H - 5} textAnchor="end" className="wc-lbl">{shortLabel(pts[pts.length - 1].date)}</text>
    </svg>
  );
}

export function WeightScreen() {
  const ws = useAll('wellness');
  const settings = useSettings();
  const profile = settings?.profile;
  const today = todayKey();
  const list = useMemo(() => weighIns(ws ?? []), [ws]);
  const st = useMemo(() => weightStatus(list, profile, today), [list, profile, today]);
  const [range, setRange] = useState(90);
  const [entry, setEntry] = useState<{ date: DateKey; kg?: number } | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [all, setAll] = useState(false);
  if (!ws || !settings) return <div className="screen" />;
  const losing = st.target != null && st.start != null ? st.target < st.start : true;
  const fast = st.perWeekPct != null && losing && -st.perWeekPct > 1;

  return (
    <div className="screen" data-testid="weight-screen">
      <PageHead title="Peso" withDate={false} />
      <section className="block b-olive">
        {st.current ? (
          <>
            <div className="row between" style={{ alignItems: 'flex-end' }}>
              <div><div className="small">Atual</div><div className="big-num num" data-testid="weight-current">{kg(st.current.kg)} kg</div><div className="small">em {shortLabel(st.current.date)}</div></div>
              {st.target != null && <div style={{ textAlign: 'right' }}><div className="small">Objetivo</div><div className="big-num num">{kg(st.target)} kg</div>{st.deadline && <div className="small">até {shortLabel(st.deadline)}</div>}</div>}
            </div>
            {st.target != null && st.pct != null && (
              <>
                <div className="wg-bar" aria-hidden><i style={{ width: `${st.pct}%` }} /></div>
                <p className="small" style={{ margin: '6px 0 0' }} data-testid="weight-progress">
                  {st.left! <= 0.05 ? 'Objetivo alcançado.' : <>Faltam <b className="num">{kg(st.left!)} kg</b>. {st.lost! > 0 ? <>Já foram {kg(st.lost!)} kg desde {st.startDate ? shortLabel(st.startDate) : 'o início'} ({kg(st.start!)} kg).</> : null}</>}
                </p>
              </>
            )}
          </>
        ) : <p style={{ margin: 0 }}>Nenhuma pesagem ainda. Registre a primeira ou sincronize o Garmin.</p>}
        <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
          <button className="pill-act pa-ghost" onClick={() => setEntry({ date: today })} data-testid="weight-add"><Plus size={15} style={{ marginRight: 6, verticalAlign: '-2px' }} />Registrar peso</button>
          <button className="pill-act pa-ghost" onClick={() => setGoalOpen(true)} data-testid="weight-goal"><Target size={15} style={{ marginRight: 6, verticalAlign: '-2px' }} />{st.target != null ? 'Ajustar objetivo' : 'Definir objetivo'}</button>
        </div>
      </section>

      {st.perWeek != null && (
        <section className="block" data-testid="weight-pace">
          <h2 style={{ fontSize: 20, margin: '0 0 6px' }}>Ritmo</h2>
          <p style={{ margin: 0 }}>
            Tendência das últimas {st.trendDays === 28 ? '4' : '8'} semanas: <b className="num">{st.perWeek > 0 ? '+' : '−'}{kg(Math.abs(st.perWeek), 2)} kg por semana</b> ({kg(Math.abs(st.perWeekPct!), 1)}% do peso).
          </p>
          {st.eta && <p style={{ margin: '6px 0 0' }}>Nesse ritmo, o objetivo chega por volta de <b>{shortLabel(st.eta)}</b>{st.deadline ? (st.eta <= st.deadline ? ', dentro do prazo.' : `, depois do prazo de ${shortLabel(st.deadline)}.`) : '.'}</p>}
          {st.neededPerWeek != null && st.eta && st.deadline && st.eta > st.deadline && <p className="small" style={{ margin: '6px 0 0' }}>Para chegar até {shortLabel(st.deadline)} seria preciso {kg(st.neededPerWeek, 2)} kg por semana.</p>}
          <p className="small" style={{ margin: '8px 0 0' }}>
            {fast ? 'Acima de 1% do peso por semana. Com déficit grande, o risco de perder massa magra sobe: proteína no alto da faixa e musculação de corpo todo regular fazem diferença, e vale conversar com a médica e a nutricionista.'
              : losing ? 'Entre 0,5% e 1% do peso por semana é a faixa que a evidência associa a preservar massa magra. A balança oscila com água, sal e ciclo: olhe a tendência, não o dia.'
              : 'Para ganhar massa com pouca gordura, algo entre 0,25% e 0,5% do peso por mês costuma bastar.'}
          </p>
        </section>
      )}

      <div className="row between" style={{ margin: '14px 0 6px', alignItems: 'center' }}>
        <h2 className="section-title" style={{ margin: 0 }}>Curva</h2>
      </div>
      <div className="chips" style={{ marginBottom: 6 }}>{RANGES.map((r) => <Chip key={r.id} on={range === r.id} onClick={() => setRange(r.id)}>{r.label}</Chip>)}</div>
      <Chart list={list} target={st.target} days={range} />

      <h2 className="section-title" style={{ marginTop: 18 }}>Pesagens</h2>
      <div data-testid="weight-list">
        {list.slice().reverse().slice(0, all ? undefined : 12).map((w, i, arr) => {
          const prev = list[list.length - 2 - i];
          const d = prev ? w.kg - prev.kg : undefined;
          return (
            <button key={w.date} className="lib-item" onClick={() => setEntry({ date: w.date, kg: w.kg })} aria-label={`Corrigir pesagem de ${shortLabel(w.date)}`}>
              <span className="grow" style={{ textAlign: 'left' }}><b className="num">{kg(w.kg)} kg</b><br /><span className="small muted">{shortLabel(w.date)}{w.date.slice(0, 4) !== today.slice(0, 4) ? ` de ${w.date.slice(0, 4)}` : ''}{w.source && w.source !== 'manual' ? ` · ${w.source === 'garmin' ? 'Garmin' : w.source === 'intervals' ? 'Garmin via intervals' : w.source}` : ''}</span></span>
              {d != null && Math.abs(d) >= 0.05 && <span className="small num">{d > 0 ? '+' : '−'}{kg(Math.abs(d))}</span>}
              <Pencil size={14} />
            </button>
          );
        })}
        {!all && list.length > 12 && <button className="link" style={{ marginTop: 10 }} onClick={() => setAll(true)}>Ver todas as {list.length} pesagens</button>}
      </div>

      <EntrySheet entry={entry} onClose={() => setEntry(null)} profile={profile} latest={list[list.length - 1]?.date} />
      <GoalSheet open={goalOpen} onClose={() => setGoalOpen(false)} profile={profile} current={st.current} />
    </div>
  );
}

function EntrySheet({ entry, onClose, profile, latest }: { entry: { date: DateKey; kg?: number } | null; onClose: () => void; profile?: Profile; latest?: DateKey }) {
  const [date, setDate] = useState(todayKey());
  const [v, setV] = useState('');
  useEffect(() => { if (entry) { setDate(entry.date); setV(entry.kg ? String(entry.kg).replace('.', ',') : ''); } }, [entry]);
  const save = async () => {
    const n = num(v);
    if (!n || n < 20 || n > 400) { toast('Informe o peso em kg.', undefined, 'error'); return; }
    await saveWeight(date, n, profile, latest);
    toast('Peso registrado'); onClose();
  };
  const del = async () => { await saveWeight(entry!.date, undefined); toast('Pesagem apagada'); onClose(); };
  return (
    <Sheet open={!!entry} onClose={onClose} title={entry?.kg ? 'Corrigir pesagem' : 'Registrar peso'} testId="weight-sheet"
      footer={<>{entry?.kg && <button className="btn btn-soft" onClick={del}>Apagar</button>}<button className="btn btn-ink grow" onClick={save} data-testid="weight-save">Salvar</button></>}>
      <div className="row wrap" style={{ gap: 12 }}>
        <label style={{ display: 'block', flex: 1, minWidth: 150 }}><span className="label" style={{ marginTop: 0 }}>Dia</span>
          <input type="date" value={date} max={todayKey()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Dia da pesagem" /></label>
        <label style={{ display: 'block', flex: 1, minWidth: 120 }}><span className="label" style={{ marginTop: 0 }}>Peso (kg)</span>
          <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, ''))} onFocus={(e) => e.target.select()} placeholder="Ex.: 88,6" aria-label="Peso em kg" data-testid="weight-input" /></label>
      </div>
      <p className="field-hint">Pese-se de manhã, depois do banheiro e antes de comer, sempre na mesma balança: a comparação fica justa.</p>
    </Sheet>
  );
}

function GoalSheet({ open, onClose, profile, current }: { open: boolean; onClose: () => void; profile?: Profile; current?: WeighIn }) {
  const g = profile?.weightGoal ?? {};
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [start, setStart] = useState('');
  const [startDate, setStartDate] = useState('');
  useEffect(() => {
    if (!open) return;
    setTarget(g.targetKg ? String(g.targetKg).replace('.', ',') : '');
    setDeadline(g.deadline ?? '');
    setStart(String(g.startKg ?? current?.kg ?? '').replace('.', ','));
    setStartDate(g.startDate ?? current?.date ?? todayKey());
  }, [open]);
  const save = async () => {
    const t = num(target);
    if (!t) { toast('Informe o peso objetivo.', undefined, 'error'); return; }
    await update<'settings'>('settings', { profile: { ...(profile ?? {}), weightGoal: { targetKg: t, deadline: deadline || undefined, startKg: num(start), startDate: startDate || undefined } } } as any);
    toast('Objetivo salvo'); onClose();
  };
  const clear = async () => { await update<'settings'>('settings', { profile: { ...(profile ?? {}), weightGoal: undefined } } as any); toast('Objetivo removido'); onClose(); };
  return (
    <Sheet open={open} onClose={onClose} title="Objetivo de peso" testId="weight-goal-sheet"
      footer={<>{g.targetKg && <button className="btn btn-soft" onClick={clear}>Remover</button>}<button className="btn btn-ink grow" onClick={save} data-testid="weight-goal-save">Salvar</button></>}>
      <div className="row wrap" style={{ gap: 12 }}>
        <label style={{ display: 'block', flex: 1, minWidth: 130 }}><span className="label" style={{ marginTop: 0 }}>Peso objetivo (kg)</span>
          <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.,]/g, ''))} aria-label="Peso objetivo" data-testid="weight-target" /></label>
        <label style={{ display: 'block', flex: 1, minWidth: 150 }}><span className="label" style={{ marginTop: 0 }}>Prazo <span className="muted small">(opcional)</span></span>
          <input type="date" value={deadline} min={todayKey()} onChange={(e) => setDeadline(e.target.value)} aria-label="Prazo" /></label>
      </div>
      <div className="row wrap" style={{ gap: 12 }}>
        <label style={{ display: 'block', flex: 1, minWidth: 130 }}><span className="label">Peso de partida (kg)</span>
          <input inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value.replace(/[^\d.,]/g, ''))} aria-label="Peso de partida" /></label>
        <label style={{ display: 'block', flex: 1, minWidth: 150 }}><span className="label">Desde</span>
          <input type="date" value={startDate} max={todayKey()} onChange={(e) => setStartDate(e.target.value)} aria-label="Data de partida" /></label>
      </div>
      <p className="field-hint">O app calcula sozinho quanto falta, o ritmo pela tendência das pesagens e quando você chega lá. O peso de partida serve para medir o quanto já foi.</p>
    </Sheet>
  );
}
