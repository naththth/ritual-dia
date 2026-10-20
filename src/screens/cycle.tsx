// Ciclo menstrual: faixa no Hoje, registro do dia e a tela com calendário, histórico e previsões.
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Droplet, Pencil, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAll, useSettings } from '../db/hooks';
import { get, remove, update, upsert } from '../db/db';
import { Chip, Sheet } from '../ui/ui';
import { toast } from '../state/store';
import { addDays, shortLabel, todayKey, type DateKey } from '../lib/dates';
import type { CycleDay, Flow, Profile } from '../db/types';
import { cycleInfo, cycleStats, PHASE_LABEL, type Phase } from '../domain/cycle';
import { PageHead } from './common';

export const FLOWS: { id: Flow; label: string }[] = [
  { id: 'spotting', label: 'Escape' },
  { id: 'leve', label: 'Leve' },
  { id: 'medio', label: 'Médio' },
  { id: 'intenso', label: 'Intenso' }
];
export const SYMPTOMS = ['Cólica', 'Inchaço', 'Dor de cabeça', 'Seios sensíveis', 'Acne', 'Pele oleosa', 'Cansaço', 'Humor instável', 'Ansiedade', 'Vontade de doce', 'Mais fome', 'Sono ruim', 'Dor lombar', 'Intestino alterado'];

/** Uma linha curta por fase: o que a evidência sustenta, sem receita. */
const PHASE_HINT: Record<Phase, string> = {
  menstrual: 'Treine pelo que o corpo pede nos dias de sintoma. Ferro e água em dia.',
  folicular: 'Costuma ser a fase de mais disposição: bom espaço para os treinos fortes.',
  ovulatoria: 'Energia em geral alta. Capriche no aquecimento.',
  lutea: 'Fome, calor e oleosidade da pele tendem a subir. Sono pede mais atenção.'
};

const cid = (d: DateKey) => `cycle:${d}`;

export async function setCycleDay(date: DateKey, data: Partial<CycleDay>) {
  const cur = (await get<'cycle'>(cid(date))) as CycleDay | undefined;
  const live = cur && !cur.deleted ? cur : undefined;
  await upsert('cycle', cid(date), { date, symptoms: [], ...(live ?? {}), ...data, deleted: 0 } as any);
}

/** Tira o fluxo de um dia; se não sobrar sintoma nem observação, apaga o registro. */
async function clearFlow(date: DateKey) {
  const cur = (await get<'cycle'>(cid(date))) as CycleDay | undefined;
  if (!cur || cur.deleted) return;
  if (!cur.symptoms?.length && !cur.note) await remove(cid(date));
  else await setCycleDay(date, { flow: undefined });
}

export function useCycle() {
  const days = useAll('cycle');
  const settings = useSettings();
  const profile = settings?.profile;
  const stats = useMemo(() => cycleStats(days ?? [], profile), [days, profile]);
  return { days, profile, stats, loaded: !!days && !!settings };
}

export function tracksCycle(p?: Profile) {
  return p?.cycle?.tracks !== false && p?.sex !== 'M';
}

