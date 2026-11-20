// Foto de cada alimento: a dela (câmera ou galeria) ou uma referência achada na internet pelo servidor do Ritual.
import { update } from '../db/db';
import type { Food } from '../db/types';

async function svc() {
  const { supabase, useSync } = await import('../sync/sync');
  if (!supabase || !useSync.getState().session) throw new Error('Entre com Google para buscar fotos na internet.');
  if (!navigator.onLine) throw new Error('Sem conexão.');
  return supabase;
}

/** Texto de busca: produto de marca procura a embalagem; alimento genérico procura o prato, sem as vírgulas da TACO. */
export function foodImageQuery(f: Pick<Food, 'name' | 'source'> & { brand?: string }): string {
  const name = (f.name ?? '').replace(/\(.*?\)/g, ' ');
  return (f.source === 'off' ? name : `${name.replace(/,/g, ' ')} comida`).replace(/\s+/g, ' ').trim();
}

/** Busca uma foto de referência; skip pula as já vistas ("outra da internet"). */
export async function searchFoodImage(f: Food, skip = 0): Promise<{ image: string; source: string; index: number } | null> {
  const sb = await svc();
  const { data, error } = await sb.functions.invoke('ritual-food', { body: { action: 'image', q: foodImageQuery(f), skip, cover: f.source !== 'off' } });
  if (error) throw new Error('Não consegui buscar a foto agora.');
  return data?.item ?? null;
}

let filling = false;
/** Um lote em segundo plano para os alimentos sem foto; o servidor grava e a sincronização traz. Uma vez por abertura do app. */
export async function fillFoodImages(foods: Food[]) {
  if (filling || !foods.some((f) => !f.archived && !f.image && !f.imageTried)) return;
  filling = true;
  try {
    const sb = await svc();
    const { syncNow } = await import('../sync/sync');
    const { data } = await sb.functions.invoke('ritual-food', { body: { action: 'images_batch', kind: 'food', limit: 10 } });
    if (data?.done || data?.failed) await syncNow();
  } catch { /* sem conexão ou sem login: fica para a próxima */ }
}

/** Foto dela: recorta o centro em quadrado, como as miniaturas da internet. */
export async function foodThumbFromFile(file: File, size = 256): Promise<string> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const side = Math.min(bmp.width, bmp.height);
  c.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.8);
}

export const setFoodImage = (id: string, image: string, imageSrc?: string) => update<'food'>(id, { image, imageSrc, imageTried: undefined });
