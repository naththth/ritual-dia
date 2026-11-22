import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Droplets, Dumbbell, Moon, MoonStar, Ruler, Sun, Sunrise, Utensils, ListPlus, Upload, Coffee, Pill, Smile } from 'lucide-react';
import { CoffeeSheet } from './mind';
import { WaterSheet } from './WaterSheet';
import { importFitFiles } from '../domain/fitImport';
import { useApp, toast } from '../state/store';
import { useAll, useByRange, useSettings } from '../db/hooks';
import { Sheet, Chip, afterSheetClose } from '../ui/ui';
import { toggleHabit } from '../domain/actions';
import { habitDay } from '../domain/rules';
import { TaskSheet } from './tasks';
import { create } from '../db/db';
import { shortLabel } from '../lib/dates';

/** Qual refeição registrar: todas do dia, com horário e se já tem algo anotado. */
function MealPick({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const date = useApp((s) => s.date);
  const settings = useSettings();
  const meals = useByRange('meal', date, date);
  const types = settings?.mealTypes ?? [];
  return (
    <Sheet open={open} onClose={onClose} title="Qual refeição?" sub={shortLabel(date)} testId="meal-pick">
      <div className="mp-list">
        {types.map((t) => {
          const m = meals?.find((x) => x.mealType === t.id && x.items.length);
          const time = settings?.mealTimes?.[t.id];
          return (
            <button key={t.id} className="mp-row tap" onClick={() => onPick(t.id)} data-testid={`pick-${t.id}`}>
              <span className="mp-ic"><Utensils size={18} /></span>
              <span className="grow"><b>{t.label}</b>{time && <span className="small muted"> · {time}</span>}<span className="small" style={{ display: 'block', color: m ? 'var(--blue-ink)' : 'var(--ink-3)' }}>{m ? `${m.items.length} ${m.items.length === 1 ? 'item anotado' : 'itens anotados'}` : 'nada anotado'}</span></span>
              <span className="mp-go">{m ? 'Editar' : 'Anotar'}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

export function RegisterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const date = useApp((s) => s.date);
  const settings = useSettings();
  const [sub, setSub] = useState<null | 'habit' | 'task' | 'measure'>(null);
  const [coffee, setCoffee] = useState(false);
  const [pick, setPick] = useState<null | 'meal' | 'water'>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const go = (path: string) => { onClose(); afterSheetClose(() => nav(path)); };
  // Os rituais ficam aqui para rever ou preencher fora de hora; no Hoje só aparece o que está aberto agora.
  const items = [
    { icon: <Sun size={22} />, label: 'Ritual da manhã', color: '#F3D7A6', on: () => go('/ritual/am'), testId: 'reg-ritual-am' },
    { icon: <MoonStar size={22} />, label: 'Ritual da noite', color: '#DCD0E8', on: () => go('/ritual/pm'), testId: 'reg-ritual-pm' },
    { icon: <Sunrise size={22} />, label: 'Pele da manhã', color: 'var(--rose)', on: () => go('/pele?p=am') },
    { icon: <Moon size={22} />, label: 'Pele da noite', color: 'var(--rose)', on: () => go('/pele?p=pm') },
    { icon: <Utensils size={22} />, label: 'Refeição', color: 'var(--honey)', on: () => { onClose(); afterSheetClose(() => setPick('meal')); }, testId: 'reg-meal' },
    { icon: <Droplets size={22} />, label: 'Água', color: 'var(--honey)', on: () => { onClose(); afterSheetClose(() => setPick('water')); }, testId: 'reg-water' },
    { icon: <Upload size={22} />, label: 'Treino do arquivo .FIT', color: 'var(--blue)', on: () => fileRef.current?.click() },
    { icon: <Dumbbell size={22} />, label: 'Treino sem arquivo', color: 'var(--blue)', on: () => go('/treino/registrar?novo=1') },
    { icon: <Coffee size={22} />, label: 'Café', color: 'var(--lilac)', on: () => { onClose(); afterSheetClose(() => setCoffee(true)); }, testId: 'reg-coffee' },
    { icon: <Pill size={22} />, label: 'Remédios e vitaminas', color: 'var(--lilac)', on: () => go('/mente/tomo') },
    { icon: <Smile size={22} />, label: 'Como estou', color: 'var(--lilac)', on: () => go(`/mente/checkin?p=${new Date().getHours() < 12 ? 'am' : 'pm'}&d=${date}`) },
    { icon: <ListPlus size={22} />, label: 'Nova tarefa', color: 'var(--wine-ink)', on: () => { onClose(); afterSheetClose(() => setSub('task')); } },
    { icon: <Ruler size={22} />, label: 'Medida de meta', color: 'var(--paper-2)', on: () => { onClose(); afterSheetClose(() => setSub('measure')); } }
  ];
  return (
    <>
      <Sheet open={open} onClose={onClose} title="Registrar" sub={`Em ${shortLabel(date)}`} testId="register-sheet">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {/* Ícone no topo e nome logo abaixo: nomes de uma e de duas linhas começam na mesma altura. */}
          {items.map((it) => (
            <button key={it.label} onClick={it.on} data-testid={(it as any).testId} className="tap" style={{ background: it.color, borderRadius: 18, padding: 14, minHeight: 84, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 12, textAlign: 'left', fontWeight: 700 }}>
              {it.icon}<span>{it.label}</span>
            </button>
          ))}
        </div>
        <input ref={fileRef} type="file" accept=".fit,.zip,application/octet-stream,application/zip" multiple hidden data-testid="fit-input-quick" onChange={async (e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = '';
          if (!files.length) return;
          onClose();
          const last = await importFitFiles(files, settings?.ftp);
          if (last) { useApp.getState().setDate(last); afterSheetClose(() => nav('/treino')); }
        }} />
      </Sheet>
      <HabitQuick open={sub === 'habit'} onClose={() => setSub(null)} />
      <TaskSheet open={sub === 'task'} onClose={() => setSub(null)} defaults={{ plannedDate: date }} />
      <MeasureSheet open={sub === 'measure'} onClose={() => setSub(null)} />
      <CoffeeSheet open={coffee} date={date} onClose={() => setCoffee(false)} />
      <WaterSheet open={pick === 'water'} date={date} onClose={() => setPick(null)} />
      <MealPick open={pick === 'meal'} onClose={() => setPick(null)} onPick={(id) => { setPick(null); afterSheetClose(() => nav(`/alimentacao/refeicao?m=${id}`)); }} />
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
          return <Chip key={h.id} color="olive" on={st.done} onClick={() => st.viaWorkout && !st.manual ? toast(`${h.title} já contou pelo treino.`, undefined, 'default', { important: true }) : toggleHabit(h, date, st.manual)}>{h.title}</Chip>;
        })}
      </div>
    </Sheet>
  );
}

function MeasureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const date = useApp((s) => s.date);
  const nav = useNavigate();
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
    <Sheet open={open} onClose={onClose} title="Medida de meta" sub={shortLabel(date)} footer={active.length ? <button className="btn btn-ink" onClick={save}>Salvar medida</button> : <button className="btn btn-ink" onClick={() => { onClose(); afterSheetClose(() => nav('/habitos?nova=meta')); }} data-testid="measure-new-goal">Criar uma meta</button>}>
      {active.length === 0 ? <p className="muted">Medidas servem para metas com número (peso de um exercício, km, um valor guardado). Você ainda não tem nenhuma: crie a primeira em Hábitos e metas.</p> : (
        <>
          <div className="chips">{active.map((g) => <Chip key={g.id} on={goalId === g.id} onClick={() => setGoalId(g.id)}>{g.title}</Chip>)}</div>
          <span className="label">Valor {active.find((g) => g.id === goalId)?.unit ? `(${active.find((g) => g.id === goalId)?.unit})` : ''}</span>
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Valor" />
        </>
      )}
    </Sheet>
  );
}
