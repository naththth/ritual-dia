// Miniatura da embalagem de cada produto: achada na internet pelo servidor do Ritual ou tirada por ela.
import { update } from '../db/db';
import type { Product } from '../db/types';

const THUMB = 160;

/** Texto de busca a partir de marca e nome, sem as anotações dela entre parênteses. */
export const imageQuery = (p: Pick<Product, 'brand' | 'name'>) => `${p.brand ?? ''} ${(p.name ?? '').replace(/\(.*?\)/g, ' ')}`.replace(/\s+/g, ' ').trim();

async function svc() {
  const { supabase, useSync } = await import('../sync/sync');
  if (!supabase || !useSync.getState().session) throw new Error('Entre com Google para buscar fotos na internet.');
  if (!navigator.onLine) throw new Error('Sem conexão.');
  return supabase;
}

/** Busca uma foto do produto; skip pula as já vistas ("buscar outra"). */
export async function searchProductImage(p: Pick<Product, 'brand' | 'name'>, skip = 0): Promise<{ image: string; source: string; index: number; total: number } | null> {
  const sb = await svc();
  const { data, error } = await sb.functions.invoke('ritual-food', { body: { action: 'image', q: imageQuery(p), skip } });
  if (error) throw new Error('Não consegui buscar a foto agora.');
  return data?.item ?? null;
}

/** Fotos para todos os produtos sem foto, em lotes; o servidor grava e a sincronização traz. */
export async function fillProductImages(onProgress?: (done: number, left: number) => void): Promise<{ done: number; failed: number }> {
  const sb = await svc();
  const { syncNow } = await import('../sync/sync');
  let done = 0, failed = 0;
  for (let round = 0; round < 12; round++) {
    const { data, error } = await sb.functions.invoke('ritual-food', { body: { action: 'images_batch', limit: 8 } });
    if (error) throw new Error('A busca de fotos parou no meio. Tente de novo.');
    done += data?.done ?? 0; failed += data?.failed ?? 0;
    await syncNow();
    onProgress?.(done, data?.left ?? 0);
    if (!data?.left || !(data.done + data.failed)) break;
  }
  return { done, failed };
}

/** Miniatura quadrada, com fundo branco, a partir de uma foto dela (câmera ou galeria). */
export async function thumbFromFile(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = THUMB; c.height = THUMB;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, THUMB, THUMB);
  // Corta o centro em quadrado: a embalagem costuma estar no meio da foto.
  const side = Math.min(bmp.width, bmp.height);
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, THUMB, THUMB);
  return c.toDataURL('image/jpeg', 0.8);
}

/** Produto novo ou renomeado sem foto: busca em segundo plano, sem atrapalhar o cadastro. */
export function autoImage(p: Product) {
  if (p.image) return;
  void searchProductImage(p).then((r) => update<'product'>(p.id, r ? { image: r.image, imageSrc: r.source, imageTried: undefined } : { imageTried: true })).catch(() => { /* sem conexão: fica sem foto */ });
}
