// Importa a biblioteca exportada do Goodreads (CSV): estantes, notas, datas, páginas e capa pelo ISBN.
import { db, upsert } from '../db/db';
import type { Book, BookStatus } from '../db/types';

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
