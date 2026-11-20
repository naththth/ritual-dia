import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Dumbbell, House, LayoutGrid, Plus, Settings as Cog, Utensils } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useSettings } from '../db/hooks';
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

/** Abre o menu lateral (todas as áreas e telas). */
export function MenuButton() {
  return <button className="wordmark-btn" aria-label="Abrir menu" onClick={() => useApp.getState().setMenu(true)} data-testid="nav-menu"><span className="wordmark">Ritual<i>.</i></span></button>;
}

/** Barra de baixo, flutuante: Hoje, Treino, o + no centro (abre Registrar), Comida e Mais.
 *  Rolando para baixo ela se recolhe, para não cobrir o conteúdo; rolando para cima, volta. */
export function AddButton() {
  const [tuck, setTuck] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    let last = window.scrollY;
    const on = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 6) return;
      setTuck(y > last && y > 80);
      last = y;
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const p = loc.pathname;
  const area = p === '/' ? 'hoje' : p.startsWith('/treino') ? 'treino' : p.startsWith('/alimentacao') ? 'comida' : 'mais';
  const items: { k: string; to: string; label: string; icon: JSX.Element }[] = [
    { k: 'hoje', to: '/', label: 'Hoje', icon: <House size={21} /> },
    { k: 'treino', to: '/treino', label: 'Treino', icon: <Dumbbell size={21} /> },
    { k: 'comida', to: '/alimentacao', label: 'Comida', icon: <Utensils size={21} /> },
    { k: 'mais', to: '/mais', label: 'Mais', icon: <LayoutGrid size={21} /> }
  ];
  const tab = (i: typeof items[number]) => (
    <button key={i.k} className={`bn-tab ${area === i.k ? 'on' : ''}`} aria-current={area === i.k ? 'page' : undefined} aria-label={i.label} onClick={() => nav(i.to)} data-testid={`bn-${i.k}`}>
      {i.icon}{area === i.k && <span>{i.label}</span>}
    </button>
  );
  return (
    <nav className={`bottomnav2 ${tuck ? 'tuck' : ''}`} aria-label="Navegação principal">
      {items.slice(0, 2).map(tab)}
      <button className="fab fab-float" aria-label="Registrar" onClick={() => useApp.getState().setReg(true)} data-testid="fab"><Plus size={26} strokeWidth={2.4} /></button>
      {items.slice(2).map(tab)}
    </nav>
  );
}

export function TopBar({ right }: { right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="topbar">
      <span className="row" style={{ gap: 6 }}><MenuButton /><SyncDot /></span>
      <span className="row" style={{ gap: 0 }}>
        {right}
        <button className="icon-btn" aria-label="Ajustes" onClick={() => nav('/ajustes')}><Cog size={22} /></button>
      </span>
    </div>
  );
}

export function greeting(h = new Date().getHours()) { return h >= 4 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite'; }

export function DateHeader() {
  const { date, setDate } = useApp();
  const settings = useSettings();
  const today = todayKey();
  const days = weekDays(date);
  const facts = useFacts(days[0], days[6]);
  const isToday = date === today;
  const who = settings?.callMe?.trim();
  return (
    <div className="dayhead dayhead2">
      <h1 data-testid="day-title">
        {isToday ? <span className="dh-greet" aria-hidden>{greeting()}{who ? <>,<br />{who}</> : null}</span>
          : <span className="dh-greet" aria-hidden><span className="num">{dayNum(date)}</span> <span className="dh-light">de {longDate(date).replace(/^\d+ de /, '').replace(/ de \d{4}$/, '')}</span></span>}
        <span className="sr-only">{WEEKDAY_LONG[isoWeekday(date)]}, {longDate(date)}</span>
      </h1>
      <div className="dh-sub">
        <span>{WEEKDAY_LONG[isoWeekday(date)][0].toUpperCase() + WEEKDAY_LONG[isoWeekday(date)].slice(1)}, {longDate(date).replace(/ de \d{4}$/, '')}</span>
        {!isToday && <button className="today-pill" onClick={() => setDate(today)}>Voltar para hoje</button>}
      </div>
      <div className="weekstrip ws2" role="group" aria-label="Semana">
        <button className="nav" aria-label="Semana anterior" onClick={() => setDate(addDays(date, -7))}><ChevronLeft size={18} /></button>
        {days.map((d) => (
          <button key={d} className={`wd ${d === date ? 'sel' : ''} ${d === today ? 'today' : ''}`} onClick={() => setDate(d)} aria-label={shortLabel(d)} aria-pressed={d === date}>
            <span className="n num">{dayNum(d)}</span>
            {WEEKDAY_LETTER[isoWeekday(d)]}
            <span className="dots">{factDots(facts?.[d]).slice(0, 3).map((c, i) => <i key={i} style={{ background: d === date ? 'var(--paper)' : c }} />)}</span>
          </button>
        ))}
        <button className="nav" aria-label="Próxima semana" onClick={() => setDate(addDays(date, 7))}><ChevronRight size={18} /></button>
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
