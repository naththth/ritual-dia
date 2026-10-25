import { useState } from 'react';
import { usePhotoPicker } from '../../ui/PhotoPicker';
import { Camera, Sparkles } from 'lucide-react';
import { aiAvailable, aiProductInfo } from '../../domain/ai';
import { shrinkImage } from '../../lib/image';
import { useSettings } from '../../db/hooks';

/** Nome da outra pessoa da casa, vindo dos responsáveis cadastrados (nunca fixo no código). */
export function useOtherPerson(): string | undefined {
  const s = useSettings();
  return s?.owners.find((o) => o !== 'Eu' && o !== 'Ambos');
}
import { create, update } from '../../db/db';
import type { Product, ProductGroup, ProductInfo, ProductStatus } from '../../db/types';
import { GROUPS, areaOf } from '../../domain/defaults';
import { productStep } from '../../domain/skinSteps';
import { autoImage, searchProductImage, thumbFromFile } from '../../domain/productImage';
import { ProductThumb } from '../../ui/ProductThumb';
import { RefreshCw } from 'lucide-react';
import { Chip } from '../../ui/ui';
import { toast } from '../../state/store';

export const STATUS_LABEL: Record<ProductStatus, string> = {
  em_uso: 'Em uso', guardado: 'Guardado', acabou: 'Acabou', quero_comprar: 'Quero comprar', conferir: 'Conferir', de_outra: 'De outra pessoa', arquivado: 'Arquivado'
};

