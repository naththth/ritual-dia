import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, CalendarPlus } from 'lucide-react';
import type { WorkoutStep } from '../db/types';
import { useAll, useRecord, useSettings } from '../db/hooks';
import { aiAvailable, aiDayBrief, watts } from '../domain/ai';
import { planTask } from '../domain/actions';
import { toast } from '../state/store';
import { todayKey, type DateKey } from '../lib/dates';
import { zoneTone } from './cardio-ui';

/** Blocos do treino: no pedal, em watts a partir do FTP; na corrida, o alvo escrito (FC, esforço, esteira). */
export function StepsView({ steps, bars }: { steps: WorkoutStep[]; bars?: boolean }) {
  const settings = useSettings();
  const ftp = settings?.ftp;
  const max = Math.max(...steps.map((s) => s.pct), 100);
  const total = steps.reduce((a, s) => a + s.minutes, 0);
  // Só o desenho dos blocos: prévia do treino fechado.
  if (bars) return (
    <div className="steps-bars" aria-hidden data-testid="steps-preview">
      {steps.map((s, i) => <i key={i} style={{ flex: s.minutes / total, height: `${(s.pct / max) * 100}%`, opacity: 0.25 + 0.75 * Math.min(1, s.pct / 100) }} />)}
    </div>
  );
  // Perfil do treino em cores por zona e um card por bloco: minutos grandes, nome e o alvo à direita.
  return (
    <section className="sv" data-testid="steps">
      <div className="sv-prof" aria-hidden>
        {steps.map((s, i) => <i key={i} className={zoneTone(s.pct)} style={{ flex: s.minutes / total, height: `${Math.max(14, (s.pct / max) * 100)}%` }} />)}
      </div>
      <ol className="sv-list">
        {steps.map((s, i) => (
          <li key={i} className="sv-row">
            <span className={`sv-dot ${zoneTone(s.pct)}`} aria-hidden />
            <b className="sv-min num">{s.minutes}<small>{'\u00a0'}min</small></b>
            {/* O alvo (watts, FC, esforço) vai embaixo do nome, para o nome nunca espremer no celular. */}
            <span className="sv-l">{s.label.charAt(0).toUpperCase() + s.label.slice(1)}<span className="sv-t2 num">{s.target ?? (ftp ? `${watts(s.pct, ftp)}\u00a0W` : `${s.pct}%\u00a0FTP`)}</span></span>
          </li>
        ))}
      </ol>
      {!ftp && steps.some((s) => !s.target) && <div className="tiny">Informe seu FTP em Ajustes para ver os watts.</div>}
    </section>
  );
}

/** Orientação do dia montada pela IA, guardada na própria data. */
export function DayBriefBlock({ date }: { date: DateKey }) {
  const brief = useRecord<'brief'>(`brief:${date}`);
  const [busy, setBusy] = useState(false);
  const run = async (silent = false) => {
    setBusy(true);
    try { await aiDayBrief(date); if (!silent) toast('Orientação atualizada'); } catch (e: any) { if (!silent) toast(e.message, undefined, 'error'); } finally { setBusy(false); }
  };
  const settings = useSettings();
  useEffect(() => {
    if (brief !== null || busy || !aiAvailable() || settings?.autoBrief === false || date !== todayKey()) return;
    const k = `auto-brief:${date}`;
    try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch { /* */ }
    run(true); // automático: se falhar, fica quieto; o botão continua lá
  }, [brief, date, settings?.autoBrief]);
  if (brief === undefined) return null;
  if (!brief) {
    if (!aiAvailable()) return null;
    return (
      <button className="btn btn-soft btn-block" style={{ marginBottom: 14 }} onClick={() => run()} disabled={busy} data-testid="brief-ask">
        <Sparkles size={18} />{busy ? 'Preparando o dia…' : 'Preparar meu dia com IA'}
      </button>
    );
  }
  return (
    <section className="block b-paper brief" data-testid="day-brief" aria-label="Orientação do dia">
      <div className="bh">
        <span className="brief-k"><Sparkles size={15} />Leitura do dia</span>
        {aiAvailable() && <button className="icon-btn" aria-label="Refazer orientação" onClick={() => run()} disabled={busy}><RefreshCw size={18} className={busy ? 'spin' : ''} /></button>}
      </div>
      <h2 style={{ fontSize: 20 }}>{brief.foco || 'Seu dia'}</h2>
      {(brief.pele || brief.treino) && (
        <details className="brief-more">
          <summary>Pele e treino de hoje</summary>
          {brief.pele && <p className="small" style={{ margin: '8px 0 0' }}><b>Pele.</b> {brief.pele}</p>}
          {brief.treino && <p className="small" style={{ margin: '6px 0 0' }}><b>Treino.</b> {brief.treino}</p>}
        </details>
      )}
    </section>
  );
}

/** Tarefas que a IA sugeriu para o dia: ficam junto das tarefas do dia, abaixo da programação. Só as que ainda não estão no dia. */
export function BriefTasks({ date }: { date: DateKey }) {
  const brief = useRecord<'brief'>(`brief:${date}`);
  const tasks = useAll('task');
  if (!brief || !tasks) return null;
  const list = brief.tarefas.map((t) => ({ t, task: tasks.find((x) => x.id === t.id) })).filter((x) => x.task && x.task.status === 'pendente' && x.task.plannedDate !== date);
  if (!list.length) return null;
  return (
    <section style={{ margin: '0 0 18px' }} data-testid="brief-tasks" aria-label="Tarefas sugeridas pela IA">
      <div className="section"><h2 className="section-title" style={{ fontSize: 20 }}>Sugeridas para hoje</h2></div>
      {list.map(({ t, task }) => (
        <div key={t.id} className="row-item">
          <div className="grow">
            <div className="t">{task!.title}</div>
            <div className="s">{t.primeiro_passo ? `Primeiro passo: ${t.primeiro_passo}` : t.motivo}</div>
          </div>
          <button className="icon-btn" aria-label={`Adicionar ${task!.title} ao dia`} onClick={() => planTask(task!, date)}><CalendarPlus size={20} /></button>
        </div>
      ))}
    </section>
  );
}