/** Faixa no Hoje: dia do ciclo, fase estimada e um atalho para marcar a menstruação. */
export function CycleCard({ date }: { date: DateKey }) {
  const nav = useNavigate();
  const { days, profile, stats, loaded } = useCycle();
  const [open, setOpen] = useState(false);
  if (!loaded || !tracksCycle(profile)) return null;
  const today = days!.find((d) => d.date === date && !d.deleted);
  const info = cycleInfo(date, stats, profile);
  const start = () => setCycleDay(date, { flow: 'medio' }).then(() => toast('Menstruação marcada. Os próximos dias seguem pelo atalho aqui.'));
  const yesterdayFlow = days!.find((d) => d.date === addDays(date, -1) && !d.deleted && d.flow && d.flow !== 'spotting');

  if (!info && !stats.lastStart) {
    if (date !== todayKey()) return null;
    return (
      <>
        <section className="wellness-ask" style={{ display: 'block' }} data-testid="cycle-ask">
          <button className="row tap" style={{ gap: 12, width: '100%', textAlign: 'left' }} onClick={() => setOpen(true)} data-testid="cycle-setup">
            <Droplet size={18} />
            <span className="grow"><b>Acompanhar o ciclo</b><br /><span className="small">Marque o primeiro dia da última menstruação. A IA passa a considerar a fase no treino, na pele e na alimentação.</span></span>
          </button>
        </section>
        <CycleSheet open={open} date={date} onClose={() => setOpen(false)} />
      </>
    );
  }

  const title = info ? `Dia ${info.day} do ciclo${info.phase ? ` · fase ${PHASE_LABEL[info.phase]}` : ''}` : 'Ciclo';
  let sub = info?.phase ? PHASE_HINT[info.phase] : '';
  if (info?.late) sub = `Menstruação atrasada ${info.day - (stats.avgLength ?? 28)} dias em relação à média.`;
  else if (info && info.daysToNext > 0 && info.daysToNext <= 3 && !today?.flow) sub = `Menstruação prevista em ${info.daysToNext === 1 ? '1 dia' : `${info.daysToNext} dias`}.`;
  const showStart = !today?.flow && info && (info.daysToNext <= 3 || info.late);
  const showFlowToday = !today?.flow && !!yesterdayFlow;
  return (
    <>
      <section className="cycle-strip" data-testid="cycle-card">
        <button className="row tap" style={{ gap: 10, width: '100%', textAlign: 'left', alignItems: 'flex-start' }} onClick={() => setOpen(true)} aria-label="Registrar ciclo do dia">
          <Droplet size={18} style={{ marginTop: 2, flex: '0 0 auto' }} />
          <span className="grow"><b data-testid="cycle-title">{title}</b>{sub && <><br /><span className="small">{sub}</span></>}
            {today && (today.flow || today.symptoms.length > 0) && <><br /><span className="small"><b>Hoje:</b> {[today.flow && `fluxo ${FLOWS.find((f) => f.id === today.flow)?.label.toLowerCase()}`, ...today.symptoms.map((s) => s.toLowerCase())].filter(Boolean).join(', ')}</span></>}
          </span>
          <Pencil size={14} style={{ marginTop: 4 }} />
        </button>
        {showFlowToday ? (
          <div className="row wrap" style={{ gap: 6, marginTop: 10 }} data-testid="cycle-continue">
            <span className="small" style={{ flexBasis: '100%' }}>Ainda menstruada hoje?</span>
            {FLOWS.slice(1).map((f) => <button key={f.id} className="pill-act pa-ghost" style={{ minHeight: 34, padding: '0 12px' }} onClick={() => setCycleDay(date, { flow: f.id })}>{f.label}</button>)}
            <button className="pill-act pa-ghost" style={{ minHeight: 34, padding: '0 12px' }} onClick={() => setCycleDay(date, { flow: undefined }).then(() => toast('Anotado: terminou'))}>Acabou</button>
          </div>
        ) : showStart ? (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="pill-act pa-ghost" onClick={start} data-testid="cycle-start">Menstruação começou hoje</button>
          </div>
        ) : null}
        <button className="link small" style={{ marginTop: 8 }} onClick={() => nav('/ciclo')} data-testid="cycle-open">Calendário e histórico <ChevronRight size={14} style={{ verticalAlign: '-2px' }} /></button>
      </section>
      <CycleSheet open={open} date={date} onClose={() => setOpen(false)} />
    </>
  );
}

