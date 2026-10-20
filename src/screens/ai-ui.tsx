import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, CalendarPlus, Check as CheckIcon } from 'lucide-react';
import type { WorkoutStep } from '../db/types';
import { useAll, useRecord, useSettings } from '../db/hooks';
import { aiAvailable, aiDayBrief, watts } from '../domain/ai';
import { planTask } from '../domain/actions';
import { toast } from '../state/store';
import { todayKey, type DateKey } from '../lib/dates';

/** Blocos do treino de pedal, em watts a partir do FTP. */
export function StepsView({ steps }: { steps: WorkoutStep[] }) {
  const settings = useSettings();
  const ftp = settings?.ftp;
  const max = Math.max(...steps.map((s) => s.pct), 100);
  const total = steps.reduce((a, s) => a + s.minutes, 0);
  return (
    <div style={{ marginTop: 10 }} data-testid="steps">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 46 }} aria-hidden>
        {steps.map((s, i) => (
          <i key={i} style={{ flex: s.minutes / total, height: `${(s.pct / max) * 100}%`, background: 'currentColor', opacity: 0.25 + 0.75 * Math.min(1, s.pct / 100), borderRadius: 4, display: 'block' }} />
        ))}
      </div>
      <div style={{ marginTop: 6 }}>
        {steps.map((s, i) => (
          <div key={i} className="row between small" style={{ minHeight: 26 }}>
            <span>{s.minutes} min, {s.label.toLowerCase()}</span>
            <span className="num" style={{ fontWeight: 700 }}>{ftp ? `${watts(s.pct, ftp)} W` : `${s.pct}% FTP`}</span>
          </div>
        ))}
        {!ftp && <div className="tiny">Informe seu FTP em Ajustes para ver os watts.</div>}
      </div>
    </div>
  );
}

/** Orientação do dia montada pela IA, guardada na própria data. */
export function DayBriefBlock({ date }: { date: DateKey }) {
  const brief = useRecord<'brief'>(`brief:${date}`);
  const tasks = useAll('task');
  const [busy, setBusy] = useState(false);
  const run = async (silent = false) => {
    setBusy(true);
    try { await aiDayBrief(date); } catch (e: any) { if (!silent) toast(e.message, undefined, 'error'); } finally { setBusy(false); }
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
    <section className="block b-paper" data-testid="day-brief" aria-label="Orientação do dia">
      <div className="bh">
        <h2 style={{ fontSize: 20 }}>{brief.foco || 'Seu dia'}</h2>
        {aiAvailable() && <button className="icon-btn" aria-label="Refazer orientação" onClick={() => run()} disabled={busy}><RefreshCw size={18} /></button>}
      </div>
      {brief.tarefas.map((t) => {
        const task = tasks?.find((x) => x.id === t.id);
        if (!task) return null;
        const inDay = task.plannedDate === date;
        return (
          <div key={t.id} className="row-item">
            <div className="grow">
              <div className="t">{task.title}</div>
              <div className="s">{t.primeiro_passo ? `Primeiro passo: ${t.primeiro_passo}` : t.motivo}</div>
            </div>
            {inDay ? (
              <button className="in-day" aria-label={`Tirar ${task.title} do dia`} onClick={() => planTask(task, null)} data-testid="brief-unplan"><CheckIcon size={14} strokeWidth={3} />No dia</button>
            ) : (
              <button className="icon-btn" aria-label={`Adicionar ${task.title} ao dia`} onClick={() => planTask(task, date)}><CalendarPlus size={20} /></button>
            )}
          </div>
        );
      })}
      {brief.pele && <p className="small" style={{ margin: '10px 0 0' }}><b>Pele.</b> {brief.pele}</p>}
      {brief.treino && <p className="small" style={{ margin: '6px 0 0' }}><b>Treino.</b> {brief.treino}</p>}
    </section>
  );
}
