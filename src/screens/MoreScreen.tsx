import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChartNoAxesColumn, ListChecks, Library, Settings, ChevronRight, Sparkles, NotebookPen, StickyNote, BookOpen, UserRound, Droplet } from 'lucide-react';
import { TopBar } from './common';

const ITEMS = [
  { to: '/perfil', label: 'Perfil e objetivos', sub: 'Corpo, objetivo, alimentação, treino e pele: a base da IA', icon: <UserRound size={20} />, c: 'var(--olive)' },
  { to: '/ciclo', label: 'Ciclo', sub: 'Menstruação, sintomas, fase e previsão', icon: <Droplet size={20} />, c: 'var(--rose)' },
  { to: '/diario', label: 'Diário', sub: 'Energia, humor, sono e o dia em poucas linhas', icon: <NotebookPen size={20} />, c: 'var(--wine-ink)' },
  { to: '/notas', label: 'Notas', sub: 'Ideias e anotações com etiquetas', icon: <StickyNote size={20} />, c: 'var(--honey)' },
  { to: '/leitura', label: 'Leitura', sub: 'Estante, páginas lidas e meta do ano', icon: <BookOpen size={20} />, c: 'var(--rose)' },
  { to: '/calendario', label: 'Calendário', sub: 'O mês inteiro e qualquer dia passado', icon: <CalendarDays size={20} />, c: 'var(--paper-2)' },
  { to: '/evolucao', label: 'Evolução', sub: 'Semana e mês: hábitos, treino, pele, alimentação', icon: <ChartNoAxesColumn size={20} />, c: 'var(--olive)' },
  { to: '/listas', label: 'Tarefas', sub: 'Pendências por categoria e prioridade', icon: <ListChecks size={20} />, c: 'var(--wine-ink)' },
  { to: '/listas?tab=biblioteca', label: 'Biblioteca', sub: 'Produtos, alimentos, treinos, hábitos, metas', icon: <Library size={20} />, c: 'var(--rose)' },
  { to: '/plano/skin', label: 'Plano de pele', sub: 'Manhã, noite e recuperação', icon: <Sparkles size={20} />, c: 'var(--rose)' },
  { to: '/ajustes', label: 'Ajustes', sub: 'Conta, IA, metas, backup', icon: <Settings size={20} />, c: 'var(--card)' }
];

export function MoreScreen() {
  const nav = useNavigate();
  return (
    <div className="screen" data-testid="more-screen">
      <TopBar />
      <h1 className="section-title" style={{ fontSize: 32, fontWeight: 500, margin: '8px 0 10px' }}>Mais</h1>
      {ITEMS.map((i) => (
        <button key={i.to} className="lib-item" onClick={() => nav(i.to)}>
          <span className="lib-icon" style={{ background: i.c }}>{i.icon}</span>
          <span className="grow"><span style={{ fontWeight: 700 }}>{i.label}</span><br /><span className="small muted">{i.sub}</span></span>
          <ChevronRight size={18} />
        </button>
      ))}
    </div>
  );
}