/** Registro de um dia: fluxo, sintomas e observação. */
export function CycleSheet({ open, date: initial, onClose }: { open: boolean; date: DateKey; onClose: () => void }) {
  const [date, setDate] = useState(initial);
  const [flow, setFlow] = useState<Flow | undefined>();
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const load = async (d: DateKey) => {
    setDate(d);
    const c = (await get<'cycle'>(cid(d))) as CycleDay | undefined;
    const live = c && !c.deleted ? c : undefined;
    setFlow(live?.flow); setSymptoms(live?.symptoms ?? []); setNote(live?.note ?? '');
  };
  useEffect(() => { if (open) load(initial); }, [open, initial]);
  const save = async () => {
    if (!flow && !symptoms.length && !note.trim()) {
      if (await get<'cycle'>(cid(date))) await remove(cid(date));
    } else await setCycleDay(date, { flow, symptoms, note: note.trim() || undefined });
    toast('Ciclo salvo');
    onClose();
  };
  const toggleSym = (s: string) => setSymptoms((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));
  return (
    <Sheet open={open} onClose={onClose} title="Ciclo" sub={shortLabel(date)} testId="cycle-sheet"
      footer={<button className="btn btn-ink" style={{ width: '100%' }} onClick={save} data-testid="cycle-save">Salvar</button>}>
      <label style={{ display: 'block' }}>
        <span className="label" style={{ marginTop: 0 }}>Dia</span>
        <input type="date" value={date} max={todayKey()} onChange={(e) => e.target.value && load(e.target.value)} aria-label="Dia do registro" />
      </label>
      <p className="label" style={{ marginTop: 14 }}>Sangramento</p>
      <div className="chips">
        <Chip on={!flow} onClick={() => setFlow(undefined)}>Nenhum</Chip>
        {FLOWS.map((f) => <Chip key={f.id} on={flow === f.id} onClick={() => setFlow(f.id)} testId={`flow-${f.id}`}>{f.label}</Chip>)}
      </div>
      <p className="field-hint">O primeiro dia com fluxo (não só escape) conta como início do ciclo.</p>
      <p className="label" style={{ marginTop: 14 }}>Sintomas</p>
      <div className="chips">
        {SYMPTOMS.map((s) => <Chip key={s} on={symptoms.includes(s)} onClick={() => toggleSym(s)}>{s}</Chip>)}
      </div>
      <label style={{ display: 'block' }}>
        <span className="label">Observação</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
      </label>
    </Sheet>
  );
}

