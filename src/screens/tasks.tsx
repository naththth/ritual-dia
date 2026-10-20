import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, CalendarCheck, Search, Trash2, Plus } from 'lucide-react';
import { useAll, useSettings } from '../db/hooks';
import { create, update, uid } from '../db/db';
import type { Category, ExecMode, Priority, Task, TaskStatus } from '../db/types';
import { PRIORITIES } from '../db/types';
import { Check, Chip, Empty, Seg, Sheet, useConfirm, ArtLeaf } from '../ui/ui';
import { matchesSearch } from '../domain/rules';
import { planTask, toggleTaskDone, deleteRecord, withUndo } from '../domain/actions';
import { shortLabel, todayKey, type DateKey } from '../lib/dates';
import { useApp, toast } from '../state/store';

export function prioLabel(cats: Category[] | undefined, t: Pick<Task, 'categoryId' | 'priority'>) {
  const c = cats?.find((c) => c.id === t.categoryId);
  return c?.labels[t.priority] ?? { alta: 'Alta', media: 'Média', baixa: 'Baixa' }[t.priority];
}

export function TaskRow({ t, cats, date, onOpen, showPlan }: { t: Task; cats?: Category[]; date: DateKey; onOpen: () => void; showPlan?: boolean }) {
  const [confirmEl, ask] = useConfirm();
  const done = t.status === 'concluida';
  const cat = cats?.find((c) => c.id === t.categoryId);
  const toggle = async () => {
    if (!done && date !== todayKey()) {
      const ok = await ask({ title: `Concluída em ${shortLabel(date)}?`, text: 'A data de conclusão será a do dia selecionado.', ok: 'Confirmar' });
      if (!ok) return;
    }
    await toggleTaskDone(t, date);
  };
  return (
    <div className={`row-item ${done ? 'done' : ''}`} data-testid="task-row">
      <Check on={done} label={`Concluir ${t.title}`} onToggle={toggle} />
      <button className="grow tap" onClick={onOpen}>
        <div className="t">{t.title}</div>
        <div className="s">
          {cat?.name}{t.subcategory ? `, ${t.subcategory.toLowerCase()}` : ''}
          {t.plannedDate && showPlan ? `. No dia ${shortLabel(t.plannedDate)}` : ''}
          {done && t.completedDate ? `. Concluída ${shortLabel(t.completedDate)}` : ''}
        </div>
      </button>
      <span className={`prio ${t.priority}`}>{prioLabel(cats, t)}</span>
      {!done && t.plannedDate === date && (
        <button className="in-day" aria-label={`Tirar ${t.title} do dia`} onClick={() => planTask(t, null)}><CalendarCheck size={15} />No dia</button>
      )}
      {showPlan && !done && t.plannedDate !== date && (
        <button className="icon-btn" aria-label={`Adicionar ${t.title} a ${shortLabel(date)}`} onClick={() => planTask(t, date)}><CalendarPlus size={20} /></button>
      )}
      {confirmEl}
    </div>
  );
}

/* ---------- Escolher tarefa para o dia ---------- */
export function TaskPicker({ open, onClose, date }: { open: boolean; onClose: () => void; date: DateKey }) {
  const tasks = useAll('task');
  const cats = useAll('category');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');
  const [prio, setPrio] = useState<Priority | ''>('');
  useEffect(() => { if (open) { setQ(''); } }, [open]);
  const list = useMemo(() => (tasks ?? [])
    .filter((t) => t.status === 'pendente' && t.plannedDate !== date)
    .filter((t) => (!cat || t.categoryId === cat) && (!prio || t.priority === prio) && matchesSearch(t, q))
    .sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || a.title.localeCompare(b.title)), [tasks, cat, prio, q, date]);
  return (
    <Sheet open={open} onClose={onClose} title="Escolher tarefa" sub={`Para ${shortLabel(date)}`} testId="task-picker">
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--ink-2)' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" style={{ paddingLeft: 40 }} aria-label="Buscar tarefa" />
      </div>
      <div className="chips scroll" style={{ marginBottom: 6 }}>
        <Chip on={!cat} onClick={() => setCat('')}>Todas</Chip>
        {cats?.filter((c) => !c.archived).sort((a, b) => a.order - b.order).map((c) => <Chip key={c.id} on={cat === c.id} onClick={() => setCat(cat === c.id ? '' : c.id)}>{c.name}</Chip>)}
      </div>
      <div className="chips" style={{ marginBottom: 8 }}>
        {PRIORITIES.map((p) => <Chip key={p} color="wine" on={prio === p} onClick={() => setPrio(prio === p ? '' : p)}>{{ alta: 'Alta', media: 'Média', baixa: 'Baixa' }[p]}</Chip>)}
      </div>
      <div className="list">
        {list.map((t) => (
          <div key={t.id} className="row-item">
            <div className="grow">
              <div className="t">{t.title}</div>
              <div className="s">{cats?.find((c) => c.id === t.categoryId)?.name}{t.plannedDate ? `. Escolhida para ${shortLabel(t.plannedDate)}` : ''}</div>
            </div>
            <span className={`prio ${t.priority}`}>{prioLabel(cats, t)}</span>
            <button className="btn btn-ink btn-sm" onClick={async () => { await planTask(t, date); onClose(); }} aria-label={`Adicionar ${t.title}`}>Adicionar</button>
          </div>
        ))}
        {list.length === 0 && <Empty art={<ArtLeaf />} text={q ? 'Nada encontrado com essa busca.' : 'Nenhuma tarefa pendente com esses filtros.'} />}
      </div>
    </Sheet>
  );
}

