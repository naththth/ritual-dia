import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Sparkles, Trash2, ChevronLeft, ChevronRight, Check as CheckIcon } from 'lucide-react';
import { TopBar } from './common';
import { AreaNav } from './areas';
import { useAll, useByRange, useSettings } from '../db/hooks';
import { useApp, toast } from '../state/store';
import { planFor, plannedTraining } from '../domain/rules';
import { addDays, isoWeekday, shortLabel, todayKey, weekStart, WEEKDAY_LETTER, dayNum, type DateKey } from '../lib/dates';
import { workoutFromTemplate, skipPlanned, deleteRecord, savePlan } from '../domain/actions';
import { StepsView } from './ai-ui';
import { POWER_ZONES } from '../domain/fit';
import { importFitFiles } from '../domain/fitImport';
import { trainingLoad, workoutLoad, formLabel } from '../domain/load';
import { effectiveSleep, effectiveHrv, wellnessForAI } from '../domain/wellness';
import { db, update } from '../db/db';
import { MicButton, appendText } from '../ui/Dictation';
import type { Workout, WorkoutTemplate } from '../db/types';
import { aiAvailable, askAI, applyTrainingResult } from '../domain/ai';
import { fmt } from '../domain/nutrition';
import { CoachButton } from './coach';
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
  if (!workouts || !plans || !tmpls || !mods || !skips) return <div className="screen"><TopBar /></div>;

  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const plannedOf = (d: DateKey) => plannedTraining(planFor(plans, 'training', d), d, extras).map((id) => tmpls.find((t) => t.id === id)).filter((t): t is WorkoutTemplate => !!t);
  const doneOf = (d: DateKey) => workouts.filter((w) => w.date === d);
  const modName = (id: string) => mods.find((m) => m.id === id)?.name ?? 'Treino';

  const weekPlanned = days.reduce((a, d) => a + plannedOf(d).length, 0);
  const weekDone = workouts.length;
  const weekMin = workouts.reduce((a, w) => a + (w.duration ?? 0), 0);
  const weekTss = workouts.reduce((a, w) => a + (w.metrics?.tss ?? 0), 0);
  const weekKcal = workouts.reduce((a, w) => a + (w.metrics?.kcal ?? 0), 0);
  const weekKm = workouts.reduce((a, w) => a + (w.metrics?.distanceKm ?? w.distanceKm ?? 0), 0);

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
        treinos_feitos_28_dias: recent.map((w) => ({ data: w.date, modalidade: modName(w.modalityId), minutos: w.duration, do_plano: !!w.fromPlan, metricas: w.metrics ? { ...w.metrics, laps: undefined } : undefined, esforco_percebido: w.rpe, como_foi: w.feeling }))
      });
      setReview({ analise: String(r.analise ?? ''), proposta: r.templates?.length ? r : undefined });
    } catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(false); }
  };

  const dayPlanned = plannedOf(date);
  const dayDone = doneOf(date);
  const daySkips = skips.filter((s) => s.date === date && s.domain === 'training').map((s) => s.ref);

  return (
    <div className="screen" data-testid="training-tab">
      <TopBar />
      <div className="row between" style={{ alignItems: 'center' }}>
        <h1 className="section-title" style={{ fontSize: 32, fontWeight: 500, margin: '8px 0 10px' }}>Treino</h1>
        <CoachButton />
      </div>
      <AreaNav area="treino" />
      <div style={{ height: 12 }} />

      <div className="row between" style={{ margin: '0 -8px' }}>
        <button className="icon-btn" aria-label="Semana anterior" onClick={() => setDate(addDays(date, -7))}><ChevronLeft size={20} /></button>
        <span className="small" style={{ fontWeight: 700, textAlign: 'center' }}>{shortLabel(ws)} a {shortLabel(we)}{syncing && <><br /><span className="tiny muted" data-testid="intervals-syncing">Buscando treinos novos…</span></>}</span>
        <button className="icon-btn" aria-label="Próxima semana" onClick={() => setDate(addDays(date, 7))}><ChevronRight size={20} /></button>
      </div>
      <div className="week-train" role="group" aria-label="Dias da semana">
        {days.map((d) => {
          const p = plannedOf(d);
          const dn = doneOf(d);
          const state = dn.length ? 'done' : p.length && d < todayKey() ? 'missed' : p.length ? 'planned' : 'rest';
          return (
            <button key={d} className={`wt-day ${d === date ? 'sel' : ''} ${state}`} onClick={() => setDate(d)} aria-label={`${shortLabel(d)}: ${dn.length ? 'feito' : p.map((t) => t.name).join(', ') || 'sem treino'}`}>
              <span className="tiny">{WEEKDAY_LETTER[isoWeekday(d)]}</span>
              <span className="n">{dayNum(d)}</span>
              <span className="wt-mark">{dn.length ? <CheckIcon size={14} strokeWidth={3} /> : p.length ? '•' : ''}</span>
            </button>
          );
        })}
      </div>

      <section className="block b-blue" style={{ marginTop: 12 }} data-testid="training-day">
        <div className="bh"><h2 style={{ fontSize: 20 }}>{date === todayKey() ? 'Hoje' : shortLabel(date)}</h2></div>

        {/* 1) O que foi feito vem primeiro, como registro do dia. */}
        {dayDone.length > 0 && <span className="label" style={{ marginTop: 0 }}>Feito</span>}
        {dayDone.map((w) => <WorkoutCard key={w.id} w={w} name={modName(w.modalityId)} ftp={settings?.ftp} />)}

        {/* 2) O planejado: completo só enquanto está pendente; trocado ou pulado vira uma linha. */}
        {dayPlanned.map((t) => {
          const done = dayDone.some((w) => w.templateId === t.id || w.modalityId === t.modalityId);
          const skipped = daySkips.includes(t.id);
          if (done) return null;
          if (skipped) {
            return (
              <div key={t.id} className="row between" style={{ marginTop: 10, gap: 8 }} data-testid="planned-skipped">
                <span className="small"><s>{t.name}</s> · não hoje</span>
                <button className="link" onClick={() => deleteRecord(`skip:${date}:training:${t.id}`, 'Planejado de volta')}>Desfazer</button>
              </div>
            );
          }
          const swapped = dayDone.find((w) => w.modalityId !== t.modalityId);
          return (
            <div key={t.id} style={{ marginTop: dayDone.length ? 14 : 0 }}>
              <span className="label" style={{ marginTop: 0 }}>Planejado</span>
              {swapped && (
                <div className="swap-ask" data-testid="swap-ask">
                  <span className="small">Você fez {modName(swapped.modalityId).toLowerCase()} no lugar de {t.name.toLowerCase()}?</span>
                  <button className="pill-act pa-blue" onClick={() => skipPlanned(date, 'training', t.id, `${t.name} trocado por ${modName(swapped.modalityId).toLowerCase()}`)} data-testid="swap-yes">Sim, troquei</button>
                </div>
              )}
              <div className="row between"><span className="t" style={{ fontWeight: 700, fontSize: 18 }}>{t.name}</span>{t.time && <span className="small" style={{ fontWeight: 700 }}>{t.time}</span>}</div>
              <div className="small">{modName(t.modalityId)}, {t.duration} min, {t.intensity}</div>
              {t.note ? <div className="small wt-note">{t.note}</div> : null}
              {t.muscles?.length ? <div className="small">Foco: {t.muscles.join(', ').toLowerCase()}</div> : null}
              {t.steps?.length ? <StepsView steps={t.steps} /> : null}
              <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                <button className="pill-act pa-blue" data-testid="train-done" onClick={() => workoutFromTemplate(t, date, true)}>Feito</button>
                <button className="pill-act pa-ghost" onClick={() => fileRef.current?.click()}>Importar o arquivo</button>
                <button className="pill-act pa-ghost" onClick={() => skipPlanned(date, 'training', t.id, 'Treino marcado como não hoje')}>Hoje não</button>
              </div>
            </div>
          );
        })}
        {!dayPlanned.length && !dayDone.length && <p className="small" style={{ margin: 0 }}>Sem treino planejado. Não registrado.</p>}
      </section>

      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn btn-ink grow" onClick={() => fileRef.current?.click()} disabled={busy} data-testid="fit-import"><Upload size={18} />{busy ? 'Lendo…' : 'Importar .FIT'}</button>
        <button className="btn btn-soft" onClick={() => nav('/treino/registrar')}><Plus size={18} />Registrar</button>
      </div>
      <input ref={fileRef} type="file" accept=".fit,.zip,application/octet-stream,application/zip" multiple hidden onChange={(e) => importFit(e.target.files)} data-testid="fit-input" />
      <p className="tiny muted">Pode escolher vários arquivos de uma vez (.fit ou .zip). Garmin: no site connect.garmin.com, abra a atividade, menu ⚙, Exportar original. MyWhoosh: na atividade, exportar ou baixar o .FIT.</p>

      <section className="block b-paper" style={{ marginTop: 14 }} data-testid="training-week">
        <div className="bh"><h2 style={{ fontSize: 20 }}>Semana</h2></div>
        <div className="row wrap" style={{ gap: '12px 22px' }}>
          <div><div className="big-num num">{weekDone}{weekPlanned ? <span className="small" style={{ fontFamily: 'var(--f-ui)' }}> de {weekPlanned}</span> : null}</div><div className="small">treinos</div></div>
          <div><div className="big-num num">{Math.floor(weekMin / 60)}h{String(weekMin % 60).padStart(2, '0')}</div><div className="small">de treino</div></div>
          {weekKm > 0 && <div><div className="big-num num">{fmt(weekKm)}</div><div className="small">km</div></div>}
          {weekTss > 0 && <div><div className="big-num num">{weekTss}</div><div className="small">TSS</div></div>}
          {weekKcal > 0 && <div><div className="big-num num">{fmt(weekKcal)}</div><div className="small">kcal</div></div>}
        </div>
      </section>

      {history && history.length > 0 && (() => {
        const load = trainingLoad(history, addDays(todayKey(), -120), todayKey());
        const now = load[load.length - 1];
        const weekAgo = load[load.length - 8];
        const wk = wellness ?? [];
        const pick = (k: 'sleepH' | 'hrv' | 'restingHR' | 'steps') => (x: any) => (k === 'sleepH' ? effectiveSleep(x)?.h : k === 'hrv' ? effectiveHrv(x) : x[k]);
        const avg = (k: 'sleepH' | 'hrv' | 'restingHR' | 'steps') => { const v = wk.map(pick(k)).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined; };
        const sleep = avg('sleepH'), hrv = avg('hrv'), rhr = avg('restingHR'), steps = avg('steps');
        const est = history.filter((w) => w.date >= addDays(todayKey(), -42)).some((w) => workoutLoad(w).estimated);
        return (
          <section className="block b-paper" data-testid="recovery">
            <div className="bh"><h2 style={{ fontSize: 20 }}>Carga e recuperação</h2><span className="tiny muted">semana</span></div>
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
          </section>
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

export function WorkoutCard({ w, name, ftp }: { w: Workout; name: string; ftp?: number }) {
  const m = w.metrics;
  const cells: [string, string][] = [];
  if (w.duration) cells.push(['Duração', `${w.duration} min`]);
  if (m?.distanceKm || w.distanceKm) cells.push(['Distância', `${m?.distanceKm ?? w.distanceKm} km`]);
  if (m?.np) cells.push(['Potência NP', `${m.np} W`]);
  if (m?.avgPower) cells.push(['Potência média', `${m.avgPower} W`]);
  if (m?.if) cells.push(['Intensidade', `${m.if}`]);
  if (m?.tss) cells.push(['TSS', `${m.tss}`]);
  if (m?.avgHr) cells.push(['FC média', `${m.avgHr} bpm`]);
  if (m?.maxHr) cells.push(['FC máxima', `${m.maxHr} bpm`]);
  if (m?.best20) cells.push(['Melhor 20 min', `${m.best20} W`]);
  if (m?.best5) cells.push(['Melhor 5 min', `${m.best5} W`]);
  if (m?.avgCadence) cells.push(['Cadência', `${m.avgCadence} rpm`]);
  if (m?.ascentM) cells.push(['Subida', `${m.ascentM} m`]);
  if (m?.kcal) cells.push(['Calorias', `${m.kcal} kcal`]);
  const zones = m?.zones;
  const zTotal = zones ? Object.values(zones).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="wcard" data-testid="workout-card">
      <div className="row between">
        <span style={{ fontWeight: 700, fontSize: 17 }}><CheckIcon size={16} strokeWidth={3} style={{ verticalAlign: '-2px', marginRight: 6 }} />{name}{w.startTime ? `, ${new Date(w.startTime).toTimeString().slice(0, 5)}` : ''}</span>
        <button className="icon-btn" aria-label="Excluir treino" onClick={() => deleteRecord(w.id, 'Treino excluído')}><Trash2 size={17} /></button>
      </div>
      {w.reclassifiedFrom && <p className="small" style={{ margin: '2px 0 6px' }} data-testid="reclassified">{w.reclassifiedBy === 'conversa' ? `Corrigido na conversa com a treinadora: contei como ${name}.` : w.reclassifiedBy === 'regra' ? `O relógio gravou de outro jeito; pela sua regra, contei como ${name}.` : `O relógio gravou como musculação; pelo horário da aula, contei como ${name}.`}</p>}
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
      {!m && <div className="small">{[w.intensity, w.muscles?.join(', ')].filter(Boolean).join(', ')}</div>}
      <WorkoutFeedback w={w} />
    </div>
  );
}

/** Como foi o treino: esforço percebido (1 a 10) e um comentário, digitado ou falado. A IA usa na análise. */
function WorkoutFeedback({ w }: { w: Workout }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(w.feeling ?? '');
  const saved = (w.feeling ?? '') === text.trim();
  const saveText = async (t: string, announce = false) => { await update<'workout'>(w.id, { feeling: t.trim() || undefined }); if (announce) toast('Anotado no treino'); };
  if (!open && !w.rpe && !w.feeling) return <button className="link" style={{ marginTop: 8 }} onClick={() => setOpen(true)} data-testid="feedback-open">Como foi? Registrar esforço e sensação</button>;
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
