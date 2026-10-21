import { useEffect, useRef, useState } from 'react';
import { usePhotoPicker } from '../../ui/PhotoPicker';
import { Plus, Trash2, Search, Camera } from 'lucide-react';
import { BarcodeButton } from './Barcode';
import { aiAvailable, askAI } from '../../domain/ai';
import { shrinkImage } from '../../lib/image';
import { create, update } from '../../db/db';
import type { Food, Measure, Nutr } from '../../db/types';
import { Chip } from '../../ui/ui';
import { toast } from '../../state/store';
import { useAll } from '../../db/hooks';
import { loadTaco, searchList, searchOFF, typeFromTacoCat, fmt, norm, type OffFood, type TacoFood } from '../../domain/nutrition';

const TYPES = ['Proteína', 'Carboidrato', 'Leguminosas', 'Vegetais', 'Fruta', 'Laticínios', 'Laticínios sem lactose', 'Complemento', 'Suplemento', 'Bebida', 'Doce', 'Outros'];

/** Lista suspensa enquanto ela digita: seus alimentos, tabela TACO e, se pedir, marcas (Open Food Facts). */
export function FoodSuggest({ q, onPickTaco, onPickOff, onPickMine, excludeMine }: {
  q: string; onPickTaco: (t: TacoFood) => void; onPickOff: (o: OffFood) => void; onPickMine?: (f: Food) => void; excludeMine?: boolean;
}) {
  const foods = useAll('food');
  const [taco, setTaco] = useState<TacoFood[]>([]);
  const [off, setOff] = useState<OffFood[] | null>(null);
  const [offBusy, setOffBusy] = useState(false);
  const [offErr, setOffErr] = useState('');
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => {
    setOff(null); setOffErr('');
    if (q.trim().length < 2) { setTaco([]); return; }
    let alive = true;
    loadTaco().then((all) => { if (alive) setTaco(searchList(all, q, (t) => t.name, 6)); }).catch(() => setTaco([]));
    // marcas entram sozinhas quando ela para de digitar
    const t = q.trim().length >= 3 ? setTimeout(() => { if (alive) brands(); }, 650) : undefined;
    return () => { alive = false; if (t) clearTimeout(t); };
  }, [q]);
  if (q.trim().length < 2) return null;
  const mine = excludeMine ? [] : searchList((foods ?? []).filter((f) => !f.archived), q, (f) => f.name, 4);
  async function brands() {
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    setOffBusy(true); setOffErr('');
    try { setOff(await searchOFF(q, ctrl.current.signal)); } catch (e: any) { if (e?.name !== 'AbortError') setOffErr(navigator.onLine ? 'Busca de marcas indisponível agora.' : 'Sem internet para buscar marcas.'); }
    finally { setOffBusy(false); }
  }
  const nLine = (n: Nutr | null) => (n ? `${fmt(n.kcal)} kcal, P ${fmt(n.p)} g, C ${fmt(n.c)} g, G ${fmt(n.f)} g por 100 g` : 'sem dados de energia');
  return (
    <div className="suggest" role="listbox" aria-label="Sugestões de alimentos" data-testid="food-suggest">
      {mine.length > 0 && onPickMine && <div className="sg-head">Meus alimentos</div>}
      {onPickMine && mine.map((f) => (
        <button key={f.id} className="sg-item" role="option" onClick={() => onPickMine(f)}>
          <span className="sg-name">{f.name}</span>
          <span className="sg-meta">{f.n ? `${fmt(f.n.kcal)} kcal por 100 g` : f.type}</span>
        </button>
      ))}
      {taco.length > 0 && <div className="sg-head">Tabela TACO</div>}
      {taco.map((t) => (
        <button key={t.id} className="sg-item" role="option" onClick={() => onPickTaco(t)} data-testid="taco-option">
          <span className="sg-name">{t.name}</span>
          <span className="sg-meta">{nLine(t.n)}</span>
        </button>
      ))}
      {off === null ? (
        <button className="sg-more" onClick={brands} disabled={offBusy}><Search size={15} />{offBusy ? 'Buscando marcas…' : `Buscar "${q.trim()}" em produtos de marca`}</button>
      ) : off.length === 0 ? <div className="sg-meta" style={{ padding: '10px 4px' }}>Nenhum produto de marca encontrado.</div> : (
        <>
          <div className="sg-head">Produtos de marca (Open Food Facts)</div>
          {off.map((o) => (
            <button key={o.code} className="sg-item" role="option" onClick={() => onPickOff(o)}>
              <span className="sg-name">{o.name}{o.brand ? `, ${o.brand}` : ''}</span>
              <span className="sg-meta">{nLine(o.n)}</span>
            </button>
          ))}
        </>
      )}
      {offErr && <div className="sg-meta" style={{ padding: '8px 4px', color: 'var(--alert)' }}>{offErr}</div>}
    </div>
  );
}

