import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useApp } from '../state/store';
import { useAll, useByDate } from '../db/hooks';
import { PageHead , useBack } from './common';
import { Chip, Seg, Sheet, Empty } from '../ui/ui';
import { GROUPS, SKIN_CONDITIONS, SKIN_SIGNALS, INTENSITY_LABEL, BODY_SIGNALS, HAIR_SIGNALS, PERIOD_LABEL } from '../domain/defaults';
import { activesTogether, planFor, plannedSkin, plannedTraining } from '../domain/rules';
import { nightAdjust } from '../domain/skinAdapt';
import { effectiveSleep } from '../domain/wellness';
import { cycleInfo } from '../domain/cycle';
import { useCycle } from './cycle';
import { saveSkin, skinId, deleteRecord } from '../domain/actions';
import { update } from '../db/db';
import { AREAS, OWNED, STEPS, applicationOrder, layerLabel, layerOf, productStep, shortUse, type Area, type Step } from '../domain/skinSteps';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { SpecialistLink } from './specchat';
import { ProductThumb } from '../ui/ProductThumb';
export { ProductThumb };
import type { Product, ProductGroup, SkinCondition } from '../db/types';
import { PhotoStrip } from './photos';
import { ProductForm } from './library/ProductForm';


export function SkinScreen() {
  const date = useApp((s) => s.date);
  const [params] = useSearchParams();
  const nav = useNavigate();
  const back = useBack();
  // Corpo e cabelo fazem parte da rotina da manhã ou da noite; links antigos para essas abas abrem a noite.
  const initial = params.get('p');
  const [period, setPeriod] = useState<'am' | 'pm'>(() => (initial === 'am' || initial === 'pm' ? initial : initial ? 'pm' : new Date().getHours() < 14 ? 'am' : 'pm'));
  const logs = useByDate('skin', date);
  const photos = useByDate('photo', date);
  const products = useAll('product');
  const plans = useAll('plan');
  const log = logs?.find((l) => l.period === period);
  const plan = planFor(plans ?? [], 'skin', date);
  const workouts = useByDate('workout', date);
  const wellness = useByDate('wellness', date);
  const tmpls = useAll('wtemplate');
  const skips = useByDate('skip', date);
  const dayExtras = useByDate('extra', date);
  const { stats: cStats, profile } = useCycle();

  const [recovery, setRecovery] = useState(false);
  const [condition, setCondition] = useState<SkinCondition | undefined>();
  const [signals, setSignals] = useState<Record<string, 1 | 2 | 3>>({});
  const [used, setUsed] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  /** Onde ela tocou em "adicionar": o seletor abre já filtrado por etapa e área. */
  const [picker, setPicker] = useState<{ step: Step; area: Area } | null>(null);
  const [loadedKey, setLoadedKey] = useState('');

  const key = `${date}:${period}:${log?.updatedAt ?? 'none'}`;
  useEffect(() => {
    if (!logs || key === loadedKey) return;
    setLoadedKey(key);
    setRecovery(!!log?.recovery);
    setCondition(log?.condition);
    setSignals(log?.signals ?? {});
    setUsed(log?.productIds ?? []);
    setNote(log?.note ?? '');
    setShowNote(!!log?.note);
  }, [key, logs]);

  const [dropped, setDropped] = useState<string[]>([]);
  const dayMods = useMemo(() => ({ skips: skips ?? [], extras: dayExtras ?? [] }), [skips, dayExtras]);
  const basePlanned = useMemo(() => plannedSkin(plan, date, period, products ?? [], recovery, dayMods), [plan, date, period, products, recovery, dayMods]);
  const planned = basePlanned.filter((id) => !dropped.includes(id));
  // Ajuste da noite: pele de hoje, ativo da manhã, treino, sono e ciclo. Só aparece antes de registrar a noite.
  const adjustKey = `night-adjust:${date}`;
  const [choice, setChoice] = useState<string | null>(() => { try { return localStorage.getItem(adjustKey); } catch { return null; } });
  const adjust = useMemo(() => {
    if (period !== 'pm' || log || !products) return undefined;
    const skipped = new Set((skips ?? []).filter((x) => x.domain === 'training').map((x) => x.ref));
    const plannedW = plannedTraining(planFor(plans ?? [], 'training', date), date, dayExtras).map((id) => (tmpls ?? []).find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t && !skipped.has(t.id));
    const w = (wellness ?? [])[0];
    return nightAdjust({
      plannedPm: plannedSkin(plan, date, 'pm', products, false, dayMods), recoveryPm: plan?.skin?.recovery?.pm ?? [], products,
      amLog: logs?.find((l) => l.period === 'am'), liveSignals: signals, liveCondition: condition,
      workouts: workouts ?? [], plannedWorkouts: plannedW, sleepH: effectiveSleep(w)?.h, phase: cycleInfo(date, cStats, profile)?.phase
    });
  }, [period, log, products, plan, date, logs, signals, condition, workouts, wellness, tmpls, plans, skips, dayExtras, dayMods, cStats, profile]);
  const decide = (c: 'applied' | 'kept') => { setChoice(c); try { localStorage.setItem(adjustKey, c); } catch { /* */ } };
  const applyAdjust = () => {
    if (!adjust) return;
    if (adjust.useRecovery) setRecovery(true); else setDropped(adjust.remove);
    setUsed((u) => u.filter((id) => !adjust.remove.includes(id)));
    decide('applied');
  };
  useEffect(() => { if (choice === 'applied' && adjust?.kind === 'swap' && !recovery && !dropped.length) { if (adjust.useRecovery) setRecovery(true); else setDropped(adjust.remove); } }, [choice, adjust?.kind]);
  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const extras = used.filter((id) => !planned.includes(id));
  const alert = activesTogether(used, products ?? []);
  const toggle = (id: string) => setUsed((u) => (u.includes(id) ? u.filter((x) => x !== id) : [...u, id]));
  const areaOfId = (id: string) => (byId.get(id)?.area ?? 'rosto') as Area;
  const stepOfId = (id: string) => { const p = byId.get(id); return p ? productStep(p) : 'pos'; };
  // Combinado com a dermatologista para este dia: aparece marcado no produto.
  const byDerm = new Set((dayExtras ?? []).filter((e) => e.domain === 'skin' && e.ref.startsWith(`${period}:`)).map((e) => e.ref.slice(period.length + 1)));
  const shown = applicationOrder([...planned, ...extras], byId);
  const [reorder, setReorder] = useState<string | null>(null);
  /** Sobe ou desce um produto na ordem: passa para a camada do vizinho e as posições da camada são renumeradas. Vale para as próximas rotinas. */
  const move = async (list: string[], i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]];
    const layer = layerOf(byId.get(list[j])!);
    await update<'product'>(list[i], { layer });
    const same = next.filter((id) => id === list[i] || layerOf(byId.get(id)!) === layer);
    for (let k = 0; k < same.length; k++) await update<'product'>(same[k], { layerPos: (k + 1) * 10 });
  };
  const pick = (id: string, target: { step: Step; area: Area }) => {
    const p = byId.get(id);
    // Escolhido numa etapa diferente da que o app deduziu: passa a ficar nessa etapa daqui em diante.
    if (p && !used.includes(id) && productStep(p) !== target.step) void update<'product'>(id, { step: target.step });
    toggle(id);
  };
  const hasBodyOrHair = planned.some((id) => areaOfId(id) !== 'rosto') || used.some((id) => areaOfId(id) !== 'rosto');
  const toggleSignal = (id: string) => setSignals((x) => { const n = { ...x }; if (n[id]) delete n[id]; else n[id] = 1; return n; });

  const save = async (skipped = false) => {
    await saveSkin(date, period, {
      condition, signals, productIds: skipped ? [] : used, plannedIds: planned, recovery, note: note.trim() || undefined, skipped
    });
    back();
  };

  return (
    <div className="screen no-nav" data-testid="skin-screen">
      <PageHead title={period === 'am' ? 'Rotina da manhã' : 'Rotina da noite'} />
      <Seg value={period} onChange={(p) => setPeriod(p)} options={[{ id: 'am', label: 'Manhã' }, { id: 'pm', label: 'Noite' }]} label="Período" />

      <span className="label">Como está a pele</span>
      <div className="chips">
        {SKIN_CONDITIONS.map((c) => <Chip key={c.id} color="rose" on={condition === c.id} onClick={() => setCondition(condition === c.id ? undefined : c.id)}>{c.label}</Chip>)}
      </div>
      <span className="label">Sinais no rosto</span>
      <div className="chips">
        {SKIN_SIGNALS.map((x) => <Chip key={x.id} color="rose" on={!!signals[x.id]} testId={`sig-${x.id}`} onClick={() => toggleSignal(x.id)}>{x.label}</Chip>)}
      </div>
      {Object.keys(signals).filter((id) => SKIN_SIGNALS.some((x) => x.id === id)).length > 0 && (
        <div style={{ marginTop: 10 }}>
          {Object.entries(signals).filter(([id]) => SKIN_SIGNALS.some((x) => x.id === id)).map(([id, lvl]) => (
            <div key={id} className="row between" style={{ minHeight: 48 }}>
              <span className="small" style={{ fontWeight: 600 }}>{SKIN_SIGNALS.find((s) => s.id === id)?.label}</span>
              <div className="row" style={{ gap: 4 }}>
                {([1, 2, 3] as const).map((n) => (
                  <button key={n} className={`chip ${lvl === n ? 'on c-rose' : ''}`} style={{ minHeight: 38, padding: '0 12px', fontSize: 13.5 }} onClick={() => setSignals((x) => ({ ...x, [id]: n }))}>{INTENSITY_LABEL[n]}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {hasBodyOrHair && (
        <>
          <span className="label">Corpo e cabelo</span>
          <div className="chips" data-testid="body-hair-signals">
            {[...BODY_SIGNALS, ...HAIR_SIGNALS].map((x) => <Chip key={x.id} color="rose" on={!!signals[x.id]} testId={`sig-${x.id}`} onClick={() => toggleSignal(x.id)}>{x.label}</Chip>)}
          </div>
        </>
      )}

      {adjust && choice !== 'kept' && !(choice === 'applied' && adjust.kind === 'swap') && (
        <section className={`night-adjust ${adjust.kind}`} data-testid="night-adjust" role="note">
          <b>{adjust.title}</b>
          <p className="small" style={{ margin: '4px 0 0' }}>Por quê: {adjust.reasons.join('; ')}.</p>
          <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
            {adjust.kind === 'swap' && <button className="pill-act pa-rose" onClick={applyAdjust} data-testid="night-adjust-apply">{adjust.useRecovery ? 'Usar a recuperação hoje' : 'Tirar hoje'}</button>}
            <button className="pill-act pa-ghost" onClick={() => decide('kept')} data-testid="night-adjust-keep">{adjust.kind === 'swap' ? 'Manter o plano' : 'Ok'}</button>
          </div>
        </section>
      )}
      {choice === 'applied' && adjust?.kind === 'swap' && <p className="small" style={{ margin: '14px 0 0' }} data-testid="night-adjust-done">Ajuste de hoje aplicado: sem ativo forte esta noite. <button className="link" style={{ minHeight: 0 }} onClick={() => { setDropped([]); setRecovery(false); decide('kept'); }}>Desfazer</button></p>}

      <div className="section">
        <h2 className="section-title">Produtos</h2>
        <button className={`chip ${recovery ? 'on c-rose' : ''}`} onClick={() => setRecovery(!recovery)} aria-pressed={recovery} style={{ minHeight: 38 }}>Modo recuperação</button>
      </div>
      {recovery && planned.length === 0 && <p className="notice calm">Você ainda não montou a lista de recuperação. Configure em Rotina de cuidados, aba Recuperação.</p>}
      {planned.length === 0 && !recovery && (
        <p className="notice calm">Sem plano para este dia. Marque abaixo o que usou ou <button className="link" style={{ minHeight: 0 }} onClick={() => nav('/cuidados/rotina')}>monte o plano</button>.</p>
      )}
      {planned.length > 0 && (
        <div className="row between" style={{ marginBottom: -4 }}>
          <span className="small muted">{recovery ? 'Lista de recuperação' : 'Do seu plano para hoje'} · {used.length} de {shown.length} marcados</span>
          <button className="link" onClick={() => setUsed((u) => Array.from(new Set([...u, ...planned])))} data-testid="skin-use-all">Usei tudo</button>
        </div>
      )}

      {STEPS.map((st) => {
        const ids = shown.filter((id) => byId.get(id) && stepOfId(id) === st.id);
        return (
          <section key={st.id} className="stage" data-testid={`stage-${st.id}`} aria-label={st.label}>
            <div className="stage-head">
              <h3>{st.label}</h3>
              <span className="hint">{st.hint}</span>
            </div>
            {/* Rosto, cabelo e corpo sempre à vista: o que está vazio mostra só o botão de adicionar. */}
            {AREAS.map((a) => {
              const list = ids.filter((id) => areaOfId(id) === a.id);
              const n = list.filter((id) => used.includes(id)).length;
              return (
                <div key={a.id} className={`stage-area${list.length ? '' : ' empty'}`} data-testid={`skin-sec-${st.id}-${a.id}`}>
                  <h4 className="sec-cap">{a.label} <span>{list.length ? `${n} de ${list.length}` : 'nada hoje'}{list.length > 1 && <button className="link reorder-link" onClick={() => setReorder(reorder === `${st.id}-${a.id}` ? null : `${st.id}-${a.id}`)} data-testid={`reorder-${st.id}-${a.id}`}>{reorder === `${st.id}-${a.id}` ? 'Pronto' : 'Mudar ordem'}</button>}</span></h4>
                  {list.map((id, k) => reorder === `${st.id}-${a.id}` ? (
                    <div key={id} className="pick reorder" data-testid="reorder-row">
                      <span className="step-num" aria-hidden>{k + 1}</span>
                      <ProductThumb p={byId.get(id)!} />
                      <span className="grow"><span className="brand">{byId.get(id)!.brand}</span><br /><span className="nm">{byId.get(id)!.name}</span></span>
                      <button className="icon-btn" aria-label="Subir" disabled={k === 0} onClick={() => void move(list, k, -1)}><ArrowUp size={18} /></button>
                      <button className="icon-btn" aria-label="Descer" disabled={k === list.length - 1} onClick={() => void move(list, k, 1)}><ArrowDown size={18} /></button>
                    </div>
                  ) : <ProductPick key={id} p={byId.get(id)!} num={k + 1} on={used.includes(id)} onClick={() => toggle(id)} tag={!planned.includes(id) ? 'fora do plano' : byDerm.has(id) ? 'da dermato, hoje' : undefined} />)}
                  <button className="add-in" onClick={() => setPicker({ step: st.id, area: a.id })} data-testid={`skin-add-${st.id}-${a.id}`}><Plus size={16} />{list.length ? `Outro produto de ${a.label.toLowerCase()}` : `Adicionar produto de ${a.label.toLowerCase()}`}</button>
                </div>
              );
            })}
          </section>
        );
      })}

      <div className="row between" style={{ marginTop: 14, gap: 10, flexWrap: 'wrap' }}>
        <span className="small muted" style={{ flex: '1 1 160px' }}>Quer mudar a rotina de hoje ou da semana?</span>
        <SpecialistLink domain="skin" label="Falar com a dermatologista" />
      </div>

      {alert.length > 0 && (
        <p className="notice" style={{ marginTop: 12 }} role="note">
          Você marcou {alert.map((p) => p.name).join(' e ')} como ativos e eles estão juntos neste período. Confira se é isso mesmo. É só um lembrete, não uma recomendação.
        </p>
      )}

      <span className="label">Fotos <span className="muted small">(opcional, privadas)</span></span>
      <PhotoStrip date={date} period={period} photos={(photos ?? []).filter((p) => p.period === period)} />

      {!showNote ? <button className="link" onClick={() => setShowNote(true)}>Adicionar observação</button> : (
        <>
          <span className="label">Observação</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} aria-label="Observação" />
        </>
      )}

      <div className="row" style={{ marginTop: 24, gap: 10 }}>
        {log ? (
          <button className="btn btn-soft" onClick={async () => { await deleteRecord(skinId(date, period), 'Registro apagado'); back(); }}>Apagar</button>
        ) : (
          <button className="btn btn-soft" onClick={() => save(true)}>Pular</button>
        )}
        <button className="btn btn-ink grow" onClick={() => save(false)} data-testid="skin-save">Salvar {PERIOD_LABEL[period]}</button>
      </div>

      <ProductPicker open={!!picker} onClose={() => setPicker(null)} selected={used} onToggle={(id) => (picker ? pick(id, picker) : toggle(id))} area={picker?.area} step={picker?.step} />
    </div>
  );
}

export function ProductPick({ p, on, onClick, tag, num }: { p: Product; on: boolean; onClick: () => void; tag?: string; num?: number }) {
  if (!p) return null;
  return (
    <button className={`pick ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on} data-testid="product-pick">
      <span className={`check ${on ? 'on' : ''}`} aria-hidden>{on && '✓'}</span>
      <ProductThumb p={p} />
      <span className="grow">
        {num != null && <span className="step-line" data-testid="step-line">Passo {num} · {layerLabel(layerOf(p))}</span>}
        <span className="brand">{p.brand}</span><br />
        <span className="nm">{p.name}</span>
        {num != null && shortUse(p) && <span className="use-line">{shortUse(p)}</span>}
        {tag && <><br /><span className="step-tag">{tag}</span></>}
      </span>
      {p.active && <span className="prio baixa">ativo</span>}
    </button>
  );
}

export function ProductPicker({ open, onClose, selected, onToggle, area, step }: { open: boolean; onClose: () => void; selected: string[]; onToggle: (id: string) => void; area?: 'rosto' | 'corpo' | 'cabelo'; step?: Step }) {
  const products = useAll('product');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<ProductGroup | ''>('');
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (open) { setQ(''); setGroup(''); setAdding(false); } }, [open, area, step]);
  // Por padrão, tudo o que ela tem (em uso, guardado, para conferir); com o filtro, também o que acabou ou quer comprar.
  const list = (products ?? [])
    .filter((p) => showAll ? !['arquivado', 'de_outra'].includes(p.status) : OWNED.has(p.status))
    .filter((p) => !area || p.area === area)
    .filter((p) => !group || p.group === group)
    .filter((p) => !q || `${p.brand} ${p.name}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (step ? Number(productStep(b) === step) - Number(productStep(a) === step) : 0) || Number(b.status === 'em_uso') - Number(a.status === 'em_uso') || a.brand.localeCompare(b.brand));
  const areaLabel = AREAS.find((a) => a.id === area)?.label;
  const stepLabel = STEPS.find((s) => s.id === step)?.label.toLowerCase();
  const tagOf = (p: Product) => {
    const bits = [p.status !== 'em_uso' ? STATUS_SHORT[p.status] : '', step && productStep(p) !== step ? `passa para ${stepLabel}` : ''].filter(Boolean);
    return bits.length ? bits.join(' · ') : undefined;
  };
  return (
    <Sheet open={open} onClose={onClose} title={areaLabel ? `${areaLabel}${stepLabel ? ` · ${stepLabel}` : ''}` : 'Minha lista'} sub="Os produtos que você tem. Toque para marcar como usado." footer={<button className="btn btn-ink" onClick={onClose}>Pronto</button>}>
      {adding ? (
        <ProductForm initial={{ area: area ?? 'rosto', group: area === 'cabelo' ? 'cabelo' : area === 'corpo' ? 'corpo' : step === 'banho' ? 'limpeza' : 'hidratacao', step }} onDone={(p) => { setAdding(false); if (p) onToggle(p.id); }} />
      ) : (
        <>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--ink-2)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto" style={{ paddingLeft: 40 }} aria-label="Buscar produto" />
          </div>
          {!area && (
            <div className="chips scroll" style={{ marginBottom: 10 }}>
              <Chip on={!group} onClick={() => setGroup('')}>Todos</Chip>
              {GROUPS.map((g) => <Chip key={g.id} color="rose" on={group === g.id} onClick={() => setGroup(group === g.id ? '' : g.id)}>{g.label}</Chip>)}
            </div>
          )}
          {list.map((p) => <ProductPick key={p.id} p={p} on={selected.includes(p.id)} onClick={() => onToggle(p.id)} tag={tagOf(p)} />)}
          {list.length === 0 && <Empty text={q ? 'Nenhum produto com esse nome.' : areaLabel ? `Nenhum produto de ${areaLabel.toLowerCase()} cadastrado.` : 'Nenhum produto com esse filtro.'} />}
          <div className="row wrap" style={{ marginTop: 12 }}>
            <button className="link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Só os que tenho' : 'Incluir os que acabaram'}</button>
            <button className="btn btn-soft btn-sm" onClick={() => setAdding(true)}><Plus size={16} />Cadastrar produto</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

const STATUS_SHORT: Record<string, string> = { guardado: 'guardado', conferir: 'para conferir', acabou: 'acabou', quero_comprar: 'quero comprar' };
