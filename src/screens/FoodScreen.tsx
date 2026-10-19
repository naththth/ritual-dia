import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Star, Copy, Undo2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp, toast } from '../state/store';
import { useAll, useByDate, useSettings } from '../db/hooks';
import { PageHead , useBack } from './common';
import { Chip, Sheet, useConfirm, Empty } from '../ui/ui';
import { addWater, copyMealsFrom, deleteRecord, mealId, saveMeal } from '../domain/actions';
import { byDateRange, create, remove } from '../db/db';
import type { Food, MealItem } from '../db/types';
import { addDays, shortLabel } from '../lib/dates';
import { FoodForm } from './library/FoodForm';
import { planFor, plannedFood } from '../domain/rules';

function defaultMeal() {
  const h = new Date().getHours();
  return h < 10 ? 'cafe' : h < 15 ? 'almoco' : h < 18 ? 'lanche' : h < 22 ? 'jantar' : 'ceia';
}

export function FoodScreen() {
  const date = useApp((s) => s.date);
  const back = useBack();
  const [params] = useSearchParams();
  const settings = useSettings();
  const [type, setType] = useState(params.get('m') || defaultMeal());
  const meals = useByDate('meal', date);
  const water = useByDate('water', date);
  const foods = useAll('food');
  const tmpls = useAll('mtemplate');
  const plans = useAll('plan');
  const recent = useLiveQuery(() => byDateRange('meal', addDays(date, -21), addDays(date, -1)), [date]);
  const meal = meals?.find((m) => m.mealType === type);
  const [items, setItems] = useState<MealItem[]>([]);
  const [loaded, setLoaded] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [adding, setAdding] = useState(false);
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
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 8);
  }, [recent]);
  const cats = Array.from(new Set(activeFoods.map((f) => f.type))).sort();
  const visible = activeFoods
    .filter((f) => !cat || (cat === '__fav' ? f.favorite : cat === '__rec' ? recentIds.includes(f.id) : f.type === cat))
    .filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || a.name.localeCompare(b.name));
  const sel = (id: string) => items.find((i) => i.foodId === id);
  const toggle = (f: Food) => setItems((xs) => (sel(f.id) ? xs.filter((x) => x.foodId !== f.id) : [...xs, { foodId: f.id, portion: f.portions?.[1] ?? 'M' }]));
  const setPortion = (id: string, portion: string) => setItems((xs) => xs.map((x) => (x.foodId === id ? { ...x, portion } : x)));
  const total = (water ?? []).reduce((a, w) => a + w.ml, 0);
  const lastWater = [...(water ?? [])].sort((a, b) => b.createdAt - a.createdAt)[0];
  const typeLabel = settings?.mealTypes.find((m) => m.id === type)?.label ?? type;

  const save = async () => {
    if (!items.length) { toast('Toque nos alimentos para montar a refeição.', undefined, 'error'); return; }
    await saveMeal(date, type, items);
    back();
  };
  const copyPrev = async () => {
    const ok = await ask({ title: `Copiar refeições de ${shortLabel(addDays(date, -1))}?`, text: 'Só entram as refeições que ainda não foram registradas hoje. Nada é substituído.', ok: 'Copiar' });
    if (!ok) return;
    const n = await copyMealsFrom(addDays(date, -1), date);
    toast(n ? `${n} ${n === 1 ? 'refeição copiada' : 'refeições copiadas'}` : 'Nada para copiar');
  };

  return (
    <div className="screen no-nav" data-testid="food-screen">
      <PageHead title="Alimentação" right={<button className="icon-btn" aria-label="Copiar do dia anterior" onClick={copyPrev}><Copy size={20} /></button>} />
      <div className="chips scroll" role="tablist" aria-label="Refeição">
        {settings?.mealTypes.map((m) => {
          const has = meals?.some((x) => x.mealType === m.id && x.items.length);
          return <Chip key={m.id} color="honey" on={type === m.id} onClick={() => setType(m.id)}>{m.label}{has ? ' ✓' : ''}</Chip>;
        })}
      </div>

      {(plannedTpl || (tmpls ?? []).length > 0) && (
        <>
          <span className="label">Refeições favoritas</span>
          <div className="chips scroll">
            {plannedTpl && <Chip color="honey" onClick={() => setItems(plannedTpl.items)}>Do plano: {plannedTpl.name}</Chip>}
            {(tmpls ?? []).filter((t) => !t.archived && t.id !== plannedTpl?.id).map((t) => <Chip key={t.id} onClick={() => setItems(t.items)}>{t.name}</Chip>)}
          </div>
        </>
      )}

      {items.length > 0 && (
        <div className="block b-honey" style={{ marginTop: 16 }} data-testid="meal-selected">
          <div className="bh"><h2 style={{ fontSize: 19 }}>{typeLabel}</h2><span className="meta">{items.length} {items.length === 1 ? 'item' : 'itens'}</span></div>
          {items.map((i) => {
            const f = foods?.find((x) => x.id === i.foodId);
            return (
              <div key={i.foodId} className="row between" style={{ minHeight: 48, gap: 8 }}>
                <button className="tap" style={{ fontWeight: 700, flex: '1 1 30%' }} onClick={() => f && toggle(f)} aria-label={`Remover ${f?.name}`}>{f?.name ?? '?'} <span className="tiny">✕</span></button>
                <div className="portion">
                  {(f?.portions?.length ? f.portions : ['P', 'M', 'G']).map((p) => <button key={p} className={i.portion === p ? 'on' : ''} onClick={() => setPortion(i.foodId, p)}>{p}</button>)}
                </div>
              </div>
            );
          })}
          {favName === null ? (
            <button className="link" onClick={() => setFavName(`${typeLabel} de sempre`)}><Star size={16} style={{ marginRight: 6 }} />Salvar como favorita</button>
          ) : (
            <div className="row" style={{ marginTop: 8 }}>
              <input value={favName} onChange={(e) => setFavName(e.target.value)} aria-label="Nome da refeição favorita" />
              <button className="btn btn-ink btn-sm" onClick={async () => { await create('mtemplate', { name: favName.trim() || typeLabel, mealType: type, items }); setFavName(null); toast('Refeição favorita salva'); }}>Salvar</button>
            </div>
          )}
        </div>
      )}

      <div style={{ position: 'relative', margin: '16px 0 10px' }}>
        <Search size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--ink-2)' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar alimento" style={{ paddingLeft: 40 }} aria-label="Buscar alimento" />
      </div>
      <div className="chips scroll" style={{ marginBottom: 10 }}>
        <Chip on={!cat} onClick={() => setCat('')}>Todos</Chip>
        <Chip on={cat === '__fav'} onClick={() => setCat(cat === '__fav' ? '' : '__fav')}>Favoritos</Chip>
        {recentIds.length > 0 && <Chip on={cat === '__rec'} onClick={() => setCat(cat === '__rec' ? '' : '__rec')}>Recentes</Chip>}
        {cats.map((c) => <Chip key={c} color="honey" on={cat === c} onClick={() => setCat(cat === c ? '' : c)}>{c}</Chip>)}
      </div>
      <div className="chips" data-testid="food-list">
        {visible.map((f) => <Chip key={f.id} color="honey" on={!!sel(f.id)} onClick={() => toggle(f)}>{f.favorite ? '★ ' : ''}{f.name}</Chip>)}
        <button className="chip" onClick={() => setAdding(true)}><Plus size={16} />Novo alimento</button>
      </div>
      {activeFoods.length === 0 && <Empty text="Nenhum alimento cadastrado ainda." />}

      <div className="row" style={{ marginTop: 22, gap: 10 }}>
        {meal && <button className="btn btn-soft" onClick={async () => { await deleteRecord(mealId(date, type), 'Refeição apagada'); setItems([]); }}>Apagar</button>}
        <button className="btn btn-ink grow" onClick={save} data-testid="meal-save">Salvar {typeLabel.toLowerCase()}</button>
      </div>

      <div className="row wrap" style={{ marginTop: 6, gap: 16 }}>
        <a className="link" href="#/plano/food">Plano de alimentação</a>
        <a className="link" href="#/biblioteca/refeicoes">Refeições favoritas</a>
      </div>
      <div className="block b-honey" style={{ marginTop: 20 }}>
        <div className="bh"><h2 style={{ fontSize: 19 }}>Água</h2><span className="big-num num">{total} mL{settings?.waterGoalMl ? <span className="small" style={{ fontFamily: 'var(--f-ui)' }}> de {settings.waterGoalMl} mL</span> : null}</span></div>
        <div className="row wrap" style={{ gap: 8 }}>
          {(settings?.waterPresets ?? [200, 300, 500]).map((ml) => <button key={ml} className="pill-act pa-honey" onClick={() => addWater(date, ml)}>+{ml} mL</button>)}
          {lastWater && <button className="pill-act pa-ghost" onClick={async () => { await remove(lastWater.id); toast(`−${lastWater.ml} mL`); }}><Undo2 size={16} />Desfazer última</button>}
        </div>
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Novo alimento">
        <FoodForm onDone={(f) => { setAdding(false); if (f) setItems((xs) => [...xs, { foodId: f.id, portion: 'M' }]); }} />
      </Sheet>
      {confirmEl}
    </div>
  );
}
