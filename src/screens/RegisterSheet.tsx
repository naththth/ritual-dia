import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Droplets, Dumbbell, Moon, Ruler, SquareCheck, Sunrise, Utensils, ListPlus } from 'lucide-react';
import { useApp, toast } from '../state/store';
import { useAll, useByRange, useSettings } from '../db/hooks';
import { Sheet, Chip, afterSheetClose } from '../ui/ui';
import { addWater, toggleHabit } from '../domain/actions';
import { habitDay } from '../domain/rules';
import { TaskSheet } from './tasks';
import { create } from '../db/db';
import { shortLabel } from '../lib/dates';

export function RegisterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const date = useApp((s) => s.date);
  const settings = useSettings();
  const [sub, setSub] = useState<null | 'habit' | 'task' | 'measure'>(null);
  const go = (path: string) => { onClose(); afterSheetClose(() => nav(path)); };
  const items = [
    { icon: <Sunrise size={22} />, label: 'Pele da manhã', color: 'var(--rose)', on: () => go('/pele?p=am') },
    { icon: <Moon size={22} />, label: 'Pele da noite', color: 'var(--rose)', on: () => go('/pele?p=pm') },
    { icon: <Utensils size={22} />, label: 'Refeição', color: 'var(--honey)', on: () => go('/alimentacao/refeicao') },
    { icon: <Droplets size={22} />, label: `Água +${settings?.waterPresets?.[1] ?? 300} mL`, color: 'var(--honey)', on: () => { addWater(date, settings?.waterPresets?.[1] ?? 300); } },
    { icon: <Dumbbell size={22} />, label: 'Treino', color: 'var(--blue)', on: () => go('/treino/registrar?novo=1') },
    { icon: <SquareCheck size={22} />, label: 'Hábito', color: 'var(--olive)', on: () => setSub('habit') },
    { icon: <ListPlus size={22} />, label: 'Nova tarefa', color: 'var(--wine-ink)', on: () => setSub('task') },
    { icon: <Ruler size={22} />, label: 'Medida de meta', color: 'var(--paper-2)', on: () => setSub('measure') }
  ];
  return (
    <>
      <Sheet open={open && !sub} onClose={onClose} title="Registrar" sub={`Em ${shortLabel(date)}`} testId="register-sheet">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {items.map((it) => (
            <button key={it.label} onClick={it.on} className="tap" style={{ background: it.color, borderRadius: 18, padding: 14, minHeight: 84, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontWeight: 700 }}>
              {it.icon}<span>{it.label}</span>
            </button>
          ))}
        </div>
      </Sheet>
      <HabitQuick open={open && sub === 'habit'} onClose={() => { setSub(null); onClose(); }} />
      <TaskSheet open={open && sub === 'task'} onClose={() => { setSub(null); onClose(); }} defaults={{ plannedDate: date }} />
      <MeasureSheet open={open && sub === 'measure'} onClose={() => { setSub(null); onClose(); }} />
    </>
  );
}

function HabitQuick({ open, onClose }: { open: boolean; onClose: () => void }) {
  const date = useApp((s) => s.date);
  const habits = useAll('habit');
  const logs = useByRange('hlog', date, date);
  const workouts = useByRange('workout', date, date);
  return (
    <Sheet open={open} onClose={onClose} title="Hábitos" sub={shortLabel(date)} footer={<button className="btn btn-ink" onClick={onClose}>Pronto</button>}>
      <div className="chips">
        {(habits ?? []).filter((h) => !h.archived).map((h) => {
          const st = habitDay(h, date, logs ?? [], workouts ?? []);
          return <Chip key={h.id} color="olive" on={st.done} onClick={() => st.viaWorkout && !st.manual ? toast(`${h.title} já contou pelo treino.`) : toggleHabit(h, date, st.manual)}>{h.title}</Chip>;
        })}
      </div>
    </Sheet>
  );
}

function MeasureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const date = useApp((s) => s.date);
  const goals = useAll('goal');
  const [goalId, setGoalId] = useState('');
  const [value, setValue] = useState('');
  const active = (goals ?? []).filter((g) => g.status === 'ativa' && (g.type === 'quantitativa' || g.type === 'financeira'));
  const save = async () => {
    const n = Number(value.replace(',', '.'));
    if (!goalId || !value || Number.isNaN(n)) { toast('Escolha a meta e informe o valor.', undefined, 'error'); return; }
    await create('gentry', { goalId, date, value: n });
    toast('Medida registrada');
    setValue('');
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Medida de meta" sub={shortLabel(date)} footer={<button className="btn btn-ink" onClick={save}>Salvar medida</button>}>
      {active.length === 0 ? <p className="muted">Nenhuma meta numérica ativa. Crie uma na Biblioteca, em Metas.</p> : (
        <>
          <div className="chips">{active.map((g) => <Chip key={g.id} on={goalId === g.id} onClick={() => setGoalId(g.id)}>{g.title}</Chip>)}</div>
          <span className="label">Valor {active.find((g) => g.id === goalId)?.unit ? `(${active.find((g) => g.id === goalId)?.unit})` : ''}</span>
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Valor" />
        </>
      )}
    </Sheet>
  );
}
