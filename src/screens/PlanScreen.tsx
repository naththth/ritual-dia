import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHead , useBack } from './common';
import { useAll, useSettings } from '../db/hooks';
import { Chip, Seg, Sheet, Empty } from '../ui/ui';
import { planFor } from '../domain/rules';
import { savePlan } from '../domain/actions';
import { todayKey, WEEKDAY_LONG, shortLabel } from '../lib/dates';
import type { Plan, Product, SkinPeriodPlan } from '../db/types';
import { ProductPick } from './SkinScreen';
import { watts } from '../domain/ai';
import { Check } from 'lucide-react';
import { update } from '../db/db';
import { toast } from '../state/store';
import { GROUP_RANK } from '../domain/defaults';
import { careProgress } from '../domain/care';
import { ChatButton } from './specialist';

const DAYS = [1, 2, 3, 4, 5, 6, 7];
const emptySkin = (): NonNullable<Plan['skin']> => ({ am: { base: [], days: {} }, pm: { base: [], days: {} }, recovery: { am: [], pm: [] } });

export function PlanScreen() {
  const { domain = 'skin' } = useParams();
  const title = { skin: 'Rotina de cuidados', training: 'Plano de treino', food: 'Plano de alimentação' }[domain] ?? 'Plano';
  return (
    <div className="screen no-nav" data-testid={`plan-${domain}`}>
      <PageHead title={title} withDate={false} />
      {domain === 'skin' && <SkinPlan />}
      {domain === 'training' && <TrainingPlan />}
      {domain === 'food' && <FoodPlan />}
    </div>
  );
}

function useCurrent(domain: 'skin' | 'training' | 'food') {
  const plans = useAll('plan');
  return { plans, current: plans ? planFor(plans, domain, todayKey()) : undefined };
}

function VersionNote({ current }: { current?: Plan }) {
  if (!current) return <p className="small muted">Ao salvar, o plano passa a valer a partir de hoje.</p>;
  return <p className="small muted">Plano em vigor desde {shortLabel(current.validFrom)}. Se você mudar, a mudança vale a partir de hoje e os dias anteriores continuam com o plano antigo.</p>;
}

/* ---------------- Rotina: rosto, corpo e cabelo juntos, de manhã e de noite ---------------- */
const AREAS: { id: 'rosto' | 'corpo' | 'cabelo'; label: string }[] = [{ id: 'rosto', label: 'Rosto' }, { id: 'corpo', label: 'Corpo' }, { id: 'cabelo', label: 'Cabelo' }];

