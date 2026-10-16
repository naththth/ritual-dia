import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAll } from '../db/hooks';
import { update } from '../db/db';
import type { Product, ProductStatus } from '../db/types';
import { GROUPS } from '../domain/defaults';
import { PageHead } from './common';
import { Sheet } from '../ui/ui';
import { ProductForm, useOtherPerson } from './library/ProductForm';

const OPTS: { id: ProductStatus; label: string }[] = [
  { id: 'em_uso', label: 'Tenho' }, { id: 'arquivado', label: 'Não' }, { id: 'acabou', label: 'Acabou' }, { id: 'conferir', label: 'Conferir' }, { id: 'de_outra', label: 'Outra' }
];

export function ProductReview() {
  const products = useAll('product');
  const nav = useNavigate();
  const [edit, setEdit] = useState<Product | null>(null);
  const [touched] = useState(() => new Set<string>());
  const [, force] = useState(0);
  const other = useOtherPerson();
  if (!products) return null;
  const imported = products.filter((p) => p.sourceId);
  const done = imported.filter((p) => p.status !== 'conferir' || touched.has(p.id)).length;
  const set = async (p: Product, s: ProductStatus) => { touched.add(p.id); await update<'product'>(p.id, { status: s }); force((x) => x + 1); };
  const finish = async (plan: boolean) => {
    await update<'settings'>('settings', { onboarded: true, reviewDone: true });
    nav(plan ? '/plano/skin' : '/', { replace: true });
  };
  return (
    <div className="screen no-nav" data-testid="product-review">
      <PageHead title="Revisar produtos" withDate={false} back={() => finish(false)} />
      <p className="small" style={{ marginTop: 0 }}>A lista veio do histórico e pode estar desatualizada. Marque o que você tem hoje; toque no nome para corrigir.</p>
      <div className="row" style={{ gap: 10, margin: '6px 0 4px' }}>
        <div className="progress grow"><i style={{ width: `${imported.length ? (done / imported.length) * 100 : 0}%` }} /></div>
        <span className="small num">{done} de {imported.length}</span>
      </div>
      <div className="row wrap" style={{ gap: 8, margin: '8px 0' }}>
        <button className="link" onClick={async () => { for (const p of imported) if (p.status === 'conferir' && !touched.has(p.id)) touched.add(p.id); force((x) => x + 1); }}>Deixar os restantes como "Conferir"</button>
      </div>
      {GROUPS.map((g) => {
        const list = imported.filter((p) => p.group === g.id);
        if (!list.length) return null;
        return (
          <section key={g.id}>
            <h2 className="section-title" style={{ margin: '22px 0 4px' }}>{g.label}</h2>
            {list.map((p) => (
              <div key={p.id} className="review-item" data-testid="review-item">
                <button className="tap" onClick={() => setEdit(p)}>
                  <span className="tiny muted" style={{ fontWeight: 600 }}>{p.brand}</span><br />
                  <span style={{ fontWeight: 650 }}>{p.name}</span>
                </button>
                <div className="opts">
                  {OPTS.map((o) => (
                    <button key={o.id} className={p.status === o.id && (o.id !== 'conferir' || touched.has(p.id)) ? 'on' : ''} onClick={() => set(p, o.id)} aria-pressed={p.status === o.id} aria-label={`${o.id === 'arquivado' ? 'Não tenho' : o.id === 'de_outra' ? `É de ${other ?? 'outra pessoa'}` : o.label}: ${p.name}`}>{o.id === 'de_outra' && other ? (other.length <= 7 ? `De ${other}` : 'Outra') : o.label}</button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}
      <div className="stack" style={{ marginTop: 24 }}>
        <button className="btn btn-ink btn-block" onClick={() => finish(true)} data-testid="review-plan">Montar meu plano de pele</button>
        <button className="btn btn-ghost btn-block" onClick={() => finish(false)}>Terminar depois</button>
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title="Corrigir produto">
        {edit && <ProductForm product={edit} onDone={() => setEdit(null)} />}
      </Sheet>
    </div>
  );
}
