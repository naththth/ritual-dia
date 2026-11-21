import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Dumbbell, House, Menu, Plus, Settings as Cog, Sparkles, Utensils } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useSettings } from '../db/hooks';
import { useApp } from '../state/store';
import { addDays, isoWeekday, longDate, shortLabel, todayKey, weekDays, WEEKDAY_LETTER, WEEKDAY_LONG, dayNum, type DateKey } from '../lib/dates';
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
  return <button className="icon-btn menu-btn" aria-label="Abrir menu" onClick={() => useApp.getState().setMenu(true)} data-testid="nav-menu"><Menu size={24} /></button>;
}

/** Barra de baixo: uma faixa única, presa no rodapé e sempre visível.
 *  Treino, Dieta, Hoje (no centro, sempre em destaque, para voltar rápido), Pele e o + que abre Registrar. */
export function AddButton() {
  const loc = useLocation();
  const nav = useNavigate();
  const p = loc.pathname;
  const area = p === '/' ? 'hoje' : p.startsWith('/treino') ? 'treino' : p.startsWith('/alimentacao') ? 'dieta' : p.startsWith('/cuidados') || p.startsWith('/pele') ? 'pele' : '';
  const tab = (k: string, to: string, label: string, icon: JSX.Element) => (
    <button key={k} className={`bn-tab ${area === k ? 'on' : ''}`} aria-current={area === k ? 'page' : undefined} onClick={() => nav(to)} data-testid={`bn-${k}`}>
      {icon}<span>{label}</span>
    </button>
  );
  return (
    <nav className="bottombar" aria-label="Navegação principal">
      {tab('treino', '/treino', 'Treino', <Dumbbell size={22} />)}
      {tab('dieta', '/alimentacao', 'Dieta', <Utensils size={22} />)}
      <button className={`bn-home ${area === 'hoje' ? 'on' : ''}`} aria-current={area === 'hoje' ? 'page' : undefined} aria-label="Hoje" onClick={() => nav('/')} data-testid="bn-hoje">
        <span className="bh-c"><House size={24} /></span><span>Hoje</span>
      </button>
      {tab('pele', '/cuidados', 'Pele', <Sparkles size={22} />)}
      <button className="bn-tab bn-add" aria-label="Registrar" onClick={() => useApp.getState().setReg(true)} data-testid="fab">
        <span className="ba-c"><Plus size={20} strokeWidth={2.6} /></span><span>Registrar</span>
      </button>
    </nav>
  );
}

export function TopBar({ right }: { right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="topbar">
      <span className="row" style={{ gap: 4 }}><MenuButton /><span className="wordmark">Ritual<i>.</i></span><SyncDot /></span>
      <span className="row" style={{ gap: 0 }}>
        {right}
        <button className="icon-btn" aria-label="Ajustes" onClick={() => nav('/ajustes')}><Cog size={22} /></button>
      </span>
    </div>
  );
}

/** O único jeito de mudar de dia no app: a semana em pílulas, com setas de semana nas pontas.
 *  Cada tela pode pôr uma marca embaixo do número (feito, planejado, registros) e um rótulo acessível. */
export function DayStrip({ mark, aria, note }: { mark?: (d: DateKey, sel: boolean) => ReactNode; aria?: (d: DateKey) => string; note?: ReactNode }) {
  const { date, setDate } = useApp();
  const today = todayKey();
  const days = weekDays(date);
  return (
    <div className="daystrip">
      <div className="weekstrip ws2" role="group" aria-label="Semana">
        <button className="nav" aria-label="Semana anterior" onClick={() => setDate(addDays(date, -7))}><ChevronLeft size={18} /></button>
        {days.map((d) => (
          <button key={d} className={`wd ${d === date ? 'sel' : ''} ${d === today ? 'today' : ''}`} onClick={() => setDate(d)} aria-label={aria ? aria(d) : shortLabel(d)} aria-pressed={d === date}>
            <span className="n num">{dayNum(d)}</span>
            {WEEKDAY_LETTER[isoWeekday(d)]}
            <span className="dots">{mark?.(d, d === date)}</span>
          </button>
        ))}
        <button className="nav" aria-label="Próxima semana" onClick={() => setDate(addDays(date, 7))}><ChevronRight size={18} /></button>
      </div>
      {(date !== today || note) && (
        <div className="ds-foot">{note}{date !== today && <button className="today-pill" onClick={() => setDate(today)}>Voltar para hoje</button>}</div>
      )}
    </div>
  );
}

export function greeting(h = new Date().getHours()) { return h >= 4 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite'; }

export function DateHeader() {
  const { date } = useApp();
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
      </div>
      <DayStrip mark={(d, sel) => factDots(facts?.[d]).slice(0, 3).map((c, i) => <i key={i} style={{ background: sel ? 'var(--paper)' : c }} />)} />
    </div>
  );
}

/** Cabeçalho das páginas de detalhe: sempre mostra a data em que se está registrando. */
export function PageHead({ title, withDate = true, right, back }: { title: string; withDate?: boolean; right?: ReactNode; back?: () => void }) {
  const goBack = useBack();
  const { date } = useApp();
  // Barra fina e translúcida (voltar, dia, ações) e, abaixo, o título grande na linguagem do app.
  return (
    <>
      <div className="page-head ph2">
        <button className="icon-btn" aria-label="Voltar" onClick={() => (back ? back() : goBack())}><ArrowLeft size={22} /></button>
        <span className="grow" />
        {right}
      </div>
      {title && (
        <h1 className="page-big ph-title">{title}{withDate && <span className="sub" data-testid="page-date">{date === todayKey() ? `Hoje, ${shortLabel(date)}` : shortLabel(date)}</span>}</h1>
      )}
      {withDate && <DayStrip />}
    </>
  );
}

/** Volta uma tela; se não houver para onde voltar dentro do app, vai para o Dia. */
export function useBack() {
  const nav = useNavigate();
  return () => whenHistoryIdle(() => ((window.history.state?.idx ?? 0) > 0 ? nav(-1) : nav('/', { replace: true })));
}
