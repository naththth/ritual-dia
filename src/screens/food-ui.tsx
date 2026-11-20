// Peças visuais da alimentação: anel de macros e a ficha do alimento (quantidade antes de ir para o prato).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Star, Trash2, Camera, RefreshCw, Egg, Beef, Drumstick, Fish, Wheat, Carrot, Salad, Apple, Banana, Citrus, Milk, Coffee, Bean, Nut, Croissant, Cookie, Soup, Droplet, Utensils, type LucideIcon } from 'lucide-react';
import { update } from '../db/db';
import { usePhotoPicker } from '../ui/PhotoPicker';
import { foodThumbFromFile, searchFoodImage, setFoodImage } from '../domain/foodImage';
import { toast } from '../state/store';
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

/** Ícone de reserva, só enquanto o alimento não tem foto: pela palavra principal do nome ou pelo grupo. */
const ICONS: [RegExp, LucideIcon][] = [
  [/\bovos?\b|omelete/i, Egg], [/frango|peru|chester|coxa|sobrecoxa/i, Drumstick], [/peixe|atum|sardinha|salm[aã]o|til[aá]pia|camar[aã]o/i, Fish],
  [/carne|\bboi\b|patinho|ac[eé]m|alcatra|picanha|porco|lombo|presunto|bacon|lingui[cç]a|hamb[uú]rguer/i, Beef],
  [/feij[aã]o|lentilha|gr[aã]o-de-bico|ervilha|soja/i, Bean], [/castanha|amendoim|nozes|am[eê]ndoa|pasta de amendoim/i, Nut],
  [/p[aã]o|torrada|bisnaguinha|croissant/i, Croissant], [/biscoito|bolacha|cookie|bolo/i, Cookie], [/sopa|caldo/i, Soup],
  [/arroz|trigo|aveia|granola|cuscuz|macarr[aã]o|massa|tapioca|milho|quinoa/i, Wheat],
  [/cenoura|ab[oó]bora|batata|mandioca|beterraba|chuchu|abobrinha|br[oó]colis|couve-flor|legume/i, Carrot],
  [/alface|r[uú]cula|agri[aã]o|couve|espinafre|salada|repolho|tomate|pepino|verdura/i, Salad],
  [/banana/i, Banana], [/laranja|lim[aã]o|tangerina|mexerica|abacaxi/i, Citrus], [/ma[cç][aã]|\bpera\b|mam[aã]o|manga|morango|\buvas?\b|fruta|abacate|melancia|mel[aã]o|kiwi/i, Apple],
  [/leite|iogurte|queijo|ricota|requeij[aã]o|whey|coalhada|kefir/i, Milk], [/caf[eé]|ch[aá]\b|cappuccino/i, Coffee], [/azeite|[oó]leo|manteiga/i, Droplet]
];
function iconFor(f?: Pick<Food, 'name' | 'type'>): LucideIcon {
  const hay = `${f?.name ?? ''} ${f?.type ?? ''}`;
  return ICONS.find(([re]) => re.test(hay))?.[1] ?? Utensils;
}

/** Miniatura do alimento: a foto (dela ou de referência) ou, sem foto, um ícone discreto na mesma moldura. */
export function FoodThumb({ food, size = 52, radius }: { food?: Pick<Food, 'name' | 'type' | 'image'>; size?: number; radius?: number }) {
  const r = radius ?? Math.round(size * 0.3);
  if (food?.image) return <img className="food-thumb" src={food.image} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: r }} loading="lazy" />;
  const Ic = iconFor(food);
  return <span className="food-thumb ft-ic" aria-hidden style={{ width: size, height: size, borderRadius: r }}><Ic size={Math.round(size * 0.46)} strokeWidth={1.6} /></span>;
}

/** Fotos sobrepostas dos itens de uma refeição, com "+N" quando passam de três. */
export function FoodStack({ foods, size = 40 }: { foods: (Food | undefined)[]; size?: number }) {
  const shown = foods.slice(0, 3);
  const more = foods.length - shown.length;
  return (
    <span className="food-stack" aria-hidden>
      {shown.map((f, i) => <FoodThumb key={i} food={f} size={size} radius={size / 2} />)}
      {more > 0 && <span className="food-thumb fs-more" style={{ width: size, height: size, borderRadius: size / 2 }}>+{more}</span>}
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
  const [img, setImg] = useState<{ image?: string; src?: string; skip: number }>({ skip: -1 });
  const [imgBusy, setImgBusy] = useState(false);
  const ownPick = usePhotoPicker({ onFiles: async (fs) => {
    if (!food) return;
    const t = await foodThumbFromFile(fs[0]);
    setImg({ image: t, src: undefined, skip: -1 }); await setFoodImage(food.id, t);
  }, testId: 'food-own-photo' });
  useEffect(() => {
    if (!food) return;
    setImg({ image: food.image, src: food.imageSrc, skip: food.image && food.imageSrc ? 0 : -1 });
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
  /** Outra foto de referência da internet: pula as que ela já viu. */
  const another = async () => {
    setImgBusy(true);
    try {
      const r = await searchFoodImage(food, img.skip + 1);
      if (r) { setImg({ image: r.image, src: r.source, skip: r.index }); await setFoodImage(food.id, r.image, r.source); }
      else toast('Não achei outra foto para este alimento.', undefined, 'default', { important: true });
    } catch (e: any) { toast(e.message, undefined, 'error'); } finally { setImgBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={d.name} sub={d.brand} testId="qty-sheet"
      footer={<>
        {onRemove && <button className="btn btn-soft" style={{ flex: '0 0 auto' }} aria-label="Tirar do prato" onClick={onRemove}><Trash2 size={18} /></button>}
        <button className="btn btn-ink grow" onClick={apply} data-testid="qty-save">
          {item ? 'Atualizar' : `Adicionar ao ${mealLabel.toLowerCase()}`}{nutr ? ` · ${fmt(nutr.kcal)} kcal` : ''}
        </button>
      </>}>
      <div className="fs-photo" data-testid="food-photo">
        <FoodThumb food={{ name: food.name, type: food.type, image: img.image }} size={104} radius={22} />
        <div className="fs-photo-side">
          <span className="tiny muted">{img.image ? (img.src ? 'Foto de referência da internet' : 'Sua foto') : 'Sem foto ainda'}</span>
          <button className="btn btn-soft btn-sm" onClick={ownPick.open}><Camera size={15} /> Sua foto</button>
          <button className="btn btn-soft btn-sm" disabled={imgBusy} onClick={another} data-testid="food-img-search"><RefreshCw size={15} /> {imgBusy ? 'Buscando…' : img.image && img.src ? 'Outra da internet' : 'Buscar na internet'}</button>
        </div>
        {ownPick.el}
      </div>
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
