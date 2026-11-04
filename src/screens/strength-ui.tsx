// Editor de exercícios da musculação: lista suspensa com 3 variações, séries, repetições e carga.
import { useState } from 'react';
import { NumberInput } from '../ui/ui';
import { Plus, Trash2 } from 'lucide-react';
import type { StrengthExercise } from '../db/types';
import { todayKey } from '../lib/dates';
import { DEFAULT_SETS, defaultReps, EXERCISE_CATALOG, OTHER_OPTION, exerciseLine, exerciseVolume, loadsPerSet, newExerciseId, repsPerSet, resizeSets, variationOptions, withPlanned, withRegressive, withSetLoad, withSetReps } from '../domain/strength';

/** Número da musculação. Usa o campo comum do app: dá para apagar e digitar outro número sem ficar preso no 1. */
function NumField({ label, value, onChange, testid, compact, min, max, int, optional, lazy }: { label: string; value?: number; onChange: (n?: number) => void; testid: string; compact?: boolean; min?: number; max?: number; int?: boolean; optional?: boolean; lazy?: boolean }) {
  return (
    <label className={compact ? 'ex-num ex-num-c' : 'ex-num'}>
      <span className="tiny">{label}</span>
      <NumberInput value={value} onChange={onChange} label={label} testId={testid} min={min} max={max} int={int} optional={optional} lazy={lazy} />
    </label>
  );
}

export function ExerciseEditor({ value, onChange, why = {}, compare = false, firstGroup }: { value: StrengthExercise[]; onChange: (v: StrengthExercise[]) => void; why?: Record<string, string>; compare?: boolean; firstGroup?: string }) {
  const groups = Object.keys(EXERCISE_CATALOG).sort((a, b) => Number(b === firstGroup) - Number(a === firstGroup));
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
              onChange={(ev) => (ev.target.value === OTHER_OPTION ? patch(e.id, { round: (e.round ?? 0) + 1 }) : patch(e.id, { name: ev.target.value, loadKg: ev.target.value === e.name ? e.loadKg : undefined, setLoads: ev.target.value === e.name ? e.setLoads : undefined, loadAt: undefined }))}>
              {opts.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={OTHER_OPTION}>Trazer outras opções…</option>
            </select>
            {(() => {
              const regressive = !!e.setReps?.length;
              const cols = { gridTemplateColumns: `repeat(${Math.min(e.sets, 5)}, 1fr)` };
              return <>
                <div className={regressive ? 'ex-nums ex-nums-1' : 'ex-nums ex-nums-2'}>
                  <NumField label="Séries" value={e.sets} min={1} max={10} int lazy onChange={(n) => { if (n != null) patch(e.id, resizeSets(e, n)); }} testid="ex-sets" />
                  {!regressive && <NumField label="Repetições" value={e.reps} min={1} max={100} int onChange={(n) => { if (n != null) patch(e.id, { reps: n }); }} testid="ex-reps" />}
                </div>
                <label className="ex-check">
                  <input type="checkbox" checked={regressive} data-testid="ex-regressive" onChange={(ev) => patch(e.id, withRegressive(e, ev.target.checked))} />
                  <span className="small">Séries regressivas <span className="muted">(repetições diferentes em cada série)</span></span>
                </label>
                {regressive && (
                  <div className="ex-loads">
                    <span className="tiny">Repetições por série</span>
                    <div className="ex-load-row" style={cols}>
                      {repsPerSet(e).map((r, si) => (
                        <NumField key={`${si}-${e.sets}`} compact label={`${si + 1}ª`} value={r} min={1} max={100} int testid="ex-reps-set"
                          onChange={(n) => { if (n != null) patch(e.id, withSetReps(e, si, n)); }} />
                      ))}
                    </div>
                  </div>
                )}
                <div className="ex-loads">
                  <span className="tiny">Carga por série (kg)</span>
                  <div className="ex-load-row" style={cols}>
                    {loadsPerSet(e).map((kg, si) => (
                      <NumField key={si} compact label={`${si + 1}ª`} value={e.setLoads?.length ? e.setLoads[si] ?? undefined : kg} min={0} max={500} optional testid={si === 0 ? 'ex-load' : 'ex-load-set'}
                        onChange={(n) => { const l = withSetLoad(e, si, n); patch(e.id, { ...l, loadAt: l.loadKg == null ? undefined : todayKey() }); }} />
                    ))}
                  </div>
                  {(() => { const v = exerciseVolume(e); return v ? <span className="tiny muted">Volume: {Math.round(v).toLocaleString('pt-BR')} kg</span> : null; })()}
                </div>
              </>;
            })()}
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
          onChange([...value, { id: newExerciseId(), group: g, name, sets: DEFAULT_SETS[g] ?? 3, reps: defaultReps(g) }]);
        }}>
          <option value="">Adicionar exercício</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
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
export function LogExercises({ w, program, onSave, firstGroup, hint }: { w: { exercises?: StrengthExercise[] }; program: StrengthExercise[]; onSave: (v: StrengthExercise[]) => void; firstGroup?: string; hint?: string }) {
  const [draft, setDraft] = useState<StrengthExercise[] | null>(null);
  if (draft) {
    return (
      <div data-testid="exercise-log" style={{ marginTop: 10 }}>
        {hint && !w.exercises?.length && draft.length > 0 && <p className="tiny muted" style={{ margin: '0 0 6px' }}>{hint}</p>}
        <ExerciseEditor value={draft} onChange={setDraft} compare={!firstGroup} firstGroup={firstGroup} />
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
      <button className="link" style={{ marginTop: 6 }} data-testid="exercise-log-open" onClick={() => setDraft(has ? w.exercises! : firstGroup ? program : withPlanned(program))}>
        {has ? 'Editar exercícios' : firstGroup === 'LPO' ? 'Lançar levantamentos, séries e carga' : 'Lançar exercícios, séries e carga'}
      </button>
    </div>
  );
}
