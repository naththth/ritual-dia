// Importa a biblioteca exportada do Goodreads (CSV): estantes, notas, datas, páginas e capa pelo ISBN.
import { db, upsert } from '../db/db';
import type { Book, BookStatus, ReadLog } from '../db/types';
import { addDays, type DateKey } from '../lib/dates';

/** CSV com aspas e vírgulas dentro de campos. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const SHELF: Record<string, BookStatus> = { read: 'lido', 'currently-reading': 'lendo', 'to-read': 'quero_ler' };
const clean = (s?: string) => (s ?? '').replace(/^="?|"$/g, '').replace(/"/g, '').trim();
const date = (s?: string) => (s && /^\d{4}\/\d{2}\/\d{2}$/.test(s.trim()) ? s.trim().replace(/\//g, '-') : undefined);

export const coverFromIsbn = (isbn?: string) => (isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false` : undefined);

/** ISBN-13 (978...) para ISBN-10. Os 979 não têm ISBN-10. */
export function isbn10(isbn?: string): string | undefined {
  const d = (isbn ?? '').replace(/[^0-9X]/gi, '').toUpperCase();
  if (d.length === 10) return d;
  if (d.length !== 13 || !d.startsWith('978')) return undefined;
  const core = d.slice(3, 12);
  const sum = [...core].reduce((a, c, i) => a + (10 - i) * Number(c), 0);
  const r = (11 - (sum % 11)) % 11;
  return core + (r === 10 ? 'X' : String(r));
}

/** Capa da Amazon pelo ISBN-10: cobre bem as edições brasileiras que faltam no Open Library.
 *  Quando não tem, devolve uma imagem de 1 px (o app trata como falha). */
export const coverFromAmazon = (isbn?: string) => { const i = isbn10(isbn); return i ? `https://images-na.ssl-images-amazon.com/images/P/${i}.01.L.jpg` : undefined; };

/** Ordem de tentativa: a capa salva, Amazon e Open Library pelo ISBN. Sem repetir. */
export function coverCandidates(b: { cover?: string; isbn?: string }, extra: (string | undefined)[] = []): string[] {
  return [...extra, b.cover, coverFromAmazon(b.isbn), coverFromIsbn(b.isbn)].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
}

export async function importGoodreads(text: string): Promise<{ added: number; updated: number }> {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const head = rows[0].map((h) => h.trim());
  const col = (r: string[], name: string) => r[head.indexOf(name)];
  if (!head.includes('Title') || !head.includes('Exclusive Shelf')) throw new Error('Esse arquivo não parece a exportação do Goodreads.');
  let added = 0, updated = 0;
  for (const r of rows.slice(1)) {
    const grId = clean(col(r, 'Book Id'));
    const title = clean(col(r, 'Title'));
    if (!grId || !title) continue;
    const id = `book:gr:${grId}`;
    const isbn = clean(col(r, 'ISBN13')) || clean(col(r, 'ISBN')) || undefined;
    const status = SHELF[clean(col(r, 'Exclusive Shelf'))] ?? 'quero_ler';
    const rating = Number(clean(col(r, 'My Rating'))) || undefined;
    const pages = Number(clean(col(r, 'Number of Pages'))) || undefined;
    const authors = [clean(col(r, 'Author')), ...clean(col(r, 'Additional Authors')).split(',').map((x) => x.trim())].filter(Boolean).slice(0, 1);
    const prev = (await db.records.get(id)) as Book | undefined;
    const data: Partial<Book> = {
      title, authors, isbn, pages, status, rating,
      finishedAt: date(col(r, 'Date Read')) ?? prev?.finishedAt,
      startedAt: prev?.startedAt ?? (status === 'lendo' ? date(col(r, 'Date Added')) : undefined),
      cover: prev?.cover ?? coverFromIsbn(isbn),
      review: clean(col(r, 'My Review')) || prev?.review,
      quotes: prev?.quotes ?? [],
      currentPage: prev?.currentPage ?? (status === 'lendo' ? 0 : undefined)
    };
    await upsert('book', id, data);
    if (prev && !prev.deleted) updated++; else added++;
  }
  return { added, updated };
}

/** Livro em "Lendo" sem página registrada há 3 semanas (contando do início, do último registro ou de quando ela disse
 *  que continua). Devolve há quantos dias, para o aviso; senão, undefined. */
export function stalledDays(b: Pick<Book, 'id' | 'status' | 'startedAt' | 'keptAt'>, logs: Pick<ReadLog, 'bookId' | 'date'>[], today: DateKey): number | undefined {
  if (b.status !== 'lendo') return undefined;
  const last = [b.startedAt, b.keptAt, ...logs.filter((l) => l.bookId === b.id).map((l) => l.date)].filter((x): x is string => !!x).sort().pop();
  if (!last || last > addDays(today, -21)) return undefined;
  return Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(last + 'T12:00:00Z')) / 86400000);
}
