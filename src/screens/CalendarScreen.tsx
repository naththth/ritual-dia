import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronRight as Go } from 'lucide-react';
import { useApp } from '../state/store';
import { TopBar } from './common';
import { addMonths, dayNum, monthGrid, monthStart, monthTitle, todayKey, WEEKDAY_LETTER, longDate, WEEKDAY_LONG, isoWeekday } from '../lib/dates';
import { factDots, useFacts } from '../domain/facts';
import { useAll, useByDate } from '../db/hooks';
import { tasksForDay } from '../domain/rules';

export function CalendarScreen() {
  const { date, setDate } = useApp();
  const nav = useNavigate();
  const grid = monthGrid(date);
  const facts = useFacts(grid[0], grid[grid.length - 1]);
  const today = todayKey();
  const m = monthStart(date);
  return (
    <div className="screen" data-testid="calendar-screen">
      <TopBar />
      <div className="cal-head">
        <button className="icon-btn" aria-label="Mês anterior" onClick={() => setDate(addMonths(date, -1))}><ChevronLeft size={22} /></button>
        <h1>{monthTitle(date)}</h1>
        <button className="icon-btn" aria-label="Próximo mês" onClick={() => setDate(addMonths(date, 1))}><ChevronRight size={22} /></button>
      </div>
      <div className="cal-grid">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="cal-wd">{WEEKDAY_LETTER[i]}</div>)}
        {grid.map((d) => (
          <button key={d} className={`cal-day ${d.slice(0, 7) !== m.slice(0, 7) ? 'out' : ''} ${d === today ? 'today' : ''} ${d === date ? 'sel' : ''}`}
            onClick={() => setDate(d)} aria-label={d} aria-pressed={d === date}>
            <span className="num">{dayNum(d)}</span>
            <span className="dots">{factDots(facts?.[d]).map((c, i) => <i key={i} style={{ background: d === date ? 'var(--paper)' : c }} />)}</span>
          </button>
        ))}
      </div>
      <div className="row wrap small muted" style={{ gap: 12, margin: '12px 0 4px' }}>
        <Legend c="var(--rose-2)" t="Pele" /><Legend c="var(--honey-2)" t="Alimentação" /><Legend c="var(--blue-2)" t="Treino" /><Legend c="var(--olive-2)" t="Hábitos" /><Legend c="var(--wine)" t="Tarefa concluída" />
      </div>
      {date !== today && <button className="today-pill" style={{ marginTop: 8 }} onClick={() => setDate(today)}>Hoje</button>}
      <DayPanel onOpen={(p) => nav(p)} />
    </div>
  );
}

function Legend({ c, t }: { c: string; t: string }) {
  return <span className="row" style={{ gap: 5 }}><i style={{ width: 8, height: 8, borderRadius: 4, background: c, display: 'inline-block' }} />{t}</span>;
}

function DayPanel({ onOpen }: { onOpen: (path: string) => void }) {
  const date = useApp((s) => s.date);
  const skin = useByDate('skin', date);
  const meals = useByDate('meal', date);
  const water = useByDate('water', date);
  const workouts = useByDate('workout', date);
  const hlogs = useByDate('hlog', date);
  const tasks = useAll('task');
  const mods = useAll('modality');
  const habits = useAll('habit');
  const settings = useAll('settings');
  const mealTypes = settings?.[0]?.mealTypes ?? [];
  const am = skin?.find((s) => s.period === 'am');
  const pm = skin?.find((s) => s.period === 'pm');
  const dayTasks = tasksForDay(tasks ?? [], date);
  const ml = (water ?? []).reduce((a, w) => a + w.ml, 0);
  const rows = [
    { k: 'Pele', v: [am ? 'manhã registrada' : 'manhã não registrada', pm ? 'noite registrada' : 'noite não registrada'].join(', '), c: 'var(--rose)', p: '/pele' },
    { k: 'Alimentação', v: (meals?.filter((m) => m.items.length).map((m) => mealTypes.find((t) => t.id === m.mealType)?.label ?? m.mealType).join(', ') || 'Não registrado') + (ml ? `. Água ${ml} mL` : ''), c: 'var(--honey)', p: '/alimentacao' },
    { k: 'Treino', v: workouts?.length ? workouts.map((w) => `${mods?.find((m) => m.id === w.modalityId)?.name}${w.duration ? ` ${w.duration} min` : ''}`).join(', ') : 'Não registrado', c: 'var(--blue)', p: '/treino' },
    { k: 'Hábitos', v: hlogs?.filter((h) => h.done).map((h) => habits?.find((x) => x.id === h.habitId)?.title).filter(Boolean).join(', ') || 'Não registrado', c: 'var(--olive)', p: '/' },
    { k: 'Tarefas', v: dayTasks.length ? dayTasks.map((t) => `${t.title}${t.status === 'concluida' ? ' (concluída)' : ''}`).join('; ') : 'Nenhuma escolhida', c: 'var(--wine-ink)', p: '/' }
  ];
  return (
    <section style={{ marginTop: 18 }} data-testid="day-panel">
      <h2 className="section-title" style={{ marginBottom: 8 }}>{WEEKDAY_LONG[isoWeekday(date)]}, {longDate(date)}</h2>
      {rows.map((r) => (
        <button key={r.k} className="lib-item" onClick={() => onOpen(r.p)}>
          <span className="lib-icon" style={{ background: r.c }} aria-hidden />
          <span className="grow"><span style={{ fontWeight: 700 }}>{r.k}</span><br /><span className="small muted">{r.v}</span></span>
          <Go size={18} />
        </button>
      ))}
      <button className="btn btn-ink btn-block" style={{ marginTop: 14 }} onClick={() => onOpen('/')}>Abrir o dia completo</button>
    </section>
  );
}
