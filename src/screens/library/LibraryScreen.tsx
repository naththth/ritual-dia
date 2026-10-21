import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { planFor } from '../../domain/rules';
import { Plus, Search, Star, Trash2, Archive, ArchiveRestore, Sparkles } from 'lucide-react';
import { aiAvailable, aiProductInfo } from '../../domain/ai';
import { PageHead } from '../common';
import { useAll } from '../../db/hooks';
import { create, db, remove, update, uid } from '../../db/db';
import { Chip, Seg, Sheet, Empty, useConfirm } from '../../ui/ui';
import { ProductForm, STATUS_LABEL } from './ProductForm';
import { FoodForm } from './FoodForm';
import { GROUPS } from '../../domain/defaults';
import { LIBRARY } from '../ListsScreen';
import { toast } from '../../state/store';
import type { AnyRecord, Category, Goal, GoalType, Habit, HabitFreq, Intensity, MealItem, MealTemplate, Modality, ModalityExtra, Priority, ProductGroup, ProductStatus, WorkoutTemplate } from '../../db/types';
import { PRIORITIES } from '../../db/types';
import { useApp } from '../../state/store';
import { useByRange } from '../../db/hooks';
import { addDays, shortLabel, todayKey } from '../../lib/dates';

/** Quantos registros históricos usam este item (para proteger contra exclusão acidental). */
async function usage(id: string): Promise<number> {
  const rows = await db.records.toArray();
  return rows.filter((r: any) => !r.deleted && r.id !== id && (
    r.productIds?.includes(id) || r.items?.some((i: MealItem) => i.foodId === id) || r.modalityId === id ||
    r.habitId === id || r.goalId === id || r.categoryId === id || r.templateId === id
  )).length;
}

function useDelete() {
  const [el, ask] = useConfirm();
  const run = async (rec: AnyRecord, name: string, onDone: () => void) => {
    const n = await usage(rec.id);
    if (n > 0) {
      const ok = await ask({ title: `Arquivar "${name}"?`, text: `Este item aparece em ${n} ${n === 1 ? 'registro' : 'registros'} do seu histórico. Para não perder esse histórico, ele será arquivado: some das listas de escolha, mas os dias passados continuam intactos.`, ok: 'Arquivar' });
      if (!ok) return;
      await update(rec.id, rec.kind === 'product' ? { status: 'arquivado' } as any : rec.kind === 'goal' ? { status: 'arquivada' } as any : { archived: true } as any);
      toast('Arquivado');
    } else {
      const ok = await ask({ title: `Excluir "${name}"?`, text: 'Não há registros usando este item.', ok: 'Excluir', danger: true });
      if (!ok) return;
      await remove(rec.id);
      toast('Excluído');
    }
    onDone();
  };
  return [el, run] as const;
}

