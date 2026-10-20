import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useApp } from '../state/store';
import { useAll, useByDate } from '../db/hooks';
import { PageHead , useBack } from './common';
import { Chip, Seg, Sheet, Empty } from '../ui/ui';
import { GROUPS, SKIN_CONDITIONS, SKIN_SIGNALS, INTENSITY_LABEL, BODY_SIGNALS, HAIR_SIGNALS, PERIOD_LABEL } from '../domain/defaults';
import { activesTogether, planFor, plannedSkin } from '../domain/rules';
import { saveSkin, skinId, deleteRecord } from '../domain/actions';
import type { Product, ProductGroup, SkinCondition } from '../db/types';
import { PhotoStrip } from './photos';
import { ProductForm } from './library/ProductForm';

const SECTIONS: { area: 'rosto' | 'corpo' | 'cabelo'; label: string }[] = [
  { area: 'rosto', label: 'Rosto' }, { area: 'corpo', label: 'Corpo' }, { area: 'cabelo', label: 'Cabelo' }
];

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

  const [recovery, setRecovery] = useState(false);
  const [condition, setCondition] = useState<SkinCondition | undefined>();
  const [signals, setSignals] = useState<Record<string, 1 | 2 | 3>>({});
  const [used, setUsed] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [picker, setPicker] = useState(false);
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

  const planned = useMemo(() => plannedSkin(plan, date, period, products ?? [], recovery), [plan, date, period, products, recovery]);
  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const extras = used.filter((id) => !planned.includes(id));
  const alert = activesTogether(used, products ?? []);
  const toggle = (id: string) => setUsed((u) => (u.includes(id) ? u.filter((x) => x !== id) : [...u, id]));
  const areaOfId = (id: string) => byId.get(id)?.area ?? 'rosto';
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

      <div className="section">
        <h2 className="section-title">Produtos</h2>
        <button className={`chip ${recovery ? 'on c-rose' : ''}`} onClick={() => setRecovery(!recovery)} aria-pressed={recovery} style={{ minHeight: 38 }}>Modo recuperação</button>
      </div>
      {recovery && planned.length === 0 && <p className="notice calm">Você ainda não montou a lista de recuperação. Configure em Rotina de cuidados, aba Recuperação.</p>}

      {planned.length > 0 && (
        <>
          <div className="row between" style={{ marginBottom: 4 }}>
            <span className="small muted">{recovery ? 'Lista de recuperação' : 'Do seu plano para hoje'}</span>
            <button className="link" onClick={() => setUsed((u) => Array.from(new Set([...u, ...planned])))} data-testid="skin-use-all">Usei tudo</button>
          </div>
          {SECTIONS.map((sec) => {
            const ids = planned.filter((id) => areaOfId(id) === sec.area);
            if (!ids.length) return null;
            return (
              <div key={sec.area} data-testid={`skin-sec-${sec.area}`}>
                <h3 className="sec-cap">{sec.label}</h3>
                {ids.map((id) => <ProductPick key={id} p={byId.get(id)!} on={used.includes(id)} onClick={() => toggle(id)} />)}
              </div>
            );
          })}
        </>
      )}
      {planned.length === 0 && !recovery && (
        <p className="notice calm">Sem plano para este dia. Escolha os produtos da sua lista ou <button className="link" style={{ minHeight: 0 }} onClick={() => nav('/plano/skin')}>monte o plano</button>.</p>
      )}

      {extras.length > 0 && (
        <>
          <span className="label">Fora do plano</span>
          {extras.map((id) => byId.get(id) && <ProductPick key={id} p={byId.get(id)!} on onClick={() => toggle(id)} />)}
        </>
      )}
      <button className="btn btn-soft btn-block" style={{ marginTop: 10 }} onClick={() => setPicker(true)} data-testid="skin-add-from-list"><Plus size={18} />Da minha lista</button>

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

      <ProductPicker open={picker} onClose={() => setPicker(false)} selected={used} onToggle={toggle} />
    </div>
  );
}

export function ProductPick({ p, on, onClick }: { p: Product; on: boolean; onClick: () => void }) {
  if (!p) return null;
  return (
    <button className={`pick ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on} data-testid="product-pick">
      <span className={`check ${on ? 'on' : ''}`} aria-hidden>{on && '✓'}</span>
      <span className="grow">
        <span className="brand">{p.brand}</span><br />
        <span className="nm">{p.name}</span>
      </span>
      {p.active && <span className="prio baixa">ativo</span>}
    </button>
  );
}

export function ProductPicker({ open, onClose, selected, onToggle, area }: { open: boolean; onClose: () => void; selected: string[]; onToggle: (id: string) => void; area?: 'rosto' | 'corpo' | 'cabelo' }) {
  const products = useAll('product');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<ProductGroup | ''>('');
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const list = (products ?? [])
    .filter((p) => showAll ? !['arquivado', 'de_outra'].includes(p.status) : p.status === 'em_uso')
    .filter((p) => !area || p.area === area || !!group)
    .filter((p) => !group || p.group === group)
    .filter((p) => !q || `${p.brand} ${p.name}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.brand.localeCompare(b.brand));
  return (
    <Sheet open={open} onClose={onClose} title="Minha lista" sub="Toque para marcar como usado" footer={<button className="btn btn-ink" onClick={onClose}>Pronto</button>}>
      {adding ? (
        <ProductForm onDone={(p) => { setAdding(false); if (p) onToggle(p.id); }} />
      ) : (
        <>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--ink-2)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto" style={{ paddingLeft: 40 }} aria-label="Buscar produto" />
          </div>
          <div className="chips scroll" style={{ marginBottom: 10 }}>
            <Chip on={!group} onClick={() => setGroup('')}>Todos</Chip>
            {GROUPS.map((g) => <Chip key={g.id} color="rose" on={group === g.id} onClick={() => setGroup(group === g.id ? '' : g.id)}>{g.label}</Chip>)}
          </div>
          {list.map((p) => <ProductPick key={p.id} p={p} on={selected.includes(p.id)} onClick={() => onToggle(p.id)} />)}
          {list.length === 0 && <Empty text={showAll ? 'Nenhum produto encontrado.' : 'Nenhum produto em uso com esse filtro.'} />}
          <div className="row wrap" style={{ marginTop: 12 }}>
            <button className="link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Mostrar só os em uso' : 'Incluir guardados e para conferir'}</button>
            <button className="btn btn-soft btn-sm" onClick={() => setAdding(true)}><Plus size={16} />Cadastrar produto</button>
          </div>
        </>
      )}
    </Sheet>
  );
}
