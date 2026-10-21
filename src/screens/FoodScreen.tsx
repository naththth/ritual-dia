// Montar uma refeição: o que está no prato em cima, o que adicionar embaixo, salvar sempre à mão no rodapé.
import { useEffect, useMemo, useState } from 'react';
import { usePhotoPicker } from '../ui/PhotoPicker';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Star, Copy, Check as CheckIcon, X, Trash2, ChevronRight, Pencil, Camera } from 'lucide-react';
import { PlateSheet, type PlateRow } from './plate';
import { aiAvailable } from '../domain/ai';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp, toast } from '../state/store';
import { useAll, useByDate, useSettings } from '../db/hooks';
import { PageHead, useBack } from './common';
import { Sheet, useConfirm, Empty, whenHistoryIdle } from '../ui/ui';
import { copyMealsFrom, deleteRecord, mealId, saveMeal } from '../domain/actions';
import { byDateRange, create } from '../db/db';
import type { Food, MealItem, MealTemplate } from '../db/types';
import { addDays, shortLabel } from '../lib/dates';
import { FoodForm, FoodSuggest, foodFromTaco, foodFromOff } from './library/FoodForm';
import { BarcodeButton } from './library/Barcode';
import { defaultItem, displayFood, fmt, itemNutr, portionText, totals } from '../domain/nutrition';
import { FoodSheet, MacroLine, MacroRing } from './food-ui';
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
  const [sheet, setSheet] = useState<{ food: Food; item?: MealItem } | null>(null);
  const [plateFile, setPlateFile] = useState<File | null>(null);
  const platePick = usePhotoPicker({ onFiles: (fs) => setPlateFile(fs[0]), testId: 'plate-input' });
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
  /** Tocar num alimento abre a ficha: no prato, para ajustar; fora, para escolher a quantidade antes de adicionar. */
  // Espera a folha anterior (cadastro, código de barras) terminar de fechar para não fechar esta junto.
  const open = (f: Food) => setTimeout(() => whenHistoryIdle(() => setSheet({ food: f, item: items.find((x) => x.foodId === f.id) })), 60);
  const putItem = (it: MealItem) => setItems((xs) => (xs.some((x) => x.foodId === it.foodId) ? xs.map((x) => (x.foodId === it.foodId ? it : x)) : [...xs, it]));
  const removeItem = (id: string) => setItems((xs) => xs.filter((x) => x.foodId !== id));
  const useTemplate = (t: MealTemplate) => {
    const add = t.items.filter((i) => !items.some((x) => x.foodId === i.foodId));
    setItems((xs) => [...xs, ...add]);
    toast(add.length ? `${add.length} ${add.length === 1 ? 'item foi' : 'itens foram'} para o prato. Toque em um para ajustar a quantidade.` : 'Esses itens já estão no prato.');
  };
  const addNew = async (data: Partial<Food>) => {
    const existing = activeFoods.find((f) => f.sourceRef && f.sourceRef === data.sourceRef);
    const f = existing ?? (await create('food', { ...(data as Food), favorite: false }));
    setQ('');
    open(f);
  };
  /** Itens confirmados da foto: usa o alimento da TACO já cadastrado ou cadastra; sem TACO, cria um item estimado. */
  const addFromPlate = async (rows: PlateRow[]) => {
    const add: MealItem[] = [];
    for (const r of rows) {
      let f: Food | undefined;
      if (r.taco) {
        f = activeFoods.find((x) => x.source === 'taco' && x.sourceRef === String(r.taco!.id));
        if (!f) f = await create('food', { ...(foodFromTaco(r.taco) as Food), favorite: false });
      } else {
        const name = `${r.name} (estimado)`;
        f = activeFoods.find((x) => x.name === name) ?? await create('food', { name, type: 'Outros', n: r.est ? { ...r.est, fib: undefined, na: undefined } : undefined, source: 'manual', portions: [], measures: [{ label: '100 g', grams: 100 }], favorite: false } as any);
      }
      const prev = add.find((x) => x.foodId === f!.id) ?? items.find((x) => x.foodId === f!.id);
      const grams = r.grams + (prev?.grams ?? 0);
      const it: MealItem = { foodId: f.id, portion: `${grams} g`, grams };
      const i = add.findIndex((x) => x.foodId === f!.id);
      if (i >= 0) add[i] = it; else add.push(it);
    }
    for (const it of add) putItem(it);
    setPlateFile(null);
    toast(`${add.length} ${add.length === 1 ? 'item foi' : 'itens foram'} para o prato. Confira e salve.`);
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
  // Vindo do resumo do dia com ?edit=ID: abre direto a ficha daquele item.
  const editParam = params.get('edit');
  const [editOpened, setEditOpened] = useState(false);
  useEffect(() => {
    if (!editParam || editOpened || !foods || loaded !== key) return;
    const f = foods.find((x) => x.id === editParam);
    if (f) setSheet({ food: f, item: items.find((x) => x.foodId === f.id) });
    setEditOpened(true);
  }, [editParam, foods, loaded, items]);

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
        {showN && mealTot && items.length > 0 ? <MacroRing n={mealTot.n} size={84} stroke={9} /> : null}
        <div className="grow" style={{ minWidth: 0 }}>
          <h2>{typeLabel}</h2>
          {showN && mealTot && items.length > 0 && (
            <>
              <MacroLine n={mealTot.n} />
              {mealTot.missing > 0 && <div className="tiny">{mealTot.missing} sem dados nutricionais</div>}
            </>
          )}
        </div>
      </div>

      {/* No prato */}
      <section data-testid="meal-selected">
        <h3 className="sec-cap">No prato{items.length ? ` · ${items.length} ${items.length === 1 ? 'item' : 'itens'}` : ''}</h3>
        {items.length === 0 && <p className="small muted" style={{ margin: '4px 0 8px' }}>Nada ainda. Adicione abaixo, pela busca ou pelo código de barras.</p>}
        {items.map((i) => {
          const f = foods?.find((x) => x.id === i.foodId);
          const d = displayFood(f);
          const n = f ? itemNutr(f, i) : undefined;
          return (
            <div key={i.foodId} className="plate-row">
              <button className="plate-main tap" onClick={() => f && open(f)} aria-label={`Quantidade de ${f?.name}`}>
                <span className="plate-name">{d.name}</span>
                <span className="plate-sub">{d.brand ? `${d.brand} · ` : ''}<span className="qty-pill"><Pencil size={12} />{portionText(f, i)}</span></span>
                {showN && n && <MacroLine n={n} className="tiny" />}
              </button>
              {showN && <span className="plate-kcal num">{n ? `${fmt(n.kcal)} kcal` : f?.n ? 'informe o peso' : ''}</span>}
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
        {aiAvailable() && (
          <>
            <button className="plate-cta" onClick={platePick.open} data-testid="plate-photo">
              <span className="plate-cta-ic"><Camera size={20} /></span>
              <span className="grow" style={{ textAlign: 'left' }}><b>Foto do prato</b><br /><span className="small">A IA reconhece os alimentos e estima as porções</span></span>
              <ChevronRight size={18} />
            </button>
            {platePick.el}
          </>
        )}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--ink-2)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar alimento ou marca" style={{ paddingLeft: 40, paddingRight: 52 }} aria-label="Buscar alimento" autoComplete="off" />
          <span style={{ position: 'absolute', right: 4, top: 4 }}><BarcodeButton onFound={(o) => addNew(foodFromOff(o))} /></span>
          <FoodSuggest q={q} onPickMine={(f) => { setQ(''); open(f); }} onPickTaco={(t) => addNew(foodFromTaco(t))} onPickOff={(o) => addNew(foodFromOff(o))} />
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
                  const inPlate = sel(f.id);
                  const it = inPlate ?? defaultItem(f);
                  const k = kcalOf(f, it);
                  return (
                    <div key={f.id} className="add-row">
                      <button className="grow tap" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => open(f)} aria-label={`Ver ${f.name}`}>
                        <div className="plate-name">{f.favorite ? '★ ' : ''}{d.name}</div>
                        <div className="plate-sub">{[d.brand, portionText(f, it), showN && k != null ? `${fmt(k)} kcal` : ''].filter(Boolean).join(' · ')}</div>
                      </button>
                      <button className={`add-btn ${inPlate ? 'in' : ''}`} aria-label={inPlate ? `${f.name} no prato` : `Adicionar ${f.name}`} aria-pressed={!!inPlate} onClick={() => open(f)}>
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
          <a className="link" href="#/alimentacao/plano">Plano de alimentação</a>
          <a className="link" href="#/alimentacao/refeicoes">Refeições favoritas</a>
        </div>
      </section>

      {/* Rodapé fixo */}
      <div className="save-bar">
        {meal && <button className="btn btn-soft" style={{ flex: '0 0 auto' }} aria-label="Apagar refeição" onClick={async () => { await deleteRecord(mealId(date, type), 'Refeição apagada'); setItems([]); }}><Trash2 size={18} /></button>}
        <button className="btn btn-ink grow" onClick={save} data-testid="meal-save">Salvar {typeLabel.toLowerCase()}{showN && mealTot && items.length && mealTot.n.kcal > 0 ? ` · ${fmt(mealTot.n.kcal)} kcal` : ''}</button>
      </div>

      {sheet && <FoodSheet food={sheet.food} item={sheet.item} mealLabel={typeLabel} onClose={() => setSheet(null)}
        onSave={(it) => { putItem(it); setSheet(null); }}
        onRemove={sheet.item ? () => { removeItem(sheet.food.id); setSheet(null); } : undefined} />}
      <PlateSheet file={plateFile} mealLabel={typeLabel} onClose={() => setPlateFile(null)} onConfirm={addFromPlate} />
      <Sheet open={adding} onClose={() => setAdding(false)} title="Novo alimento">
        <FoodForm onDone={(f) => { setAdding(false); if (f) open(f); }} />
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