export function LibraryScreen() {
  const { section = '' } = useParams();
  const meta = LIBRARY.find((l) => l.id === section);
  const body: Record<string, ReactNode> = {
    produtos: <Products />, alimentos: <Foods />, refeicoes: <MealTemplates />, modalidades: <Modalities />,
    treinos: <WorkoutTemplates />, habitos: <Habits />, metas: <Goals />, categorias: <Categories />
  };
  return (
    <div className="screen no-nav" data-testid={`library-${section}`}>
      <PageHead title={meta?.label ?? 'Biblioteca'} withDate={false} />
      {body[section] ?? <Empty text="Seção não encontrada." />}
    </div>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return <button className="btn btn-ink btn-block" style={{ margin: '4px 0 12px' }} onClick={onClick} data-testid="lib-add"><Plus size={18} />{label}</button>;
}

function ArchToggle({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return <button className="link" onClick={() => set(!on)}>{on ? 'Ocultar arquivados' : 'Mostrar arquivados'}</button>;
}

/* ---------------- Produtos ---------------- */
export function Products() {
  const products = useAll('product');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<ProductGroup | ''>('');
  const [status, setStatus] = useState<ProductStatus | ''>('');
  const [edit, setEdit] = useState<any>(null);
  const [delEl, del] = useDelete();
  const list = (products ?? [])
    .filter((p) => (!group || p.group === group) && (!status ? p.status !== 'arquivado' : p.status === status))
    .filter((p) => !q || `${p.brand} ${p.name}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
  return (
    <>
      <AddButton label="Cadastrar produto" onClick={() => setEdit({})} />
      <FillProductInfo />
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--ink-2)' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto" style={{ paddingLeft: 40 }} aria-label="Buscar produto" />
      </div>
      <div className="chips scroll">{GROUPS.map((g) => <Chip key={g.id} color="rose" on={group === g.id} onClick={() => setGroup(group === g.id ? '' : g.id)}>{g.label}</Chip>)}</div>
      <div className="chips scroll" style={{ marginTop: 8 }}>{(Object.keys(STATUS_LABEL) as ProductStatus[]).map((s) => <Chip key={s} on={status === s} onClick={() => setStatus(status === s ? '' : s)}>{STATUS_LABEL[s]}</Chip>)}</div>
      <div className="list" style={{ marginTop: 8 }}>
        {list.map((p) => (
          <button key={p.id} className="lib-item" onClick={() => setEdit(p)}>
            <span className="grow"><span className="tiny muted" style={{ fontWeight: 600 }}>{p.brand}</span><br /><span style={{ fontWeight: 650 }}>{p.name}</span>{p.info?.purpose && <><br /><span className="small muted clamp2">{p.info.purpose}</span></>}</span>
            <span className={`prio ${p.status === 'em_uso' ? 'media' : 'baixa'}`}>{STATUS_LABEL[p.status]}</span>
          </button>
        ))}
      </div>
      {list.length === 0 && <Empty text="Nenhum produto com esse filtro." />}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar produto' : 'Novo produto'}
        footer={edit?.id ? <button className="btn btn-danger" onClick={() => del(edit, edit.name, () => setEdit(null))}><Trash2 size={18} />Excluir ou arquivar</button> : undefined}>
        {edit && <ProductForm product={edit.id ? edit : undefined} onDone={() => setEdit(null)} />}
      </Sheet>
      {delEl}
    </>
  );
}

/* ---------------- Alimentos ---------------- */
export function Foods() {
  const foods = useAll('food');
  const [arch, setArch] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [delEl, del] = useDelete();
  const list = (foods ?? []).filter((f) => !!f.archived === arch).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  return (
    <>
      <AddButton label="Cadastrar alimento" onClick={() => setEdit({})} />
      <ArchToggle on={arch} set={setArch} />
      {list.map((f) => (
        <div key={f.id} className="lib-item">
          <button className="icon-btn" aria-label={f.favorite ? 'Tirar dos favoritos' : 'Favoritar'} onClick={() => update<'food'>(f.id, { favorite: !f.favorite })}><Star size={20} fill={f.favorite ? 'var(--honey-2)' : 'none'} /></button>
          <button className="grow tap" onClick={() => setEdit(f)}><span style={{ fontWeight: 650 }}>{f.name}</span><br /><span className="small muted">{f.type}. Porções: {f.portions.join(', ')}</span></button>
          {arch && <button className="icon-btn" aria-label="Restaurar" onClick={() => update<'food'>(f.id, { archived: false })}><ArchiveRestore size={20} /></button>}
        </div>
      ))}
      {list.length === 0 && <Empty text={arch ? 'Nenhum alimento arquivado.' : 'Nenhum alimento cadastrado.'} />}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar alimento' : 'Novo alimento'}
        footer={edit?.id ? <button className="btn btn-danger" onClick={() => del(edit, edit.name, () => setEdit(null))}><Trash2 size={18} />Excluir ou arquivar</button> : undefined}>
        {edit && <FoodForm food={edit.id ? edit : undefined} onDone={() => setEdit(null)} />}
      </Sheet>
      {delEl}
    </>
  );
}

/* ---------------- Refeições favoritas ---------------- */
export function MealTemplates() {
  const tmpls = useAll('mtemplate');
  const foods = useAll('food');
  const [edit, setEdit] = useState<Partial<MealTemplate> | null>(null);
  const [delEl, del] = useDelete();
  const save = async () => {
    if (!edit?.name?.trim() || !edit.items?.length) { toast('Dê um nome e escolha alimentos.', undefined, 'error'); return; }
    if (edit.id) await update<'mtemplate'>(edit.id, edit); else await create('mtemplate', edit as MealTemplate);
    toast('Refeição favorita salva'); setEdit(null);
  };
  return (
    <>
      <AddButton label="Nova refeição favorita" onClick={() => setEdit({ name: '', items: [] })} />
      {(tmpls ?? []).filter((t) => !t.archived).map((t) => (
        <button key={t.id} className="lib-item" onClick={() => setEdit(t)}>
          <span className="grow"><span style={{ fontWeight: 650 }}>{t.name}</span><br /><span className="small muted">{t.items.map((i) => `${foods?.find((f) => f.id === i.foodId)?.name ?? '?'} ${i.portion}`).join(', ')}</span></span>
        </button>
      ))}
      {(tmpls ?? []).length === 0 && <Empty text="Salve combinações que você repete, como o almoço de sempre." />}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar refeição' : 'Nova refeição favorita'}
        footer={<>{edit?.id && <button className="btn btn-soft" style={{ flex: '0 0 auto' }} aria-label="Excluir" onClick={() => del(edit as any, edit!.name!, () => setEdit(null))}><Trash2 size={18} /></button>}<button className="btn btn-ink" onClick={save}>Salvar</button></>}>
        {edit && (
          <>
            <input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Nome, ex.: Meu almoço de sempre" aria-label="Nome" />
            <span className="label">Alimentos</span>
            <div className="chips">
              {(foods ?? []).filter((f) => !f.archived).map((f) => {
                const on = edit.items?.some((i) => i.foodId === f.id);
                return <Chip key={f.id} color="honey" on={on} onClick={() => setEdit({ ...edit, items: on ? edit.items!.filter((i) => i.foodId !== f.id) : [...(edit.items ?? []), { foodId: f.id, portion: 'M' }] })}>{f.name}</Chip>;
              })}
            </div>
            {edit.items?.map((i) => {
              const f = foods?.find((x) => x.id === i.foodId);
              return (
                <div key={i.foodId} className="row between" style={{ minHeight: 48 }}>
                  <span style={{ fontWeight: 650 }}>{f?.name}</span>
                  <div className="portion">{(f?.portions ?? ['P', 'M', 'G']).map((p) => <button key={p} className={i.portion === p ? 'on' : ''} onClick={() => setEdit({ ...edit, items: edit.items!.map((x) => x.foodId === i.foodId ? { ...x, portion: p } : x) })}>{p}</button>)}</div>
                </div>
              );
            })}
          </>
        )}
      </Sheet>
      {delEl}
    </>
  );
}

/* ---------------- Modalidades ---------------- */
export function Modalities() {
  const mods = useAll('modality');
  const [arch, setArch] = useState(false);
  const [edit, setEdit] = useState<Partial<Modality> | null>(null);
  const [delEl, del] = useDelete();
  const save = async () => {
    if (!edit?.name?.trim()) return;
    if (edit.id) await update<'modality'>(edit.id, edit); else await create('modality', { ...edit, order: 50 } as Modality);
    toast('Modalidade salva'); setEdit(null);
  };
  const extras: { id: string; label: string; v: ModalityExtra }[] = [
    { id: 'none', label: 'Só duração', v: null }, { id: 'distance', label: 'Distância', v: 'distance' }, { id: 'muscle', label: 'Grupo muscular', v: 'muscle' }, { id: 'combo', label: 'Combinação', v: 'combo' }, { id: 'rest', label: 'Descanso', v: 'rest' }
  ];
  return (
    <>
      <AddButton label="Nova modalidade" onClick={() => setEdit({ name: '', extra: null })} />
      <ArchToggle on={arch} set={setArch} />
      {(mods ?? []).filter((m) => !!m.archived === arch).sort((a, b) => a.order - b.order).map((m) => (
        <div key={m.id} className="lib-item">
          <button className="grow tap" onClick={() => setEdit(m)} style={{ fontWeight: 650 }}>{m.name}</button>
          {arch && <button className="icon-btn" aria-label="Restaurar" onClick={() => update<'modality'>(m.id, { archived: false })}><ArchiveRestore size={20} /></button>}
        </div>
      ))}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Modalidade"
        footer={<>{edit?.id && <button className="btn btn-soft" style={{ flex: '0 0 auto' }} aria-label="Excluir" onClick={() => del(edit as any, edit!.name!, () => setEdit(null))}><Archive size={18} /></button>}<button className="btn btn-ink" onClick={save}>Salvar</button></>}>
        {edit && (
          <>
            <input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Nome" aria-label="Nome" />
            <span className="label">Campo extra no registro</span>
            <div className="chips">{extras.map((x) => <Chip key={x.id} color="blue" on={(edit.extra ?? null) === x.v} onClick={() => setEdit({ ...edit, extra: x.v })}>{x.label}</Chip>)}</div>
          </>
        )}
      </Sheet>
      {delEl}
    </>
  );
}

/* ---------------- Treinos-modelo ---------------- */
export function WorkoutTemplates() {
  const tmpls = useAll('wtemplate');
  const mods = useAll('modality');
  const plans = useAll('plan');
  const [edit, setEdit] = useState<Partial<WorkoutTemplate> | null>(null);
  const plan = planFor(plans ?? [], 'training', todayKey());
  const DOW = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  const daysOf = (id: string) => Object.entries(plan?.training ?? {}).filter(([, ids]) => ids.includes(id)).map(([d]) => DOW[Number(d)]);
  const nav = useNavigate();
  const [delEl, del] = useDelete();
  const save = async () => {
    if (!edit?.name?.trim() || !edit.modalityId) { toast('Dê um nome e escolha a modalidade.', undefined, 'error'); return; }
    if (edit.id) await update<'wtemplate'>(edit.id, edit); else await create('wtemplate', edit as WorkoutTemplate);
    toast('Sessão salva'); setEdit(null);
  };
  return (
    <>
      <p className="small" style={{ margin: '0 0 12px' }} data-testid="wt-intro">Cada sessão é um treino pronto: o que fazer, quanto tempo e em que intensidade. O <button className="link" style={{ minHeight: 0, padding: 0 }} onClick={() => nav('/treino/plano')}>Plano de treino</button> distribui as sessões pelos dias da semana; no dia, a sessão aparece em Treino com os exercícios e você marca como feita com um toque. Aqui você muda o conteúdo; lá, o dia.</p>
      <AddButton label="Nova sessão" onClick={() => setEdit({ name: '', duration: 45, intensity: 'moderada' })} />
      {(tmpls ?? []).filter((t) => !t.archived).map((t) => {
        const ds = daysOf(t.id);
        return (
          <button key={t.id} className="lib-item" onClick={() => setEdit(t)}>
            <span className="grow"><span style={{ fontWeight: 650 }}>{t.name}</span><br />
              <span className="small muted">{mods?.find((m) => m.id === t.modalityId)?.name}, {t.duration} min, {t.intensity}</span><br />
              <span className="small" style={{ fontWeight: 650 }}>{ds.length ? `No plano: ${ds.join(', ')}` : 'Fora do plano da semana'}</span></span>
          </button>
        );
      })}
      {(tmpls ?? []).length === 0 && <Empty text="Crie sessões como Musculação corpo todo 35 min ou Pedal Z2 60 min. Elas montam o plano de treino." />}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Sessão de treino"
        footer={<>{edit?.id && <button className="btn btn-soft" style={{ flex: '0 0 auto' }} aria-label="Excluir" onClick={() => del(edit as any, edit!.name!, () => setEdit(null))}><Trash2 size={18} /></button>}<button className="btn btn-ink" onClick={save} data-testid="wt-save">Salvar</button></>}>
        {edit && (
          <>
            <input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Nome, ex.: Treino de força" aria-label="Nome do treino" />
            <span className="label">Modalidade</span>
            <div className="chips">{(mods ?? []).filter((m) => !m.archived && m.extra !== 'rest').map((m) => <Chip key={m.id} color="blue" on={edit.modalityId === m.id} onClick={() => setEdit({ ...edit, modalityId: m.id, name: edit.name || m.name })}>{m.name}</Chip>)}</div>
            <span className="label">Duração</span>
            <div className="chips">{[15, 20, 30, 45, 60, 90, 120].map((d) => <Chip key={d} color="blue" on={edit.duration === d} onClick={() => setEdit({ ...edit, duration: d })}>{d} min</Chip>)}</div>
            <span className="label">Intensidade</span>
            <Seg<Intensity> value={edit.intensity ?? 'moderada'} onChange={(v) => setEdit({ ...edit, intensity: v })} options={[{ id: 'leve', label: 'Leve' }, { id: 'moderada', label: 'Moderada' }, { id: 'intensa', label: 'Intensa' }]} />
            <span className="label">Exercícios e como fazer</span>
            <textarea rows={9} value={edit.note ?? ''} onChange={(e) => setEdit({ ...edit, note: e.target.value || undefined })} aria-label="Exercícios e como fazer" data-testid="wt-note"
              placeholder={'1. Agachamento goblet 3x8-12\n2. Remada baixa 3x8-12\n…'} />
            {edit.steps?.length ? <><span className="label">Blocos do pedal</span><p className="small" style={{ margin: 0 }}>{edit.steps.map((x) => `${x.label} ${x.minutes} min a ${x.pct}% do FTP`).join(' · ')}</p></> : null}
          </>
        )}
      </Sheet>
      {delEl}
    </>
  );
}

/* ---------------- Hábitos ---------------- */
export function Habits() {
  const habits = useAll('habit');
  const mods = useAll('modality');
  const [arch, setArch] = useState(false);
  const [edit, setEdit] = useState<Partial<Habit> | null>(null);
  const [delEl, del] = useDelete();
  const date = useApp((s) => s.date);
  const logs = useByRange('hlog', addDays(date, -27), date);
  const save = async () => {
    if (!edit?.title?.trim()) return;
    if (edit.id) await update<'habit'>(edit.id, edit); else await create('habit', { ...edit, order: (habits?.length ?? 0) + 1 } as Habit);
    toast('Hábito salvo'); setEdit(null);
  };
  const freqs: { id: HabitFreq; label: string }[] = [{ id: 'diaria', label: 'Diário' }, { id: 'semanal', label: 'Por semana' }, { id: 'mensal', label: 'Por mês' }];
  return (
    <>
      <AddButton label="Novo hábito" onClick={() => setEdit({ title: '', freq: 'diaria', target: 1, priority: 'media' })} />
      <ArchToggle on={arch} set={setArch} />
      {(habits ?? []).filter((h) => !!h.archived === arch).sort((a, b) => a.order - b.order).map((h) => (
        <div key={h.id} className="lib-item">
          <button className="grow tap" onClick={() => setEdit(h)}>
            <span style={{ fontWeight: 650 }}>{h.title}</span><br />
            <span className="small muted">{h.freq === 'diaria' ? 'Diário' : `${h.target}x ${h.freq === 'semanal' ? 'por semana' : 'por mês'}, sem dias fixos`}{h.modalityId ? `. Conta com treinos de ${mods?.find((m) => m.id === h.modalityId)?.name}` : ''}. {logs?.filter((l) => l.habitId === h.id && l.done).length ?? 0} marcações em 4 semanas</span>
          </button>
          {arch && <button className="icon-btn" aria-label="Restaurar" onClick={() => update<'habit'>(h.id, { archived: false })}><ArchiveRestore size={20} /></button>}
        </div>
      ))}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Hábito"
        footer={<>{edit?.id && <button className="btn btn-soft" style={{ flex: '0 0 auto' }} aria-label="Excluir" onClick={() => del(edit as any, edit!.title!, () => setEdit(null))}><Trash2 size={18} /></button>}<button className="btn btn-ink" onClick={save}>Salvar</button></>}>
        {edit && (
          <>
            <input value={edit.title ?? ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Nome do hábito" aria-label="Nome do hábito" />
            <span className="label">Frequência</span>
            <Seg<HabitFreq> value={edit.freq ?? 'diaria'} onChange={(v) => setEdit({ ...edit, freq: v })} options={freqs} />
            {edit.freq !== 'diaria' && (
              <>
                <span className="label">Quantas vezes</span>
                <div className="chips">{[1, 2, 3, 4, 5, 6].map((n) => <Chip key={n} color="olive" on={edit.target === n} onClick={() => setEdit({ ...edit, target: n })}>{n}x</Chip>)}</div>
              </>
            )}
            <span className="label">Conta automaticamente com treino de</span>
            <div className="chips">
              <Chip on={!edit.modalityId} onClick={() => setEdit({ ...edit, modalityId: undefined })}>Nenhum</Chip>
              {(mods ?? []).filter((m) => !m.archived && m.extra !== 'rest').map((m) => <Chip key={m.id} color="blue" on={edit.modalityId === m.id} onClick={() => setEdit({ ...edit, modalityId: m.id })}>{m.name}</Chip>)}
            </div>
            <p className="field-hint">Treino e marcação no mesmo dia contam uma vez só.</p>
          </>
        )}
      </Sheet>
      {delEl}
    </>
  );
}

/* ---------------- Metas ---------------- */
export function Goals() {
  const goals = useAll('goal');
  const entries = useAll('gentry');
  const [edit, setEdit] = useState<Partial<Goal> | null>(null);
  const [ms, setMs] = useState('');
  const [delEl, del] = useDelete();
  const save = async () => {
    if (!edit?.title?.trim()) return;
    if (edit.id) await update<'goal'>(edit.id, edit); else await create('goal', { milestones: [], status: 'ativa', ...edit } as Goal);
    toast('Meta salva'); setEdit(null);
  };
  const types: { id: GoalType; label: string }[] = [{ id: 'quantitativa', label: 'Número' }, { id: 'financeira', label: 'Dinheiro' }, { id: 'marcos', label: 'Marcos' }, { id: 'frequencia', label: 'Frequência' }];
  const num = (v: string) => (v === '' ? undefined : Number(v.replace(',', '.')));
  return (
    <>
      <p className="small" style={{ margin: '0 0 12px' }}>Objetivo de peso fica em <a className="link" href="#/peso" style={{ minHeight: 0, display: 'inline' }}>Peso</a>, onde o app acompanha as pesagens e calcula ritmo e previsão.</p>
      <AddButton label="Nova meta" onClick={() => setEdit({ title: '', type: 'quantitativa', milestones: [], status: 'ativa' })} />
      {(goals ?? []).filter((g) => g.status !== 'arquivada').map((g) => {
        const es = (entries ?? []).filter((e) => e.goalId === g.id).sort((a, b) => (a.date < b.date ? 1 : -1));
        return (
          <button key={g.id} className="lib-item" onClick={() => setEdit(g)}>
            <span className="grow"><span style={{ fontWeight: 650 }}>{g.title}</span><br />
              <span className="small muted">{g.type === 'marcos' ? `${g.milestones.filter((m) => m.done).length} de ${g.milestones.length} marcos` : es[0] ? `Última medida: ${es[0].value} ${g.unit ?? ''} em ${shortLabel(es[0].date)}` : 'Sem medidas ainda'}{g.status === 'concluida' ? '. Concluída' : ''}</span></span>
          </button>
        );
      })}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Meta"
        footer={<>{edit?.id && <button className="btn btn-soft" style={{ flex: '0 0 auto' }} aria-label="Excluir" onClick={() => del(edit as any, edit!.title!, () => setEdit(null))}><Archive size={18} /></button>}<button className="btn btn-ink" onClick={save}>Salvar</button></>}>
        {edit && (
          <>
            <input value={edit.title ?? ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Nome da meta" aria-label="Nome da meta" />
            <span className="label">Tipo</span>
            <div className="chips">{types.map((t) => <Chip key={t.id} on={edit.type === t.id} onClick={() => setEdit({ ...edit, type: t.id })}>{t.label}</Chip>)}</div>
            {(edit.type === 'quantitativa' || edit.type === 'financeira') && (
              <>
                <div className="row" style={{ gap: 10 }}>
                  <div className="grow"><span className="label">Unidade</span><input value={edit.unit ?? (edit.type === 'financeira' ? 'R$' : '')} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} aria-label="Unidade" /></div>
                  <div className="grow"><span className="label">Início <span className="muted small">(opc.)</span></span><input inputMode="decimal" value={edit.startValue ?? ''} onChange={(e) => setEdit({ ...edit, startValue: num(e.target.value) })} aria-label="Valor inicial" /></div>
                  <div className="grow"><span className="label">Alvo <span className="muted small">(opc.)</span></span><input inputMode="decimal" value={edit.targetValue ?? ''} onChange={(e) => setEdit({ ...edit, targetValue: num(e.target.value) })} aria-label="Valor alvo" /></div>
                </div>
              </>
            )}
            {edit.type === 'marcos' && (
              <>
                <span className="label">Marcos</span>
                {edit.milestones?.map((m) => (
                  <div key={m.id} className="row-item">
                    <button className={`check ${m.done ? 'on' : ''}`} aria-label={m.title} onClick={() => setEdit({ ...edit, milestones: edit.milestones!.map((x) => x.id === m.id ? { ...x, done: !x.done, doneDate: !x.done ? todayKey() : undefined } : x) })}>{m.done && '✓'}</button>
                    <span className="grow">{m.title}</span>
                  </div>
                ))}
                <div className="row"><input value={ms} onChange={(e) => setMs(e.target.value)} placeholder="Novo marco" aria-label="Novo marco" />
                  <button className="btn btn-soft" onClick={() => { if (ms.trim()) { setEdit({ ...edit, milestones: [...(edit.milestones ?? []), { id: uid(), title: ms.trim(), done: false }] }); setMs(''); } }}><Plus size={18} /></button></div>
              </>
            )}
            <span className="label">Prazo <span className="muted small">(opcional)</span></span>
            <input type="date" value={edit.deadline ?? ''} onChange={(e) => setEdit({ ...edit, deadline: e.target.value || undefined })} aria-label="Prazo" />
            <span className="label">Situação</span>
            <div className="chips">{(['ativa', 'concluida', 'arquivada'] as const).map((s) => <Chip key={s} on={edit.status === s} onClick={() => setEdit({ ...edit, status: s })}>{{ ativa: 'Ativa', concluida: 'Concluída', arquivada: 'Arquivada' }[s]}</Chip>)}</div>
            <span className="label">Observação</span>
            <textarea value={edit.note ?? ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} aria-label="Observação" />
            {edit.id && (entries ?? []).some((e) => e.goalId === edit.id) && (
              <>
                <span className="label">Medidas</span>
                {(entries ?? []).filter((e) => e.goalId === edit.id).sort((a, b) => (a.date < b.date ? 1 : -1)).map((e) => (
                  <div key={e.id} className="row-item"><span className="grow num">{shortLabel(e.date)}: {e.value} {edit.unit}</span>
                    <button className="icon-btn" aria-label="Excluir medida" onClick={() => remove(e.id)}><Trash2 size={18} /></button></div>
                ))}
              </>
            )}
          </>
        )}
      </Sheet>
      {delEl}
    </>
  );
}

/* ---------------- Categorias ---------------- */
export function Categories() {
  const cats = useAll('category');
  const [edit, setEdit] = useState<Partial<Category> | null>(null);
  const [sub, setSub] = useState('');
  const [delEl, del] = useDelete();
  const save = async () => {
    if (!edit?.name?.trim()) return;
    if (edit.id) await update<'category'>(edit.id, edit); else await create('category', { subcategories: [], order: (cats?.length ?? 0) + 1, ...edit } as Category);
    toast('Categoria salva'); setEdit(null);
  };
  return (
    <>
      <AddButton label="Nova categoria" onClick={() => setEdit({ name: '', labels: { alta: 'Alta', media: 'Média', baixa: 'Baixa' }, subcategories: [] })} />
      {(cats ?? []).filter((c) => !c.archived).sort((a, b) => a.order - b.order).map((c) => (
        <button key={c.id} className="lib-item" onClick={() => setEdit(c)}>
          <span className="grow"><span style={{ fontWeight: 650 }}>{c.name}</span><br /><span className="small muted">Prioridades: {PRIORITIES.map((p) => c.labels[p]).join(', ')}{c.subcategories.length ? `. Subcategorias: ${c.subcategories.join(', ')}` : ''}</span></span>
        </button>
      ))}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Categoria"
        footer={<>{edit?.id && <button className="btn btn-soft" style={{ flex: '0 0 auto' }} aria-label="Excluir" onClick={() => del(edit as any, edit!.name!, () => setEdit(null))}><Archive size={18} /></button>}<button className="btn btn-ink" onClick={save}>Salvar</button></>}>
        {edit && (
          <>
            <input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Nome" aria-label="Nome da categoria" />
            <span className="label">Nomes das prioridades nesta categoria</span>
            {PRIORITIES.map((p: Priority) => (
              <div key={p} className="row" style={{ marginBottom: 8 }}>
                <span className={`prio ${p}`} style={{ width: 64, textAlign: 'center' }}>{{ alta: 'Alta', media: 'Média', baixa: 'Baixa' }[p]}</span>
                <input value={edit.labels?.[p] ?? ''} onChange={(e) => setEdit({ ...edit, labels: { ...(edit.labels as any), [p]: e.target.value } })} aria-label={`Rótulo ${p}`} />
              </div>
            ))}
            <span className="label">Subcategorias</span>
            <div className="chips" style={{ marginBottom: 8 }}>{edit.subcategories?.map((s) => <Chip key={s} on onClick={() => setEdit({ ...edit, subcategories: edit.subcategories!.filter((x) => x !== s) })}>{s} <span className="x">✕</span></Chip>)}</div>
            <div className="row"><input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Nova subcategoria" aria-label="Nova subcategoria" />
              <button className="btn btn-soft" onClick={() => { if (sub.trim()) { setEdit({ ...edit, subcategories: [...(edit.subcategories ?? []), sub.trim()] }); setSub(''); } }}><Plus size={18} /></button></div>
          </>
        )}
      </Sheet>
      {delEl}
    </>
  );
}

/** Completa, em lote, a ficha dos produtos em uso que ainda não têm "para que serve" e "modo de uso". */
function FillProductInfo() {
  const products = useAll('product');
  const [run, setRun] = useState<{ done: number; total: number } | null>(null);
  const missing = (products ?? []).filter((p) => p.status === 'em_uso' && !p.info?.purpose);
  if (!aiAvailable() || (!missing.length && !run)) return null;
  const go = async () => {
    setRun({ done: 0, total: missing.length });
    let ok = 0;
    for (const [i, p] of missing.entries()) {
      try {
        const r = await aiProductInfo(p.brand, p.name);
        if (r.ok) { await update<'product'>(p.id, { info: { ...(p.info ?? {}), ...Object.fromEntries(Object.entries(r.info).filter(([, v]) => v !== undefined)) }, period: p.period ?? r.period }); ok++; }
      } catch (e: any) { toast(e.message, undefined, 'error'); break; }
      setRun({ done: i + 1, total: missing.length });
    }
    setRun(null);
    toast(`${ok} fichas preenchidas. Confira as de certeza baixa.`);
  };
  return (
    <button className="lib-item" onClick={go} disabled={!!run} data-testid="fill-product-info">
      <span className="lib-icon" style={{ background: 'var(--rose)' }}><Sparkles size={18} /></span>
      <span className="grow"><span style={{ fontWeight: 700 }}>{run ? `Preenchendo fichas… ${run.done} de ${run.total}` : `Completar ficha de ${missing.length} produtos em uso`}</span><br /><span className="small muted">Para que serve, modo de uso, ativos e cuidados, para a IA montar a rotina</span></span>
    </button>
  );
}
