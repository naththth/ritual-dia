// Peças visuais da alimentação: anel de macros e a ficha do alimento (quantidade antes de ir para o prato).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { update } from '../db/db';
import { useSettings } from '../db/hooks';
import { Sheet } from '../ui/ui';
import type { Food, MealItem, Nutr } from '../db/types';
import { displayFood, fmt, fmtQ, itemFromUnit, pluralize, scale, unitOfItem, unitsFor } from '../domain/nutrition';

export const MACRO_COLORS = { p: '#8E3446', c: '#E0A93B', f: '#6F87BF' };

/** Divisão das calorias entre proteína, carboidrato e gordura (4/4/9 kcal por grama). */
export function macroPct(n: Nutr) {
  const p = n.p * 4, c = n.c * 4, f = n.f * 9;
  const t = p + c + f;
  return t > 0 ? { p: (p / t) * 100, c: (c / t) * 100, f: (f / t) * 100 } : { p: 0, c: 0, f: 0 };
}

/** Anel com as calorias no centro e a fatia de cada macro em volta. */
export function MacroRing({ n, size = 112, stroke = 12, label = 'kcal' }: { n?: Nutr; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const pct = n ? macroPct(n) : { p: 0, c: 0, f: 0 };
  const segs = (['c', 'f', 'p'] as const).map((k) => ({ k, len: (pct[k] / 100) * C }));
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={n ? `${fmt(n.kcal)} kcal` : 'sem dados'} className="macro-ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--paper-2)" strokeWidth={stroke} />
      {segs.map((s) => {
        const el = s.len > 0.5 ? <circle key={s.k} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={MACRO_COLORS[s.k]} strokeWidth={stroke}
          strokeDasharray={`${Math.max(0, s.len - 1.5)} ${C}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`} /> : null;
        off += s.len;
        return el;
      })}
      <text x="50%" y="48%" textAnchor="middle" className="mr-num" style={{ fontSize: size * 0.24 }}>{n ? fmt(n.kcal) : '–'}</text>
      <text x="50%" y="66%" textAnchor="middle" className="mr-lbl" style={{ fontSize: size * 0.11 }}>{label}</text>
    </svg>
  );
}

/** Barra fina com a divisão das calorias entre os macros. */
export function MacroBar({ n }: { n: Nutr }) {
  const p = macroPct(n);
  return (
    <span className="macro-split" aria-hidden>
      {(['p', 'c', 'f'] as const).map((k) => <i key={k} style={{ width: `${p[k]}%`, background: MACRO_COLORS[k] }} />)}
    </span>
  );
}

/** Linha compacta de macros com bolinha de cor: P 25 g · C 30 g · G 10 g. */
export function MacroLine({ n, className = 'small' }: { n: Nutr; className?: string }) {
  return (
    <span className={`macro-line ${className}`}>
      {([['p', 'P', n.p], ['c', 'C', n.c], ['f', 'G', n.f]] as const).map(([k, l, v]) => (
        <span key={k}><i style={{ background: MACRO_COLORS[k] }} />{l} <b className="num">{fmt(v)}</b> g</span>
      ))}
    </span>
  );
}

