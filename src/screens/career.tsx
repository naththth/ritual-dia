// Área Carreira: trabalho atual, marca pessoal, conquistas, oportunidades e desenvolvimento, com a especialista de carreira.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, BellRing, Briefcase, Check, ChevronDown, Plus, Sparkles, Trash2, Zap } from 'lucide-react';
import { useAll, useRecord, useSettings } from '../db/hooks';
import { create, remove, update, upsert } from '../db/db';
import { addDays, shortLabel, todayKey, weekStart, type DateKey } from '../lib/dates';
import { CAREER_ID, DEV_TYPE, isWork, OPP_STAGE, OPP_TYPE, WORK_FALLBACK } from '../domain/career';
import { AreaPage } from './areas';
import { TaskRow, TaskSheet } from './tasks';
import { BrandPosts } from './brand';
import { Chip } from '../ui/ui';
import { haptic, toast, useApp } from '../state/store';
import type { CareerBase, DevItem, Opp, Task } from '../db/types';

const ask = (text: string) => useApp.getState().setAsk({ domain: 'career' as any, text });

/* ---------- Captura rápida (aba de trabalho e tela própria para o PC) ---------- */
export function QuickAdd({ categoryId, alt, autoFocus, onAdded }: { categoryId?: string; alt?: { id: string; label: string }[]; autoFocus?: boolean; onAdded?: (t: Task) => void }) {
  const today = todayKey();
  const [title, setTitle] = useState('');
  const [day, setDay] = useState<DateKey | null>(today);
  const [time, setTime] = useState('');
  const [high, setHigh] = useState(false);
  const [cat, setCat] = useState(categoryId);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setCat(categoryId), [categoryId]);
  const add = async () => {
    if (!title.trim() || !cat) return;
    const t = await create('task', { title: title.trim(), categoryId: cat, priority: high ? 'alta' : 'media', status: 'pendente', tags: [], subtasks: [], history: [{ at: Date.now(), text: 'Criada' }], plannedDate: day, remindAt: day && time ? time : undefined } as any);
    haptic(); toast(time && day ? `Anotado. Lembro ${day === today ? 'hoje' : shortLabel(day)} às ${time}` : 'Anotado');
    setTitle(''); setTime(''); setHigh(false); ref.current?.focus();
    onAdded?.(t);
  };
  return (
    <div className="qa" data-testid="quick-add">
      <div className="qa-row">
        <input ref={ref} autoFocus={autoFocus} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} placeholder="O que precisa ser feito?" aria-label="Nova tarefa" data-testid="qa-title" />
        <button className="btn btn-ink qa-go" onClick={() => void add()} aria-label="Anotar" data-testid="qa-add"><Plus size={20} /></button>
      </div>
      <div className="chips qa-opts">
        {alt && alt.map((a) => <Chip key={a.id} on={cat === a.id} onClick={() => setCat(a.id)}>{a.label}</Chip>)}
        {alt && <span className="qa-sep" />}
        <Chip on={day === today} onClick={() => setDay(today)}>Hoje</Chip>
        <Chip on={day === addDays(today, 1)} onClick={() => setDay(addDays(today, 1))}>Amanhã</Chip>
        <label className={`chip ${day && day > addDays(today, 1) ? 'on' : ''}`} style={{ position: 'relative' }}>
          {day && day > addDays(today, 1) ? shortLabel(day) : 'Outro dia'}
          <input type="date" value={day ?? ''} onChange={(e) => setDay(e.target.value || null)} style={{ position: 'absolute', inset: 0, opacity: 0, minHeight: 0 }} aria-label="Escolher dia" />
        </label>
        <Chip on={!day} onClick={() => setDay(null)}>Sem dia</Chip>
        {day && <label className={`chip qa-time ${time ? 'on' : ''}`}><BellRing size={14} /><input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Lembrar às" data-testid="qa-time" /></label>}
        <Chip on={high} onClick={() => setHigh(!high)}><Zap size={14} /> Prioridade</Chip>
      </div>
    </div>
  );
}

