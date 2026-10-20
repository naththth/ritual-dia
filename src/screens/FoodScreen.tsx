// Montar uma refeição: o que está no prato em cima, o que adicionar embaixo, salvar sempre à mão no rodapé.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Star, Copy, Check as CheckIcon, X, Trash2, ChevronRight } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp, toast } from '../state/store';
import { useAll, useByDate, useSettings } from '../db/hooks';
import { PageHead, useBack } from './common';
import { Chip, Sheet, useConfirm, Empty } from '../ui/ui';
import { copyMealsFrom, deleteRecord, mealId, saveMeal } from '../domain/actions';
import { byDateRange, create } from '../db/db';
import type { Food, MealItem, MealTemplate } from '../db/types';
import { addDays, shortLabel } from '../lib/dates';
import { FoodForm, FoodSuggest, foodFromTaco, foodFromOff } from './library/FoodForm';
import { BarcodeButton } from './library/Barcode';
import { displayFood, fmt, gramsFor, itemNutr, portionOptions, portionText, totals } from '../domain/nutrition';
import { planFor, plannedFood } from '../domain/rules';

function defaultMeal() {
  const h = new Date().getHours();
  return h < 10 ? 'cafe' : h < 15 ? 'almoco' : h < 18 ? 'lanche' : h < 22 ? 'jantar' : 'ceia';
}

type Tab = 'rec' | 'fav' | 'plano' | 'todos';