/** Ficha do alimento: macros da quantidade escolhida, medida caseira ou gramas, e adicionar/atualizar o prato. */
export function FoodSheet({ food, item, mealLabel, onClose, onSave, onRemove }: {
  food?: Food; item?: MealItem; mealLabel: string; onClose: () => void; onSave: (it: MealItem) => void; onRemove?: () => void;
}) {
  const settings = useSettings();
  const units = useMemo(() => unitsFor(food), [food]);
  const [unitKey, setUnitKey] = useState('g');
  const [qty, setQty] = useState('');
  const [fav, setFav] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!food) return;
    setFav(!!food.favorite);
    if (item) { const r = unitOfItem(food, item, units); setUnitKey(r.unit.key); setQty(fmtQ(r.qty)); return; }
    const first = units.find((u) => u.key !== 'g' && u.grams);
    if (first) { setUnitKey(first.key); setQty('1'); } else { setUnitKey('g'); setQty('100'); }
  }, [food?.id, item?.portion]);
  if (!food) return null;
  const u = units.find((x) => x.key === unitKey) ?? units[units.length - 1];
  const n = Number(qty.replace(',', '.'));
  const grams = u.grams && n > 0 ? n * u.grams : undefined;
  const nutr = food.n && grams ? scale(food.n, grams) : undefined;
  const pct = nutr ? macroPct(nutr) : undefined;
  const d = displayFood(food);
  const t = settings?.targets;
  const goals = { p: t?.p, c: t?.c, f: t?.f, kcal: t?.kcal };
  const quick = u.key === 'g' ? [25, 50, 100, 150, 200] : [0.5, 1, 1.5, 2, 3];
  const pickUnit = (k: string) => {
    const nu = units.find((x) => x.key === k)!;
    // Troca de medida mantém o peso quando dá: 2 unidades de 50 g viram 100 g.
    if (nu.key === 'g') setQty(String(Math.round(grams ?? 100)));
    else if (nu.grams && grams && u.key === 'g') setQty(fmtQ(Math.max(0.5, Math.round((grams / nu.grams) * 2) / 2)));
    else setQty('1');
    setUnitKey(k);
  };
  const apply = () => {
    if (u.grams && !(n > 0)) { inputRef.current?.focus(); return; }
    onSave(itemFromUnit(food.id, u, u.grams ? n : 1));
  };
  const toggleFav = async () => { setFav(!fav); await update<'food'>(food.id, { favorite: !fav }); };

  return (
    <Sheet open onClose={onClose} title={d.name} sub={d.brand} testId="qty-sheet"
      footer={<>
        {onRemove && <button className="btn btn-soft" style={{ flex: '0 0 auto' }} aria-label="Tirar do prato" onClick={onRemove}><Trash2 size={18} /></button>}
        <button className="btn btn-ink grow" onClick={apply} data-testid="qty-save">
          {item ? 'Atualizar' : `Adicionar ao ${mealLabel.toLowerCase()}`}{nutr ? ` · ${fmt(nutr.kcal)} kcal` : ''}
        </button>
      </>}>
      <div className="fs-top">
        <MacroRing n={nutr} />
        <div className="fs-macros" data-testid="food-macros">
          {([['p', 'Proteína', nutr?.p, goals.p], ['c', 'Carboidrato', nutr?.c, goals.c], ['f', 'Gordura', nutr?.f, goals.f]] as const).map(([k, l, v, g]) => (
            <div key={k} className="fs-m">
              <span className="fs-dot" style={{ background: MACRO_COLORS[k] }} />
              <span className="fs-ml">{l}</span>
              <b className="num">{v != null ? fmt(v) : '–'} g</b>
              <span className="fs-pct num">{pct ? `${Math.round(pct[k])}%` : ''}</span>
              {g && v != null ? <span className="fs-goal">{Math.round((v / g) * 100)}% da meta</span> : null}
            </div>
          ))}
        </div>
      </div>
      {!food.n && <p className="field-hint">Este alimento não tem calorias cadastradas. Edite em Biblioteca → Alimentos para incluir.</p>}

      <span className="label" style={{ marginTop: 12 }}>Quantidade</span>
      {u.grams ? (
        <div className="fs-qty">
          <input ref={inputRef} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.,]/g, ''))} onFocus={(e) => e.target.select()} aria-label="Quantidade" data-testid="qty-input" />
          <span className="fs-unit">{u.key === 'g' ? 'g' : n > 1 ? pluralize(u.label) : u.label}</span>
        </div>
      ) : <p style={{ fontWeight: 700, fontSize: 18, margin: '6px 0' }}>{u.label}</p>}
      {u.grams && u.key !== 'g' && <p className="small" style={{ margin: '2px 0 0' }} data-testid="qty-grams">{grams ? `${u.approx ? '≈ ' : ''}${fmtQ(Math.round(grams))} g` : ''}{u.approx ? ' · medida caseira aproximada' : ''}</p>}
      {u.grams && (
        <div className="fs-quick">
          {quick.map((v) => <button key={v} className={`fs-q ${n === v ? 'on' : ''}`} onClick={() => setQty(fmtQ(v))}>{u.key === 'g' ? `${v} g` : v === 0.5 ? '½' : v === 1.5 ? '1½' : String(v)}</button>)}
        </div>
      )}

      <span className="label" style={{ marginTop: 14 }}>Medida</span>
      <div className="fs-units" role="radiogroup" aria-label="Medida">
        {units.map((x) => (
          <button key={x.key} role="radio" aria-checked={unitKey === x.key} className={`fs-u ${unitKey === x.key ? 'on' : ''}`} onClick={() => pickUnit(x.key)}>
            <span>{x.label}</span>{x.grams && x.key !== 'g' ? <small>{x.approx ? '≈ ' : ''}{fmt(x.grams)} g</small> : null}
          </button>
        ))}
      </div>
      <button className="link" style={{ marginTop: 14 }} onClick={toggleFav} aria-pressed={fav}>
        <Star size={15} fill={fav ? 'currentColor' : 'none'} style={{ marginRight: 6, verticalAlign: '-2px' }} />{fav ? 'Nos favoritos' : 'Marcar como favorito'}
      </button>
    </Sheet>
  );
}