/* ---------- Trabalho ---------- */
export function CareerWorkPage() {
  const base = useRecord<'careerbase'>(CAREER_ID);
  const tasks = useAll('task');
  const cats = useAll('category');
  const wins = useAll('win');
  const [open, setOpen] = useState<Task | undefined>();
  const [sheet, setSheet] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const today = todayKey();
  const ws = weekStart(today);
  if (base === undefined || !tasks || !cats || !wins) return <AreaPage area="carreira" testId="area-carreira"><div /></AreaPage>;
  if (!base?.workCategoryId) return <AreaPage area="carreira" testId="area-carreira"><WorkSetup /></AreaPage>;
  const work = tasks.filter((t) => isWork(t, base));
  const pend = work.filter((t) => t.status === 'pendente');
  const now = pend.filter((t) => t.plannedDate && t.plannedDate <= today).sort((a, b) => (a.priority === 'alta' ? -1 : 0) - (b.priority === 'alta' ? -1 : 0));
  const next = pend.filter((t) => t.plannedDate && t.plannedDate > today).sort((a, b) => a.plannedDate!.localeCompare(b.plannedDate!));
  const loose = pend.filter((t) => !t.plannedDate);
  const doneWeek = work.filter((t) => t.status === 'concluida' && t.completedDate && t.completedDate >= ws).sort((a, b) => (b.completedDate ?? '').localeCompare(a.completedDate ?? ''));
  const winsWeek = wins.filter((w) => w.date >= ws).length;
  const openTask = (t: Task) => { setOpen(t); setSheet(true); };
  const toWin = async (t: Task) => { await create('win', { title: t.title, date: t.completedDate ?? today, where: 'trabalho' } as any); toast('Virou conquista. Vale anotar o impacto na aba Conquistas.'); };
  const Section = ({ title, list, plan }: { title: string; list: Task[]; plan?: boolean }) => list.length ? (
    <>
      <h2 className="section-title">{title} <span className="muted small num">{list.length}</span></h2>
      <div className="list">{list.map((t) => <TaskRow key={t.id} t={t} cats={cats} date={today} onOpen={() => openTask(t)} showPlan={plan} />)}</div>
    </>
  ) : null;
  return (
    <AreaPage area="carreira" testId="area-carreira">
      <div className="cr-stats">
        <div className="cr-stat"><b className="num">{now.length}</b><span>para hoje</span></div>
        <div className="cr-stat"><b className="num">{doneWeek.length}</b><span>entregues na semana</span></div>
        <div className="cr-stat"><b className="num">{winsWeek}</b><span>conquistas na semana</span></div>
      </div>
      <QuickAdd categoryId={base.workCategoryId} />
      <Section title="Hoje e atrasadas" list={now} />
      <Section title="Próximos dias" list={next} />
      <Section title="Sem dia" list={loose} plan />
      {!pend.length && <p className="muted" style={{ margin: '18px 2px' }}>Nada pendente no {base.workName ?? WORK_FALLBACK.toLowerCase()}. Anote acima ou pelo PC na captura rápida.</p>}
      {doneWeek.length > 0 && <>
        <button className="link cr-more" onClick={() => setShowDone(!showDone)} data-testid="work-done-toggle"><ChevronDown size={15} style={{ transform: showDone ? 'rotate(180deg)' : undefined }} /> Entregues na semana ({doneWeek.length})</button>
        {showDone && <div className="list">{doneWeek.map((t) => (
          <div key={t.id} className="row-item done">
            <span className="grow"><div className="t">{t.title}</div><div className="s">{t.completedDate && shortLabel(t.completedDate)}</div></span>
            <button className="pill-act pa-honey" onClick={() => void toWin(t)}><Award size={14} /> Virou conquista</button>
          </div>
        ))}</div>}
      </>}
      <button className="pill-act pa-rose" style={{ marginTop: 18 }} onClick={() => ask('Me ajuda a priorizar o trabalho desta semana')}><Sparkles size={15} /> Priorizar a semana com a especialista</button>
      <TaskSheet open={sheet} onClose={() => setSheet(false)} task={open} defaults={{ categoryId: base.workCategoryId }} />
    </AreaPage>
  );
}