export function ProductForm({ product, initial, onDone }: { product?: Product; initial?: Partial<Product>; onDone: (p?: Product) => void }) {
  const [d, setD] = useState<Partial<Product>>(product ?? { brand: '', name: '', group: 'hidratacao', area: 'rosto', period: 'ambos', status: 'em_uso', active: false, ...initial });
  const set = (p: Partial<Product>) => setD((x) => ({ ...x, ...p }));
  const other = useOtherPerson();
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState('');
  const info = d.info ?? {};
  const setInfo = (p: Partial<ProductInfo>) => setD((x) => ({ ...x, info: { ...(x.info ?? {}), ...p } }));

  /** Lê a embalagem (frente e verso) ou, sem foto, completa a ficha pelo nome e marca. */
  const identify = async (files?: FileList | null) => {
    const list = files ? Array.from(files).slice(0, 3) : [];
    if (!list.length && !d.name?.trim()) { toast('Tire uma foto ou escreva o nome do produto.', undefined, 'error'); return; }
    setReading(true); setReadNote('');
    try {
      // A foto da embalagem também vira a miniatura, se ainda não houver uma.
      if (list[0] && !d.image) { const t = await thumbFromFile(list[0]); setD((x) => ({ ...x, image: x.image ?? t })); }
      const imgs = await Promise.all(list.map((f) => shrinkImage(f)));
      const r = await aiProductInfo(d.brand, d.name, imgs);
      if (!r.ok) { toast(r.note, undefined, 'error'); return; }
      setD((x) => ({
        ...x,
        brand: x.brand?.trim() ? x.brand : r.brand ?? '',
        name: x.name?.trim() ? x.name : r.name ?? '',
        group: r.group ?? x.group,
        area: r.group ? areaOf(r.group) : x.area,
        period: r.period ?? x.period,
        active: r.strongActive ?? x.active,
        info: { ...(x.info ?? {}), ...Object.fromEntries(Object.entries(r.info).filter(([, v]) => v !== undefined)) }
      }));
      setReadNote(r.note);
      toast(r.info.confidence === 'baixa' ? 'Ficha preenchida, mas com pouca certeza. Confira.' : 'Ficha preenchida. Confira antes de salvar.');
    } catch (e: any) { toast(e.message, undefined, 'error'); } finally { setReading(false); }
  };
  const camPick = usePhotoPicker({ onFiles: (fs) => identify(fs), multiple: true });
  // Miniatura: outra da internet (pula as já vistas) ou uma foto dela.
  const [imgBusy, setImgBusy] = useState(false);
  const [skip, setSkip] = useState(0);
  const another = async () => {
    if (!d.name?.trim()) { toast('Escreva o nome do produto primeiro.', undefined, 'error'); return; }
    setImgBusy(true);
    try {
      const next = d.image ? skip + 1 : 0;
      const r = await searchProductImage({ brand: d.brand ?? '', name: d.name ?? '' }, next);
      if (r) { set({ image: r.image, imageSrc: r.source, imageTried: undefined }); setSkip(r.index); }
      else toast(next ? 'Não achei outra foto. Você pode tirar uma.' : 'Não achei foto deste produto. Você pode tirar uma.', undefined, 'error');
    } catch (e: any) { toast(e.message, undefined, 'error'); } finally { setImgBusy(false); }
  };
  const ownPick = usePhotoPicker({ onFiles: async (fs) => { const t = await thumbFromFile(fs[0]); set({ image: t, imageSrc: undefined }); }, testId: 'product-own-photo' });
  const save = async () => {
    if (!d.name?.trim()) { toast('Informe o nome do produto.', undefined, 'error'); return; }
    const data = { ...d, name: d.name.trim(), brand: (d.brand ?? '').trim() } as Product;
    if (product) {
      const renamed = product.name !== data.name || product.brand !== data.brand;
      const r = await update<'product'>(product.id, renamed && !d.image ? { ...data, imageTried: undefined } : data);
      toast('Produto salvo'); onDone(r);
      if (r && renamed && !r.image) autoImage(r);
    } else { const r = await create('product', data); toast('Produto cadastrado'); onDone(r); autoImage(r); }
  };
  return (
    <div data-testid="product-form">
      {aiAvailable() && (
        <div className="row wrap" style={{ gap: 8, marginBottom: 6 }}>
          <button className="btn btn-ink btn-sm" disabled={reading} onClick={camPick.open} data-testid="product-photo"><Camera size={16} /> {reading ? 'Identificando…' : 'Foto da embalagem'}</button>
          {(d.name?.trim() || product) && <button className="btn btn-soft btn-sm" disabled={reading} onClick={() => identify()} data-testid="product-ai"><Sparkles size={16} /> {info.purpose ? 'Refazer ficha com IA' : 'Completar ficha com IA'}</button>}
          {camPick.el}
          <p className="field-hint" style={{ flexBasis: '100%', margin: 0 }}>Frente e verso ajudam: o verso traz a lista de ingredientes e o modo de uso.</p>
        </div>
      )}
      <div className="pf-photo" data-testid="product-thumb">
        <ProductThumb p={{ image: d.image, brand: d.brand ?? '', name: d.name ?? '' }} size={72} />
        <div className="pf-photo-acts">
          <span className="small muted">{d.image ? (d.imageSrc ? 'Foto achada na internet' : 'Sua foto') : 'Sem foto ainda'}</span>
          <div className="row wrap" style={{ gap: 6 }}>
            {aiAvailable() && <button className="btn btn-soft btn-sm" disabled={imgBusy} onClick={another} data-testid="product-img-search"><RefreshCw size={15} /> {imgBusy ? 'Buscando…' : d.image ? 'Outra da internet' : 'Buscar na internet'}</button>}
            <button className="btn btn-soft btn-sm" onClick={ownPick.open}><Camera size={15} /> Tirar foto</button>
          </div>
        </div>
        {ownPick.el}
      </div>
      <span className="label" style={{ marginTop: 12 }}>Marca</span>
      <input value={d.brand ?? ''} onChange={(e) => set({ brand: e.target.value })} aria-label="Marca" />
      <span className="label">Nome</span>
      <input value={d.name ?? ''} onChange={(e) => set({ name: e.target.value })} aria-label="Nome do produto" />
      <span className="label">Tipo</span>
      <div className="chips">{GROUPS.map((g) => <Chip key={g.id} color="rose" on={d.group === g.id} onClick={() => set({ group: g.id as ProductGroup, area: areaOf(g.id as ProductGroup) })}>{g.label}</Chip>)}</div>
      <span className="label">Quando usa</span>
      <div className="chips" data-testid="product-step">{([['banho', 'No banho'], ['pos', 'Depois do banho']] as const).map(([id, l]) => <Chip key={id} on={productStep(d as Product) === id} onClick={() => set({ step: id })}>{l}</Chip>)}</div>
      {!d.step && <p className="field-hint">Deduzido pelo tipo e pelo nome. Toque para fixar.</p>}
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
      <span className="label">Ficha do produto {info.confidence && <span className="muted small">({info.fromLabel ? 'lida da embalagem' : 'pelo nome'}{info.confidence !== 'alta' ? `, certeza ${info.confidence === 'media' ? 'média' : 'baixa'}` : ''})</span>}</span>
      {readNote && <p className="field-hint" style={{ marginTop: 0 }} data-testid="product-read-note">{readNote}</p>}
      <div className="product-info" data-testid="product-info">
        <InfoField label="Para que serve" value={info.purpose} onChange={(v) => setInfo({ purpose: v })} />
        <InfoField label="Indicação" value={info.indication} onChange={(v) => setInfo({ indication: v })} />
        <InfoField label="Modo de uso" value={info.howToUse} onChange={(v) => setInfo({ howToUse: v })} />
        <InfoField label="Ativos principais" value={info.actives?.join(', ')} onChange={(v) => setInfo({ actives: v.split(',').map((x) => x.trim()).filter(Boolean) })} rows={1} />
        <InfoField label="Cuidados" value={info.cautions} onChange={(v) => setInfo({ cautions: v })} />
      </div>
      <span className="label">Aberto em <span className="muted small">(opcional)</span></span>
      <input type="date" value={d.openedAt ?? ''} onChange={(e) => set({ openedAt: e.target.value || undefined })} aria-label="Data de abertura" />
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn btn-soft" onClick={() => onDone()}>Cancelar</button>
        <button className="btn btn-ink grow" onClick={save} data-testid="product-save">Salvar produto</button>
      </div>
    </div>
  );
}

function InfoField({ label, value, onChange, rows = 2 }: { label: string; value?: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span className="small" style={{ fontWeight: 650 }}>{label}</span>
      <textarea rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={label} style={{ width: '100%', marginTop: 4 }} />
    </label>
  );
}