export function SkinPlan({ embedded = false }: { embedded?: boolean } = {}) {
  const { plans, current } = useCurrent('skin');
  const products = useAll('product');
  const nav = useNavigate();
  const back = useBack();
  const [d, setD] = useState<NonNullable<Plan['skin']> | null>(null);
  const [tab, setTab] = useState<'am' | 'pm' | 'rec'>('am');
  const [baseOpen, setBaseOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (plans && !dirty) setD(structuredClone(current?.skin ?? emptySkin())); }, [plans, current?.id, current?.updatedAt]);
  const setDD = (v: NonNullable<Plan['skin']>) => { setDirty(true); setD(v); };
  if (!d || !products) return null;
  const inUse = products.filter((p) => p.status === 'em_uso');
  const faceInUse = inUse.filter((p) => (p.area ?? 'rosto') === 'rosto');
  const byId = new Map(products.map((p) => [p.id, p]));
  const sortIds = (ids: string[]) => [...ids].sort((a, b) => (GROUP_RANK[byId.get(a)?.group ?? 'hidratacao'] - GROUP_RANK[byId.get(b)?.group ?? 'hidratacao']));
  /** Lista em tópicos, separada por área, na ordem de aplicação. */
  const groups = (ids: string[], suffix = '', tone = '') => AREAS.map((ar) => {
    const n = sortIds(ids).filter((id) => (byId.get(id)?.area ?? 'rosto') === ar.id).map((id) => byId.get(id)?.name).filter(Boolean) as string[];
    return n.length ? <div key={ar.id + suffix} className={`dgroup flat ${tone}`}><span className="dg-l">{ar.label}{suffix}</span><ol>{n.map((x, i) => <li key={i}>{x}</li>)}</ol></div> : null;
  });

  if (inUse.length === 0) {
    return <Empty text="Nenhum produto marcado como em uso. Faça a revisão dos produtos primeiro." action={<button className="btn btn-ink" onClick={() => nav('/revisao')}>Revisar produtos</button>} />;
  }
  const pp: SkinPeriodPlan | null = tab === 'rec' ? null : d[tab];
  const dayList = (p: SkinPeriodPlan, wd: number) => {
    const day = p.days[wd] ?? { add: [], remove: [] };
    return [...p.base.filter((id) => !day.remove.includes(id)), ...day.add];
  };
  const toggleDay = (wd: number, id: string) => {
    if (!pp) return;
    const day = { add: [...(pp.days[wd]?.add ?? [])], remove: [...(pp.days[wd]?.remove ?? [])] };
    if (pp.base.includes(id)) day.remove = day.remove.includes(id) ? day.remove.filter((x) => x !== id) : [...day.remove, id];
    else day.add = day.add.includes(id) ? day.add.filter((x) => x !== id) : [...day.add, id];
    setDD({ ...d, [tab]: { ...pp, days: { ...pp.days, [wd]: day } } });
  };
  const copyToAll = (wd: number) => {
    if (!pp) return;
    const src = pp.days[wd] ?? { add: [], remove: [] };
    const days: SkinPeriodPlan['days'] = {};
    DAYS.forEach((x) => (days[x] = { add: [...src.add], remove: [...src.remove] }));
    setDD({ ...d, [tab]: { ...pp, days } });
  };
  return (
    <>
      <VersionNote current={current} />
      <CareAssessment products={inUse} diagnosis={d.diagnosis} />
      <AIPrefs domain="skin" />
      <ChatButton domain="skin" label="Montar rotina com a dermatologista" />
      <Seg value={tab} onChange={setTab} options={[{ id: 'am', label: 'Manhã' }, { id: 'pm', label: 'Noite' }, { id: 'rec', label: 'Recuperação' }]} />
      {pp && (
        <>
          <div className="section"><h2 className="section-title">Todos os dias</h2><button className="link" onClick={() => setBaseOpen(true)} data-testid="edit-base">Editar</button></div>
          <div data-testid="plan-base">{pp.base.length ? groups(pp.base) : <p className="small" style={{ marginTop: 0 }}>Nada ainda. Comece pelo que se repete todo dia: limpeza e hidratante do rosto, protetor, hidratante do corpo.</p>}</div>
          <div className="section"><h2 className="section-title">Por dia da semana</h2></div>
          <p className="small muted" style={{ marginTop: -6 }}>O que muda em relação a todos os dias: lavar o cabelo, máscara, esfoliação, ativos do rosto. Toque no dia para ajustar.</p>
          {DAYS.map((wd) => {
            const day = pp.days[wd];
            const has = !!(day?.add.length || day?.remove.length);
            return (
              <button key={wd} className="plan-day tap" onClick={() => setDayOpen(wd)} style={{ display: 'block', textAlign: 'left', width: '100%' }} data-testid={`plan-day-${wd}`}>
                <div className="row between"><span className="dn">{WEEKDAY_LONG[wd]}</span><span className="tiny muted">{has ? `${dayList(pp, wd).length} passos` : 'Igual a todos os dias'}</span></div>
                {has && <div style={{ marginTop: 6 }}>{groups(day!.add, ' · entra', 'add')}{groups(day!.remove, ' · sai', 'remove')}</div>}
              </button>
            );
          })}
        </>
      )}
      {tab === 'rec' && (
        <>
          <p className="small">Lista do rosto usada quando você liga o modo recuperação em um dia. Corpo e cabelo seguem o plano normal.</p>
          {(['am', 'pm'] as const).map((per) => (
            <div key={per}>
              <span className="label">{per === 'am' ? 'Manhã' : 'Noite'}</span>
              {[...faceInUse].sort((a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group]).map((p) => (
                <ProductPick key={p.id} p={p} on={d.recovery[per].includes(p.id)} onClick={() => setDD({ ...d, recovery: { ...d.recovery, [per]: d.recovery[per].includes(p.id) ? d.recovery[per].filter((x) => x !== p.id) : [...d.recovery[per], p.id] } })} />
              ))}
            </div>
          ))}
        </>
      )}
      <button className="btn btn-ink btn-block" style={{ marginTop: 20 }} data-testid="plan-save" onClick={async () => { await savePlan('skin', current, { skin: { ...d, body: undefined, hair: undefined } }); if (embedded) { setDirty(false); toast('Plano salvo'); } else back(); }}>Salvar plano</button>

      <Sheet open={baseOpen} onClose={() => setBaseOpen(false)} title={`Todos os dias · ${tab === 'am' ? 'manhã' : 'noite'}`} footer={<button className="btn btn-ink" onClick={() => setBaseOpen(false)}>Pronto</button>}>
        {pp && <AreaToggleList products={inUse} selected={pp.base} onToggle={(id) => setDD({ ...d, [tab]: { ...pp, base: pp.base.includes(id) ? pp.base.filter((x) => x !== id) : [...pp.base, id] } })} />}
      </Sheet>
      <Sheet open={dayOpen !== null} onClose={() => setDayOpen(null)} title={dayOpen ? WEEKDAY_LONG[dayOpen] : ''} sub={tab === 'am' ? 'Manhã' : 'Noite'}
        footer={<><button className="btn btn-soft" onClick={() => { if (dayOpen) copyToAll(dayOpen); setDayOpen(null); }}>Usar em todos os dias</button><button className="btn btn-ink" onClick={() => setDayOpen(null)}>Pronto</button></>}>
        {pp && dayOpen && <AreaToggleList products={inUse} selected={dayList(pp, dayOpen)} onToggle={(id) => toggleDay(dayOpen, id)} />}
      </Sheet>
    </>
  );
}