export function FoodScreen() {
  const date = useApp((s) => s.date);
  const back = useBack();
  const [params] = useSearchParams();
  const settings = useSettings();
  const [type, setType] = useState(params.get('m') || defaultMeal());
  const meals = useByDate('meal', date);
  const foods = useAll('food');
  const tmpls = useAll('mtemplate');
  const plans = useAll('plan');
  const recent = useLiveQuery(() => byDateRange('meal', addDays(date, -21), addDays(date, -1)), [date]);
  const meal = meals?.find((m) => m.mealType === type);
  const [items, setItems] = useState<MealItem[]>([]);
  const [loaded, setLoaded] = useState('');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [favName, setFavName] = useState<string | null>(null);
  const [confirmEl, ask] = useConfirm();
  const key = `${date}:${type}:${meal?.updatedAt ?? 'none'}`;
  useEffect(() => {
    if (!meals || loaded === key) return;
    setLoaded(key);
    setItems(meal?.items ?? []);
  }, [key, meals]);

  const plannedTplId = plannedFood(planFor(plans ?? [], 'food', date), date)[type];
  const plannedTpl = tmpls?.find((t) => t.id === plannedTplId);
  const activeFoods = (foods ?? []).filter((f) => !f.archived);
  const recentIds = useMemo(() => {
    const c = new Map<string, number>();
    (recent ?? []).forEach((m) => m.items.forEach((i) => c.set(i.foodId, (c.get(i.foodId) ?? 0) + 1)));
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 12);
  }, [recent]);
  const curTab: Tab = tab ?? (plannedTpl ? 'plano' : recentIds.length ? 'rec' : activeFoods.some((f) => f.favorite) ? 'fav' : 'todos');
  const listFoods = (curTab === 'rec' ? recentIds.map((id) => activeFoods.find((f) => f.id === id)).filter((f): f is Food => !!f)
    : curTab === 'fav' ? activeFoods.filter((f) => f.favorite)
    : activeFoods).slice().sort((a, b) => (curTab === 'rec' ? 0 : displayFood(a).name.localeCompare(displayFood(b).name)));

  const sel = (id: string) => items.find((i) => i.foodId === id);
  const add = (f: Food) => setItems((xs) => (xs.some((x) => x.foodId === f.id) ? xs : [...xs, { foodId: f.id, portion: portionOptions(f)[0] }]));
  const removeItem = (id: string) => setItems((xs) => xs.filter((x) => x.foodId !== id));
  const setItem = (id: string, it: MealItem) => setItems((xs) => xs.map((x) => (x.foodId === id ? it : x)));
  const useTemplate = (t: MealTemplate) => setItems((xs) => [...xs, ...t.items.filter((i) => !xs.some((x) => x.foodId === i.foodId))]);
  const addNew = async (data: Partial<Food>) => {
    const existing = activeFoods.find((f) => f.sourceRef && f.sourceRef === data.sourceRef);
    const f = existing ?? (await create('food', { ...(data as Food), favorite: false }));
    add(f);
    setQ('');
  };
  const showN = settings?.showNutrition !== false;
  const mealTot = foods ? totals(items, foods) : undefined;
  const typeLabel = settings?.mealTypes.find((m) => m.id === type)?.label ?? type;
  const kcalOf = (f: Food, it: MealItem) => itemNutr(f, it)?.kcal;

  const save = async () => {
    if (!items.length) { toast('Adicione ao menos um alimento.', undefined, 'error'); return; }
    await saveMeal(date, type, items);
    back();
  };
  const copyPrev = async () => {
    const ok = await ask({ title: `Copiar refeições de ${shortLabel(addDays(date, -1))}?`, text: 'Só entram as refeições que ainda não foram registradas hoje. Nada é substituído.', ok: 'Copiar' });
    if (!ok) return;
    const n = await copyMealsFrom(addDays(date, -1), date);
    toast(n ? `${n} ${n === 1 ? 'refeição copiada' : 'refeições copiadas'}` : 'Nada para copiar');
  };
  const editingItem = editing ? items.find((i) => i.foodId === editing) : undefined;
  const editingFood = editing ? foods?.find((f) => f.id === editing) : undefined;

  return (
    <div className="screen no-nav meal-screen" data-testid="food-screen">
      <PageHead title="Refeição" right={<button className="icon-btn" aria-label="Copiar do dia anterior" onClick={copyPrev}><Copy size={20} /></button>} />

      {/* Qual refeição: abas sublinhadas, não botões */}
      <div className="seg-tabs" role="tablist" aria-label="Refeição">
        {settings?.mealTypes.map((m) => {
          const has = meals?.some((x) => x.mealType === m.id && x.items.length);
          return (
            <button key={m.id} role="tab" aria-selected={type === m.id} className={type === m.id ? 'on' : ''} onClick={() => setType(m.id)}>
              {m.label}{has && <CheckIcon size={13} strokeWidth={3} style={{ marginLeft: 3 }} />}
            </button>
          );
        })}
      </div>

      <div className="meal-head" data-testid="meal-totals">
        <h2>{typeLabel}</h2>
        {showN && mealTot && (
          <div className="meal-head-n">
            <span className="big-num num">{fmt(mealTot.n.kcal)}<small> kcal</small></span>
            <span className="small">P {fmt(mealTot.n.p)} g · C {fmt(mealTot.n.c)} g · G {fmt(mealTot.n.f)} g{mealTot.missing > 0 ? ` · ${mealTot.missing} sem dados` : ''}</span>
          </div>
        )}
      </div>

      {/* No prato */}
      <section data-testid="meal-selected">
        <h3 className="sec-cap">No prato{items.length ? ` · ${items.length} ${items.length === 1 ? 'item' : 'itens'}` : ''}</h3>
        {items.length === 0 && <p className="small muted" style={{ margin: '4px 0 8px' }}>Nada ainda. Adicione abaixo, pela busca ou pelo código de barras.</p>}
        {items.map((i) => {
          const f = foods?.find((x) => x.id === i.foodId);
          const d = displayFood(f);
          const k = f ? kcalOf(f, i) : undefined;
          return (
            <div key={i.foodId} className="plate-row">
              <button className="plate-main tap" onClick={() => setEditing(i.foodId)} aria-label={`Quantidade de ${f?.name}`}>
                <span className="plate-name">{d.name}</span>
                <span className="plate-sub">{[d.brand, portionText(f, i)].filter(Boolean).join(' · ')}</span>
              </button>
              {showN && <span className="plate-kcal num">{k != null ? `${fmt(k)} kcal` : f?.n ? 'informe o peso' : ''}</span>}
              <button className="icon-btn" aria-label={`Remover ${f?.name}`} onClick={() => removeItem(i.foodId)}><X size={18} /></button>
            </div>
          );
        })}
        {items.length > 0 && (favName === null ? (
          <button className="link" style={{ marginTop: 8 }} onClick={() => setFavName(`${typeLabel} de sempre`)}><Star size={15} style={{ marginRight: 6, verticalAlign: '-2px' }} />Salvar como refeição favorita</button>
        ) : (
          <div className="row" style={{ marginTop: 8, gap: 8 }}>
            <input value={favName} onChange={(e) => setFavName(e.target.value)} aria-label="Nome da refeição favorita" />
            <button className="btn btn-ink btn-sm" onClick={async () => { await create('mtemplate', { name: favName.trim() || typeLabel, mealType: type, items }); setFavName(null); toast('Refeição favorita salva'); }}>Salvar</button>
          </div>
        ))}
      </section>

      {/* Adicionar */}
      <section style={{ marginTop: 22 }}>
        <h3 className="sec-cap">Adicionar</h3>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--ink-2)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar alimento ou marca" style={{ paddingLeft: 40, paddingRight: 52 }} aria-label="Buscar alimento" autoComplete="off" />
          <span style={{ position: 'absolute', right: 4, top: 4 }}><BarcodeButton onFound={(o) => addNew(foodFromOff(o))} /></span>
          <FoodSuggest q={q} onPickMine={(f) => { add(f); setQ(''); }} onPickTaco={(t) => addNew(foodFromTaco(t))} onPickOff={(o) => addNew(foodFromOff(o))} />
        </div>

        {!q && (
          <>
            <div className="seg-tabs small-tabs" role="tablist" aria-label="Lista de alimentos">
              {([['rec', 'Recentes'], ['fav', 'Favoritos'], ['plano', 'Do plano'], ['todos', 'Todos']] as [Tab, string][]).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={curTab === k} className={curTab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>

            {curTab === 'plano' ? (
              <div data-testid="plan-list">
                {plannedTpl && <TemplateRow t={plannedTpl} foods={activeFoods} label="Do plano de hoje" onUse={() => useTemplate(plannedTpl)} showN={showN} />}
                {(tmpls ?? []).filter((t) => !t.archived && t.id !== plannedTpl?.id && (!t.mealType || t.mealType === type)).map((t) => <TemplateRow key={t.id} t={t} foods={activeFoods} label="Favorita" onUse={() => useTemplate(t)} showN={showN} />)}
                {!plannedTpl && !(tmpls ?? []).some((t) => !t.archived) && <Empty text="Sem refeição do plano para hoje." />}
              </div>
            ) : (
              <div data-testid="food-list">
                {listFoods.map((f) => {
                  const d = displayFood(f);
                  const it: MealItem = { foodId: f.id, portion: portionOptions(f)[0] };
                  const k = kcalOf(f, it);
                  const inPlate = !!sel(f.id);
                  return (
                    <div key={f.id} className="add-row">
                      <div className="grow">
                        <div className="plate-name">{f.favorite ? '★ ' : ''}{d.name}</div>
                        <div className="plate-sub">{[d.brand, portionText(f, it), showN && k != null ? `${fmt(k)} kcal` : ''].filter(Boolean).join(' · ')}</div>
                      </div>
                      <button className={`add-btn ${inPlate ? 'in' : ''}`} aria-label={inPlate ? `${f.name} no prato` : `Adicionar ${f.name}`} aria-pressed={inPlate} onClick={() => (inPlate ? removeItem(f.id) : add(f))}>
                        {inPlate ? <CheckIcon size={18} strokeWidth={3} /> : <Plus size={20} />}
                      </button>
                    </div>
                  );
                })}
                {listFoods.length === 0 && <Empty text={curTab === 'rec' ? 'Ainda sem alimentos recentes.' : curTab === 'fav' ? 'Nenhum favorito. Marque com ★ ao cadastrar.' : 'Nenhum alimento cadastrado.'} />}
              </div>
            )}
            <button className="add-row tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => setAdding(true)}>
              <div className="grow"><div className="plate-name">Cadastrar alimento</div><div className="plate-sub">Pelo nome, código de barras ou foto da tabela</div></div>
              <ChevronRight size={18} />
            </button>
          </>
        )}
        <div className="row wrap" style={{ marginTop: 14, gap: 16 }}>
          <a className="link" href="#/plano/food">Plano de alimentação</a>
          <a className="link" href="#/biblioteca/refeicoes">Refeições favoritas</a>
        </div>
      </section>

      {/* Rodapé fixo */}
      <div className="save-bar">
        {meal && <button className="btn btn-soft" style={{ flex: '0 0 auto' }} aria-label="Apagar refeição" onClick={async () => { await deleteRecord(mealId(date, type), 'Refeição apagada'); setItems([]); }}><Trash2 size={18} /></button>}
        <button className="btn btn-ink grow" onClick={save} data-testid="meal-save">Salvar {typeLabel.toLowerCase()}{showN && mealTot && items.length && mealTot.n.kcal > 0 ? ` · ${fmt(mealTot.n.kcal)} kcal` : ''}</button>
      </div>

      <QuantitySheet food={editingFood} item={editingItem} onClose={() => setEditing(null)} onSave={(it) => { setItem(it.foodId, it); setEditing(null); }} onRemove={() => { if (editing) removeItem(editing); setEditing(null); }} />
      <Sheet open={adding} onClose={() => setAdding(false)} title="Novo alimento">
        <FoodForm onDone={(f) => { setAdding(false); if (f) add(f); }} />
      </Sheet>
      {confirmEl}
    </div>
  );
}

