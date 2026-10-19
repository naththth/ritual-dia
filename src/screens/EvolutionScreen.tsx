import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TopBar } from './common';
import { Seg, Empty } from '../ui/ui';
import { useAll, useByRange } from '../db/hooks';
import { useApp } from '../state/store';
import { addDays, addMonths, monthEnd, monthStart, shortLabel, todayKey, weekStart, weekDays, WEEKDAY_LETTER, isoWeekday, monthTitle, type DateKey, diffDays } from '../lib/dates';
import { habitDoneDates, planFor, plannedTraining } from '../domain/rules';
import { SKIN_SIGNALS, SKIN_CONDITIONS } from '../domain/defaults';
import { PhotoThumb } from './photos';
import { fmt, totals } from '../domain/nutrition';

function Bars({ rows, color, unit = '' }: { rows: { label: string; value: number }[]; color: string; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div role="table" aria-label="Valores">
      {rows.map((r) => (
        <div key={r.label} className="bar-row" role="row">
          <span role="cell" className="small" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</span>
          <span className="bar-track" role="presentation"><span className="bar-fill" style={{ width: `${(r.value / max) * 100}%`, display: 'block', color }} /></span>
          <span role="cell" className="small num" style={{ textAlign: 'right', fontWeight: 700 }}>{r.value}{unit}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ n, label }: { n: string | number; label: string }) {
  return <div><div className="big-num num">{n}</div><div className="small">{label}</div></div>;
}

export function EvolutionScreen() {
  const date = useApp((s) => s.date);
  const [mode, setMode] = useState<'semana' | 'mes'>('semana');
  const [anchor, setAnchor] = useState<DateKey>(date);
  const from = mode === 'semana' ? weekStart(anchor) : monthStart(anchor);
  const to = mode === 'semana' ? addDays(from, 6) : monthEnd(anchor);
  const today = todayKey();
  const lastDay = to < today ? to : today;
  const elapsed = from > today ? 0 : diffDays(from, lastDay) + 1;

  const habits = useAll('habit');
  const hlogs = useByRange('hlog', from, to);
  const workouts = useByRange('workout', from, to);
  const skin = useByRange('skin', from, to);
  const meals = useByRange('meal', from, to);
  const water = useByRange('water', from, to);
  const photos = useByRange('photo', addDays(to, -120), to);
  const tasks = useAll('task');
  const cats = useAll('category');
  const mods = useAll('modality');
  const foods = useAll('food');
  const plans = useAll('plan');
  const goals = useAll('goal');
  const gentries = useAll('gentry');

  const shift = (n: number) => setAnchor(mode === 'semana' ? addDays(anchor, 7 * n) : addMonths(anchor, n));
  const label = mode === 'semana' ? `${shortLabel(from)} a ${shortLabel(to)}` : monthTitle(from);

  // Treino
  let plannedCount = 0;
  for (let d = from; d <= lastDay; d = addDays(d, 1)) plannedCount += plannedTraining(planFor(plans ?? [], 'training', d), d).length;
  const fromPlan = (workouts ?? []).filter((w) => w.fromPlan).length;
  const minutes = (workouts ?? []).reduce((a, w) => a + (w.duration ?? 0), 0);
  const byMod = new Map<string, number>();
  (workouts ?? []).forEach((w) => byMod.set(w.modalityId, (byMod.get(w.modalityId) ?? 0) + 1));

  // Pele
  const skinDays = new Set((skin ?? []).filter((s) => s.period !== 'corpo').map((s) => s.date));
  const sig = SKIN_SIGNALS.map((s) => ({ label: s.label, value: (skin ?? []).filter((l) => l.signals?.[s.id]).length })).filter((r) => r.value > 0);
  const cond = SKIN_CONDITIONS.map((c) => ({ label: c.label, value: (skin ?? []).filter((l) => l.condition === c.id).length })).filter((r) => r.value > 0);

  // Alimentação
  const mealDays = new Set((meals ?? []).filter((m) => m.items.length).map((m) => m.date));
  const waterByDay = new Map<string, number>();
  (water ?? []).forEach((w) => waterByDay.set(w.date, (waterByDay.get(w.date) ?? 0) + w.ml));
  const avgWater = waterByDay.size ? Math.round([...waterByDay.values()].reduce((a, b) => a + b, 0) / waterByDay.size) : 0;
  const foodCount = new Map<string, number>();
  (meals ?? []).forEach((m) => m.items.forEach((i) => foodCount.set(i.foodId, (foodCount.get(i.foodId) ?? 0) + 1)));
  const topFoods = [...foodCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => ({ label: foods?.find((f) => f.id === id)?.name ?? '?', value: v }));

  const dayTot = [...mealDays].map((d) => totals((meals ?? []).filter((m) => m.date === d).flatMap((m) => m.items), foods ?? []).n);
  const avgKcal = dayTot.length && dayTot.some((t) => t.kcal > 0) ? dayTot.reduce((a, t) => a + t.kcal, 0) / dayTot.length : null;
  const avgProt = avgKcal != null ? dayTot.reduce((a, t) => a + t.p, 0) / dayTot.length : null;

  // Tarefas
  const done = (tasks ?? []).filter((t) => t.completedDate && t.completedDate >= from && t.completedDate <= to);
  const byCat = (cats ?? []).map((c) => ({ label: c.name, value: done.filter((t) => t.categoryId === c.id).length })).filter((r) => r.value > 0);

  return (
    <div className="screen" data-testid="evolution-screen">
      <TopBar />
      <h1 className="section-title" style={{ fontSize: 32, fontWeight: 500, margin: '8px 0 14px' }}>Evolução</h1>
      <Seg value={mode} onChange={(m) => setMode(m)} options={[{ id: 'semana', label: 'Semana' }, { id: 'mes', label: 'Mês' }]} />
      <div className="row between" style={{ margin: '10px 0 6px' }}>
        <button className="icon-btn" aria-label="Período anterior" onClick={() => shift(-1)}><ChevronLeft size={22} /></button>
        <span style={{ fontWeight: 650 }}>{label}</span>
        <button className="icon-btn" aria-label="Próximo período" onClick={() => shift(1)}><ChevronRight size={22} /></button>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>Só o que você registrou. Dia sem registro aparece como não registrado, não como falha.</p>

      <section className="block b-olive">
        <div className="bh"><h2>Hábitos</h2></div>
        {(habits ?? []).filter((h) => !h.archived).map((h) => {
          const dates = habitDoneDates(h, from, to, hlogs ?? [], workouts ?? []);
          const target = h.freq === 'diaria' ? elapsed : h.freq === 'semanal' ? (mode === 'semana' ? h.target : Math.round((h.target * (diffDays(from, to) + 1)) / 7)) : h.target;
          return (
            <div key={h.id} style={{ marginBottom: 14 }}>
              <div className="row between"><span style={{ fontWeight: 700 }}>{h.title}</span><span className="small num" style={{ fontWeight: 700 }}>{dates.length} de {target}</span></div>
              {mode === 'semana' && (
                <div className="week-dots" style={{ marginTop: 6 }}>
                  {weekDays(from).map((d) => <i key={d} className={dates.includes(d) ? 'on' : ''} title={shortLabel(d)}><span>{WEEKDAY_LETTER[isoWeekday(d)]}</span></i>)}
                </div>
              )}
            </div>
          );
        })}
        {!habits?.length && <p className="small">Nenhum hábito cadastrado.</p>}
      </section>

      <section className="block b-blue">
        <div className="bh"><h2>Treino</h2></div>
        <div className="row wrap" style={{ gap: '12px 24px', marginBottom: 12 }}>
          <Stat n={workouts?.length ?? 0} label="treinos" />
          <Stat n={minutes} label="minutos" />
          {plannedCount > 0 && <Stat n={`${fromPlan}/${plannedCount}`} label="do plano feitos" />}
        </div>
        {byMod.size > 0 ? <Bars color="var(--blue-ink)" rows={[...byMod.entries()].map(([id, v]) => ({ label: mods?.find((m) => m.id === id)?.name ?? '?', value: v }))} /> : <p className="small" style={{ margin: 0 }}>Nenhum treino registrado no período.</p>}
      </section>

      <section className="block b-rose">
        <div className="bh"><h2>Pele</h2></div>
        <div className="row wrap" style={{ gap: '12px 24px', marginBottom: 12 }}>
          <Stat n={skinDays.size} label={`de ${elapsed} ${elapsed === 1 ? 'dia' : 'dias'} com registro`} />
        </div>
        {cond.length > 0 && (<><span className="label" style={{ marginTop: 0 }}>Como a pele estava</span><Bars color="var(--rose-ink)" rows={cond} unit="x" /></>)}
        {sig.length > 0 && (<><span className="label">Sinais registrados</span><Bars color="var(--rose-ink)" rows={sig} unit="x" /></>)}
        {(photos ?? []).length > 0 && (
          <>
            <span className="label">Fotos recentes</span>
            <div className="photo-strip">{[...(photos ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8).map((p) => (
              <div key={p.id} style={{ textAlign: 'center' }}><PhotoThumb p={p} /><div className="tiny">{shortLabel(p.date)}</div></div>
            ))}</div>
          </>
        )}
      </section>

      <section className="block b-honey">
        <div className="bh"><h2>Alimentação</h2></div>
        <div className="row wrap" style={{ gap: '12px 24px', marginBottom: 12 }}>
          <Stat n={mealDays.size} label={`de ${elapsed} ${elapsed === 1 ? 'dia' : 'dias'} com refeição`} />
          {avgKcal != null && <Stat n={fmt(avgKcal)} label="kcal média por dia registrado" />}
          {avgProt != null && <Stat n={`${fmt(avgProt)} g`} label="proteína média" />}
          {avgWater > 0 && <Stat n={`${(avgWater / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L`} label="água nos dias registrados" />}
        </div>
        {topFoods.length > 0 ? (<><span className="label" style={{ marginTop: 0 }}>Mais presentes</span><Bars color="var(--honey-ink)" rows={topFoods} unit="x" /></>) : <p className="small" style={{ margin: 0 }}>Nenhuma refeição registrada no período.</p>}
      </section>

      <section className="block b-wine">
        <div className="bh"><h2>Tarefas</h2></div>
        <Stat n={done.length} label="concluídas no período" />
        {byCat.length > 0 && <div style={{ marginTop: 12 }}><Bars color="var(--wine-ink)" rows={byCat} /></div>}
        {done.slice(0, 8).map((t) => <div key={t.id} className="small" style={{ marginTop: 6 }}>{shortLabel(t.completedDate!)}: {t.title}</div>)}
      </section>

      <section className="block b-paper">
        <div className="bh"><h2>Metas</h2></div>
        {(goals ?? []).filter((g) => g.status === 'ativa').map((g) => {
          const es = (gentries ?? []).filter((e) => e.goalId === g.id).sort((a, b) => (a.date < b.date ? -1 : 1));
          const first = es[0]; const last = es[es.length - 1];
          return (
            <div key={g.id} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700 }}>{g.title}</div>
              <div className="small muted">
                {g.type === 'marcos' ? `${g.milestones.filter((m) => m.done).length} de ${g.milestones.length} marcos concluídos`
                  : !last ? 'Sem medidas ainda. Registre pelo botão + em "Medida de meta".'
                    : es.length === 1 ? `Primeira medida: ${last.value} ${g.unit ?? ''} em ${shortLabel(last.date)}`
                      : `De ${first.value} para ${last.value} ${g.unit ?? ''} (${shortLabel(first.date)} a ${shortLabel(last.date)})`}
              </div>
            </div>
          );
        })}
        {!(goals ?? []).some((g) => g.status === 'ativa') && <Empty text="Nenhuma meta ativa." />}
      </section>
    </div>
  );
}
