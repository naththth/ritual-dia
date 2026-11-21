import { useEffect, useRef, useState } from 'react';
import { metricCells, showsPowerZones, weekDistances, shortLine } from '../domain/workoutMetrics';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Sparkles, Trash2, ChevronRight, ChevronDown, Check as CheckIcon, Activity } from 'lucide-react';
import type { ReactNode } from 'react';
import { Fold } from '../ui/ui';
import { TopBar , DayStrip } from './common';
import { AreaNav } from './areas';
import { useAll, useByRange, useSettings } from '../db/hooks';
import { useApp, toast } from '../state/store';
import { planFor, slotCounts, trainingDay } from '../domain/rules';
import { addDays, isoWeekday, shortLabel, todayKey, weekStart, WEEKDAY_LETTER, WEEKDAY_SHORT, dayNum, type DateKey } from '../lib/dates';
import { workoutFromTemplate, skipPlanned, skipTraining, deleteRecord, savePlan, undoMove } from '../domain/actions';
import { StepsView } from './ai-ui';
import { POWER_ZONES } from '../domain/fit';
import { importFitFiles } from '../domain/fitImport';
import { trainingLoad, workoutLoad, formLabel } from '../domain/load';
import { effectiveSleep, effectiveHrv, wellnessForAI } from '../domain/wellness';
import { db, update } from '../db/db';
import { MicButton, appendText } from '../ui/Dictation';
import type { StrengthExercise, Workout, WorkoutTemplate } from '../db/types';
import { programFor, lpoProgram, lpoFromText, LPO_GROUP, defaultExercises, reconcileWithNote, noteWithExercises, parseNoteLine, loadText, topLoad, loadsPerSet, exerciseVolume, repsPerSet, repsText } from '../domain/strength';
import { ExerciseEditor, LogExercises } from './strength-ui';
import { Arc } from '../ui/art';
import { ActivityArt, activityKind } from '../ui/activity';
import { SessionHero, FeelCard, SessionExercises } from './session-ui';
import { aiAvailable, askAI, applyTrainingResult } from '../domain/ai';
import { fmt } from '../domain/nutrition';
import { CoachButton } from './coach';
import { WeekPlanCard } from './weekplan';
import { aiWorkoutFeedback, feedbackBasis } from '../domain/wfeedback';
import { syncIntervalsNow } from '../sync/services';
import { useSync } from '../sync/sync';

// Ao abrir a aba (ou voltar ao app nela), busca no intervals o que acabou de chegar do MyWhoosh e do Garmin.
let lastAutoSync = 0;
function useIntervalsOnOpen(connected: boolean | undefined) {
  const [syncing, setSyncing] = useState(false);
  const session = useSync((s) => s.session);
  useEffect(() => {
    if (!connected || !session) return;
    const run = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - lastAutoSync < 2 * 60_000) return;
      lastAutoSync = Date.now();
      setSyncing(true);
      syncIntervalsNow(3).catch(() => { lastAutoSync = 0; }).finally(() => setSyncing(false));
    };
    run();
    document.addEventListener('visibilitychange', run);
    return () => document.removeEventListener('visibilitychange', run);
  }, [connected, !!session]);
  return syncing;
}