function WorkSetup() {
  const [name, setName] = useState('');
  const go = async () => {
    if (!name.trim()) return;
    const id = 'cat:trabalho';
    await upsert('category', id, { name: `Trabalho ${name.trim()}`, labels: { alta: 'Urgente', media: 'Importante', baixa: 'Quando der' }, subcategories: ['Entregas', 'Reuniões', 'Equipe', 'Comercial'], order: 0 } as any);
    await upsert('careerbase', CAREER_ID, { workName: name.trim(), workCategoryId: id } as any);
  };
  return (
    <div className="block b-paper">
      <b>Onde você trabalha hoje?</b>
      <p className="small muted">Vira o nome da aba e a categoria das tarefas de trabalho.</p>
      <div className="row" style={{ gap: 8, marginTop: 8 }}><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da empresa" /><button className="btn btn-ink btn-sm" onClick={() => void go()}>Salvar</button></div>
    </div>
  );
}

/* ---------- Marca ---------- */
const BASE_FIELDS: { k: keyof CareerBase; label: string; hint: string; rows?: number }[] = [
  { k: 'posicionamento', label: 'Posicionamento', hint: 'Em uma ou duas frases: o que você faz de diferente e para quem.', rows: 3 },
  { k: 'publico', label: 'Para quem você fala', hint: 'Quem você quer que leia e lembre de você.', rows: 2 },
  { k: 'pilares', label: 'Pilares de conteúdo', hint: 'Os 3 ou 4 temas a que você volta sempre.', rows: 4 },
  { k: 'tom', label: 'Tom de voz', hint: 'Como você soa quando escreve.', rows: 3 },
  { k: 'evitar', label: 'O que evitar', hint: 'O que não é você.', rows: 2 },
  { k: 'bio', label: 'Bio curta', hint: 'A frase do topo do perfil.', rows: 2 },
  { k: 'objetivo', label: 'Onde quer chegar', hint: 'O próximo passo de carreira.', rows: 2 },
  { k: 'assinatura', label: 'Assinatura', hint: 'Como você assina.', rows: 1 }
];
export function CareerBrandPage() {
  const base = useRecord<'careerbase'>(CAREER_ID);
  const [edit, setEdit] = useState(false);
  const filled = base ? BASE_FIELDS.filter((f) => String(base[f.k] ?? '').trim()).length : 0;
  const save = (k: keyof CareerBase, v: string) => upsert('careerbase', CAREER_ID, { [k]: v.trim() || undefined } as any);
  return (
    <AreaPage area="carreira" testId="area-carreira-marca">
      <section className="block b-paper cr-base" data-testid="brand-base">
        <div className="row between"><b>Base da marca</b><span className="small muted num">{filled} de {BASE_FIELDS.length}</span></div>
        {!edit && base?.posicionamento && <p className="cr-quote">{base.posicionamento}</p>}
        {!edit && base?.pilares && <div className="chips" style={{ marginTop: 6 }}>{base.pilares.split(/\n|;/).map((x) => x.replace(/^[-•]\s*/, '').trim()).filter(Boolean).map((x) => <span key={x} className="chip">{x}</span>)}</div>}
        {edit && BASE_FIELDS.map((f) => (
          <label key={f.k} className="cr-field">
            <span className="label">{f.label}</span>
            <span className="small muted">{f.hint}</span>
            <textarea rows={f.rows ?? 2} defaultValue={String(base?.[f.k] ?? '')} onBlur={(e) => void save(f.k, e.target.value)} data-testid={`base-${f.k}`} />
          </label>
        ))}
        <button className="link" style={{ marginTop: 8 }} onClick={() => setEdit(!edit)} data-testid="base-edit">{edit ? 'Pronto' : filled ? 'Editar a base' : 'Preencher a base'}</button>
        <p className="small muted" style={{ marginTop: 6 }}>A especialista usa esta base para escrever no seu tom. Cole aqui o que estiver no seu projeto de marca.</p>
      </section>
      <BrandPosts />
      <button className="pill-act pa-rose" style={{ marginTop: 18 }} onClick={() => ask('Transforma a próxima pauta em post no meu tom')}><Sparkles size={15} /> Escrever um post com a especialista</button>
    </AreaPage>
  );
}

