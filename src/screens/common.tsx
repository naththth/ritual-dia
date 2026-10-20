import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Settings as Cog } from 'lucide-react';
import { useApp } from '../state/store';
import { addDays, isoWeekday, longDate, shortLabel, todayKey, weekDays, WEEKDAY_LETTER, WEEKDAY_LONG, dayNum } from '../lib/dates';
import { factDots, useFacts } from '../domain/facts';
import { useSync } from '../sync/sync';
import { whenHistoryIdle } from '../ui/ui';

export function SyncDot() {
  const { state, session } = useSync();
  const map: Record<string, [string, string]> = {
    local: ['var(--ink-3)', 'Só neste aparelho'],
    offline: ['var(--honey-2)', 'Sem conexão: salvo no aparelho'],
    syncing: ['var(--blue-2)', 'Sincronizando'],
    synced: ['var(--ok)', 'Sincronizado'],
    pending: ['var(--honey-2)', 'Alterações a enviar'],
    error: ['var(--alert)', 'Erro ao sincronizar']
  };
  const [c, label] = map[session ? state : 'local'];
  return <span className="sync-dot" style={{ background: c }} title={label} aria-label={label} role="img" />;
}

export function TopBar({ right }: { right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="topbar">
      <span className="row" style={{ gap: 8 }}><span className="wordmark">Ritual</span><SyncDot /></span>
      <span className="row" style={{ gap: 0 }}>
        {right}
        <button className="icon-btn" aria-label="Ajustes" onClick={() => nav('/ajustes')}><Cog size={22} /></button>
      </span>
    </div>
  );
}

export function DateHeader() {
  const { date, setDate } = useApp();
  const today = todayKey();
  const days = weekDays(date);
  const facts = useFacts(days[0], days[6]);
  return (
    <div className="dayhead">
      <div className="row">
        <h1 data-testid="day-title">
          {WEEKDAY_LONG[isoWeekday(date)]},
          <b>{longDate(date)}</b>
        </h1>
        {date !== today && <button className="today-pill" onClick={() => setDate(today)}>Hoje</button>}
      </div>
      <div className="weekstrip" role="group" aria-label="Semana">
        <button className="nav" aria-label="Semana anterior" onClick={() => setDate(addDays(date, -7))}><ChevronLeft size={20} /></button>
        {days.map((d) => (
          <button key={d} className={`wd ${d === date ? 'sel' : ''} ${d === today ? 'today' : ''}`} onClick={() => setDate(d)} aria-label={shortLabel(d)} aria-pressed={d === date}>
            {WEEKDAY_LETTER[isoWeekday(d)]}
            <span className="n">{dayNum(d)}</span>
            <span className="dots">{factDots(facts?.[d]).slice(0, 3).map((c, i) => <i key={i} style={{ background: d === date ? 'var(--paper)' : c }} />)}</span>
          </button>
        ))}
        <button className="nav" aria-label="Próxima semana" onClick={() => setDate(addDays(date, 7))}><ChevronRight size={20} /></button>
      </div>
    </div>
  );
}

/** Cabeçalho das páginas de detalhe: sempre mostra a data em que se está registrando. */
export function PageHead({ title, withDate = true, right, back }: { title: string; withDate?: boolean; right?: ReactNode; back?: () => void }) {
  const goBack = useBack();
  const { date, setDate } = useApp();
  return (
    <div className="page-head">
      <button className="icon-btn" aria-label="Voltar" onClick={() => (back ? back() : goBack())}><ArrowLeft size={22} /></button>
      <h1>{title}{withDate && <span className="sub" data-testid="page-date">{date === todayKey() ? `Hoje, ${shortLabel(date)}` : shortLabel(date)}</span>}</h1>
      {withDate && (
        <>
          <button className="icon-btn" aria-label="Dia anterior" onClick={() => setDate(addDays(date, -1))}><ChevronLeft size={22} /></button>
          <button className="icon-btn" aria-label="Próximo dia" onClick={() => setDate(addDays(date, 1))}><ChevronRight size={22} /></button>
        </>
      )}
      {right}
    </div>
  );
}

/** Volta uma tela; se não houver para onde voltar dentro do app, vai para o Dia. */
export function useBack() {
  const nav = useNavigate();
  return () => whenHistoryIdle(() => ((window.history.state?.idx ?? 0) > 0 ? nav(-1) : nav('/', { replace: true })));
}