/** Avaliação antes da IA: o que falta responder sobre rosto, corpo e cabelo, e o diagnóstico da última vez. */
function CareAssessment({ products, diagnosis }: { products: Product[]; diagnosis?: NonNullable<Plan['skin']>['diagnosis'] }) {
  const settings = useSettings();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const prog = careProgress(settings?.profile);
  const has = (a: string) => products.some((p) => (p.area ?? 'rosto') === a);
  const rows = ([
    ['rosto', 'Rosto', prog.face, 'pele'],
    ['corpo', 'Corpo', prog.body, 'corpo'],
    ['cabelo', 'Cabelo', prog.hair, 'cabelo']
  ] as const).filter(([a]) => a === 'rosto' || has(a));
  const missing = rows.filter(([, , pr]) => pr.done < pr.total);
  return (
    <section className="care-assess" data-testid="care-assessment">
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <b>Avaliação</b>
        {diagnosis && (diagnosis.rosto || diagnosis.corpo || diagnosis.cabelo) ? <button className="link" onClick={() => setOpen(!open)} data-testid="diagnosis-toggle">{open ? 'Fechar diagnóstico' : 'Ver diagnóstico'}</button> : null}
      </div>
      <div className="care-rows">
        {rows.map(([a, label, pr, sec]) => (
          <button key={a} className={`care-row ${pr.done >= pr.total ? 'ok' : ''}`} onClick={() => nav(`/perfil?s=${sec}`)} data-testid={`assess-${a}`}>
            <span>{label}</span><span className="small">{pr.done >= pr.total ? 'respondido' : `${pr.done} de ${pr.total}`}</span>
          </button>
        ))}
      </div>
      {missing.length > 0 && <p className="small" style={{ margin: '8px 0 0' }}>Responda a avaliação de {(() => { const n = missing.map(([, l]) => l.toLowerCase()); return n.length > 1 ? `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}` : n[0]; })()} para a IA diagnosticar e indicar o melhor uso de cada produto.</p>}
      {open && diagnosis && (
        <div className="small" style={{ marginTop: 10, whiteSpace: 'pre-line' }} data-testid="diagnosis">
          {diagnosis.rosto && <p style={{ margin: '0 0 8px' }}><b>Rosto.</b> {diagnosis.rosto}</p>}
          {diagnosis.corpo && <p style={{ margin: '0 0 8px' }}><b>Corpo.</b> {diagnosis.corpo}</p>}
          {diagnosis.cabelo && <p style={{ margin: 0 }}><b>Cabelo.</b> {diagnosis.cabelo}</p>}
          {diagnosis.date && <p className="tiny muted" style={{ margin: '8px 0 0' }}>Feito em {shortLabel(diagnosis.date)}. Não substitui avaliação médica.</p>}
        </div>
      )}
    </section>
  );
}

