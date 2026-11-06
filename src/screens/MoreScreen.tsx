import { useNavigate } from 'react-router-dom';
import { Sparkles, Activity, CalendarDays, ChartNoAxesColumn, ListChecks, Settings, ChevronRight, StickyNote, BookOpen, UserRound, Droplet, Scale, Target, Linkedin } from 'lucide-react';
import { TopBar } from './common';

/* Agrupado pelo uso: o que ela consulta sobre si, o que organiza o dia a dia e o que é registro. Cada bloco tem a cor da paleta. */
const GROUPS = [
  {
    title: 'Você',
    items: [
      { to: '/perfil', label: 'Perfil e objetivos', sub: 'A base das especialistas', icon: <UserRound size={20} />, tone: 't-olive' },
      { to: '/peso', label: 'Peso', sub: 'Ritmo e previsão', icon: <Scale size={20} />, tone: 't-honey' },
      { to: '/ciclo', label: 'Ciclo', sub: 'Fase e previsão', icon: <Droplet size={20} />, tone: 't-rose' },
      { to: '/indicadores', label: 'Indicadores', sub: 'Você contra as referências', icon: <Activity size={20} />, tone: 't-teal' },
      { to: '/semana', label: 'Sua semana', sub: 'Leitura da equipe e padrões', icon: <Sparkles size={20} />, tone: 't-plum' },
      { to: '/evolucao', label: 'Evolução', sub: 'Semana, mês e revisão', icon: <ChartNoAxesColumn size={20} />, tone: 't-lilac' }
    ]
  },
  {
    title: 'Organizar',
    items: [
      { to: '/listas', label: 'Tarefas', sub: 'Por categoria e prioridade', icon: <ListChecks size={20} />, tone: 't-terra' },
      { to: '/habitos', label: 'Hábitos e metas', sub: 'O que repetir, onde chegar', icon: <Target size={20} />, tone: 't-ink' },
      { to: '/calendario', label: 'Calendário', sub: 'O mês inteiro', icon: <CalendarDays size={20} />, tone: 't-olive' },
      { to: '/carreira', label: 'Carreira', sub: 'Trabalho, marca e oportunidades', icon: <Linkedin size={20} />, tone: 't-teal' }
    ]
  },
  {
    title: 'Registros',
    items: [
      { to: '/notas', label: 'Notas', sub: 'Ideias com etiquetas', icon: <StickyNote size={20} />, tone: 't-honey' },
      { to: '/leitura', label: 'Leitura', sub: 'Estante e meta do ano', icon: <BookOpen size={20} />, tone: 't-rose' }
    ]
  }
];

export function MoreScreen() {
  const nav = useNavigate();
  return (
    <div className="screen" data-testid="more-screen">
      <TopBar />
      <h1 className="page-title">Mais</h1>
      {GROUPS.map((g) => (
        <section key={g.title} className="more-group">
          <h2 className="set-group">{g.title}</h2>
          <div className="tile-grid">
            {g.items.map((i) => (
              <button key={i.to} className={`tile ${i.tone}`} onClick={() => nav(i.to)}>
                <span className="tile-ic">{i.icon}</span>
                <span className="tile-l">{i.label}</span>
                <span className="tile-s">{i.sub}</span>
              </button>
            ))}
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
