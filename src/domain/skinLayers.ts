// Ordem de aplicação e modo de uso curto de cada produto, definidos pela dermatologista (IA).
// Vale para todas as rotinas: o plano diz o que entra; a camada e a posição dizem em que ordem.
import { all, update } from '../db/db';
import { askAI } from './ai';
import { LAYERS, LAYER_IDS, OWNED, productStep } from './skinSteps';
import type { Product } from '../db/types';

/** Camadas no formato que vai para a IA. */
export const layersForAI = () => LAYERS.map((l) => ({ id: l.id, area: l.area, etapa: l.step, nome: l.label }));

/** Grava o que a IA devolveu para um produto (camada, posição e uso), só com valores válidos. */
export async function applyLayer(p: Product, x: { camada?: unknown; ordem?: unknown; uso?: unknown }) {
  const patch: Partial<Product> = {};
  const layer = String(x.camada ?? '');
  if (LAYER_IDS.has(layer) && layer.startsWith(p.area ?? 'rosto')) {
    patch.layer = layer;
    patch.step = LAYERS.find((l) => l.id === layer)!.step;
  }
  const n = Number(x.ordem);
  if (n >= 1 && n <= 99) patch.layerPos = Math.round(n) * 10;
  const use = String(x.uso ?? '').trim();
  if (use) patch.howShort = use.length > 180 ? `${use.slice(0, 177).trimEnd()}…` : use;
  if (Object.keys(patch).length) await update<'product'>(p.id, patch);
  return Object.keys(patch).length > 0;
}

/** Pede à dermatologista a camada, a posição e o uso dos produtos (todos os que ela tem, ou só os indicados). */
export async function organizeProducts(onlyIds?: string[], onlyMissing = false): Promise<number> {
  const owned = (await all('product')).filter((p) => OWNED.has(p.status) || onlyIds?.includes(p.id));
  const targets = new Set(owned.filter((p) => (!onlyIds || onlyIds.includes(p.id)) && (!onlyMissing || !p.howShort || !p.layer)).map((p) => p.id));
  if (!targets.size) return 0;
  // Vão todos os produtos que ela tem, para a posição do novo sair coerente com os outros; grava só nos pedidos.
  const products = owned;
  let changed = 0;
  // Tudo de uma vez, para a ordem dentro de cada camada sair coerente; lotes só acima de 100 produtos.
  for (let i = 0; i < products.length; i += 100) {
    const chunk = products.slice(i, i + 100);
    const ctx = {
      camadas: layersForAI(),
      produtos: chunk.map((p, k) => ({
        codigo: `p${k + 1}`, marca: p.brand, nome: p.name, area: p.area ?? 'rosto', etapa_atual: productStep(p), tipo: p.group,
        ativos: p.info?.actives, para_que_serve: p.info?.purpose, modo_de_uso: p.info?.howToUse, cuidados: p.info?.cautions
      }))
    };
    const r = await askAI<any>('skin_layers', ctx);
    for (const x of Array.isArray(r?.produtos) ? r.produtos : []) {
      const p = chunk[Number(String(x?.codigo ?? '').slice(1)) - 1];
      if (p && targets.has(p.id) && (await applyLayer(p, x))) changed++;
    }
  }
  return changed;
}

/** Depois de montar ou mudar a rotina: organiza em segundo plano os produtos ainda sem ordem ou sem uso. */
export function organizeSoon(ids?: string[]) {
  void organizeProducts(ids, true).catch(() => { /* sem conexão: fica a ordem deduzida pelo tipo */ });
}
