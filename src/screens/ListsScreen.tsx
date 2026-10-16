import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, ChevronRight, Droplet, Utensils, Dumbbell, Target, Repeat2, Tags, CalendarRange, Sparkles, BookmarkCheck } from 'lucide-react';
import { useAll, useSettings } from '../db/hooks';
import { useApp } from '../state/store';
import { TopBar } from './common';
import { Chip, Seg, Empty, ArtLeaf } from '../ui/ui';
import { TaskRow, TaskSheet } from './tasks';
import { matchesSearch } from '../domain/rules';
import { PRIORITIES, type Priority, type Task, type TaskStatus } from '../db/types';
import { shortLabel } from '../lib/dates';

type Sort = 'prioridade' | 'recentes' | 'custo' | 'tempo';

export function ListsScreen() {
  const [tab, setTab] = useState<'tarefas' | 'biblioteca'>(() => (sessionStorage.getItem('lists-tab') as any) || 'tarefas');
  const change = (t: typeof tab) => { setTab(t); try { sessionStorage.setItem('lists-tab', t); } catch { /* */ } };
  return (
    <div className="screen" data-testid="lists-screen">
      <TopBar />
      <h1 className="section-title" style={{ fontSize: 32, fontWeight: 500, margin: '8px 0 14px' }}>Listas</h1>
      <Seg value={tab} onChange={change} options={[{ id: 'tarefas', label: 'Tarefas' }, { id: 'biblioteca', label: 'Biblioteca' }]} label="Seção" />
      {tab === 'tarefas' ? <Tasks /> : <Library />}
    </div>
  );
}

function Tasks() {
  const tasks = useAll('task');
  const cats = useAll('category');
  const settings = useSettings();
  const date = useApp((s) => s.date);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [prio, setPrio] = useState<Priority | ''>('');
  const [status, setStatus] = useState<TaskStatus>('pendente');
  const [owner, setOwner] = useState('');
  const [sort, setSort] = useState<Sort>('prioridade');
  const [edit, setEdit] = useState<Task | undefined>();
  const [creating, setCreating] = useState(false);
  const list = (tasks ?? [])
    .filter((t) => t.status === status && (!cat || t.categoryId === cat) && (!prio || t.priority === prio) && (!owner || (t.owner ?? 'Eu') === owner) && matchesSearch(t, q))
    .sort((a, b) => {
      if (sort === 'recentes') return b.createdAt - a.createdAt;
      if (sort === 'custo') return (a.costEst ?? Infinity) - (b.costEst ?? Infinity);
      if (sort === 'tempo') return (a.minutes ?? Infinity) - (b.minutes ?? Infinity);
      return PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || a.title.localeCompare(b.title);
    });
  return (
    <section style={{ marginTop: 14 }}>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--ink-2)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tarefas" style={{ paddingLeft: 40 }} aria-label="Buscar tarefas" data-testid="lists-search" />
        </div>
        <button className="btn btn-ink" style={{ padding: '0 14px' }} aria-label="Nova tarefa" onClick={() => setCreating(true)}><Plus size={20} /></button>
      </div>
      <div className="chips scroll" style={{ margin: '10px -16px 0' }}>
        <Chip on={!cat} onClick={() => setCat('')}>Todas</Chip>
        {cats?.filter((c) => !c.archived).sort((a, b) => a.order - b.order).map((c) => <Chip key={c.id} on={cat === c.id} onClick={() => setCat(cat === c.id ? '' : c.id)}>{c.name}</Chip>)}
      </div>
      <div className="chips scroll" style={{ margin: '8px -16px 0' }}>
        {PRIORITIES.map((p) => <Chip key={p} color="wine" on={prio === p} onClick={() => setPrio(prio === p ? '' : p)}>{{ alta: 'Alta', media: 'Média', baixa: 'Baixa' }[p]}</Chip>)}
        {(settings?.owners ?? []).map((o) => <Chip key={o} on={owner === o} onClick={() => setOwner(owner === o ? '' : o)}>{o}</Chip>)}
      </div>
      <div className="row between" style={{ margin: '10px 0 2px', gap: 8 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} aria-label="Situação" style={{ width: 'auto', minHeight: 40, padding: '6px 10px' }}>
          <option value="pendente">Pendentes</option><option value="concluida">Concluídas</option><option value="arquivada">Arquivadas</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar" style={{ width: 'auto', minHeight: 40, padding: '6px 10px' }}>
          <option value="prioridade">Por prioridade</option><option value="recentes">Mais recentes</option><option value="custo">Menor custo</option><option value="tempo">Menor tempo</option>
        </select>
      </div>
      <p className="tiny muted" style={{ margin: '6px 0 0' }}>{list.length} {list.length === 1 ? 'tarefa' : 'tarefas'}. O ícone de calendário adiciona a {shortLabel(date)}.</p>
      <div className="list">
        {list.map((t) => <TaskRow key={t.id} t={t} cats={cats} date={date} onOpen={() => setEdit(t)} showPlan />)}
      </div>
      {list.length === 0 && <Empty art={<ArtLeaf />} text={q ? 'Nada encontrado com essa busca.' : 'Nenhuma tarefa aqui.'} action={<button className="btn btn-ink" onClick={() => setCreating(true)}>Nova tarefa</button>} />}
      <TaskSheet open={!!edit} onClose={() => setEdit(undefined)} task={edit} />
      <TaskSheet open={creating} onClose={() => setCreating(false)} defaults={cat ? { categoryId: cat } : undefined} />
    </section>
  );
}

export const LIBRARY = [
  { id: 'produtos', label: 'Produtos de pele', icon: <Droplet size={20} />, c: 'var(--rose)' },
  { id: 'plano-pele', label: 'Plano de pele', icon: <Sparkles size={20} />, c: 'var(--rose)', path: '/plano/skin' },
  { id: 'alimentos', label: 'Alimentos', icon: <Utensils size={20} />, c: 'var(--honey)' },
  { id: 'refeicoes', label: 'Refeições favoritas', icon: <BookmarkCheck size={20} />, c: 'var(--honey)' },
  { id: 'plano-alimentacao', label: 'Plano de alimentação', icon: <CalendarRange size={20} />, c: 'var(--honey)', path: '/plano/food' },
  { id: 'modalidades', label: 'Modalidades de treino', icon: <Dumbbell size={20} />, c: 'var(--blue)' },
  { id: 'treinos', label: 'Treinos-modelo', icon: <Repeat2 size={20} />, c: 'var(--blue)' },
  { id: 'plano-treino', label: 'Plano de treino', icon: <CalendarRange size={20} />, c: 'var(--blue)', path: '/plano/training' },
  { id: 'habitos', label: 'Hábitos', icon: <Repeat2 size={20} />, c: 'var(--olive)' },
  { id: 'metas', label: 'Metas', icon: <Target size={20} />, c: 'var(--olive)' },
  { id: 'categorias', label: 'Categorias de tarefas', icon: <Tags size={20} />, c: 'var(--wine-ink)' }
];

function Library() {
  const nav = useNavigate();
  return (
    <section style={{ marginTop: 10 }} data-testid="library">
      {LIBRARY.map((l) => (
        <button key={l.id} className="lib-item" onClick={() => nav(l.path ?? `/biblioteca/${l.id}`)}>
          <span className="lib-icon" style={{ background: l.c }}>{l.icon}</span>
          <span className="grow" style={{ fontWeight: 650 }}>{l.label}</span>
          <ChevronRight size={18} />
        </button>
      ))}
    </section>
  );
}