/** Lista de produtos separada por Rosto, Corpo e Cabelo. */
function AreaToggleList({ products, selected, onToggle }: { products: Product[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <>
      {AREAS.map((ar) => {
        const list = products.filter((p) => (p.area ?? 'rosto') === ar.id);
        if (!list.length) return null;
        return (
          <div key={ar.id}>
            <h3 className="sec-cap">{ar.label}</h3>
            <ProductToggleList products={list} selected={selected} onToggle={onToggle} />
          </div>
        );
      })}
    </>
  );
}

function ProductToggleList({ products, selected, onToggle }: { products: Product[]; selected: string[]; onToggle: (id: string) => void }) {
  return <>{[...products].sort((a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group] || a.brand.localeCompare(b.brand)).map((p) => <ProductPick key={p.id} p={p} on={selected.includes(p.id)} onClick={() => onToggle(p.id)} />)}</>;
}

/* ---------------- Treino ---------------- */
export function TrainingPlan({ embedded = false }: { embedded?: boolean } = {}) {
  const { plans, current } = useCurrent('training');
  const tmpls = useAll('wtemplate');
  const nav = useNavigate();
  const back = useBack();
  const [d, setD] = useState<Record<number, string[]> | null>(null);
  const settings = useSettings();
  const [dirty, setDirty] = useState(false);
  const [resumo] = useState('');
  useEffect(() => { if (plans && !dirty) setD(structuredClone(current?.training ?? {})); }, [plans, current?.id, current?.updatedAt]);
  if (!d || !tmpls) return null;
  const active = tmpls.filter((t) => !t.archived);
  const ai = (
    <>
    <AIPrefs domain="training" />
    <ChatButton domain="training" label="Montar semana com a treinadora" />
    </>
  );
  if (!active.length) return <>{ai}<Empty text="Crie sessões de treino ou peça à IA para montar a semana." action={<button className="btn btn-ink" onClick={() => nav('/treino/sessoes')}>Criar sessão de treino</button>} /></>;
  return (
    <>
      <VersionNote current={current} />
      {ai}
      {resumo && <div className="notice calm" style={{ margin: '10px 0' }}>{resumo}</div>}
      {DAYS.map((wd) => (
        <div key={wd} className="plan-day" data-testid={`tplan-${wd}`}>
          <div className="dn">{WEEKDAY_LONG[wd]}</div>
          <div className="chips" style={{ marginTop: 8 }}>
            {active.map((t) => {
              const on = d[wd]?.includes(t.id);
              return <Chip key={t.id} color="blue" on={on} onClick={() => { setDirty(true); setD({ ...d, [wd]: on ? d[wd].filter((x) => x !== t.id) : [...(d[wd] ?? []), t.id] }); }}>{t.name}</Chip>;
            })}
          </div>
          {d[wd]?.map((id) => active.find((t) => t.id === id)).filter((t) => t?.steps?.length).map((t) => (
            <div key={t!.id} className="tiny muted" style={{ marginTop: 6 }}>{t!.steps!.map((s) => `${s.minutes}' ${watts(s.pct, settings?.ftp) ?? s.pct + '%'}${settings?.ftp ? 'W' : ''}`).join(', ')}</div>
          ))}
          {!d[wd]?.length && <div className="tiny muted" style={{ marginTop: 6 }}>Sem treino planejado</div>}
        </div>
      ))}
      <button className="btn btn-ink btn-block" style={{ marginTop: 20 }} data-testid="plan-save" onClick={async () => { await savePlan('training', current, { training: d }); if (embedded) { setDirty(false); toast('Plano salvo'); } else back(); }}>Salvar plano</button>
    </>
  );
}

/* ---------------- Alimentação ---------------- */
export function FoodPlan({ embedded = false }: { embedded?: boolean } = {}) {
  const { plans, current } = useCurrent('food');
  const tmpls = useAll('mtemplate');
  const settings = useSettings();
  const nav = useNavigate();
  const back = useBack();
  const [d, setD] = useState<Record<number, Record<string, string | null>> | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [resumo] = useState('');
  useEffect(() => { if (plans && !dirty) setD(structuredClone(current?.food ?? {})); }, [plans, current?.id, current?.updatedAt]);
  if (!d || !tmpls || !settings) return null;
  const active = tmpls.filter((t) => !t.archived);
  const aiBox = (
    <>
      <AIPrefs domain="food" />
      <ChatButton domain="food" label="Montar plano com a nutricionista" />
      {resumo && <div className="notice calm" style={{ margin: '10px 0' }}>{resumo}</div>}
    </>
  );
  if (!active.length) return <>{aiBox}<Empty text="Salve refeições favoritas ou monte a partir da sua dieta." action={<button className="btn btn-ink" onClick={() => nav('/alimentacao/refeicoes')}>Criar refeição favorita</button>} /></>;
  const tName = (id?: string | null) => active.find((t) => t.id === id)?.name;
  return (
    <>
      <VersionNote current={current} />
      {aiBox}
      {DAYS.map((wd) => {
        const day = d[wd] ?? {};
        const parts = settings.mealTypes.filter((m) => day[m.id]).map((m) => `${m.label}: ${tName(day[m.id])}`);
        return (
          <button key={wd} className="plan-day tap" style={{ display: 'block' }} onClick={() => setOpen(wd)}>
            <div className="dn">{WEEKDAY_LONG[wd]}</div>
            <div className="small">{parts.length ? parts.join('. ') : 'Nada planejado'}</div>
          </button>
        );
      })}
      <button className="btn btn-ink btn-block" style={{ marginTop: 20 }} data-testid="plan-save" onClick={async () => { await savePlan('food', current, { food: d }); if (embedded) { setDirty(false); toast('Plano salvo'); } else back(); }}>Salvar plano</button>
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open ? WEEKDAY_LONG[open] : ''}
        footer={<><button className="btn btn-soft" onClick={() => { if (open) { const src = d[open] ?? {}; const nd = { ...d }; DAYS.forEach((x) => (nd[x] = { ...src })); setDirty(true); setD(nd); } setOpen(null); }}>Usar em todos os dias</button><button className="btn btn-ink" onClick={() => setOpen(null)}>Pronto</button></>}>
        {open && settings.mealTypes.map((m) => (
          <div key={m.id}>
            <span className="label">{m.label}</span>
            <div className="chips">
              <Chip on={!d[open]?.[m.id]} onClick={() => { setDirty(true); setD({ ...d, [open]: { ...(d[open] ?? {}), [m.id]: null } }); }}>Nada</Chip>
              {active.map((t) => <Chip key={t.id} color="honey" on={d[open]?.[m.id] === t.id} onClick={() => { setDirty(true); setD({ ...d, [open]: { ...(d[open] ?? {}), [m.id]: t.id } }); }}>{t.name}</Chip>)}
            </div>
          </div>
        ))}
      </Sheet>
    </>
  );
}