/** Uma menstruação inteira: início, quantos dias e o fluxo. Serve para registrar, corrigir ou apagar um ciclo de uma vez. */
export function PeriodSheet({ open, period, onClose }: { open: boolean; period?: { start: DateKey; days: number }; onClose: () => void }) {
  const [start, setStart] = useState(todayKey());
  const [days, setDays] = useState('5');
  const [flow, setFlow] = useState<Flow>('medio');
  useEffect(() => {
    if (!open) return;
    setStart(period?.start ?? todayKey()); setDays(String(period?.days || 5)); setFlow('medio');
  }, [open, period?.start, period?.days]);
  const n = Math.min(12, Math.max(1, Number(days) || 0));
  const clearOld = async () => { if (period) for (let i = 0; i < period.days; i++) await clearFlow(addDays(period.start, i)); };
  const save = async () => {
    if (!start || start > todayKey()) { toast('Escolha um dia até hoje.', undefined, 'error'); return; }
    await clearOld();
    for (let i = 0; i < n; i++) { const d = addDays(start, i); if (d <= todayKey()) await setCycleDay(d, { flow }); }
    toast(period ? 'Ciclo corrigido' : 'Menstruação registrada');
    onClose();
  };
  const del = async () => { await clearOld(); toast('Ciclo apagado'); onClose(); };
  return (
    <Sheet open={open} onClose={onClose} title={period ? 'Corrigir menstruação' : 'Registrar menstruação'} sub={period ? `Começou em ${shortLabel(period.start)}` : undefined} testId="period-sheet"
      footer={<>
        {period && <button className="btn btn-soft" onClick={del} data-testid="period-delete">Apagar</button>}
        <button className="btn btn-ink grow" onClick={save} data-testid="period-save">Salvar</button>
      </>}>
      <div className="row wrap" style={{ gap: 12 }}>
        <label style={{ display: 'block', flex: 2, minWidth: 160 }}>
          <span className="label" style={{ marginTop: 0 }}>Primeiro dia</span>
          <input type="date" value={start} max={todayKey()} onChange={(e) => e.target.value && setStart(e.target.value)} aria-label="Primeiro dia" data-testid="period-start" />
        </label>
        <label style={{ display: 'block', flex: 1, minWidth: 110 }}>
          <span className="label" style={{ marginTop: 0 }}>Dias de fluxo</span>
          <input inputMode="numeric" value={days} onFocus={(e) => e.target.select()} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} aria-label="Dias de fluxo" data-testid="period-days" />
        </label>
      </div>
      <p className="label" style={{ marginTop: 14 }}>Fluxo na maior parte dos dias</p>
      <div className="chips">
        {FLOWS.slice(1).map((f) => <Chip key={f.id} on={flow === f.id} onClick={() => setFlow(f.id)}>{f.label}</Chip>)}
      </div>
      <p className="field-hint">Vai de {shortLabel(start)} a {shortLabel(addDays(start, n - 1))}. Sintomas e observações de cada dia são mantidos; para ajustar um dia específico, toque nele no calendário.</p>
    </Sheet>
  );
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Tela completa: situação atual, calendário com previsão, histórico e ajustes. */
export function CycleScreen() {
  const { days, profile, stats, loaded } = useCycle();
  const [sheet, setSheet] = useState<DateKey | null>(null);
  const [period, setPeriod] = useState<{ start: DateKey; days: number } | null | 'new'>(null);
  const [all, setAll] = useState(false);
  const today = todayKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  if (!loaded) return <div className="screen" />;
  const info = cycleInfo(today, stats, profile);
  const cyc = profile?.cycle ?? {};
  const setCyc = (p: Partial<NonNullable<Profile['cycle']>>) => update<'settings'>('settings', { profile: { ...(profile ?? {}), cycle: { ...cyc, ...p } } } as any);
  const byDay = new Map((days ?? []).filter((d) => !d.deleted).map((d) => [d.date, d]));

  // Previsões: próximas 2 menstruações e janela fértil estimada.
  const len = stats.avgLength ?? 28;
  const per = stats.avgPeriod ?? 5;
  const predicted = new Set<DateKey>();
  const fertile = new Set<DateKey>();
  if (stats.lastStart && !cyc.hormonalContraception) {
    for (let k = 1; k <= 3; k++) {
      const s = addDays(stats.lastStart, len * k);
      for (let i = 0; i < per; i++) predicted.add(addDays(s, i));
      const ov = addDays(stats.lastStart, len * (k - 1) + len - 14);
      for (let i = -5; i <= 1; i++) fertile.add(addDays(ov, i));
    }
  }

  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const nDays = new Date(y, m, 0).getDate();
  const cells: (DateKey | null)[] = [...Array(lead).fill(null), ...Array.from({ length: nDays }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const shift = (n: number) => { const d = new Date(y, m - 1 + n, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };

  const history = stats.starts.slice().reverse().slice(0, all ? undefined : 6).map((s, i, arr) => {
    const next = stats.starts[stats.starts.indexOf(s) + 1];
    let p = 0; while (byDay.get(addDays(s, p))?.flow && byDay.get(addDays(s, p))!.flow !== 'spotting') p++;
    const len = next ? Math.round((new Date(next + 'T12:00').getTime() - new Date(s + 'T12:00').getTime()) / 86400000) : undefined;
    return { s, p, len, i, n: arr.length };
  });

  return (
    <div className="screen" data-testid="cycle-screen">
      <PageHead title="Ciclo" withDate={false} />
      <section className="block b-rose">
        {info ? (
          <>
            <div className="big-num num" data-testid="cycle-day">Dia {info.day}</div>
            <p style={{ margin: '4px 0 0' }}>{info.phase ? <>Fase {PHASE_LABEL[info.phase]} (estimada). {PHASE_HINT[info.phase]}</> : 'Com anticoncepcional hormonal não há fase natural para estimar; o app acompanha sangramentos e sintomas.'}</p>
            {!cyc.hormonalContraception && <p className="small" style={{ margin: '8px 0 0' }} data-testid="cycle-next">{info.late ? `Atrasada ${info.day - len} dias em relação à média.` : `Próxima menstruação por volta de ${shortLabel(info.nextStart)}${info.daysToNext > 0 ? `, em ${info.daysToNext} dias` : ''}.`}{info.estimated ? ' Previsão ainda aproximada: fica melhor com três ciclos registrados.' : ''}</p>}
          </>
        ) : <p style={{ margin: 0 }}>Toque no dia em que a última menstruação começou e marque o fluxo. A partir daí o app estima as fases.</p>}
        <button className="pill-act pa-ghost" style={{ marginTop: 12 }} onClick={() => setPeriod('new')} data-testid="period-new"><Plus size={15} style={{ marginRight: 6, verticalAlign: '-2px' }} />Registrar menstruação</button>
        <div className="row wrap" style={{ gap: 14, marginTop: 10 }}>
          <span className="small">Ciclo médio: <b className="num">{stats.avgLength ?? '—'}</b>{stats.avgLength ? ' dias' : ''}</span>
          <span className="small">Menstruação: <b className="num">{stats.avgPeriod ?? '—'}</b>{stats.avgPeriod ? ' dias' : ''}</span>
        </div>
      </section>

      <div className="row between" style={{ margin: '14px 0 8px', alignItems: 'center' }}>
        <button className="icon-btn" aria-label="Mês anterior" onClick={() => shift(-1)}>‹</button>
        <b style={{ textTransform: 'capitalize' }}>{MONTHS[m - 1]} {y}</b>
        <button className="icon-btn" aria-label="Próximo mês" onClick={() => shift(1)}>›</button>
      </div>
      <div className="cycle-grid" data-testid="cycle-grid">
        {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => <span key={i} className="cg-h">{d}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const rec = byDay.get(d);
          const bleed = rec?.flow && rec.flow !== 'spotting';
          const cls = ['cg-d', bleed ? 'bleed' : '', rec?.flow === 'spotting' ? 'spot' : '', !rec?.flow && predicted.has(d) && d > today ? 'pred' : '', fertile.has(d) && !bleed ? 'fert' : '', d === today ? 'today' : '', rec?.symptoms?.length ? 'sym' : ''].join(' ');
          return <button key={d} className={cls} disabled={d > today} onClick={() => setSheet(d)} aria-label={`${shortLabel(d)}${bleed ? ', menstruação' : ''}`}>{Number(d.slice(8))}</button>;
        })}
      </div>
      <div className="row wrap small" style={{ gap: 12, margin: '8px 0 18px' }}>
        <span><i className="cg-key bleed" /> menstruação</span>
        {!cyc.hormonalContraception && <><span><i className="cg-key pred" /> prevista</span><span><i className="cg-key fert" /> janela fértil estimada</span></>}
      </div>

      <h2 className="section-title">Histórico</h2>
      {history.length ? (
        <div data-testid="cycle-history">
          {history.map((h) => (
            <button key={h.s} className="lib-item" onClick={() => setPeriod({ start: h.s, days: h.p })} aria-label={`Corrigir ciclo de ${shortLabel(h.s)}`}>
              <span className="grow" style={{ textAlign: 'left' }}>
                <span style={{ fontWeight: 700 }}>{shortLabel(h.s)}{h.s.slice(0, 4) !== today.slice(0, 4) ? ` de ${h.s.slice(0, 4)}` : ''}</span><br />
                <span className="small muted">{h.p ? `${h.p} ${h.p === 1 ? 'dia' : 'dias'} de fluxo` : 'sem fluxo marcado'}{h.len ? ` · ciclo de ${h.len} dias` : ' · ciclo atual'}</span>
              </span>
              <Pencil size={15} />
            </button>
          ))}
          {!all && stats.starts.length > 6 && <button className="link" style={{ marginTop: 10 }} onClick={() => setAll(true)}>Ver todos os {stats.starts.length} ciclos</button>}
        </div>
      ) : <p className="small">Nenhum ciclo registrado ainda.</p>}

      <h2 className="section-title" style={{ marginTop: 18 }}>Ajustes</h2>
      <div className="chips">
        <Chip on={!!cyc.hormonalContraception} onClick={() => setCyc({ hormonalContraception: !cyc.hormonalContraception })} testId="cycle-hormonal">Uso anticoncepcional hormonal</Chip>
        <Chip on={cyc.tracks !== false} onClick={() => setCyc({ tracks: cyc.tracks === false })}>Mostrar no Hoje</Chip>
      </div>
      <div className="row wrap" style={{ gap: 12, marginTop: 12 }}>
        <label style={{ display: 'block', flex: 1, minWidth: 140 }}>
          <span className="label">Ciclo típico (dias)</span>
          <input inputMode="numeric" defaultValue={cyc.typicalLength ?? ''} placeholder="28" onBlur={(e) => setCyc({ typicalLength: Number(e.target.value) || undefined })} />
        </label>
        <label style={{ display: 'block', flex: 1, minWidth: 140 }}>
          <span className="label">Menstruação típica (dias)</span>
          <input inputMode="numeric" defaultValue={cyc.typicalPeriod ?? ''} placeholder="5" onBlur={(e) => setCyc({ typicalPeriod: Number(e.target.value) || undefined })} />
        </label>
      </div>
      <p className="field-hint">Usados até haver ciclos suficientes registrados. Se o Garmin registra a menstruação, ela chega pela sincronização com o intervals.icu. As fases são estimativas pelo calendário, não confirmam ovulação.</p>
      <CycleSheet open={!!sheet} date={sheet ?? today} onClose={() => setSheet(null)} />
      <PeriodSheet open={!!period} period={period && period !== 'new' ? period : undefined} onClose={() => setPeriod(null)} />
    </div>
  );
}
