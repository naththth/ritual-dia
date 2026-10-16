import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Check as CheckIcon, Shuffle } from 'lucide-react';
import { useApp } from '../state/store';
import { useAll, useByDate, useByRange, useSettings } from '../db/hooks';
import { TopBar, DateHeader } from './common';
import { TaskPicker, TaskRow, TaskSheet, prioLabel } from './tasks';
import {
  daySummary, habitDay, habitProgress, planFor, plannedFood, plannedSkin, plannedTraining, suggestTasks, suggestionReason, tasksForDay
} from '../domain/rules';
import { addDays, monthEnd, monthStart, weekStart, type DateKey } from '../lib/dates';
import { addWater, logSuggestion, planTask, saveSkin, skipPlanned, toggleHabit, workoutFromTemplate, mealFromTemplate } from '../domain/actions';
import type { Habit, Task } from '../db/types';
import { toast } from '../state/store';

export function DayScreen() {
  const date = useApp((s) => s.date);
  const skin = useByDate('skin', date);
  const meals = useByDate('meal', date);
  const water = useByDate('water', date);
  const workouts = useByDate('workout', date);
  const hlogsDay = useByDate('hlog', date);
  const skips = useByDate('skip', date);
  const tasks = useAll('task');
  const skinAm = skin?.find((s) => s.period === 'am');
  const skinPm = skin?.find((s) => s.period === 'pm');
  const sum = daySummary({
    skinAm: !!skinAm, skinPm: !!skinPm,
    food: !!(meals?.some((m) => m.items.length) || water?.length),
    training: !!(workouts?.length || skips?.some((s) => s.domain === 'training')),
    habits: !!hlogsDay?.some((h) => h.done)
  });
  return (
    <div className="screen" data-testid="day-screen">
      <TopBar />
      <DateHeader />
      <div className="summary" data-testid="day-summary">
        <span className="bars" aria-hidden>{Array.from({ length: sum.total }, (_, i) => <i key={i} style={i < sum.done ? { background: 'var(--ink)' } : undefined} />)}</span>
        <span>{sum.done} de {sum.total} áreas registradas</span>
      </div>
      <Suggestion date={date} tasks={tasks} />
      <TodayTasks date={date} tasks={tasks} />
      <SkinBlock date={date} />
      <TrainingBlock date={date} skips={skips?.map((s) => s.ref) ?? []} />
      <FoodBlock date={date} />
      <HabitsBlock date={date} />
    </div>
  );
}

