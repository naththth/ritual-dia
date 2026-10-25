import { useState } from 'react';
import type { Product } from '../db/types';

/** Miniatura da embalagem; sem foto, as iniciais da marca no lugar. */
export function ProductThumb({ p, size = 44 }: { p: Pick<Product, 'image' | 'brand' | 'name'>; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initials = (p.brand || p.name || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return p.image && !broken
    ? <img className="pthumb" src={p.image} alt="" width={size} height={size} style={{ width: size, height: size }} onError={() => setBroken(true)} loading="lazy" />
    : <span className="pthumb pthumb-empty" style={{ width: size, height: size }} aria-hidden>{initials}</span>;
}

