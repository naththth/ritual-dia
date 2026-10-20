import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check as CheckIcon, Shuffle } from 'lucide-react';
import { useApp } from '../state/store';
import { useAll, useByRange } from '../db/hooks';
import { TopBar, DateHeader } from './common';
import { TaskPicker, TaskRow, TaskSheet, prioLabel } from './tasks';
import {
  habitDay, habitProgress, suggestTasks, suggestionReason, tasksForDay
} from '../domain/rules';
import { addDays, monthEnd, monthStart, weekStart, type DateKey } from '../lib/dates';
import { logSuggestion, planTask, toggleHabit } from '../domain/actions';
import type { Habit, Task } from '../db/types';
import { toast } from '../state/store';
import { BriefTasks, DayBriefBlock } from './ai-ui';
import { NowAndTimeline, TodayStats } from './today';
import { WellnessCard } from './wellness';
import { CycleCard } from './cycle';

export function DayScreen() {
  const date = useApp((s) => s.date);
  const tasks = useAll('task');
  return (
    <div className="screen" data-testid="day-screen">
      <TopBar />
      <DateHeader />
      {/* Ordem: saúde e ciclo, leitura da IA, o dia com horários, tarefas (as do dia e as sugeridas) e hábitos. */}
      <TodayStats date={date} />
      <WellnessCard date={date} />
      <CycleCard date={date} />
      <DayBriefBlock date={date} />
      <NowAndTimeline date={date} />
      <TodayTasks date={date} tasks={tasks} />
      <BriefTasks date={date} />
      <Suggestion date={date} tasks={tasks} />
      <HabitsBlock date={date} />
    </div>
  );
}

/* ---------------- Sugestão ---------------- */
export function Suggestion({ date, tasks }: { date: DateKey; tasks?: Task[] }) {
  const logs = useAll('suggestion');
  const cats = useAll('category');
  const [offset, setOffset] = useState(0);
  const options = useMemo(() => suggestTasks(tasks ?? [], logs ?? [], date, {}, 3), [tasks, logs, date]);
  const deferredToday = (logs ?? []).filter((l) => l.date === date && l.action === 'adiada').length;
  if (!tasks || !logs || deferredToday >= 3) return null;
  if (options.length === 0) return null;
  const t = options[offset % options.length];
  return (
    <section className="block b-wine" data-testid="suggestion" aria-label="Sugestão de tarefa">
      <div className="meta" style={{ marginBottom: 6 }}>Uma sugestão, se fizer sentido hoje</div>
      <h2 style={{ fontSize: 24 }}>{t.title}</h2>
      <p style={{ margin: '8px 0 14px', fontSize: 15, opacity: 0.92 }}>{suggestionReason(t, prioLabel(cats, t))}</p>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn btn-cream btn-sm" data-testid="sugg-accept" onClick={async () => { await logSuggestion(t.id, date, 'aceita'); await planTask(t, date); setOffset(0); }}>Colocar no meu dia</button>
        {options.length > 1 && (
          <button className="btn btn-sm btn-line" data-testid="sugg-other" onClick={() => setOffset(offset + 1)}><Shuffle size={16} />Outra</button>
        )}
        <button className="btn btn-sm btn-ghost" data-testid="sugg-later" onClick={async () => { await logSuggestion(t.id, date, 'adiada'); setOffset(0); if (deferredToday + 1 >= 3) toast('Sem mais sugestões por hoje.'); }}>Agora não</button>
      </div>
    </section>
  );
}

/* ---------------- Tarefas do dia ---------------- */
export function TodayTasks({ date, tasks }: { date: DateKey; tasks?: Task[] }) {
  const cats = useAll('category');
  const [pick, setPick] = useState(false);
  const [edit, setEdit] = useState<Task | undefined>();
  const list = tasksForDay(tasks ?? [], date);
  return (
    <section style={{ margin: '4px 0 18px' }} aria-label="Tarefas do dia">
      <div className="section" style={{ marginTop: 18 }}>
        <h2 className="section-title">Tarefas do dia</h2>
        {list.length > 0 && <button className="link" onClick={() => setPick(true)}>Escolher tarefa</button>}
      </div>
      {list.length === 0 ? (
        <div className="row between" style={{ border: '1.5px dashed var(--line-2)', borderRadius: 18, padding: '12px 12px 12px 16px', gap: 10 }}>
          <span className="small muted">Nenhuma tarefa escolhida para este dia.</span>
          <button className="btn btn-ink btn-sm" onClick={() => setPick(true)} data-testid="pick-task">Escolher</button>
        </div>
      ) : (
        <div className="list">
          {list.map((t) => <TaskRow key={t.id} t={t} cats={cats} date={date} onOpen={() => setEdit(t)} />)}
        </div>
      )}
      <TaskPicker open={pick} onClose={() => setPick(false)} date={date} />
      <TaskSheet open={!!edit} onClose={() => setEdit(undefined)} task={edit} />
    </section>
  );
}

/* ---------------- Hábitos ---------------- */
export function HabitsBlock({ date }: { date: DateKey }) {
  const nav = useNavigate();
  const habits = useAll('habit');
  const from = [weekStart(date), monthStart(date)].sort()[0];
  const to = [addDays(weekStart(date), 6), monthEnd(date)].sort()[1];
  const logs = useByRange('hlog', from, to);
  const workouts = useByRange('workout', from, to);
  const active = (habits ?? []).filter((h) => !h.archived).sort((a, b) => a.order - b.order);
  if (!habits) return null;
  const tap = async (h: Habit) => {
    const st = habitDay(h, date, logs ?? [], workouts ?? []);
    if (st.viaWorkout && !st.manual) { toast(`${h.title} já contou pelo treino deste dia.`); return; }
    await toggleHabit(h, date, st.manual);
  };
  return (
    <section className="block b-olive" aria-label="Hábitos" data-testid="habits-block">
      <div className="bh">
        <h2>Hábitos</h2>
        <button className="link" onClick={() => nav('/biblioteca/habitos')}>Gerenciar</button>
      </div>
      {active.length === 0 ? <p className="small" style={{ margin: 0 }}>Nenhum hábito cadastrado ainda.</p> : (
        <div className="habit-grid">
          {active.map((h) => {
            const st = habitDay(h, date, logs ?? [], workouts ?? []);
            const pr = habitProgress(h, date, logs ?? [], workouts ?? []);
            return (
              <button key={h.id} className={`habit ${st.done ? 'on' : ''}`} onClick={() => tap(h)} aria-pressed={st.done} data-testid={`habit-${h.title}`}>
                <span className="ring">{st.done && <CheckIcon size={16} strokeWidth={3} />}</span>
                <span>
                  <span className="hn">{h.title}</span><br />
                  <span className="hc num">{h.freq === 'diaria' ? (st.done ? 'Feito hoje' : 'Diário') : `${pr.count} de ${pr.target} ${h.freq === 'semanal' ? 'na semana' : 'no mês'}`}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