export function foodFromTaco(t: TacoFood): Partial<Food> {
  return { name: t.name, type: typeFromTacoCat(t.cat), n: t.n ?? undefined, source: 'taco', sourceRef: String(t.id), measures: [{ label: '100 g', grams: 100 }], portions: [] };
}
export function foodFromOff(o: OffFood): Partial<Food> {
  const name = o.brand && !norm(o.name).includes(norm(o.brand)) ? `${o.name} (${o.brand})` : o.name;
  const serving = o.serving && o.serving.grams !== 100 ? [{ label: `1 porção (${fmt(o.serving.grams)} g)`, grams: o.serving.grams }] : [];
  return { name, type: 'Outros', n: o.n ?? undefined, source: 'off', sourceRef: o.code, measures: [{ label: '100 g', grams: 100 }, ...serving], portions: [] };
}

export function FoodForm({ food, onDone }: { food?: Food; onDone: (f?: Food) => void }) {
  const foods = useAll('food');
  const types = Array.from(new Set([...TYPES, ...(foods ?? []).map((f) => f.type)]));
  const [d, setD] = useState<Partial<Food>>(food ?? { name: '', type: 'Outros', portions: [], measures: [{ label: '100 g', grams: 100 }], favorite: false });
  const [q, setQ] = useState(food ? '' : '');
  const [picked, setPicked] = useState(!!food);
  const [mLabel, setMLabel] = useState('');
  const [mGrams, setMGrams] = useState('');
  const set = (p: Partial<Food>) => setD((x) => ({ ...x, ...p }));
  const setN = (k: keyof Nutr, v: string) => {
    const num = v === '' ? undefined : Number(v.replace(',', '.'));
    const cur = d.n ?? { kcal: 0, p: 0, c: 0, f: 0 };
    set({ n: { ...cur, [k]: num ?? 0 }, source: d.source === 'manual' || !d.source ? 'manual' : d.source });
  };
  const save = async () => {
    if (!d.name?.trim()) { toast('Informe o nome do alimento.', undefined, 'error'); return; }
    const data = { ...d, name: d.name.trim(), portions: d.portions ?? [], measures: d.measures?.length ? d.measures : [{ label: '100 g', grams: 100 }] } as Food;
    const r = food ? await update<'food'>(food.id, data) : await create('food', data);
    toast(food ? 'Alimento salvo' : 'Alimento cadastrado');
    onDone(r);
  };
  const addMeasure = () => {
    const g = Number(mGrams.replace(',', '.'));
    if (!mLabel.trim() || !(g > 0)) { toast('Informe a medida e o peso em gramas.', undefined, 'error'); return; }
    set({ measures: [...(d.measures ?? []), { label: mLabel.trim(), grams: g }] });
    setMLabel(''); setMGrams('');
  };
  const [reading, setReading] = useState(false);
  const labelPick = usePhotoPicker({ onFiles: (fs) => readLabel(fs[0]) });
  /** A IA lê a tabela do rótulo e converte para 100 g; ela confere antes de salvar. */
  const readLabel = async (file?: File) => {
    if (!file) return;
    setReading(true);
    try {
      const img = await shrinkImage(file);
      const r = await askAI<any>('label_read', { nome_digitado: d.name ?? '' }, [img]);
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
      const nn: Nutr | undefined = num(r.kcal_100g) != null ? { kcal: Math.round(r.kcal_100g), p: num(r.proteina_100g) ?? 0, c: num(r.carboidrato_100g) ?? 0, f: num(r.gordura_100g) ?? 0, fib: num(r.fibra_100g), na: num(r.sodio_mg_100g) } : undefined;
      const g = num(r.porcao_g);
      setD((x) => ({
        ...x,
        name: x.name?.trim() ? x.name : [r.nome, r.marca].filter(Boolean).join(' (') + (r.marca && r.nome ? ')' : ''),
        n: nn ?? x.n, source: 'manual',
        measures: g && !(x.measures ?? []).some((m) => m.grams === g) ? [...(x.measures ?? [{ label: '100 g', grams: 100 }]), { label: r.porcao_rotulo ? `1 porção (${r.porcao_rotulo})` : `1 porção (${g} g)`, grams: g }] : x.measures
      }));
      setPicked(true);
      toast(nn ? 'Tabela lida. Confira os números.' : 'Não consegui ler os valores. Tente uma foto mais de perto.', undefined, nn ? undefined : 'error');
    } catch (e: any) { toast(e.message, undefined, 'error'); } finally { setReading(false); }
  };
  const n = d.n;
  return (
    <div data-testid="food-form">
      <span className="label" style={{ marginTop: 0 }}>Nome</span>
      <div style={{ position: 'relative' }}>
        <input value={d.name ?? ''} onChange={(e) => { set({ name: e.target.value }); setQ(e.target.value); setPicked(false); }} aria-label="Nome do alimento" autoFocus={!food} autoComplete="off" placeholder="Comece a digitar: frango, pão, iogurte…" />
        {!picked && (
          <FoodSuggest q={q} excludeMine
            onPickTaco={(t) => { setD((x) => ({ ...x, ...foodFromTaco(t) })); setPicked(true); }}
            onPickOff={(o) => { setD((x) => ({ ...x, ...foodFromOff(o) })); setPicked(true); }} />
        )}
      </div>
      {d.source && d.source !== 'manual' && <p className="field-hint">Valores da {d.source === 'taco' ? 'tabela TACO (UNICAMP)' : 'base Open Food Facts'}. Você pode ajustar.</p>}

      <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
        <BarcodeButton label="Código de barras" onFound={(o) => { setD((x) => ({ ...x, ...foodFromOff(o) })); setPicked(true); }} />
        <button className="btn btn-soft btn-sm" disabled={reading || !aiAvailable()} onClick={labelPick.open} data-testid="label-photo"><Camera size={18} />{reading ? 'Lendo a tabela…' : 'Foto da tabela nutricional'}</button>
        {labelPick.el}
      </div>

      <span className="label">Valores por 100 g</span>
      <div className="nutr-grid">
        {([['kcal', 'kcal'], ['p', 'Proteína (g)'], ['c', 'Carboidrato (g)'], ['f', 'Gordura (g)'], ['fib', 'Fibra (g)'], ['na', 'Sódio (mg)']] as [keyof Nutr, string][]).map(([k, l]) => (
          <label key={k} className="nutr-cell">
            <span>{l}</span>
            <input inputMode="decimal" value={n?.[k] != null ? String(Math.round((n[k] as number) * 10) / 10) : ''} onChange={(e) => setN(k, e.target.value)} aria-label={l} />
          </label>
        ))}
      </div>

      <span className="label">Medidas que você usa</span>
      {(d.measures ?? []).map((m: Measure, i) => (
        <div key={i} className="row between" style={{ minHeight: 44 }}>
          <span style={{ fontWeight: 600 }}>{m.label}</span>
          <span className="row"><span className="small num">{fmt(m.grams)} g{n ? `, ${fmt((n.kcal * m.grams) / 100)} kcal` : ''}</span>
            <button className="icon-btn" aria-label={`Remover ${m.label}`} onClick={() => set({ measures: d.measures!.filter((_, j) => j !== i) })}><Trash2 size={17} /></button></span>
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <input value={mLabel} onChange={(e) => setMLabel(e.target.value)} placeholder="1 un., 1 fatia, 1 colher" aria-label="Nova medida" style={{ flex: 2 }} />
        <input value={mGrams} onChange={(e) => setMGrams(e.target.value)} inputMode="decimal" placeholder="g" aria-label="Peso da medida em gramas" style={{ flex: 1 }} />
        <button className="btn btn-soft" aria-label="Adicionar medida" onClick={addMeasure}><Plus size={18} /></button>
      </div>

      <span className="label">Grupo</span>
      <div className="chips">{types.map((t) => <Chip key={t} color="honey" on={d.type === t} onClick={() => set({ type: t })}>{t}</Chip>)}</div>
      <span className="label">Favorito</span>
      <div className="chips"><Chip on={!!d.favorite} onClick={() => set({ favorite: true })}>Sim</Chip><Chip on={!d.favorite} onClick={() => set({ favorite: false })}>Não</Chip></div>
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn btn-soft" onClick={() => onDone()}>Cancelar</button>
        <button className="btn btn-ink grow" onClick={save} data-testid="food-save">Salvar alimento</button>
      </div>
    </div>
  );
}