const PREF_HINT = {
  skin: { title: 'Suas preferências para a rotina', ph: 'Ex.: quero usar ácidos várias vezes na semana; prefiro rotina curta de manhã; não gosto de óleo no rosto; lavo o cabelo de manhã' },
  training: { title: 'Suas preferências para a semana de treino', ph: 'Ex.: musculação sempre de manhã; pedal longo no sábado; não quero treinar domingo' },
  food: { title: 'Suas preferências para o plano', ph: 'Ex.: café da manhã sempre doce; jantar leve; não como peixe' }
} as const;

/** O que ela prefere: a IA segue, e só ajusta (explicando) quando a combinação for claramente danosa. */
function AIPrefs({ domain }: { domain: 'skin' | 'training' | 'food' }) {
  const settings = useSettings();
  const saved = settings?.aiPrefs?.[domain] ?? '';
  const [text, setText] = useState<string | null>(null);
  const value = text ?? saved;
  const isSaved = value.trim() === saved.trim();
  const save = async (announce: boolean) => {
    await update<'settings'>('settings', { aiPrefs: { ...(settings?.aiPrefs ?? {}), [domain]: value.trim() || undefined } } as any);
    if (announce) toast('Preferências salvas. A IA vai considerar na próxima montagem.');
  };
  if (!settings) return null;
  return (
    <section className="block b-paper ai-prefs" data-testid={`ai-prefs-${domain}`}>
      <span className="label" style={{ marginTop: 0 }}>{PREF_HINT[domain].title}</span>
      <textarea value={value} onChange={(e) => setText(e.target.value)} onBlur={() => !isSaved && save(false)} placeholder={PREF_HINT[domain].ph} rows={3} aria-label={PREF_HINT[domain].title} />
      <div className="row between" style={{ marginTop: 8, alignItems: 'center', gap: 8 }}>
        <span className="tiny muted" style={{ flex: 1 }}>A IA segue o que você escrever. Se alguma combinação puder machucar, ela ajusta e explica o porquê.</span>
        {isSaved ? (value.trim() ? <span className="small saved-ok" data-testid="ai-prefs-saved"><Check size={15} strokeWidth={3} /> Salvo</span> : null)
          : <button className="pill-act pa-ghost" onClick={() => save(true)} data-testid="ai-prefs-save">Salvar</button>}
      </div>
    </section>
  );
}