/* ---------- Criar e editar tarefa ---------- */
const MODES: { id: ExecMode; label: string }[] = [
  { id: 'celular', label: 'No celular' }, { id: 'computador', label: 'No computador' },
  { id: 'em_casa', label: 'Em casa' }, { id: 'na_rua', label: 'Na rua' }, { id: 'presencial', label: 'Presencial' }
];
const MINUTES = [10, 15, 30, 60, 120];

export function TaskSheet({ open, onClose, task, defaults }: { open: boolean; onClose: () => void; task?: Task; defaults?: Partial<Task> }) {
  const cats = useAll('category');
  const settings = useSettings();
  const date = useApp((s) => s.date);
  const [d, setD] = useState<Partial<Task>>({});
  const [more, setMore] = useState(false);
  const [newSub, setNewSub] = useState('');
  const [newTag, setNewTag] = useState('');
  const [confirmEl, ask] = useConfirm();
  useEffect(() => {
    if (open) {
      setD(task ? { ...task } : { title: '', categoryId: 'cat:compras', priority: 'media', status: 'pendente', tags: [], subtasks: [], history: [], plannedDate: null, ...defaults });
      setMore(false);
    }
  }, [open, task?.id]);
  const set = (p: Partial<Task>) => setD((x) => ({ ...x, ...p }));
  const cat = cats?.find((c) => c.id === d.categoryId);
  const save = async () => {
    if (!d.title?.trim()) { toast('Dê um nome à tarefa.', undefined, 'error'); return; }
    if (task) {
      await withUndo(task.id, 'Tarefa salva', () => update<'task'>(task.id, { ...d, title: d.title!.trim() }));
    } else {
      await create('task', { ...(d as Task), title: d.title!.trim(), history: [{ at: Date.now(), text: 'Criada' }] });
      toast('Tarefa criada');
    }
    onClose();
  };
  const del = async () => {
    if (!task) return;
    const ok = await ask({ title: 'Excluir esta tarefa?', text: 'Ela some das listas e dos dias. Você pode desfazer logo em seguida.', ok: 'Excluir', danger: true });
    if (!ok) return;
    await deleteRecord(task.id, 'Tarefa excluída');
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={task ? 'Tarefa' : 'Nova tarefa'} testId="task-sheet"
      footer={<>
        {task && <button className="btn btn-soft" style={{ flex: '0 0 auto' }} aria-label="Excluir" onClick={del}><Trash2 size={18} /></button>}
        <button className="btn btn-ink" onClick={save} data-testid="task-save">Salvar</button>
      </>}>
      <input value={d.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="O que é?" aria-label="Título" autoFocus={!task} />
      <span className="label">Categoria</span>
      <div className="chips">
        {cats?.filter((c) => !c.archived).sort((a, b) => a.order - b.order).map((c) => <Chip key={c.id} on={d.categoryId === c.id} onClick={() => set({ categoryId: c.id, subcategory: undefined })}>{c.name}</Chip>)}
      </div>
      {cat && cat.subcategories.length > 0 && (
        <div className="chips" style={{ marginTop: 8 }}>
          {cat.subcategories.map((s) => <Chip key={s} on={d.subcategory === s} onClick={() => set({ subcategory: d.subcategory === s ? undefined : s })}>{s}</Chip>)}
        </div>
      )}
      <span className="label">Prioridade</span>
      <Seg value={d.priority ?? 'media'} onChange={(v) => set({ priority: v })} options={PRIORITIES.map((p) => ({ id: p, label: cat?.labels[p] ?? p }))} label="Prioridade" />
      <span className="label">Dia em que pretendo fazer</span>
      <div className="chips">
        <Chip on={!d.plannedDate} onClick={() => set({ plannedDate: null })}>Sem dia</Chip>
        <Chip on={d.plannedDate === date} onClick={() => set({ plannedDate: date })}>{shortLabel(date)}</Chip>
        <label className="chip" style={{ position: 'relative' }}>
          {d.plannedDate && d.plannedDate !== date ? shortLabel(d.plannedDate) : 'Outro dia'}
          <input type="date" value={d.plannedDate ?? ''} onChange={(e) => set({ plannedDate: e.target.value || null })} style={{ position: 'absolute', inset: 0, opacity: 0, minHeight: 0 }} aria-label="Escolher outro dia" />
        </label>
      </div>
      {task && (
        <>
          <span className="label">Situação</span>
          <Seg<TaskStatus> value={d.status ?? 'pendente'} onChange={(v) => set({ status: v, completedDate: v === 'concluida' ? (d.completedDate ?? date) : null })}
            options={[{ id: 'pendente', label: 'Pendente' }, { id: 'concluida', label: 'Concluída' }, { id: 'arquivada', label: 'Arquivada' }]} />
        </>
      )}
      <span className="label">Próximo passo <span className="muted small">(opcional)</span></span>
      <input value={d.nextStep ?? ''} onChange={(e) => set({ nextStep: e.target.value })} placeholder="Ex.: pedir orçamento" aria-label="Próximo passo" />

      {!more && <button className="link" onClick={() => setMore(true)}>Mais detalhes</button>}
      {more && (
        <>
          <span className="label">Tempo estimado</span>
          <div className="chips">{MINUTES.map((m) => <Chip key={m} on={d.minutes === m} onClick={() => set({ minutes: d.minutes === m ? undefined : m })}>{m < 60 ? `${m} min` : `${m / 60} h`}</Chip>)}</div>
          <span className="label">Onde dá para fazer</span>
          <div className="chips">{MODES.map((m) => <Chip key={m.id} on={d.mode === m.id} onClick={() => set({ mode: d.mode === m.id ? undefined : m.id })}>{m.label}</Chip>)}</div>
          <span className="label">Responsável</span>
          <div className="chips">{(settings?.owners ?? ['Eu']).map((o) => <Chip key={o} on={d.owner === o} onClick={() => set({ owner: d.owner === o ? undefined : o })}>{o}</Chip>)}</div>
          <div className="row" style={{ gap: 10 }}>
            <div className="grow"><span className="label">Custo estimado (R$)</span><input inputMode="decimal" value={d.costEst ?? ''} onChange={(e) => set({ costEst: e.target.value ? Number(e.target.value.replace(',', '.')) : undefined })} aria-label="Custo estimado" /></div>
            <div className="grow"><span className="label">Custo real (R$)</span><input inputMode="decimal" value={d.costReal ?? ''} onChange={(e) => set({ costReal: e.target.value ? Number(e.target.value.replace(',', '.')) : undefined })} aria-label="Custo real" /></div>
          </div>
          {d.categoryId === 'cat:compromissos' && (
            <>
              <span className="label">Data marcada do compromisso</span>
              <input type="date" value={d.appointmentDate ?? ''} onChange={(e) => set({ appointmentDate: e.target.value || undefined })} aria-label="Data do compromisso" />
              <span className="label">Etapa</span>
              <div className="chips">{['Agendar', 'Agendado', 'Realizar', 'Realizado'].map((s) => <Chip key={s} on={d.stage === s} onClick={() => set({ stage: d.stage === s ? undefined : s })}>{s}</Chip>)}</div>
            </>
          )}
          {d.categoryId === 'cat:projetos' && (
            <>
              <span className="label">Etapa</span>
              <div className="chips">{['Ideia', 'Planejando', 'Em andamento', 'Finalizando'].map((s) => <Chip key={s} on={d.stage === s} onClick={() => set({ stage: d.stage === s ? undefined : s })}>{s}</Chip>)}</div>
            </>
          )}
          <span className="label">Subtarefas</span>
          {(d.subtasks ?? []).map((s) => (
            <div key={s.id} className="row-item">
              <Check on={s.done} label={s.title} onToggle={() => set({ subtasks: d.subtasks!.map((x) => x.id === s.id ? { ...x, done: !x.done } : x) })} />
              <span className="grow">{s.title}</span>
              <button className="icon-btn" aria-label="Remover subtarefa" onClick={() => set({ subtasks: d.subtasks!.filter((x) => x.id !== s.id) })}><Trash2 size={18} /></button>
            </div>
          ))}
          <div className="row"><input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Nova subtarefa" aria-label="Nova subtarefa" />
            <button className="btn btn-soft" aria-label="Adicionar subtarefa" onClick={() => { if (newSub.trim()) { set({ subtasks: [...(d.subtasks ?? []), { id: uid(), title: newSub.trim(), done: false }] }); setNewSub(''); } }}><Plus size={18} /></button></div>
          <span className="label">Etiquetas</span>
          <div className="chips" style={{ marginBottom: 8 }}>{(d.tags ?? []).map((t) => <Chip key={t} on onClick={() => set({ tags: d.tags!.filter((x) => x !== t) })}>{t} <span className="x">✕</span></Chip>)}</div>
          <div className="row"><input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Nova etiqueta" aria-label="Nova etiqueta" />
            <button className="btn btn-soft" aria-label="Adicionar etiqueta" onClick={() => { const v = newTag.trim().toLowerCase(); if (v && !(d.tags ?? []).includes(v)) set({ tags: [...(d.tags ?? []), v] }); setNewTag(''); }}><Plus size={18} /></button></div>
          <span className="label">Descrição</span>
          <textarea value={d.description ?? ''} onChange={(e) => set({ description: e.target.value })} aria-label="Descrição" />
          {task && task.history?.length > 0 && (
            <>
              <span className="label">Histórico</span>
              {task.history.slice(-6).reverse().map((h, i) => <div key={i} className="small muted">{new Date(h.at).toLocaleDateString('pt-BR')}: {h.text}</div>)}
            </>
          )}
        </>
      )}
      {confirmEl}
    </Sheet>
  );
}
