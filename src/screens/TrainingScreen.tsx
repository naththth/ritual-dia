import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check as CheckIcon, Plus, Trash2, Repeat } from 'lucide-react';
import { useApp, toast } from '../state/store';
import { useAll, useByDate, useSettings } from '../db/hooks';
import { PageHead, useBack } from './common';
import { Chip, Seg, Stepper, ArtShoe, Empty } from '../ui/ui';
import { saveWorkout, workoutFromTemplate, deleteRecord, skipPlanned } from '../domain/actions';
import { planFor, plannedTraining } from '../domain/rules';
import { MUSCLE_GROUPS, REST_TYPES } from '../domain/defaults';
import { create, db } from '../db/db';
import type { Intensity, Workout } from '../db/types';
import { addDays } from '../lib/dates';
import { StepsView } from './ai-ui';

type Draft = Partial<Workout>;

export function TrainingScreen() {
  const date = useApp((s) => s.date);
  const [params, setParams] = useSearchParams();
  const workouts = useByDate('workout', date);
  const skips = useByDate('skip', date);
  const extras = useByDate('extra', date);
  const mods = useAll('modality');
  const tmpls = useAll('wtemplate');
  const plans = useAll('plan');
  const settings = useSettings();
  const last = useLiveQuery(async () => {
    const rows = await db.records.where('[kind+date]').between(['workout', addDays(date, -60)], ['workout', addDays(date, -1)], true, true).toArray();
    return (rows.filter((r) => !r.deleted) as Workout[]).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  }, [date]);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (params.get('novo') && tmpls) {
      const from = tmpls.find((t) => t.id === params.get('de'));
      setDraft(from ? { modalityId: from.modalityId, duration: from.duration, intensity: from.intensity, muscles: from.muscles, distanceKm: from.distanceKm } : { duration: 45, intensity: 'moderada' });
      setParams({}, { replace: true });
    }
  }, [params, tmpls]);

  const planned = plannedTraining(planFor(plans ?? [], 'training', date), date, extras)
    .map((id) => tmpls?.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t);
  const modName = (id?: string) => mods?.find((m) => m.id === id)?.name ?? 'Treino';
  const mod = mods?.find((m) => m.id === draft?.modalityId);
  const set = (p: Draft) => setDraft((d) => ({ ...(d ?? {}), ...p }));

  const back = useBack();
  const save = async () => {
    if (!draft?.modalityId) { toast('Escolha a modalidade.', undefined, 'error'); return; }
    await saveWorkout({ ...(draft as Workout), date });
    setDraft(null);
    back();
  };

  return (
    <div className="screen no-nav" data-testid="training-screen">
      <PageHead title="Treino" />

      {workouts && workouts.length > 0 && (
        <section className="block b-blue">
          <div className="bh"><h2 style={{ fontSize: 19 }}>Feito neste dia</h2></div>
          {workouts.map((w) => (
            <div key={w.id} className="workout-row">
              <CheckIcon size={20} strokeWidth={3} />
              <button className="grow tap" onClick={() => setDraft({ ...w })}>
                <div className="t">{modName(w.modalityId)}</div>
                <div className="small">{[w.duration && `${w.duration} min`, w.intensity, w.distanceKm && `${w.distanceKm} km`, w.muscles?.join(', '), w.restType].filter(Boolean).join(', ')}</div>
              </button>
              <button className="icon-btn" aria-label="Excluir treino" onClick={() => deleteRecord(w.id, 'Treino excluído')}><Trash2 size={18} /></button>
            </div>
          ))}
        </section>
      )}

      {!draft && (
        <>
          {planned.length > 0 && (
            <>
              <h2 className="section-title" style={{ margin: '18px 0 10px' }}>Do seu plano</h2>
              {planned.map((t) => {
                const done = workouts?.some((w) => w.templateId === t.id);
                const skipped = skips?.some((s) => s.domain === 'training' && s.ref === t.id);
                return (
                  <div key={t.id} className="row-item">
                    <div className="grow"><div className="t">{t.name}</div><div className="s">{modName(t.modalityId)}, {t.duration} min, {t.intensity}</div>{t.steps?.length ? <StepsView steps={t.steps} /> : null}</div>
                    {done ? <span className="small" style={{ fontWeight: 700 }}>Feito</span> : skipped ? <span className="small muted">Não hoje</span> : (
                      <>
                        <button className="btn btn-ink btn-sm" onClick={() => workoutFromTemplate(t, date, true)}>Feito</button>
                        <button className="btn btn-soft btn-sm" onClick={() => skipPlanned(date, 'training', t.id, 'Treino marcado como não hoje')}>Não hoje</button>
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}
          <h2 className="section-title" style={{ margin: '22px 0 10px' }}>Registrar com um toque</h2>
          <div className="chips">
            {(tmpls ?? []).filter((t) => !t.archived).map((t) => <Chip key={t.id} color="blue" onClick={() => workoutFromTemplate(t, date, false)}>{t.name}</Chip>)}
            {last && <Chip onClick={() => setDraft({ modalityId: last.modalityId, duration: last.duration, intensity: last.intensity, distanceKm: last.distanceKm, muscles: last.muscles })}><Repeat size={15} />Repetir último ({modName(last.modalityId)})</Chip>}
          </div>
          {(tmpls ?? []).length === 0 && !last && <Empty art={<ArtShoe />} text="Cadastre treinos-modelo para registrar com um toque." />}
          <button className="btn btn-ink btn-block" style={{ marginTop: 18 }} onClick={() => setDraft({ duration: 45, intensity: 'moderada' })} data-testid="workout-new"><Plus size={18} />Novo registro</button>
          <div className="row wrap" style={{ marginTop: 6, gap: 16 }}>
            <a className="link" href="#/treino/plano">Plano de treino</a>
            <a className="link" href="#/treino/sessoes">Sessões de treino</a>
          </div>
        </>
      )}

      {draft && (
        <section style={{ marginTop: 10 }} data-testid="workout-form">
          <h2 className="section-title">{draft.id ? 'Editar treino' : 'Novo treino'}</h2>
          <span className="label">Modalidade</span>
          <div className="chips">
            {(mods ?? []).filter((m) => !m.archived).sort((a, b) => a.order - b.order).map((m) => <Chip key={m.id} color="blue" on={draft.modalityId === m.id} onClick={() => set({ modalityId: m.id })}>{m.name}</Chip>)}
          </div>
          {mod?.extra === 'rest' ? (
            <>
              <span className="label">Tipo de descanso</span>
              <div className="chips">{REST_TYPES.map((r) => <Chip key={r} color="blue" on={draft.restType === r} onClick={() => set({ restType: r })}>{r}</Chip>)}</div>
            </>
          ) : (
            <>
              <span className="label">Duração</span>
              <div className="chips">{(settings?.durations ?? [15, 20, 30, 45, 60, 90, 120]).map((m) => <Chip key={m} color="blue" on={draft.duration === m} onClick={() => set({ duration: m })}>{m} min</Chip>)}</div>
              <span className="label">Intensidade</span>
              <Seg<Intensity> value={draft.intensity ?? 'moderada'} onChange={(v) => set({ intensity: v })} options={[{ id: 'leve', label: 'Leve' }, { id: 'moderada', label: 'Moderada' }, { id: 'intensa', label: 'Intensa' }]} />
              {mod?.extra === 'distance' && (
                <>
                  <span className="label">Distância <span className="muted small">(opcional)</span></span>
                  <Stepper value={draft.distanceKm ?? 0} onChange={(n) => set({ distanceKm: n || undefined })} step={mod.id === 'mod:natacao' ? 0.25 : 1} suffix=" km" label="distância" />
                </>
              )}
              {mod?.extra === 'muscle' && (
                <>
                  <span className="label">Grupo muscular <span className="muted small">(opcional)</span></span>
                  <div className="chips">{MUSCLE_GROUPS.map((g) => <Chip key={g} color="blue" on={draft.muscles?.includes(g)} onClick={() => set({ muscles: draft.muscles?.includes(g) ? draft.muscles.filter((x) => x !== g) : [...(draft.muscles ?? []), g] })}>{g}</Chip>)}</div>
                </>
              )}
              {mod?.extra === 'combo' && (
                <>
                  <span className="label">Combinação</span>
                  <div className="chips">{['Natação', 'Ciclismo', 'Corrida'].map((g) => <Chip key={g} color="blue" on={draft.combo?.includes(g)} onClick={() => set({ combo: draft.combo?.includes(g) ? draft.combo.filter((x) => x !== g) : [...(draft.combo ?? []), g] })}>{g}</Chip>)}</div>
                </>
              )}
            </>
          )}
          <div className="row" style={{ marginTop: 22, gap: 10 }}>
            <button className="btn btn-soft" onClick={() => setDraft(null)}>Cancelar</button>
            <button className="btn btn-ink grow" onClick={save} data-testid="workout-save">Salvar treino</button>
          </div>
          {!draft.id && draft.modalityId && mod?.extra !== 'rest' && (
            <button className="link" onClick={async () => {
              await create('wtemplate', { name: `${modName(draft.modalityId)} ${draft.duration ?? ''} min`.trim(), modalityId: draft.modalityId!, duration: draft.duration ?? 45, intensity: draft.intensity ?? 'moderada', muscles: draft.muscles, distanceKm: draft.distanceKm });
              toast('Modelo de treino salvo');
            }}>Salvar também como modelo</button>
          )}
        </section>
      )}
    </div>
  );
}