function TemplateRow({ t, foods, label, onUse, showN }: { t: MealTemplate; foods: Food[]; label: string; onUse: () => void; showN: boolean }) {
  const tot = totals(t.items, foods);
  const names = t.items.map((i) => displayFood(foods.find((f) => f.id === i.foodId)).name).join(', ');
  return (
    <div className="add-row">
      <div className="grow">
        <div className="plate-name">{t.name}</div>
        <div className="plate-sub">{label} · {names}{showN ? ` · ${fmt(tot.n.kcal)} kcal` : ''}</div>
      </div>
      <button className="btn btn-soft btn-sm" onClick={onUse}>Usar</button>
    </div>
  );
}

/** Quantidade de um item: um número e a unidade (g ou as medidas daquele alimento). */
function QuantitySheet({ food, item, onClose, onSave, onRemove }: { food?: Food; item?: MealItem; onClose: () => void; onSave: (it: MealItem) => void; onRemove: () => void }) {
  const units = useMemo(() => {
    const out: { key: string; label: string; grams?: number }[] = [{ key: 'g', label: 'gramas', grams: 1 }];
    for (const m of food?.measures ?? []) {
      if (m.label === '100 g') continue;
      out.push({ key: m.label, label: m.label.replace(/^1\s+/, ''), grams: m.grams });
    }
    for (const p of food?.portions ?? []) if (!out.some((u) => u.key === p)) out.push({ key: p, label: /^[PMG]$/.test(p) ? `porção ${p}` : p });
    return out;
  }, [food]);
  const [unit, setUnit] = useState('g');
  const [qty, setQty] = useState('');
  useEffect(() => {
    if (!item || !food) return;
    const m = units.find((u) => u.key !== 'g' && u.key === item.portion);
    if (m) { setUnit(m.key); setQty('1'); return; }
    const g = gramsFor(food, item.portion, item.grams);
    setUnit('g'); setQty(g != null ? String(Math.round(g)) : '');
  }, [item?.foodId, food?.id]);
  if (!item || !food) return null;
  const u = units.find((x) => x.key === unit) ?? units[0];
  const n = Number(qty.replace(',', '.'));
  const grams = u.grams && n > 0 ? n * u.grams : undefined;
  const kcal = food.n && grams ? (food.n.kcal * grams) / 100 : undefined;
  const d = displayFood(food);
  const apply = () => {
    if (u.key === 'g') { if (!(n > 0)) return; onSave({ foodId: food.id, portion: `${fmt(n)} g`, grams: n }); return; }
    if (!u.grams) { onSave({ foodId: food.id, portion: u.key }); return; }
    const label = n === 1 ? u.key : `${fmt(n)} × ${u.label}`;
    onSave({ foodId: food.id, portion: label, grams });
  };
  return (
    <Sheet open onClose={onClose} title={d.name} sub={d.brand} testId="qty-sheet"
      footer={<>
        <button className="btn btn-soft" style={{ flex: '0 0 auto' }} aria-label="Tirar do prato" onClick={onRemove}><Trash2 size={18} /></button>
        <button className="btn btn-ink" onClick={apply} data-testid="qty-save">Pronto{kcal != null ? ` · ${fmt(kcal)} kcal` : ''}</button>
      </>}>
      {u.grams ? (
        <div className="qty-big">
          <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantidade" autoFocus />
          <span>{u.key === 'g' ? 'g' : u.label}</span>
        </div>
      ) : <p style={{ textAlign: 'center', fontWeight: 700, fontSize: 18, margin: '14px 0' }}>{u.label}</p>}
      {grams != null && u.key !== 'g' && <p className="small" style={{ textAlign: 'center', margin: '0 0 8px' }}>{fmt(grams)} g</p>}
      <span className="label">Medida</span>
      <div className="chips">
        {units.map((x) => <Chip key={x.key} on={unit === x.key} onClick={() => { setUnit(x.key); setQty(x.key === 'g' ? String(Math.round(grams ?? 100)) : '1'); }}>{x.label}</Chip>)}
      </div>
      {!food.n && <p className="field-hint">Este alimento não tem calorias cadastradas. Edite em Biblioteca → Alimentos para incluir.</p>}
    </Sheet>
  );
}
