import { useState } from 'react';
import { useSettings } from '../../db/hooks';

/** Nome da outra pessoa da casa, vindo dos responsáveis cadastrados (nunca fixo no código). */
export function useOtherPerson(): string | undefined {
  const s = useSettings();
  return s?.owners.find((o) => o !== 'Eu' && o !== 'Ambos');
}
import { create, update } from '../../db/db';
import type { Product, ProductGroup, ProductStatus } from '../../db/types';
import { GROUPS } from '../../domain/defaults';
import { Chip } from '../../ui/ui';
import { toast } from '../../state/store';

export const STATUS_LABEL: Record<ProductStatus, string> = {
  em_uso: 'Em uso', guardado: 'Guardado', acabou: 'Acabou', quero_comprar: 'Quero comprar', conferir: 'Conferir', de_outra: 'De outra pessoa', arquivado: 'Arquivado'
};

export function ProductForm({ product, onDone }: { product?: Product; onDone: (p?: Product) => void }) {
  const [d, setD] = useState<Partial<Product>>(product ?? { brand: '', name: '', group: 'hidratacao', area: 'rosto', period: 'ambos', status: 'em_uso', active: false });
  const set = (p: Partial<Product>) => setD((x) => ({ ...x, ...p }));
  const other = useOtherPerson();
  const save = async () => {
    if (!d.name?.trim()) { toast('Informe o nome do produto.', undefined, 'error'); return; }
    const data = { ...d, name: d.name.trim(), brand: (d.brand ?? '').trim() } as Product;
    if (product) { const r = await update<'product'>(product.id, data); toast('Produto salvo'); onDone(r); }
    else { const r = await create('product', data); toast('Produto cadastrado'); onDone(r); }
  };
  return (
    <div data-testid="product-form">
      <span className="label" style={{ marginTop: 0 }}>Marca</span>
      <input value={d.brand ?? ''} onChange={(e) => set({ brand: e.target.value })} aria-label="Marca" />
      <span className="label">Nome</span>
      <input value={d.name ?? ''} onChange={(e) => set({ name: e.target.value })} aria-label="Nome do produto" />
      <span className="label">Tipo</span>
      <div className="chips">{GROUPS.map((g) => <Chip key={g.id} color="rose" on={d.group === g.id} onClick={() => set({ group: g.id as ProductGroup, area: g.id === 'corpo' ? 'corpo' : 'rosto' })}>{g.label}</Chip>)}</div>
      <span className="label">Período preferido</span>
      <div className="chips">{([['am', 'Manhã'], ['pm', 'Noite'], ['ambos', 'Ambos']] as const).map(([id, l]) => <Chip key={id} on={d.period === id} onClick={() => set({ period: id })}>{l}</Chip>)}</div>
      <span className="label">Situação</span>
      <div className="chips">{(Object.keys(STATUS_LABEL) as ProductStatus[]).map((s) => <Chip key={s} on={d.status === s} onClick={() => set({ status: s })}>{s === 'de_outra' && other ? `É de ${other}` : STATUS_LABEL[s]}</Chip>)}</div>
      <span className="label">Ativo que pede atenção</span>
      <div className="chips">
        <Chip on={!!d.active} onClick={() => set({ active: true })}>Sim</Chip>
        <Chip on={!d.active} onClick={() => set({ active: false })}>Não</Chip>
      </div>
      <p className="field-hint">Se marcar dois ativos no mesmo período, o app só avisa para você conferir.</p>
      <span className="label">Aberto em <span className="muted small">(opcional)</span></span>
      <input type="date" value={d.openedAt ?? ''} onChange={(e) => set({ openedAt: e.target.value || undefined })} aria-label="Data de abertura" />
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn btn-soft" onClick={() => onDone()}>Cancelar</button>
        <button className="btn btn-ink grow" onClick={save} data-testid="product-save">Salvar produto</button>
      </div>
    </div>
  );
}