/* ---------- Conquistas ---------- */
export function CareerWinsPage() {
  const wins = useAll('win');
  const [title, setTitle] = useState('');
  const [impact, setImpact] = useState('');
  const [where, setWhere] = useState<'trabalho' | 'fora'>('trabalho');
  const [openId, setOpenId] = useState<string>();
  if (!wins) return <AreaPage area="carreira" testId="area-carreira-conquistas"><div /></AreaPage>;
  const add = async () => { if (!title.trim()) return; await create('win', { title: title.trim(), impact: impact.trim() || undefined, date: todayKey(), where } as any); setTitle(''); setImpact(''); haptic(); toast('Conquista guardada'); };
  const list = [...wins].sort((a, b) => b.date.localeCompare(a.date));
  const byMonth = list.reduce<Record<string, typeof list>>((m, w) => { const k = w.date.slice(0, 7); (m[k] ??= []).push(w); return m; }, {});
  const monthName = (k: string) => new Date(`${k}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return (
    <AreaPage area="carreira" testId="area-carreira-conquistas">
      <section className="block b-paper">
        <b>O que você entregou?</b>
        <p className="small muted">Uma linha e, se tiver, o número. Vira matéria-prima para avaliação, entrevista e post.</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: estruturei o funil de prospecção da área" style={{ marginTop: 8 }} data-testid="win-title" />
        <input value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="Impacto: +30% de reuniões qualificadas no trimestre" style={{ marginTop: 8 }} data-testid="win-impact" />
        <div className="row between" style={{ marginTop: 8 }}>
          <div className="chips"><Chip on={where === 'trabalho'} onClick={() => setWhere('trabalho')}>No trabalho</Chip><Chip on={where === 'fora'} onClick={() => setWhere('fora')}>Fora dele</Chip></div>
          <button className="btn btn-ink btn-sm" onClick={() => void add()} disabled={!title.trim()} data-testid="win-add">Guardar</button>
        </div>
      </section>
      {Object.entries(byMonth).map(([k, ws]) => (
        <div key={k}>
          <h2 className="section-title" style={{ textTransform: 'capitalize' }}>{monthName(k)} <span className="muted small num">{ws.length}</span></h2>
          <div className="list">{ws.map((w) => (
            <div key={w.id} className="row-item cr-win" data-testid="win-row">
              <span className="cr-win-ic"><Award size={18} /></span>
              <button className="grow tap" onClick={() => setOpenId(openId === w.id ? undefined : w.id)}>
                <div className="t">{w.title}</div>
                <div className="s">{shortLabel(w.date)}{w.impact ? ` · ${w.impact}` : ''}</div>
              </button>
              {openId === w.id && <button className="icon-btn" aria-label="Apagar" onClick={() => void remove(w.id)}><Trash2 size={17} /></button>}
            </div>
          ))}</div>
          {openId && ws.some((w) => w.id === openId) && <ImpactEdit id={openId} value={ws.find((w) => w.id === openId)?.impact} />}
        </div>
      ))}
      {!list.length && <p className="muted" style={{ margin: '18px 2px' }}>Comece pelo que saiu esta semana. Uma linha por conquista.</p>}
      {list.length > 0 && <button className="pill-act pa-rose" style={{ marginTop: 18 }} onClick={() => ask('Monta minha narrativa de conquistas dos últimos 6 meses, pronta para avaliação e entrevista')}><Sparkles size={15} /> Montar minha narrativa</button>}
    </AreaPage>
  );
}
function ImpactEdit({ id, value }: { id: string; value?: string }) {
  return <input key={id} defaultValue={value ?? ''} placeholder="Impacto (número, resultado)" onBlur={(e) => void update<'win'>(id, { impact: e.target.value.trim() || undefined })} style={{ marginTop: 6 }} />;
}

/* ---------- Oportunidades ---------- */
export function CareerOppsPage() {
  const opps = useAll('opp');
  const [title, setTitle] = useState('');
  const [org, setOrg] = useState('');
  const [type, setType] = useState<Opp['type']>('vaga');
  const [openId, setOpenId] = useState<string>();
  const [closed, setClosed] = useState(false);
  if (!opps) return <AreaPage area="carreira" testId="area-carreira-oportunidades"><div /></AreaPage>;
  const add = async () => { if (!title.trim()) return; await create('opp', { title: title.trim(), org: org.trim() || undefined, type, stage: 'mapeada' } as any); setTitle(''); setOrg(''); haptic(); };
  const live = opps.filter((o) => o.stage !== 'encerrada').sort((a, b) => (a.nextDate ?? '9').localeCompare(b.nextDate ?? '9'));
  const done = opps.filter((o) => o.stage === 'encerrada');
  const today = todayKey();
  const Row = ({ o }: { o: Opp }) => (
    <div className="cr-opp" data-testid="opp-row">
      <button className="row between tap" style={{ width: '100%', textAlign: 'left', gap: 10 }} onClick={() => setOpenId(openId === o.id ? undefined : o.id)}>
        <span className="grow"><b>{o.title}</b>{o.org && <span className="muted"> · {o.org}</span>}<br />
          <span className="small muted">{OPP_TYPE[o.type]} · {OPP_STAGE[o.stage]}{o.next ? ` · ${o.next}` : ''}{o.nextDate ? ` até ${shortLabel(o.nextDate)}` : ''}</span></span>
        {o.nextDate && o.nextDate <= today && o.stage !== 'encerrada' && <span className="prio alta">Agora</span>}
      </button>
      {openId === o.id && <div className="cr-opp-edit">
        <div className="chips">{Object.entries(OPP_STAGE).map(([k, v]) => <Chip key={k} on={o.stage === k} onClick={() => void update<'opp'>(o.id, { stage: k as Opp['stage'] })}>{v}</Chip>)}</div>
        <input defaultValue={o.next ?? ''} placeholder="Próximo passo" onBlur={(e) => void update<'opp'>(o.id, { next: e.target.value.trim() || undefined })} />
        <input type="date" defaultValue={o.nextDate ?? ''} onChange={(e) => void update<'opp'>(o.id, { nextDate: e.target.value || undefined })} aria-label="Até quando" />
        <textarea rows={2} defaultValue={o.note ?? ''} placeholder="Notas: quem, o que falaram, salário, modelo" onBlur={(e) => void update<'opp'>(o.id, { note: e.target.value.trim() || undefined })} />
        <div className="row between">
          <button className="pill-act pa-rose" onClick={() => ask(`Me prepara para a próxima etapa de: ${o.title}${o.org ? ` (${o.org})` : ''}`)}><Sparkles size={14} /> Preparar com a especialista</button>
          <button className="icon-btn" aria-label="Apagar" onClick={() => void remove(o.id)}><Trash2 size={17} /></button>
        </div>
      </div>}
    </div>
  );
  return (
    <AreaPage area="carreira" testId="area-carreira-oportunidades">
      <section className="block b-paper">
        <div className="chips">{Object.entries(OPP_TYPE).map(([k, v]) => <Chip key={k} on={type === k} onClick={() => setType(k as Opp['type'])}>{v}</Chip>)}</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'contato' ? 'Quem' : 'Cargo ou assunto'} style={{ marginTop: 8 }} data-testid="opp-title" />
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Empresa" style={{ flex: 1 }} />
          <button className="btn btn-ink btn-sm" onClick={() => void add()} disabled={!title.trim()} data-testid="opp-add">Adicionar</button>
        </div>
      </section>
      <div className="list">{live.map((o) => <Row key={o.id} o={o} />)}</div>
      {!live.length && <p className="muted" style={{ margin: '18px 2px' }}>Processos, conversas e contatos de rede, cada um com o próximo passo e a data.</p>}
      {done.length > 0 && <>
        <button className="link cr-more" onClick={() => setClosed(!closed)}><ChevronDown size={15} /> Encerradas ({done.length})</button>
        {closed && <div className="list">{done.map((o) => <Row key={o.id} o={o} />)}</div>}
      </>}
    </AreaPage>
  );
}

/* ---------- Desenvolvimento ---------- */
const DEV_NEXT: Record<DevItem['status'], DevItem['status']> = { quero: 'fazendo', fazendo: 'feito', feito: 'quero' };
const DEV_STATUS: Record<DevItem['status'], string> = { quero: 'Quero', fazendo: 'Fazendo', feito: 'Feito' };
export function CareerGrowPage() {
  const items = useAll('devitem');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<DevItem['type']>('meta');
  if (!items) return <AreaPage area="carreira" testId="area-carreira-crescer"><div /></AreaPage>;
  const add = async () => { if (!title.trim()) return; await create('devitem', { title: title.trim(), type, status: 'quero' } as any); setTitle(''); haptic(); };
  return (
    <AreaPage area="carreira" testId="area-carreira-crescer">
      <section className="block b-paper">
        <div className="chips">{Object.entries(DEV_TYPE).map(([k, v]) => <Chip key={k} on={type === k} onClick={() => setType(k as DevItem['type'])}>{v}</Chip>)}</div>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} placeholder={type === 'meta' ? 'Ex.: liderar uma área de receita até 2027' : 'O quê'} style={{ flex: 1 }} data-testid="dev-title" />
          <button className="btn btn-ink btn-sm" onClick={() => void add()} disabled={!title.trim()} data-testid="dev-add">Adicionar</button>
        </div>
      </section>
      {(['fazendo', 'quero', 'feito'] as const).map((st) => {
        const list = items.filter((x) => x.status === st);
        return list.length ? (
          <div key={st}>
            <h2 className="section-title">{DEV_STATUS[st]} <span className="muted small num">{list.length}</span></h2>
            <div className="list">{list.map((x) => (
              <div key={x.id} className={`row-item ${st === 'feito' ? 'done' : ''}`} data-testid="dev-row">
                <span className="grow"><div className="t">{x.title}</div><div className="s">{DEV_TYPE[x.type]}</div></span>
                <button className="pill-act pa-blue" onClick={() => void update<'devitem'>(x.id, { status: DEV_NEXT[x.status] })}>{st === 'quero' ? 'Comecei' : st === 'fazendo' ? <><Check size={14} /> Concluí</> : 'Reabrir'}</button>
                {st === 'feito' && <button className="icon-btn" aria-label="Apagar" onClick={() => void remove(x.id)}><Trash2 size={17} /></button>}
              </div>
            ))}</div>
          </div>
        ) : null;
      })}
      {!items.length && <p className="muted" style={{ margin: '18px 2px' }}>Metas do ano, cursos, leituras, eventos e competências que você quer construir.</p>}
    </AreaPage>
  );
}

/* ---------- Captura rápida: tela própria, pensada para o PC ---------- */
export function CaptureScreen() {
  const base = useRecord<'careerbase'>(CAREER_ID);
  const cats = useAll('category');
  const tasks = useAll('task');
  const settings = useSettings();
  const nav = useNavigate();
  const [recent, setRecent] = useState<string[]>([]);
  if (!cats || base === undefined || !settings) return <div className="screen no-nav" />;
  const work = base?.workCategoryId;
  const personal = cats.find((c) => c.id === 'cat:compromissos')?.id ?? cats.find((c) => c.id !== work)?.id;
  const alt = [work && { id: work, label: base?.workName ?? WORK_FALLBACK }, personal && { id: personal, label: 'Pessoal' }].filter(Boolean) as { id: string; label: string }[];
  const shown = (tasks ?? []).filter((t) => recent.includes(t.id));
  return (
    <div className="screen no-nav capture" data-testid="capture-screen">
      <div className="cap-head"><Briefcase size={20} /><b>Captura rápida</b><button className="link small" style={{ marginLeft: 'auto' }} onClick={() => nav('/carreira')}>Abrir a Carreira</button></div>
      <QuickAdd categoryId={work ?? personal} alt={alt} autoFocus onAdded={(t) => setRecent((r) => [t.id, ...r].slice(0, 8))} />
      <p className="small muted" style={{ margin: '10px 2px' }}>Enter anota. Com horário, chega como notificação no celular no dia marcado.</p>
      {shown.length > 0 && <div className="list">{shown.map((t) => (
        <div key={t.id} className="row-item"><span className="grow"><div className="t">{t.title}</div><div className="s">{cats.find((c) => c.id === t.categoryId)?.name}{t.plannedDate ? ` · ${shortLabel(t.plannedDate)}` : ''}{t.remindAt ? ` às ${t.remindAt}` : ''}</div></span><Check size={18} /></div>
      ))}</div>}
    </div>
  );
}