export function TrainingTab() {
  const { date, setDate } = useApp();
  const nav = useNavigate();
  const settings = useSettings();
  const ws = weekStart(date);
  const we = addDays(ws, 6);
  const workouts = useByRange('workout', ws, we);
  const skips = useByRange('skip', ws, we);
  const extras = useByRange('extra', ws, we);
  const history = useByRange('workout', addDays(todayKey(), -120), todayKey());
  const wellness = useByRange('wellness', ws, we);
  const plans = useAll('plan');
  const tmpls = useAll('wtemplate');
  const mods = useAll('modality');
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ analise: string; proposta?: any } | null>(null);
  const syncing = useIntervalsOnOpen(settings?.intervals?.connected);
  // Itens do dia abertos. A chave do planejado é o modelo; o feito herda a do modelo, então abrir e marcar "Feito" mantém aberto.
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set());
  if (!workouts || !plans || !tmpls || !mods || !skips) return <div className="screen"><TopBar /></div>;

  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const tplOf = (id: string) => tmpls.find((t) => t.id === id);
  const slotsOf = (d: DateKey) => trainingDay(planFor(plans, 'training', d), d, extras, skips, workouts, tmpls);
  // Planejado que vale: o que foi trocado por outro treino sai da conta e do dia.
  const plannedOf = (d: DateKey) => slotsOf(d).filter((s) => s.status !== 'trocado').map((s) => tplOf(s.id)).filter((t): t is WorkoutTemplate => !!t);
  const doneOf = (d: DateKey) => workouts.filter((w) => w.date === d);
  const modName = (id: string) => mods.find((m) => m.id === id)?.name ?? 'Treino';
  const isMuscle = (id: string) => mods.find((m) => m.id === id)?.extra === 'muscle';
  // LPO também tem barra e carga: o card da aula feita ganha o lançamento de levantamentos.
  const isLpo = (id: string) => id === 'mod:lpo' || /\bLPO\b|levantamento ol[íi]mpico/i.test(modName(id));

  const weekPlanned = days.reduce((a, d) => a + slotsOf(d).filter(slotCounts).length, 0);
  const weekDone = workouts.length;
  const weekMin = workouts.reduce((a, w) => a + (w.duration ?? 0), 0);
  const weekTss = workouts.reduce((a, w) => a + (w.metrics?.tss ?? 0), 0);
  const weekKcal = workouts.reduce((a, w) => a + (w.metrics?.kcal ?? 0), 0);
  // Distância por esporte: com um só, ocupa o card; com dois ou mais, ganha uma faixa própria e o card mostra o TSS.
  const weekDist = weekDistances(workouts);
  const oneDist = weekDist.length === 1 ? weekDist[0] : undefined;

  const importFit = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try { const last = await importFitFiles(files, settings?.ftp); if (last) setDate(last); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const runReview = async () => {
    setBusy(true);
    try {
      const recent = (await db.records.where('[kind+date]').between(['workout', addDays(todayKey(), -28)], ['workout', todayKey()], true, true).toArray())
        .filter((r: any) => !r.deleted) as Workout[];
      const r = await askAI<any>('training_review', {
        ftp: settings?.ftp ?? null,
        observacoes_dela: settings?.aiContext ?? '',
        plano_atual: days.map((d) => ({ dia: ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'][isoWeekday(d)], treinos: plannedOf(d).map((t) => ({ nome: t.name, minutos: t.duration, intensidade: t.intensity, blocos: t.steps, horario: t.time })) })),
        carga_atual: (() => { const l = trainingLoad(history ?? [], addDays(todayKey(), -120), todayKey()).slice(-1)[0]; return l ? { fitness_ctl: Math.round(l.ctl), fadiga_atl: Math.round(l.atl), forma_tsb: Math.round(l.tsb) } : null; })(),
        sono_e_recuperacao_28_dias: (await db.records.where('[kind+date]').between(['wellness', addDays(todayKey(), -28)], ['wellness', todayKey()], true, true).toArray()).filter((r: any) => !r.deleted).map((w: any) => wellnessForAI(w)),
        diario_14_dias: (await db.records.where('[kind+date]').between(['journal', addDays(todayKey(), -14)], ['journal', todayKey()], true, true).toArray()).filter((r: any) => !r.deleted).map((j: any) => ({ data: j.date, energia: j.energy, sono: j.sleep, estresse: j.stress })),
        treinos_feitos_28_dias: recent.map((w) => ({ data: w.date, modalidade: modName(w.modalityId), minutos: w.duration, do_plano: !!w.fromPlan, metricas: w.metrics ? { ...w.metrics, laps: undefined } : undefined, esforco_percebido: w.rpe, como_foi: w.feeling, exercicios: w.exercises?.map((e) => ({ exercicio: e.name, series: e.sets, repeticoes: e.reps, repeticoes_por_serie: repsPerSet(e), carga_kg_serie_mais_pesada: topLoad(e), carga_kg_por_serie: loadsPerSet(e), volume_kg: exerciseVolume(e), programado: e.planned })) }))
      });
      setReview({ analise: String(r.analise ?? ''), proposta: r.templates?.length ? r : undefined });
    } catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(false); }
  };

  const daySlots = slotsOf(date);
  const dayPlanned = plannedOf(date);
  const dayDone = doneOf(date);
  const pending = daySlots.filter((s) => s.status === 'pendente').map((s) => tplOf(s.id)).filter((t): t is WorkoutTemplate => !!t);
  const outSlots = daySlots.filter((s) => s.status === 'trocado' || s.status === 'pulado').map((slot) => ({ slot, t: tplOf(slot.id) })).filter((x): x is { slot: typeof x.slot; t: WorkoutTemplate } => !!x.t);
  const toggle = (k: string) => setOpenSet((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const nameOfSub = (s: { byTemplate?: string; byWorkout?: string }) => {
    if (s.byTemplate) return tplOf(s.byTemplate)?.name;
    const w = dayDone.find((x) => x.id === s.byWorkout);
    return w ? modName(w.modalityId).toLowerCase() : undefined;
  };

  return (
    <div className="screen" data-testid="training-tab">
      <TopBar />
      <div className="row between" style={{ alignItems: 'center' }}>
        <h1 className="page-title page-big">Treino</h1>
        <CoachButton />
      </div>
      <AreaNav area="treino" />
      <div style={{ height: 12 }} />

      <DayStrip
        aria={(d) => `${shortLabel(d)}: ${doneOf(d).length ? 'feito' : plannedOf(d).map((t) => t.name).join(', ') || 'sem treino'}`}
        mark={(d, sel) => { const dn = doneOf(d).length, p = plannedOf(d).length; return dn ? <CheckIcon size={12} strokeWidth={3.4} style={{ color: sel ? 'var(--paper)' : 'var(--blue-ink)' }} /> : p ? <i style={{ background: sel ? 'var(--paper)' : d < todayKey() ? 'var(--wine)' : 'var(--ink-3)' }} /> : null; }}
        note={syncing ? <span className="tiny muted" data-testid="intervals-syncing">Buscando treinos novos…</span> : undefined}
      />

      <div className="mini-stats" data-testid="training-week">
        <div className="ms t-teal"><span className="v num">{weekDone}{weekPlanned ? <small>/{weekPlanned}</small> : null}</span><span className="l">treinos</span></div>
        <div className="ms"><span className="v num">{Math.floor(weekMin / 60)}h{String(weekMin % 60).padStart(2, '0')}</span><span className="l">de treino</span></div>
        {oneDist ? <div className="ms"><span className="v num">{oneDist.value}</span><span className="l">{oneDist.label}</span></div> : <div className="ms"><span className="v num">{weekTss ? Math.round(weekTss) : '–'}</span><span className="l">TSS</span></div>}
        <div className="ms"><span className="v num">{weekKcal ? fmt(weekKcal) : '–'}</span><span className="l">kcal</span></div>
      </div>
      {weekDist.length > 1 && (
        <div className="mini-stats dist" style={{ gridTemplateColumns: `repeat(${weekDist.length}, 1fr)` }} data-testid="training-week-dist">
          {weekDist.map((d) => <div key={d.fam} className="ms"><span className="v num">{d.value}</span><span className="l">{d.label}</span></div>)}
        </div>
      )}

      <WeekPlanCard />
      <section className="block b-blue tday-block" style={{ marginTop: 12 }} data-testid="training-day">
        <div className="bh row between" style={{ alignItems: 'baseline', gap: 8 }}>
          <h2 style={{ fontSize: 20 }}>{date === todayKey() ? 'Hoje' : shortLabel(date)}</h2>
          {(dayDone.length > 0 || pending.length > 0) && <span className="small" data-testid="training-day-count">{[dayDone.length ? `${dayDone.length} ${dayDone.length === 1 ? 'feito' : 'feitos'}` : '', pending.length ? `${pending.length} ${pending.length === 1 ? 'planejado' : 'planejados'}` : ''].filter(Boolean).join(', ')}</span>}
        </div>

        <div className="tday-list">
          {/* 1) O que foi feito vem primeiro, como registro do dia. Fechado mostra o essencial; aberto, tudo. */}
          {dayDone.map((w) => {
            const tpl = isMuscle(w.modalityId) ? (dayPlanned.find((t) => t.id === w.templateId) ?? dayPlanned.find((t) => t.modalityId === w.modalityId)) : undefined;
            const strength = isMuscle(w.modalityId) ? { program: tpl ? programFor(tpl, history ?? [], w.date).exercises : [] }
              : isLpo(w.modalityId) ? { program: lpoProgram(w, history ?? []), firstGroup: LPO_GROUP, hint: lpoFromText(w.feeling).length ? 'Comecei pelo que você escreveu no comentário. Confira séries e repetições.' : undefined } : undefined;
            const k = w.templateId ?? w.id;
            return <WorkoutCard key={w.id} w={w} name={modName(w.modalityId)} ftp={settings?.ftp} strength={strength} history={history ?? []} open={openSet.has(k)} onToggle={() => toggle(k)} />;
          })}

          {/* 2) O planejado que ainda vale. */}
          {pending.map((t) => {
            const swapped = dayDone.find((w) => !daySlots.some((x) => x.workoutId === w.id));
            return (
              <TItem key={t.id} kind="planned" testId="planned-item" open={openSet.has(t.id)} onToggle={() => toggle(t.id)}
                title={t.name} time={t.time}
                cover={<ActivityArt kind={activityKind(t.name, modName(t.modalityId))} exercises={isMuscle(t.modalityId) ? programFor(t, history ?? [], date).exercises : undefined} />}
                chips={<><span className="chip">{modName(t.modalityId)}</span><span className="chip">{t.duration} min</span><span className={`chip int-${t.intensity}`}>{t.intensity}</span></>}
                preview={<>
                  {swapped && (
                    <div className="swap-ask" data-testid="swap-ask">
                      <span className="small">Você fez {modName(swapped.modalityId).toLowerCase()} no lugar de {t.name.toLowerCase()}?</span>
                      <button className="pill-act pa-blue" onClick={() => skipPlanned(date, 'training', t.id, `${t.name} trocado por ${modName(swapped.modalityId).toLowerCase()}`)} data-testid="swap-yes">Sim, troquei</button>
                    </div>
                  )}
                  {(t.steps ?? t.runSteps)?.length && !openSet.has(t.id) ? <StepsView steps={(t.steps ?? t.runSteps)!} bars /> : null}
                </>}>
                {t.note && !isMuscle(t.modalityId) ? <div className="small wt-note">{t.note}</div> : null}
                {t.muscles?.length ? <div className="small" style={{ marginTop: 6 }}>Foco: {t.muscles.join(', ').toLowerCase()}</div> : null}
                {isMuscle(t.modalityId) && <PlannedStrength t={t} history={history ?? []} date={date} onDone={(exs) => workoutFromTemplate(t, date, true, exs)} />}
                {(t.steps ?? t.runSteps)?.length ? <StepsView steps={(t.steps ?? t.runSteps)!} /> : null}
                <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
                  {!isMuscle(t.modalityId) && <button className="pill-act pa-blue" data-testid="train-done" onClick={() => workoutFromTemplate(t, date, true)}>Feito</button>}
                  <button className="pill-act pa-ghost" onClick={() => fileRef.current?.click()}>Importar o arquivo</button>
                  <button className="pill-act pa-ghost" data-testid="train-skip" onClick={() => skipTraining(date, t)}>Hoje não</button>
                </div>
              </TItem>
            );
          })}
        </div>

        {/* 3) O que saiu do dia (trocado, mudou de dia ou não feito): uma linha cada, com desfazer. */}
        {outSlots.length > 0 && (
          <div className="tday-out" data-testid="training-out">
            {outSlots.map(({ slot, t }) => {
              const by = slot.status === 'trocado' ? nameOfSub(slot) : undefined;
              const what = slot.status === 'pulado' ? 'não realizado'
                : slot.movedTo ? `foi para ${WEEKDAY_SHORT[isoWeekday(slot.movedTo)]} ${slot.movedTo.slice(8, 10)}/${slot.movedTo.slice(5, 7)}`
                : `trocado${by ? ` por ${by}` : ''}`;
              return (
                <div key={t.id} className="tday-out-row" data-testid={slot.status === 'pulado' ? 'planned-skipped' : 'planned-replaced'}>
                  <span className="small">{slot.status === 'pulado' ? <s>{t.name}</s> : <span className="muted">{t.name}</span>}<span className="muted"> · {what}</span></span>
                  <button className="link" onClick={() => slot.movedTo ? undoMove(date, t.id, slot.movedTo) : deleteRecord(`skip:${date}:training:${t.id}`, 'Planejado de volta')}>Desfazer</button>
                </div>
              );
            })}
          </div>
        )}
        {!pending.length && !dayDone.length && !outSlots.length && <p className="small" style={{ margin: 0 }}>Sem treino planejado. Não registrado.</p>}
      </section>

      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn btn-ink grow" onClick={() => fileRef.current?.click()} disabled={busy} data-testid="fit-import"><Upload size={18} />{busy ? 'Lendo…' : 'Importar .FIT'}</button>
        <button className="btn btn-soft" onClick={() => nav('/treino/registrar')}><Plus size={18} />Registrar</button>
      </div>
      <input ref={fileRef} type="file" accept=".fit,.zip,application/octet-stream,application/zip" multiple hidden onChange={(e) => importFit(e.target.files)} data-testid="fit-input" />
      <details className="hint-more">
        <summary>Como exportar o arquivo do relógio</summary>
        <p className="tiny muted">Pode escolher vários arquivos de uma vez (.fit ou .zip). Garmin: no site connect.garmin.com, abra a atividade, menu ⚙, Exportar original. MyWhoosh: na atividade, exportar ou baixar o .FIT.</p>
      </details>

      {(() => {
        const ahead = Array.from({ length: 7 }, (_, i) => addDays(date, i + 1))
          .flatMap((d) => plannedOf(d).filter((t) => !doneOf(d).some((w) => w.templateId === t.id || w.modalityId === t.modalityId) && !skips.some((x) => x.date === d && x.domain === 'training' && x.ref === t.id)).map((t) => ({ d, t })))
          .slice(0, 4);
        if (!ahead.length) return null;
        return (
          <section className="upcoming" data-testid="training-upcoming">
            <h2 className="sec-h">Próximos treinos</h2>
            {(() => {
              const { d, t } = ahead[0];
              return (
                <button className="up-hero" onClick={() => setDate(d)} data-testid="training-next">
                  <ActivityArt kind={activityKind(t.name, modName(t.modalityId))} exercises={isMuscle(t.modalityId) ? programFor(t, history ?? [], d).exercises : undefined} />
                  <span className="uh-in">
                    <span className="uh-k">{d === addDays(todayKey(), 1) ? 'Amanhã' : `${WEEKDAY_SHORT[isoWeekday(d)]} ${dayNum(d)}`}{t.time ? ` · ${t.time}` : ''}</span>
                    <b className="uh-t">{t.name}</b>
                    <span className="uh-chips"><span className="chip">{modName(t.modalityId)}</span><span className="chip">{t.duration} min</span><span className={`chip int-${t.intensity}`}>{t.intensity}</span></span>
                  </span>
                </button>
              );
            })()}
            {ahead.slice(1).map(({ d, t }) => (
              <button key={`${d}-${t.id}`} className="up-row" onClick={() => setDate(d)}>
                <ActivityArt thumb kind={activityKind(t.name, modName(t.modalityId))} />
                <span className="up-day"><b>{WEEKDAY_LETTER[isoWeekday(d)]}</b><span className="num">{dayNum(d)}</span></span>
                <span className="grow"><b>{t.name}</b><span className="small muted">{[t.time, `${t.duration} min`, t.intensity].filter(Boolean).join(' · ')}</span></span>
                <ChevronRight size={18} />
              </button>
            ))}
          </section>
        );
      })()}

      {history && history.length > 0 && (() => {
        const load = trainingLoad(history, addDays(todayKey(), -120), todayKey());
        const now = load[load.length - 1];
        const weekAgo = load[load.length - 8];
        const wk = wellness ?? [];
        const pick = (k: 'sleepH' | 'hrv' | 'restingHR' | 'steps') => (x: any) => (k === 'sleepH' ? effectiveSleep(x)?.h : k === 'hrv' ? effectiveHrv(x) : x[k]);
        const avg = (k: 'sleepH' | 'hrv' | 'restingHR' | 'steps') => { const v = wk.map(pick(k)).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined; };
        const sleep = avg('sleepH'), hrv = avg('hrv'), rhr = avg('restingHR'), steps = avg('steps');
        const est = history.filter((w) => w.date >= addDays(todayKey(), -42)).some((w) => workoutLoad(w).estimated);
        const f = Math.max(0, Math.min(1, (now.tsb + 30) / 55));
        return (
          <>
          <section className="hero2" style={{ background: '#0B3E40', color: '#DCEBE6', ['--hero-glow' as string]: '#6FA39A', marginTop: 14 }} data-testid="recovery-arc">
            <div className="row between"><span className="h2-k">Carga e recuperação</span>{hrv != null && <span className="chip" style={{ background: 'rgba(255,255,255,.10)', color: '#DCEBE6', height: 28 }}>VFC {Math.round(hrv)}</span>}</div>
            <div className="arc-wrap">
              <Arc f={f} from="#6FA39A" to="#EDC15A" label={`Forma ${Math.round(now.tsb)}: ${formLabel(now.tsb)}`} />
              <div className="arc-mid"><div className="h2-v num" style={{ fontSize: 46 }}>{now.tsb > 0 ? '+' : ''}{Math.round(now.tsb)}</div><div style={{ fontSize: 14, marginTop: 4 }}>forma {formLabel(now.tsb)}</div></div>
            </div>
            <div className="row between small" style={{ margin: '0 14px', color: '#DCEBE6' }}><span>cansada</span><span>descansada</span></div>
            <div className="h2-stats">
              <div><b className="num">{Math.round(now.ctl)}</b>fitness</div>
              <div><b className="num">{Math.round(now.atl)}</b>fadiga</div>
              <div><b className="num">{weekTss ? Math.round(weekTss) : '–'}</b>TSS semana</div>
            </div>
          </section>
          <Fold title="Carga e recuperação" icon={<Activity size={19} />} testId="recovery"
            summary={[`forma ${formLabel(now.tsb)}`, `fitness ${Math.round(now.ctl)}`, sleep != null ? `sono ${Math.floor(sleep)}h${String(Math.round((sleep % 1) * 60)).padStart(2, '0')}` : '', hrv != null ? `VFC ${Math.round(hrv)}` : ''].filter(Boolean).join(' · ')}>
            <div className="row wrap" style={{ gap: '12px 22px' }}>
              <div><div className="big-num num">{Math.round(now.ctl)}</div><div className="small">fitness{weekAgo ? ` (${now.ctl >= weekAgo.ctl ? '+' : ''}${Math.round(now.ctl - weekAgo.ctl)} na semana)` : ''}</div></div>
              <div><div className="big-num num">{Math.round(now.atl)}</div><div className="small">fadiga</div></div>
              <div><div className="big-num num">{Math.round(now.tsb)}</div><div className="small">forma: {formLabel(now.tsb)}</div></div>
            </div>
            {(sleep ?? hrv ?? rhr ?? steps) != null && (
              <div className="row wrap" style={{ gap: '12px 22px', marginTop: 12 }} data-testid="recovery-week">
                {sleep != null && <div><div className="big-num num">{Math.floor(sleep)}h{String(Math.round((sleep % 1) * 60)).padStart(2, '0')}</div><div className="small">sono médio</div></div>}
                {hrv != null && <div><div className="big-num num">{Math.round(hrv)}</div><div className="small">VFC média</div></div>}
                {rhr != null && <div><div className="big-num num">{Math.round(rhr)}</div><div className="small">FC repouso</div></div>}
                {steps != null && <div><div className="big-num num">{Math.round(steps).toLocaleString('pt-BR')}</div><div className="small">passos por dia</div></div>}
              </div>
            )}
            <p className="tiny muted" style={{ marginBottom: 0 }}>Calculada pelo TSS dos arquivos .FIT{est ? '; treinos sem potência (musculação, aulas) entram por estimativa de duração e intensidade' : ''}. Fica mais precisa depois de algumas semanas de registros.</p>
          </Fold>
          </>
        );
      })()}

      <button className="btn btn-wine btn-block" onClick={runReview} disabled={busy || !aiAvailable()} data-testid="train-review"><Sparkles size={18} />Analisar treinos e ajustar o plano</button>
      {review && (
        <section className="block b-paper" style={{ marginTop: 12 }} data-testid="train-review-result">
          <p style={{ marginTop: 0, whiteSpace: 'pre-line' }}>{review.analise}</p>
          {review.proposta && (
            <button className="btn btn-ink btn-block" onClick={async () => {
              const week = await applyTrainingResult(review.proposta);
              await savePlan('training', planFor(plans, 'training', todayKey()), { training: week });
              setReview(null);
            }}>Aplicar o plano ajustado</button>
          )}
        </section>
      )}
    </div>
  );
}

/** Item do dia: fechado mostra nome, o essencial e uma prévia; tocar abre os detalhes e as ações. */
function TItem({ kind, title, meta, time, open, onToggle, preview, children, testId, wide, cover, chips }: {
  kind: 'done' | 'planned'; title: ReactNode; meta?: string; time?: string; open: boolean; onToggle: () => void; preview?: ReactNode; children: ReactNode; testId: string; wide?: boolean; cover?: ReactNode; chips?: ReactNode;
}) {
  return (
    <article className={`titem ${kind} ${open ? 'open' : ''} ${cover ? 'has-cover' : ''}`} data-testid={testId}>
      {cover && <button className="titem-cover" onClick={onToggle} tabIndex={-1} aria-hidden>{cover}{time && <span className="tc-time num">{time}</span>}</button>}
      <button className="titem-head" aria-expanded={open} onClick={onToggle} data-testid="titem-head">
        <span className="titem-ic" aria-hidden>{kind === 'done' ? <CheckIcon size={15} strokeWidth={3} /> : null}</span>
        <span className="titem-main">
          <b className="titem-t">{title}</b>
          {meta ? <span className="titem-meta">{meta}</span> : null}
        </span>
        <span className="titem-side">
          {time && !cover ? <span className="titem-time num">{time}</span> : null}
          <ChevronDown size={18} className="titem-chev" aria-label={open ? 'Fechar detalhes' : 'Ver detalhes'} />
        </span>
      </button>
      {chips && <div className="titem-chips">{chips}</div>}
      {preview}
      {open && <div className={`titem-body ${wide ? 'wide' : ''}`}>{children}</div>}
    </article>
  );
}

export function WorkoutCard({ w, name, ftp, strength, history = [], open, onToggle }: { w: Workout; name: string; ftp?: number; strength?: { program: StrengthExercise[]; firstGroup?: string; hint?: string }; history?: Workout[]; open: boolean; onToggle: () => void }) {
  const m = w.metrics;
  const cells = metricCells(w);
  const zones = showsPowerZones(w) ? m?.zones : undefined;
  const zTotal = zones ? Object.values(zones).reduce((a, b) => a + b, 0) : 0;
  const meta = [w.duration ? `${w.duration} min` : '', ...shortLine(w), w.rpe ? `esforço ${w.rpe}` : ''].filter(Boolean).join(' · ');
  useAutoCoachRead(w);
  const read = w.aiFeedback?.titulo;
  const time = w.startTime ? new Date(w.startTime).toTimeString().slice(0, 5) : undefined;
  const preview = read && !open ? <button className="titem-read" onClick={onToggle} data-testid="wfb-preview"><Sparkles size={13} />{read}</button> : null;
  const saveExercises = (exercises: StrengthExercise[]) => update<'workout'>(w.id, { exercises }).then(() => toast('Exercícios salvos no treino'));
  // Força com exercícios lançados: capa, números, "Como foi" e um card por exercício, na largura toda.
  if (strength && w.exercises?.length) {
    return (
      <TItem kind="done" testId="workout-card" open={open} onToggle={onToggle} title={name} meta={meta || undefined} time={time} preview={preview} wide>
        {w.reclassifiedFrom && <p className="small ss-pad" style={{ margin: '0 0 8px' }} data-testid="reclassified">{w.reclassifiedBy === 'conversa' ? `Corrigido na conversa com a treinadora: contei como ${name}.` : w.reclassifiedBy === 'regra' ? `O relógio gravou de outro jeito; pela sua regra, contei como ${name}.` : `O relógio gravou como musculação; pelo horário da aula, contei como ${name}.`}</p>}
        <SessionHero w={w} />
        <FeelCard w={w} editor={<WorkoutFeedback w={w} forceOpen />} />
        <div className="ss-pad"><CoachRead w={w} /></div>
        <SessionExercises w={w} history={history} />
        <div className="ss-pad ss-actions">
          <LogExercises w={w} program={strength.program} firstGroup={strength.firstGroup} hint={strength.hint} onSave={saveExercises} hideSummary />
          <button className="link small titem-del" aria-label="Excluir treino" onClick={() => deleteRecord(w.id, 'Treino excluído')}><Trash2 size={15} />Excluir treino</button>
        </div>
      </TItem>
    );
  }
  return (
    <TItem kind="done" testId="workout-card" open={open} onToggle={onToggle} title={name} meta={meta || undefined} time={time} preview={preview}>
      {w.reclassifiedFrom && <p className="small" style={{ margin: '0 0 8px' }} data-testid="reclassified">{w.reclassifiedBy === 'conversa' ? `Corrigido na conversa com a treinadora: contei como ${name}.` : w.reclassifiedBy === 'regra' ? `O relógio gravou de outro jeito; pela sua regra, contei como ${name}.` : `O relógio gravou como musculação; pelo horário da aula, contei como ${name}.`}</p>}
      {cells.length > 0 && (
        <div className="metric-grid">
          {cells.map(([l, v]) => <div key={l}><span className="ml">{l}</span><span className="mv num">{v}</span></div>)}
        </div>
      )}
      {zones && zTotal > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="small" style={{ fontWeight: 700, marginBottom: 4 }}>Tempo por zona{ftp ? ` (FTP ${m?.ftpUsed ?? ftp} W)` : ''}</div>
          {POWER_ZONES.map((z, i) => (
            <div key={z.id} className="bar-row" style={{ gridTemplateColumns: '108px 1fr 44px', minHeight: 24 }}>
              <span className="tiny" style={{ fontWeight: 600 }}>{z.label}</span>
              <span className="bar-track"><span className="bar-fill" style={{ display: 'block', width: `${(zones[z.id] / zTotal) * 100}%`, color: 'var(--blue-ink)', opacity: 0.35 + i * 0.13 }} /></span>
              <span className="tiny num" style={{ textAlign: 'right', fontWeight: 700 }}>{zones[z.id]} min</span>
            </div>
          ))}
        </div>
      )}
      {!m && [w.intensity, w.muscles?.join(', ')].filter(Boolean).length ? <div className="small">{[w.intensity, w.muscles?.join(', ')].filter(Boolean).join(', ')}</div> : null}
      {strength && <LogExercises w={w} program={strength.program} firstGroup={strength.firstGroup} hint={strength.hint} onSave={saveExercises} />}
      <WorkoutFeedback w={w} />
      <CoachRead w={w} />
      <div className="titem-foot">
        <button className="link small titem-del" aria-label="Excluir treino" onClick={() => deleteRecord(w.id, 'Treino excluído')}><Trash2 size={15} />Excluir treino</button>
      </div>
    </TItem>
  );
}

/** Como foi o treino: esforço percebido (1 a 10) e um comentário, digitado ou falado. A IA usa na análise. */
function WorkoutFeedback({ w, forceOpen }: { w: Workout; forceOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(w.feeling ?? '');
  // Se o comentário salvo mudar por fora (treino do relógio fundido com o "Feito"), o campo acompanha, a menos que ela esteja editando.
  const prevFeeling = useRef(w.feeling ?? '');
  useEffect(() => { const f = w.feeling ?? ''; if (text.trim() === prevFeeling.current.trim()) setText(f); prevFeeling.current = f; }, [w.feeling]);
  const saved = (w.feeling ?? '') === text.trim();
  const saveText = async (t: string, announce = false) => { await update<'workout'>(w.id, { feeling: t.trim() || undefined }); if (announce) toast('Anotado no treino'); };
  if (!forceOpen && !open && !w.rpe && !w.feeling) return <button className="link" style={{ marginTop: 8 }} onClick={() => setOpen(true)} data-testid="feedback-open">Como foi? Registrar esforço e sensação</button>;
  return (
    <div className="feedback" data-testid="feedback">
      <span className="small" style={{ fontWeight: 700 }}>Esforço percebido</span>
      <div className="rpe">{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <button key={n} className={w.rpe === n ? 'on' : ''} aria-label={`Esforço ${n}`} onClick={() => update<'workout'>(w.id, { rpe: w.rpe === n ? undefined : n })}>{n}</button>)}</div>
      <div className="tiny muted" style={{ display: 'flex', justifyContent: 'space-between' }}><span>muito leve</span><span>máximo</span></div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={() => saveText(text)} placeholder="Como se sentiu, o que pesou, dores, energia…" aria-label="Como foi o treino" style={{ minHeight: 64, marginTop: 8 }} />
      <div className="row between" style={{ gap: 8, marginTop: 8, alignItems: 'center' }}>
        <MicButton label="Falar" onText={(t) => { const next = appendText(text, t); setText(next); saveText(next); }} />
        {saved ? (text.trim() ? <span className="small saved-ok" data-testid="feedback-saved"><CheckIcon size={15} strokeWidth={3} /> Salvo</span> : null)
          : <button className="pill-act pa-blue" onClick={() => saveText(text, true)} data-testid="feedback-save">Salvar</button>}
      </div>
    </div>
  );
}

/** Texto do treino com a carga de cada exercício do roteiro ao lado. Sem roteiro escrito, a lista vem dos exercícios. */
function StrengthNote({ note, exercises }: { note?: string; exercises: StrengthExercise[] }) {
  const lines = (note ?? '').split('\n');
  const hasList = lines.some((l) => parseNoteLine(l));
  const used = new Set<string>();
  const kg = (e?: StrengthExercise) => { const l = e ? loadText(e) : undefined; return l ? <b> · {l}</b> : null; };
  return (
    <div className="small wt-note" data-testid="strength-note">
      {(note ?? '').trim() ? lines.map((l, i) => {
        const p = parseNoteLine(l);
        const e = p ? exercises.find((x) => x.name === p.name && !used.has(x.id)) : undefined;
        if (e) used.add(e.id);
        return <span key={i}>{l}{kg(e)}{'\n'}</span>;
      }) : null}
      {!hasList && exercises.length ? <>{(note ?? '').trim() ? '\n' : ''}{exercises.map((e, i) => <span key={e.id}>{`${i + 1}. ${e.name} ${e.sets}x${repsText(e)}`}{kg(e)}{'\n'}</span>)}</> : null}
    </div>
  );
}

/** Musculação planejada: o texto do treino é o programado. Em "Editar treino" ela troca exercícios, séries,
 *  repetições e carga; ao concluir, o roteiro do texto é reescrito com o que ficou. */
function PlannedStrength({ t, history, date, onDone }: { t: WorkoutTemplate; history: Workout[]; date: DateKey; onDone: (exs: StrengthExercise[]) => void }) {
  // Grava no modelo a sessão que vale: a do roteiro escrito (se a gravada não bate com ele) ou a sugerida pelos grupos.
  useEffect(() => {
    const fix = reconcileWithNote(t.note, t.exercises) ?? (!t.exercises?.length ? defaultExercises(t.muscles, t.note) : undefined);
    if (fix?.length) update<'wtemplate'>(t.id, { exercises: fix });
  }, [t.id, t.note, t.exercises]);
  const [draft, setDraft] = useState<StrengthExercise[] | null>(null);
  const { exercises, why } = programFor(t, history, date);
  if (!exercises.length && !draft) {
    return (
      <>
        {t.note ? <div className="small wt-note">{t.note}</div> : null}
        <button className="pill-act pa-blue" style={{ marginTop: 10 }} data-testid="train-done" onClick={() => onDone([])}>Feito</button>
      </>
    );
  }
  if (draft) {
    // O texto de apoio (descanso, RIR) continua à vista; o roteiro numerado vira o editor.
    const intro = (t.note ?? '').split('\n').filter((l) => !parseNoteLine(l)).join('\n').trim();
    return (
      <div data-testid="planned-strength-edit">
        {intro ? <div className="small wt-note">{intro}</div> : null}
        <div style={{ marginTop: 10 }}><ExerciseEditor value={draft} why={why} onChange={setDraft} /></div>
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          <button className="pill-act pa-ghost" onClick={() => setDraft(null)}>Cancelar</button>
          <button className="pill-act pa-blue" data-testid="strength-edit-save" disabled={!draft.length}
            onClick={() => {
              const exs = draft;
              setDraft(null);
              update<'wtemplate'>(t.id, { exercises: exs, note: noteWithExercises(t.note, exs) }).then(() => toast('Treino atualizado'));
            }}>Concluir edição</button>
        </div>
      </div>
    );
  }
  return (
    <div data-testid="planned-strength">
      <StrengthNote note={t.note} exercises={exercises} />
      <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
        <button className="pill-act pa-blue" data-testid="train-done" onClick={() => onDone(exercises)}>Feito, como programado</button>
        <button className="pill-act pa-ghost" data-testid="strength-edit" onClick={() => setDraft(exercises)}>Editar treino</button>
      </div>
    </div>
  );
}

/** Leitura da treinadora: gerada sozinha para treinos dos últimos 2 dias, uma vez; dá para refazer depois de lançar esforço, comentário ou cargas. */
/** A leitura sai sozinha mesmo com o item fechado; o título aparece na prévia. */
function useAutoCoachRead(w: Workout) {
  const fb = w.aiFeedback;
  useEffect(() => {
    if (fb || w.date < addDays(todayKey(), -2) || !aiAvailable()) return;
    const k = `wfb:${w.id}`;
    try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch { /* */ }
    aiWorkoutFeedback(w).catch(() => undefined);
  }, [w.id, !!fb]);
}

function CoachRead({ w }: { w: Workout }) {
  const [busy, setBusy] = useState(false);
  const fb = w.aiFeedback;
  const run = async (silent: boolean) => {
    setBusy(true);
    try { await aiWorkoutFeedback(w); }
    catch (e: any) { if (!silent) toast(e.message, undefined, 'error'); } finally { setBusy(false); }
  };
  if (!fb) {
    if (!aiAvailable()) return null;
    return <button className="link small" style={{ marginTop: 6 }} onClick={() => run(false)} disabled={busy} data-testid="wfb-ask"><Sparkles size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />{busy ? 'Lendo o treino…' : 'Pedir a leitura da treinadora'}</button>;
  }
  const stale = fb.basis !== feedbackBasis(w);
  return (
    <section className="wfb" data-testid="wfb">
      <div className="row between" style={{ alignItems: 'center' }}>
        <span className="brief-k" style={{ color: 'var(--blue-ink)' }}><Sparkles size={14} />Leitura da treinadora</span>
        {fb.nota ? <span className="wfb-nota" aria-label={`Execução ${fb.nota} de 5`}>{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= fb.nota! ? 'on' : ''} />)}</span> : null}
      </div>
      {fb.titulo && <b className="wfb-t">{fb.titulo}</b>}
      {fb.desempenho && <p>{fb.desempenho}</p>}
      {fb.recuperacao && <p><b>Recuperação.</b> {fb.recuperacao}</p>}
      {fb.alimentacao && <p className="wfb-food"><b>Comer agora.</b> {fb.alimentacao}</p>}
      {fb.proximo && <p><b>Próximo.</b> {fb.proximo}</p>}
      {aiAvailable() && <button className="link tiny" onClick={() => run(false)} disabled={busy}>{busy ? 'Refazendo…' : stale ? 'Você lançou dados novos: refazer leitura' : 'Refazer leitura'}</button>}
    </section>
  );
}
