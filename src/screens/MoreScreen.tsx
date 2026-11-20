import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Activity, CalendarDays, ChartNoAxesColumn, ListChecks, Settings, ChevronRight, BookOpen, UserRound, Droplet, Scale, Target, Linkedin, Brain, Leaf } from 'lucide-react';
import { TopBar } from './common';
import { useAll } from '../db/hooks';
import { tasksForDay } from '../domain/rules';
import { useApp } from '../state/store';

/* Tudo num lugar só: as áreas que não estão na barra de baixo, as leituras, o que é sobre ela e o que organiza o dia.
   Cada card tem a cor da paleta; os escuros são os que trazem uma leitura pronta. */
type T = { to: string; label: string; sub: string; icon: ReactNode; bg: string; ink: string; ic: string; icInk?: string; dark?: boolean; wide?: boolean; art?: ReactNode; glow?: string };

function Tile({ t }: { t: T }) {
  const nav = useNavigate();
  return (
    <button className={`mt2 ${t.wide ? 'wide' : ''} ${t.glow ? 'has-glow' : ''}`} style={{ background: t.bg, color: t.ink, ['--mt-glow' as string]: t.glow }} onClick={() => nav(t.to)}>
      {t.art}
      <span className="mt2-ic" style={{ background: t.ic, color: t.icInk }}>{t.icon}</span>
      <span className="mt2-txt"><b style={t.dark ? { color: '#fff' } : undefined}>{t.label}</b><span>{t.sub}</span></span>
    </button>
  );
}

const WeekBars = () => (
  <svg className="mt2-bars" width="150" height="104" viewBox="0 0 150 104" aria-hidden>
    <defs><pattern id="mtHatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#6A4A36" strokeWidth="1.5" /></pattern></defs>
    {[56, 76, 62, 100, 68, 86, 54].map((h, i) => <rect key={i} x={i * 22} y={104 - h} width="16" height={h} rx="8" fill={i === 3 ? '#F2B48C' : 'url(#mtHatch)'} />)}
  </svg>
);

export function MoreScreen() {
  const nav = useNavigate();
  const date = useApp((s) => s.date);
  const tasks = useAll('task');
  const today = tasksForDay(tasks ?? [], date).length;
  const groups: { title: string; cols?: number; items: T[] }[] = [
    { title: 'Áreas', items: [
      { to: '/mente', label: 'Mente', sub: 'Humor, remédios e respiro', icon: <Brain size={18} />, bg: '#3A1426', ink: '#F6DDE3', ic: 'rgba(255,255,255,.12)', dark: true, glow: 'radial-gradient(circle,#C0582C 0%,rgba(90,30,55,0) 70%)' },
      { to: '/cuidados', label: 'Cuidados', sub: 'Rotinas e produtos', icon: <Leaf size={18} />, bg: 'var(--honey)', ink: 'var(--honey-ink)', ic: 'rgba(255,255,255,.6)', glow: 'radial-gradient(circle,#F2B48C 0%,rgba(237,193,90,0) 70%)' }
    ] },
    { title: 'Leituras', items: [
      { to: '/semana', label: 'Sua semana', sub: 'Leitura da equipe e padrões', icon: <Sparkles size={18} />, bg: 'var(--ink)', ink: '#E9DCC8', ic: '#3E2A1E', dark: true, wide: true, art: <WeekBars /> },
      { to: '/evolucao', label: 'Evolução', sub: 'Semana, mês e revisão', icon: <ChartNoAxesColumn size={18} />, bg: 'var(--lilac)', ink: 'var(--lilac-ink)', ic: 'var(--card)' },
      { to: '/indicadores', label: 'Indicadores', sub: 'Você contra as referências', icon: <Activity size={18} />, bg: 'var(--blue-ink)', ink: '#DCEBE6', ic: '#1E6668', dark: true }
    ] },
    { title: 'Você', cols: 3, items: [
      { to: '/perfil', label: 'Perfil', sub: 'Objetivos', icon: <UserRound size={18} />, bg: 'var(--card)', ink: 'var(--ink)', ic: 'var(--olive)' },
      { to: '/peso', label: 'Peso', sub: 'Ritmo', icon: <Scale size={18} />, bg: 'var(--card)', ink: 'var(--ink)', ic: 'var(--honey)' },
      { to: '/ciclo', label: 'Ciclo', sub: 'Fase', icon: <Droplet size={18} />, bg: 'var(--card)', ink: 'var(--ink)', ic: 'var(--rose)' }
    ] },
    { title: 'Organizar', items: [
      { to: '/listas', label: 'Tarefas', sub: today ? `${today} para hoje` : 'Por categoria e prioridade', icon: <ListChecks size={18} />, bg: 'var(--wine)', ink: 'var(--wine-ink)', ic: 'var(--wine-2)', dark: true },
      { to: '/habitos', label: 'Metas', sub: 'Hábitos e onde chegar', icon: <Target size={18} />, bg: 'var(--card)', ink: 'var(--ink)', ic: 'var(--ink)', icInk: 'var(--paper)' },
      { to: '/calendario', label: 'Calendário', sub: 'O mês inteiro', icon: <CalendarDays size={18} />, bg: 'var(--card)', ink: 'var(--ink)', ic: 'var(--blue)' },
      { to: '/carreira', label: 'Carreira', sub: 'Trabalho e marca', icon: <Linkedin size={18} />, bg: 'var(--card)', ink: 'var(--ink)', ic: 'var(--lilac)' },
      { to: '/leitura', label: 'Leitura', sub: 'Estante e meta do ano', icon: <BookOpen size={18} />, bg: 'var(--plum)', ink: 'var(--plum-ink)', ic: '#7A3352', dark: true }
    ] }
  ];
  return (
    <div className="screen" data-testid="more-screen">
      <TopBar />
      <h1 className="page-big">Tudo <span className="lt">num</span><br /><span className="lt">lugar</span> só</h1>
      {groups.map((g) => (
        <section key={g.title} className="more-group">
          <h2 className="mt2-k">{g.title}</h2>
          <div className="mt2-grid" style={g.cols ? { gridTemplateColumns: `repeat(${g.cols}, minmax(0, 1fr))` } : undefined}>
            {g.items.map((t) => <Tile key={t.to} t={t} />)}
          </div>
        </section>
      ))}
      <button className="lib-item more-settings" onClick={() => nav('/ajustes')}>
        <span className="lib-icon"><Settings size={20} /></span>
        <span className="grow"><b>Ajustes</b><br /><span className="small muted">Conta, horários, metas, conexões e backup</span></span>
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
