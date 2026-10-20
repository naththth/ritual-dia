import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHead , useBack } from './common';
import { useAll, useSettings } from '../db/hooks';
import { Chip, Sheet, Empty } from '../ui/ui';
import { planFor } from '../domain/rules';
import { savePlan } from '../domain/actions';
import { todayKey, WEEKDAY_LONG, shortLabel } from '../lib/dates';
import type { Plan, Product, SkinPeriodPlan } from '../db/types';
import { ProductPick } from './SkinScreen';
import { aiSkinPlan, aiTrainingPlan, applyTrainingResult, aiFoodPlan, aiAvailable, watts } from '../domain/ai';
import { Sparkles } from 'lucide-react';
import { toast } from '../state/store';
import { GROUP_RANK } from '../domain/defaults';

const DAYS = [1, 2, 3, 4, 5, 6, 7];
const emptySkin = (): NonNullable<Plan['skin']> => ({ am: { base: [], days: {} }, pm: { base: [], days: {} }, recovery: { am: [], pm: [] } });

export function PlanScreen() {
  const { domain = 'skin' } = useParams();
  const title = { skin: 'Pele, corpo e cabelo', training: 'Plano de treino', food: 'Plano de alimentação' }[domain] ?? 'Plano';
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

/* ---------------- Pele, corpo e cabelo ---------------- */
type SkinTab = 'am' | 'pm' | 'corpo' | 'cabelo' | 'rec';
const TAB_KEY = { am: 'am', pm: 'pm', corpo: 'body', cabelo: 'hair' } as const;
const TAB_NAME: Record<Exclude<SkinTab, 'rec'>, string> = { am: 'manhã', pm: 'noite', corpo: 'corpo', cabelo: 'cabelo' };

function SkinPlan() {
  const { plans, current } = useCurrent('skin');
  const products = useAll('product');
  const nav = useNavigate();
  const back = useBack();
  const [d, setD] = useState<NonNullable<Plan['skin']> | null>(null);
  const [tab, setTab] = useState<SkinTab>('am');
  const [baseOpen, setBaseOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ resumo: string; observacoes: string } | null>(null);
  useEffect(() => { if (plans && !dirty) setD(structuredClone(current?.skin ?? emptySkin())); }, [plans, current?.id, current?.updatedAt]);
  const setDD = (v: NonNullable<Plan['skin']>) => { setDirty(true); setD(v); };
  if (!d || !products) return null;
  const area = tab === 'corpo' ? 'corpo' : tab === 'cabelo' ? 'cabelo' : 'rosto';
  const inUse = products.filter((p) => p.status === 'em_uso' && p.area === area);
  const faceInUse = products.filter((p) => p.status === 'em_uso' && p.area === 'rosto');
  const byId = new Map(products.map((p) => [p.id, p]));
  const sortIds = (ids: string[]) => [...ids].sort((a, b) => (GROUP_RANK[byId.get(a)?.group ?? 'hidratacao'] - GROUP_RANK[byId.get(b)?.group ?? 'hidratacao']));
  const names = (ids: string[]) => sortIds(ids).map((id) => byId.get(id)?.name).filter(Boolean).join(', ');

  if (products.filter((p) => p.status === 'em_uso').length === 0) {
    return <Empty text="Nenhum produto marcado como em uso. Faça a revisão dos produtos primeiro." action={<button className="btn btn-ink" onClick={() => nav('/revisao')}>Revisar produtos</button>} />;
  }
  const key = tab === 'rec' ? null : TAB_KEY[tab];
  const pp: SkinPeriodPlan | null = key ? (d[key] ?? { base: [], days: {} }) : null;
  const setPP = (v: SkinPeriodPlan) => key && setDD({ ...d, [key]: v });
  const hair = tab === 'cabelo';
  const isWash = (wd: number) => !hair || !pp?.washDays || pp.washDays.includes(wd);
  const dayList = (p: SkinPeriodPlan, wd: number) => {
    const day = p.days[wd] ?? { add: [], remove: [] };
    const base = isWash(wd) ? p.base : [];
    return [...base.filter((id) => !day.remove.includes(id)), ...day.add];
  };
  const toggleDay = (wd: number, id: string) => {
    if (!pp) return;
    const day = { add: [...(pp.days[wd]?.add ?? [])], remove: [...(pp.days[wd]?.remove ?? [])] };
    if (pp.base.includes(id) && isWash(wd)) day.remove = day.remove.includes(id) ? day.remove.filter((x) => x !== id) : [...day.remove, id];
    else day.add = day.add.includes(id) ? day.add.filter((x) => x !== id) : [...day.add, id];
    setPP({ ...pp, days: { ...pp.days, [wd]: day } });
  };
  const copyToAll = (wd: number) => {
    if (!pp) return;
    const src = pp.days[wd] ?? { add: [], remove: [] };
    const days: SkinPeriodPlan['days'] = {};
    DAYS.forEach((x) => (days[x] = { add: [...src.add], remove: [...src.remove] }));
    setPP({ ...pp, days });
  };
  const toggleWash = (wd: number) => {
    if (!pp) return;
    const cur = pp.washDays ?? [];
    setPP({ ...pp, washDays: (cur.includes(wd) ? cur.filter((x) => x !== wd) : [...cur, wd]).sort() });
  };
  const baseTitle = tab === 'corpo' ? 'Todos os dias' : hair ? 'Nos dias de lavar' : 'Rotina-base';
  const baseEmpty = tab === 'corpo' ? 'Ex.: hidratante depois do banho, protetor nas áreas expostas.' : hair ? 'Ex.: shampoo, condicionador, leave-in ou protetor térmico.' : 'Nenhum produto ainda. Comece pela rotina que se repete todos os dias.';
  return (
    <>
      <VersionNote current={current} />
      <AIButton busy={busy} label="Montar pele, corpo e cabelo com IA" onClick={async () => {
        setBusy(true);
        try { const r = await aiSkinPlan(todayKey()); setDD(r.skin); setNote({ resumo: r.resumo, observacoes: r.observacoes }); toast('Rascunho pronto. Revise e salve.'); }
        catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(false); }
      }} />
      {note && <div className="notice calm" style={{ margin: '10px 0', whiteSpace: 'pre-line' }}>{note.resumo}{note.observacoes ? <><br /><br />{note.observacoes}</> : null}</div>}
      <div className="seg-tabs" role="tablist" aria-label="Rotina">
        {([['am', 'Manhã'], ['pm', 'Noite'], ['corpo', 'Corpo'], ['cabelo', 'Cabelo'], ['rec', 'Recuperação']] as [SkinTab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {pp && inUse.length === 0 && (
        <p className="notice calm" style={{ marginTop: 12 }}>Nenhum produto de {TAB_NAME[tab as Exclude<SkinTab, 'rec'>]} em uso. Cadastre em Biblioteca → Produtos, no tipo {tab === 'cabelo' ? 'Cabelo' : tab === 'corpo' ? 'Corpo' : 'certo'}.</p>
      )}
      {pp && hair && (
        <>
          <div className="section"><h2 className="section-title">Dias de lavar</h2></div>
          <div className="chips" data-testid="wash-days">
            {DAYS.map((wd) => <Chip key={wd} on={!!pp.washDays?.includes(wd)} onClick={() => toggleWash(wd)}>{WEEKDAY_LONG[wd].slice(0, 3)}</Chip>)}
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>Nos dias de lavar entra a rotina abaixo. Nos outros, só o que você marcar para o dia (óleo, tônico, finalizador).</p>
        </>
      )}
      {pp && (
        <>
          <div className="section"><h2 className="section-title">{baseTitle}</h2><button className="link" onClick={() => setBaseOpen(true)} data-testid="edit-base">Editar</button></div>
          <p className="small" style={{ marginTop: 0 }}>{pp.base.length ? names(pp.base) : baseEmpty}</p>
          <div className="section"><h2 className="section-title">Por dia da semana</h2></div>
          {DAYS.map((wd) => {
            const list = dayList(pp, wd);
            const day = pp.days[wd];
            return (
              <button key={wd} className="plan-day tap" onClick={() => setDayOpen(wd)} style={{ display: 'block' }}>
                <div className="dn">{WEEKDAY_LONG[wd]}{hair && pp.washDays?.includes(wd) ? <span className="small muted"> · lavar</span> : null}</div>
                <div className="small">{list.length ? names(list) : 'Nada planejado'}</div>
                {(day?.add.length || day?.remove.length) ? <div className="tiny muted">{day.add.length ? `+ ${names(day.add)}` : ''}{day.add.length && day.remove.length ? '. ' : ''}{day.remove.length ? `sem ${names(day.remove)}` : ''}</div> : null}
              </button>
            );
          })}
        </>
      )}
      {tab === 'rec' && (
        <>
          <p className="small">Lista usada quando você liga o modo recuperação em um dia. Não muda os outros dias.</p>
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
      <button className="btn btn-ink btn-block" style={{ marginTop: 20 }} data-testid="plan-save" onClick={async () => { await savePlan('skin', current, { skin: d }); back(); }}>Salvar plano</button>

      <Sheet open={baseOpen} onClose={() => setBaseOpen(false)} title={tab === 'rec' ? '' : tab === 'am' || tab === 'pm' ? `Rotina-base da ${TAB_NAME[tab]}` : `${baseTitle} · ${TAB_NAME[tab]}`} footer={<button className="btn btn-ink" onClick={() => setBaseOpen(false)}>Pronto</button>}>
        {pp && <ProductToggleList products={inUse} selected={pp.base} onToggle={(id) => setPP({ ...pp, base: pp.base.includes(id) ? pp.base.filter((x) => x !== id) : [...pp.base, id] })} />}
      </Sheet>
      <Sheet open={dayOpen !== null} onClose={() => setDayOpen(null)} title={dayOpen ? WEEKDAY_LONG[dayOpen] : ''} sub={tab === 'rec' ? '' : TAB_NAME[tab]}
        footer={<><button className="btn btn-soft" onClick={() => { if (dayOpen) copyToAll(dayOpen); setDayOpen(null); }}>Usar em todos os dias</button><button className="btn btn-ink" onClick={() => setDayOpen(null)}>Pronto</button></>}>
        {pp && dayOpen && <ProductToggleList products={inUse} selected={dayList(pp, dayOpen)} onToggle={(id) => toggleDay(dayOpen, id)} />}
      </Sheet>
    </>
  );
}

function ProductToggleList({ products, selected, onToggle }: { products: Product[]; selected: string[]; onToggle: (id: string) => void }) {
  return <>{[...products].sort((a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group] || a.brand.localeCompare(b.brand)).map((p) => <ProductPick key={p.id} p={p} on={selected.includes(p.id)} onClick={() => onToggle(p.id)} />)}</>;
}

/* ---------------- Treino ---------------- */
function TrainingPlan() {
  const { plans, current } = useCurrent('training');
  const tmpls = useAll('wtemplate');
  const nav = useNavigate();
  const back = useBack();
  const [d, setD] = useState<Record<number, string[]> | null>(null);
  const settings = useSettings();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resumo, setResumo] = useState('');
  useEffect(() => { if (plans && !dirty) setD(structuredClone(current?.training ?? {})); }, [plans, current?.id, current?.updatedAt]);
  if (!d || !tmpls) return null;
  const active = tmpls.filter((t) => !t.archived);
  const ai = (
    <AIButton busy={busy} label="Montar semana com IA" onClick={async () => {
      setBusy(true);
      try { const r = await aiTrainingPlan(); const week = await applyTrainingResult(r); setDirty(true); setD(week); setResumo(r.resumo); toast('Rascunho pronto. Revise e salve.'); }
      catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(false); }
    }} />
  );
  if (!active.length) return <>{ai}<Empty text="Crie treinos-modelo ou peça à IA para montar a semana." action={<button className="btn btn-ink" onClick={() => nav('/biblioteca/treinos')}>Criar treino-modelo</button>} /></>;
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
      <button className="btn btn-ink btn-block" style={{ marginTop: 20 }} data-testid="plan-save" onClick={async () => { await savePlan('training', current, { training: d }); back(); }}>Salvar plano</button>
    </>
  );
}

/* ---------------- Alimentação ---------------- */
function FoodPlan() {
  const { plans, current } = useCurrent('food');
  const tmpls = useAll('mtemplate');
  const settings = useSettings();
  const nav = useNavigate();
  const back = useBack();
  const [d, setD] = useState<Record<number, Record<string, string | null>> | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [diet, setDiet] = useState('');
  const [showAI, setShowAI] = useState(false);
  const [resumo, setResumo] = useState('');
  useEffect(() => { if (plans && !dirty) setD(structuredClone(current?.food ?? {})); }, [plans, current?.id, current?.updatedAt]);
  if (!d || !tmpls || !settings) return null;
  const active = tmpls.filter((t) => !t.archived);
  const aiBox = (
    <>
      {!showAI ? <AIButton busy={false} label="Montar a partir da minha dieta" onClick={() => setShowAI(true)} /> : (
        <div className="block b-paper" style={{ marginTop: 8 }}>
          <span className="label" style={{ marginTop: 0 }}>Cole aqui o texto da sua dieta</span>
          <textarea value={diet} onChange={(e) => setDiet(e.target.value)} style={{ minHeight: 140 }} aria-label="Texto da dieta" />
          <AIButton busy={busy} label="Montar com IA" onClick={async () => {
            if (diet.trim().length < 20) { toast('Cole o texto da dieta primeiro.', undefined, 'error'); return; }
            setBusy(true);
            try { const r = await aiFoodPlan(diet); setDirty(true); setD(r.week); setResumo(r.resumo); setShowAI(false); toast('Rascunho pronto. Revise e salve.'); }
            catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(false); }
          }} />
        </div>
      )}
      {resumo && <div className="notice calm" style={{ margin: '10px 0' }}>{resumo}</div>}
    </>
  );
  if (!active.length) return <>{aiBox}<Empty text="Salve refeições favoritas ou monte a partir da sua dieta." action={<button className="btn btn-ink" onClick={() => nav('/biblioteca/refeicoes')}>Criar refeição favorita</button>} /></>;
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
      <button className="btn btn-ink btn-block" style={{ marginTop: 20 }} data-testid="plan-save" onClick={async () => { await savePlan('food', current, { food: d }); back(); }}>Salvar plano</button>
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

function AIButton({ busy, label, onClick }: { busy: boolean; label: string; onClick: () => void }) {
  return (
    <button className="btn btn-wine btn-block" style={{ margin: '8px 0' }} disabled={busy || !aiAvailable()} onClick={onClick} data-testid="ai-build">
      <Sparkles size={18} />{busy ? 'Montando…' : aiAvailable() ? label : `${label} (entre com Google e conecte-se)`}
    </button>
  );
}
