// Editor de exercícios da musculação: lista suspensa com 3 variações, séries, repetições e carga.
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { StrengthExercise } from '../db/types';
import { todayKey } from '../lib/dates';
import { EXERCISE_CATALOG, OTHER_OPTION, exerciseLine, newExerciseId, variationOptions, withPlanned } from '../domain/strength';

function NumField({ label, value, onChange, step, testid }: { label: string; value?: number; onChange: (n?: number) => void; step: string; testid: string }) {
  const [txt, setTxt] = useState(value == null ? '' : String(value).replace('.', ','));
  const typed = txt.trim() === '' || Number.isNaN(Number(txt.replace(',', '.'))) ? undefined : Number(txt.replace(',', '.'));
  const shown = typed === value ? txt : value == null ? '' : String(value).replace('.', ',');
  return (
    <label className="ex-num">
      <span className="tiny">{label}</span>
      <input type="text" inputMode="decimal" data-step={step} value={shown} data-testid={testid} aria-label={label}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d,.]/g, '');
          setTxt(v);
          const n = Number(v.replace(',', '.'));
          onChange(v === '' || Number.isNaN(n) ? undefined : n);
        }} />
    </label>
  );
}

export function ExerciseEditor({ value, onChange, why = {}, compare = false }: { value: StrengthExercise[]; onChange: (v: StrengthExercise[]) => void; why?: Record<string, string>; compare?: boolean }) {
  const patch = (id: string, p: Partial<StrengthExercise>) => onChange(value.map((e) => (e.id === id ? { ...e, ...p } : e)));
  return (
    <div className="ex-list" data-testid="exercise-editor">
      {value.map((e, i) => {
        const opts = variationOptions(e, value.filter((x) => x.id !== e.id).map((x) => x.name));
        return (
          <div key={e.id} className="ex-row" data-testid="exercise-row">
            <div className="row between" style={{ gap: 8, alignItems: 'center' }}>
              <span className="tiny muted">{e.group}</span>
              <button className="icon-btn" aria-label={`Remover ${e.name}`} onClick={() => onChange(value.filter((x) => x.id !== e.id))}><Trash2 size={16} /></button>
            </div>
            <select value={e.name} aria-label={`Exercício ${i + 1}`} data-testid="exercise-select"
              onChange={(ev) => (ev.target.value === OTHER_OPTION ? patch(e.id, { round: (e.round ?? 0) + 1 }) : patch(e.id, { name: ev.target.value, loadKg: ev.target.value === e.name ? e.loadKg : undefined, loadAt: undefined }))}>
              {opts.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={OTHER_OPTION}>Trazer outras opções…</option>
            </select>
            <div className="ex-nums">
              <NumField label="Séries" value={e.sets} onChange={(n) => patch(e.id, { sets: Math.max(1, Math.round(n ?? 1)) })} step="1" testid="ex-sets" />
              <NumField label="Repetições" value={e.reps} onChange={(n) => patch(e.id, { reps: Math.max(1, Math.round(n ?? 1)) })} step="1" testid="ex-reps" />
              <NumField label="Carga (kg)" value={e.loadKg} onChange={(n) => patch(e.id, { loadKg: n, loadAt: n == null ? undefined : todayKey() })} step="0.5" testid="ex-load" />
            </div>
            {why[e.id] && <span className="tiny muted">Carga {why[e.id]}.</span>}
            {compare && e.planned && (e.planned.name !== e.name || exerciseLine(e.planned) !== exerciseLine(e)) && <span className="tiny muted">Programado: {e.planned.name !== e.name ? `${e.planned.name}, ` : ''}{exerciseLine(e.planned)}</span>}
          </div>
        );
      })}
      <label className="ex-add">
        <Plus size={16} />
        <select value="" aria-label="Adicionar exercício" data-testid="exercise-add" onChange={(ev) => {
          const g = ev.target.value;
          if (!g) return;
          const used = new Set(value.map((x) => x.name));
          const name = EXERCISE_CATALOG[g].find((n) => !used.has(n)) ?? EXERCISE_CATALOG[g][0];
          onChange([...value, { id: newExerciseId(), group: g, name, sets: 3, reps: 10 }]);
        }}>
          <option value="">Adicionar exercício</option>
          {Object.keys(EXERCISE_CATALOG).map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </label>
    </div>
  );
}

/** Resumo do que foi feito, uma linha por exercício. */
export function ExerciseSummary({ value }: { value: StrengthExercise[] }) {
  return (
    <ul className="ex-sum" data-testid="exercise-summary">
      {value.map((e) => (
        <li key={e.id}><span>{e.name}</span><span className="num">{exerciseLine(e)}</span>
          {e.planned && (e.planned.name !== e.name || exerciseLine(e.planned) !== exerciseLine(e)) && <span className="tiny muted" style={{ gridColumn: '1 / -1' }}>programado: {e.planned.name !== e.name ? `${e.planned.name}, ` : ''}{exerciseLine(e.planned)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Lançar ou corrigir o que foi feito num treino de musculação já registrado (Garmin ou à mão). */
export function LogExercises({ w, program, onSave }: { w: { exercises?: StrengthExercise[] }; program: StrengthExercise[]; onSave: (v: StrengthExercise[]) => void }) {
  const [draft, setDraft] = useState<StrengthExercise[] | null>(null);
  if (draft) {
    return (
      <div data-testid="exercise-log">
        <ExerciseEditor value={draft} onChange={setDraft} compare />
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <button className="pill-act pa-ghost" onClick={() => setDraft(null)}>Cancelar</button>
          <button className="pill-act pa-blue" data-testid="exercise-log-save" onClick={() => { onSave(draft); setDraft(null); }}>Salvar exercícios</button>
        </div>
      </div>
    );
  }
  const has = !!w.exercises?.length;
  return (
    <div style={{ marginTop: 10 }}>
      {has && <><span className="small" style={{ fontWeight: 700 }}>Exercícios</span><ExerciseSummary value={w.exercises!} /></>}
      <button className="link" style={{ marginTop: 6 }} data-testid="exercise-log-open" onClick={() => setDraft(has ? w.exercises! : withPlanned(program))}>
        {has ? 'Editar exercícios' : 'Lançar exercícios, séries e carga'}
      </button>
    </div>
  );
}
