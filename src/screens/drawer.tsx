// Menu lateral: todas as áreas e telas do app, agrupadas. A barra de baixo fica com as quatro mais usadas.
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, BookOpen, Brain, Briefcase, CalendarDays, ChartNoAxesColumn, Droplet, Dumbbell, ListChecks, NotebookPen, Scale, Settings, Sparkles, StickyNote, Sun, Target, UserRound, Utensils, Wand2, X } from 'lucide-react';
import { useRecord } from '../db/hooks';

type Item = { to: string; label: string; icon: JSX.Element; match?: string };
const GROUPS: { title: string; items: Item[] }[] = [
  { title: 'Áreas', items: [
    { to: '/', label: 'Hoje', icon: <Sun size={20} /> },
    { to: '/treino', label: 'Treino', icon: <Dumbbell size={20} />, match: '/treino' },
    { to: '/alimentacao', label: 'Alimentação', icon: <Utensils size={20} />, match: '/alimentacao' },
    { to: '/cuidados', label: 'Cuidados', icon: <Sparkles size={20} />, match: '/cuidados' },
    { to: '/mente', label: 'Mente', icon: <Brain size={20} />, match: '/mente' },
    { to: '/carreira', label: 'Carreira', icon: <Briefcase size={20} />, match: '/carreira' }
  ] },
  { title: 'Organizar', items: [
    { to: '/listas', label: 'Tarefas', icon: <ListChecks size={20} /> },
    { to: '/habitos', label: 'Hábitos e metas', icon: <Target size={20} /> },
    { to: '/calendario', label: 'Calendário', icon: <CalendarDays size={20} /> }
  ] },
  { title: 'Você', items: [
    { to: '/indicadores', label: 'Indicadores', icon: <Activity size={20} /> },
    { to: '/semana', label: 'Sua semana', icon: <Wand2 size={20} /> },
    { to: '/evolucao', label: 'Evolução', icon: <ChartNoAxesColumn size={20} /> },
    { to: '/peso', label: 'Peso', icon: <Scale size={20} /> },
    { to: '/ciclo', label: 'Ciclo', icon: <Droplet size={20} /> },
    { to: '/perfil', label: 'Perfil e objetivos', icon: <UserRound size={20} /> }
  ] },
  { title: 'Registros', items: [
    { to: '/diario', label: 'Diário', icon: <NotebookPen size={20} /> },
    { to: '/notas', label: 'Notas', icon: <StickyNote size={20} /> },
    { to: '/leitura', label: 'Leitura', icon: <BookOpen size={20} /> }
  ] }
];

export function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const loc = useLocation();
  const base = useRecord<'careerbase'>('careerbase');
  useEffect(() => { onClose(); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  const on = (i: Item) => (i.match ? loc.pathname.startsWith(i.match) : loc.pathname === i.to);
  let k = 0;
  return (
    <>
      <div className="scrim dr-scrim" onClick={onClose} />
      <nav className="drawer" aria-label="Menu" data-testid="drawer">
        <div className="dr-head">
          <span className="dr-brand">Ritual</span>
          <button className="icon-btn" aria-label="Fechar menu" onClick={onClose}><X size={22} /></button>
        </div>
        {GROUPS.map((g) => (
          <div key={g.title} className="dr-group">
            <span className="dr-k">{g.title}</span>
            {g.items.map((i) => (
              <button key={i.to} className={`dr-item ${on(i) ? 'on' : ''}`} style={{ animationDelay: `${(k++) * 18}ms` }} onClick={() => nav(i.to)} data-testid={`dr-${i.to.replace('/', '') || 'hoje'}`}>
                {i.icon}<span>{i.label}</span>{i.to === '/carreira' && base?.workName && <span className="dr-sub">{base.workName}</span>}
              </button>
            ))}
          </div>
        ))}
        <div className="dr-group">
          <button className={`dr-item ${loc.pathname === '/ajustes' ? 'on' : ''}`} onClick={() => nav('/ajustes')} data-testid="dr-ajustes"><Settings size={20} /><span>Ajustes</span></button>
        </div>
      </nav>
    </>
  );
}