/* ---------------- Sugestão ---------------- */
function Suggestion({ date, tasks }: { date: DateKey; tasks?: Task[] }) {
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
function TodayTasks({ date, tasks }: { date: DateKey; tasks?: Task[] }) {
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

/* ---------------- Pele ---------------- */
function SkinBlock({ date }: { date: DateKey }) {
  const nav = useNavigate();
  const skin = useByDate('skin', date);
  const plans = useAll('plan');
  const products = useAll('product');
  const plan = planFor(plans ?? [], 'skin', date);
  const half = (period: 'am' | 'pm', label: string) => {
    const log = skin?.find((s) => s.period === period);
    const planned = plannedSkin(plan, date, period, products ?? []);
    const cond = log?.condition ? { otima: 'Ótima', boa: 'Boa', regular: 'Regular', sensibilizada: 'Sensibilizada' }[log.condition] : null;
    return (
      <div className="half" data-testid={`skin-${period}`}>
        <button className="tap" onClick={() => nav(`/pele?p=${period}`)} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="k">{label}</span>
          <span className="v">
            {log ? (log.skipped ? 'Pulado' : `${cond ?? 'Registrado'}. ${log.productIds.length} ${log.productIds.length === 1 ? 'produto' : 'produtos'}`) :
              planned.length ? `${planned.length} produtos no plano` : 'Não registrado'}
          </span>
        </button>
        <div className="act">
          {log ? (
            <span className="row small" style={{ gap: 4, fontWeight: 700 }}><CheckIcon size={16} strokeWidth={3} /> Feito</span>
          ) : planned.length ? (
            <button className="pill-act pa-rose" data-testid={`skin-${period}-all`} onClick={() => saveSkin(date, period, { productIds: planned, plannedIds: planned })}>Usei tudo</button>
          ) : (
            <button className="pill-act pa-ghost" onClick={() => nav(`/pele?p=${period}`)}>Registrar</button>
          )}
        </div>
      </div>
    );
  };
  return (
    <section className="block b-rose" aria-label="Pele">
      <div className="bh">
        <h2>Pele</h2>
        <button className="icon-btn" aria-label="Abrir pele" onClick={() => nav('/pele')}><ChevronRight size={22} /></button>
      </div>
      <div className="skin-halves">
        {half('am', 'Manhã')}
        {half('pm', 'Noite')}
      </div>
    </section>
  );
}

/* ---------------- Treino ---------------- */
function TrainingBlock({ date, skips }: { date: DateKey; skips: string[] }) {
  const nav = useNavigate();
  const workouts = useByDate('workout', date);
  const plans = useAll('plan');
  const templates = useAll('wtemplate');
  const mods = useAll('modality');
  const planned = plannedTraining(planFor(plans ?? [], 'training', date), date)
    .map((id) => templates?.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t);
  const pending = planned.filter((t) => !skips.includes(t.id) && !workouts?.some((w) => w.templateId === t.id));
  const modName = (id: string) => mods?.find((m) => m.id === id)?.name ?? 'Treino';
  return (
    <section className="block b-blue" aria-label="Treino" data-testid="training-block">
      <div className="bh">
        <h2>Treino</h2>
        <button className="icon-btn" aria-label="Abrir treino" onClick={() => nav('/treino')}><ChevronRight size={22} /></button>
      </div>
      {workouts?.map((w) => (
        <div key={w.id} className="workout-row">
          <CheckIcon size={20} strokeWidth={3} />
          <div className="grow"><div className="t">{modName(w.modalityId)}</div>
            <div className="small">{[w.duration && `${w.duration} min`, w.intensity, w.distanceKm && `${w.distanceKm} km`].filter(Boolean).join(', ')}</div></div>
        </div>
      ))}
      {pending.map((t) => (
        <div key={t.id} style={{ marginTop: 6 }}>
          <div className="small" style={{ fontWeight: 600 }}>Planejado</div>
          <div className="workout-row" style={{ minHeight: 0 }}>
            <div className="grow"><div className="t" style={{ fontSize: 18 }}>{t.name}</div>
              <div className="small">{modName(t.modalityId)}, {t.duration} min, {t.intensity}</div></div>
          </div>
          <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
            <button className="pill-act pa-blue" data-testid="train-done" onClick={() => workoutFromTemplate(t, date, true)}>Feito</button>
            <button className="pill-act pa-ghost" onClick={() => nav(`/treino?novo=1&de=${t.id}`)}>Fiz outro</button>
            <button className="pill-act pa-ghost" onClick={() => skipPlanned(date, 'training', t.id, 'Treino marcado como não hoje')}>Hoje não</button>
          </div>
        </div>
      ))}
      {!workouts?.length && !pending.length && (
        <div className="row between">
          <span className="small">{planned.length ? 'Plano dispensado hoje.' : 'Nada planejado. Não registrado.'}</span>
          <button className="pill-act pa-blue" onClick={() => nav('/treino?novo=1')}>Registrar</button>
        </div>
      )}
    </section>
  );
}

/* ---------------- Alimentação ---------------- */
function FoodBlock({ date }: { date: DateKey }) {
  const nav = useNavigate();
  const settings = useSettings();
  const meals = useByDate('meal', date);
  const water = useByDate('water', date);
  const foods = useAll('food');
  const plans = useAll('plan');
  const tmpls = useAll('mtemplate');
  const skips = useByDate('skip', date);
  const plannedMap = plannedFood(planFor(plans ?? [], 'food', date), date);
  const total = (water ?? []).reduce((a, w) => a + w.ml, 0);
  const types = settings?.mealTypes ?? [];
  const foodName = (id: string) => foods?.find((f) => f.id === id)?.name ?? '?';
  return (
    <section className="block b-honey" aria-label="Alimentação" data-testid="food-block">
      <div className="bh">
        <h2>Alimentação</h2>
        <button className="icon-btn" aria-label="Abrir alimentação" onClick={() => nav('/alimentacao')}><ChevronRight size={22} /></button>
      </div>
      <div className="timeline">
        {types.map((mt) => {
          const meal = meals?.find((m) => m.mealType === mt.id);
          const tplId = plannedMap[mt.id];
          const tpl = tplId ? tmpls?.find((t) => t.id === tplId) : undefined;
          const skipped = skips?.some((s) => s.domain === 'food' && s.ref === mt.id);
          if (!meal && !tpl && (mt.id === 'ceia' || mt.id === 'lanche')) return null;
          return (
            <div key={mt.id} className={`tl-row ${meal ? 'done' : ''}`}>
              <span className="dot" />
              <button className="tap" onClick={() => nav(`/alimentacao?m=${mt.id}`)}>
                <div className="t">{mt.label}</div>
                <div className="s">{meal ? meal.items.map((i) => foodName(i.foodId)).join(', ') || 'Sem itens'
                  : tpl && !skipped ? `Plano: ${tpl.name}` : skipped ? 'Não hoje' : 'Não registrado'}</div>
              </button>
              {!meal && tpl && !skipped && (
                <button className="pill-act pa-honey" data-testid={`meal-plan-${mt.id}`} onClick={() => mealFromTemplate(tpl, date, mt.id, true)}>Comi isso</button>
              )}
            </div>
          );
        })}
      </div>
      <div className="water" data-testid="water">
        <span className="amount num">{total >= 1000 ? `${(total / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L` : `${total} mL`}</span>
        <span className="grow small">de água</span>
        {(settings?.waterPresets ?? [300]).slice(0, 2).map((ml) => (
          <button key={ml} onClick={() => addWater(date, ml)} aria-label={`Adicionar ${ml} mL de água`}>+{ml}</button>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Hábitos ---------------- */
function HabitsBlock({ date }: { date: DateKey }) {
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
