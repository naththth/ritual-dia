import { useState } from 'react';
import { create, update } from '../../db/db';
import type { Food } from '../../db/types';
import { Chip } from '../../ui/ui';
import { PORTIONS } from '../../domain/defaults';
import { toast } from '../../state/store';
import { useAll } from '../../db/hooks';

const TYPES = ['Proteína', 'Carboidrato', 'Leguminosas', 'Vegetais', 'Fruta', 'Laticínios sem lactose', 'Complemento', 'Suplemento', 'Bebida', 'Doce', 'Outros'];

export function FoodForm({ food, onDone }: { food?: Food; onDone: (f?: Food) => void }) {
  const foods = useAll('food');
  const types = Array.from(new Set([...TYPES, ...(foods ?? []).map((f) => f.type)]));
  const [d, setD] = useState<Partial<Food>>(food ?? { name: '', type: 'Proteína', portions: ['P', 'M', 'G'], favorite: false });
  const set = (p: Partial<Food>) => setD((x) => ({ ...x, ...p }));
  const save = async () => {
    if (!d.name?.trim()) { toast('Informe o nome do alimento.', undefined, 'error'); return; }
    const data = { ...d, name: d.name.trim(), portions: d.portions?.length ? d.portions : ['M'] } as Food;
    const r = food ? await update<'food'>(food.id, data) : await create('food', data);
    toast(food ? 'Alimento salvo' : 'Alimento cadastrado');
    onDone(r);
  };
  return (
    <div data-testid="food-form">
      <span className="label" style={{ marginTop: 0 }}>Nome</span>
      <input value={d.name ?? ''} onChange={(e) => set({ name: e.target.value })} aria-label="Nome do alimento" autoFocus={!food} />
      <span className="label">Grupo</span>
      <div className="chips">{types.map((t) => <Chip key={t} color="honey" on={d.type === t} onClick={() => set({ type: t })}>{t}</Chip>)}</div>
      <span className="label">Porções que você usa</span>
      <div className="chips">{PORTIONS.map((p) => <Chip key={p} on={d.portions?.includes(p)} onClick={() => set({ portions: d.portions?.includes(p) ? d.portions.filter((x) => x !== p) : [...(d.portions ?? []), p] })}>{p}</Chip>)}</div>
      <span className="label">Favorito</span>
      <div className="chips"><Chip on={!!d.favorite} onClick={() => set({ favorite: true })}>Sim</Chip><Chip on={!d.favorite} onClick={() => set({ favorite: false })}>Não</Chip></div>
      <span className="label">Calorias por porção média <span className="muted small">(opcional; só se você tiver a informação)</span></span>
      <input inputMode="numeric" value={d.kcal ?? ''} onChange={(e) => set({ kcal: e.target.value ? Number(e.target.value) : undefined })} aria-label="Calorias" />
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn btn-soft" onClick={() => onDone()}>Cancelar</button>
        <button className="btn btn-ink grow" onClick={save} data-testid="food-save">Salvar alimento</button>
      </div>
    </div>
  );
}
