import { useEffect, useRef, useState } from 'react';
import { Plus, Search, Trash2, Star } from 'lucide-react';
import { PageHead } from './common';
import { useAll } from '../db/hooks';
import { create, update, uid } from '../db/db';
import { deleteRecord } from '../domain/actions';
import { Chip, Seg, Sheet, Empty, useConfirm } from '../ui/ui';
import { toast } from '../state/store';
import { todayKey, shortLabel } from '../lib/dates';
import type { Book, BookStatus } from '../db/types';
import { useSettings } from '../db/hooks';

interface GBook { googleId: string; title: string; authors: string[]; cover?: string; pages?: number; isbn?: string; year?: string }

async function searchBooks(q: string, signal?: AbortSignal): Promise<GBook[]> {
  const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=12&printType=books`, { signal });
  if (!r.ok) throw new Error('Busca de livros indisponível agora.');
  const d = await r.json();
  return (d.items ?? []).map((it: any) => {
    const v = it.volumeInfo ?? {};
    const isbn = (v.industryIdentifiers ?? []).find((x: any) => x.type === 'ISBN_13')?.identifier;
    return {
      googleId: it.id, title: v.subtitle ? `${v.title}: ${v.subtitle}` : v.title, authors: v.authors ?? [], pages: v.pageCount,
      cover: v.imageLinks?.thumbnail?.replace(/^http:/, 'https:'), isbn, year: v.publishedDate?.slice(0, 4)
    } as GBook;
  }).filter((b: GBook) => b.title);
}

const STATUS: { id: BookStatus; label: string }[] = [
  { id: 'lendo', label: 'Lendo' }, { id: 'quero_ler', label: 'Quero ler' }, { id: 'lido', label: 'Lidos' }, { id: 'abandonado', label: 'Parados' }
];

function Cover({ b }: { b: Pick<Book, 'cover' | 'title'> }) {
  return b.cover ? <img src={b.cover} alt="" loading="lazy" /> : <span className="nocover">{b.title.charAt(0)}</span>;
}

export function ReadingScreen() {
  const books = useAll('book');
  const settings = useSettings();
  const [tab, setTab] = useState<BookStatus>('lendo');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GBook[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Book | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => {
    if (q.trim().length < 3) { setResults(null); return; }
    const t = setTimeout(async () => {
      ctrl.current?.abort(); ctrl.current = new AbortController();
      setBusy(true);
      try { setResults(await searchBooks(q.trim(), ctrl.current.signal)); } catch (e: any) { if (e?.name !== 'AbortError') toast(navigator.onLine ? 'Busca de livros indisponível agora.' : 'Sem internet para buscar livros.', undefined, 'error'); }
      finally { setBusy(false); }
    }, 450);
    return () => clearTimeout(t);
  }, [q]);
  if (!books) return null;
  const year = todayKey().slice(0, 4);
  const doneYear = books.filter((b) => b.status === 'lido' && b.finishedAt?.startsWith(year)).length;
  const goal = settings?.readingGoal;
  const add = async (g: GBook, status: BookStatus) => {
    const exists = books.find((b) => b.googleId === g.googleId);
    if (exists) { toast('Esse livro já está na sua estante.'); return; }
    await create('book', { title: g.title, authors: g.authors, cover: g.cover, pages: g.pages, googleId: g.googleId, isbn: g.isbn, status, quotes: [], startedAt: status === 'lendo' ? todayKey() : undefined, currentPage: status === 'lendo' ? 0 : undefined });
    toast(status === 'lendo' ? 'Livro em "Lendo"' : 'Livro em "Quero ler"');
    setQ(''); setResults(null); setTab(status);
  };
  const list = books.filter((b) => b.status === tab).sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '') || b.updatedAt - a.updatedAt);
  return (
    <div className="screen no-nav" data-testid="reading-screen">
      <PageHead title="Leitura" withDate={false} />
      <section className="block b-rose">
        <div className="row between"><span className="big-num num">{doneYear}{goal ? <span className="small" style={{ fontFamily: 'var(--f-ui)' }}> de {goal} livros em {year}</span> : <span className="small" style={{ fontFamily: 'var(--f-ui)' }}> lidos em {year}</span>}</span></div>
        {goal ? <div className="macro-bar" style={{ background: 'rgba(111,38,56,.18)' }}><i style={{ width: `${Math.min(100, (doneYear / goal) * 100)}%`, background: 'var(--rose-ink)' }} /></div> : null}
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <span className="small">Meta do ano:</span>
          <input inputMode="numeric" defaultValue={goal ?? ''} onBlur={(e) => update<'settings'>('settings', { readingGoal: e.target.value ? Number(e.target.value) : undefined })} aria-label="Meta de livros no ano" style={{ width: 80, minHeight: 38 }} />
        </div>
      </section>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--ink-2)' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar livro por título, autora ou ISBN" style={{ paddingLeft: 40 }} aria-label="Buscar livro" autoComplete="off" />
      </div>
      {busy && <p className="small muted">Buscando…</p>}
      {results && (
        <div className="suggest" style={{ marginTop: 0, marginBottom: 12 }} data-testid="book-results">
          {results.map((g) => (
            <div key={g.googleId} className="book" style={{ borderBottom: '1px dotted var(--line)' }}>
              <Cover b={g} />
              <div>
                <div className="bt">{g.title}</div>
                <div className="ba">{g.authors.join(', ')}{g.year ? `, ${g.year}` : ''}{g.pages ? `, ${g.pages} páginas` : ''}</div>
                <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                  <button className="btn btn-ink btn-sm" onClick={() => add(g, 'lendo')}>Estou lendo</button>
                  <button className="btn btn-soft btn-sm" onClick={() => add(g, 'quero_ler')}>Quero ler</button>
                </div>
              </div>
            </div>
          ))}
          {results.length === 0 && <div className="sg-meta" style={{ padding: 10 }}>Nada encontrado.</div>}
        </div>
      )}
      <Seg value={tab} onChange={setTab} options={STATUS} label="Estante" />
      {list.map((b) => <BookRow key={b.id} b={b} onOpen={() => setOpen(b)} />)}
      {list.length === 0 && <Empty text={tab === 'lendo' ? 'Nenhum livro em andamento. Busque acima para começar.' : 'Nada nesta estante.'} />}
      <BookSheet book={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function BookRow({ b, onOpen }: { b: Book; onOpen: () => void }) {
  const pct = b.pages && b.currentPage ? Math.min(100, (b.currentPage / b.pages) * 100) : 0;
  const addPages = async (n: number) => {
    const to = Math.min(b.pages ?? Infinity, (b.currentPage ?? 0) + n);
    await logPages(b, to);
  };
  return (
    <div className="book" data-testid="book-row">
      <button className="tap" onClick={onOpen} aria-label={`Abrir ${b.title}`}><Cover b={b} /></button>
      <div>
        <button className="tap" onClick={onOpen}><div className="bt">{b.title}</div><div className="ba">{b.authors.join(', ')}</div></button>
        {b.status === 'lendo' && (
          <>
            <div className="macro-bar" style={{ background: 'var(--paper-2)' }}><i style={{ width: `${pct}%`, background: 'var(--wine)' }} /></div>
            <div className="small num">{b.currentPage ?? 0}{b.pages ? ` de ${b.pages} páginas, ${Math.round(pct)}%` : ' páginas'}</div>
            <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
              <button className="pill-act pa-rose" onClick={() => addPages(10)}>+10 pág.</button>
              <button className="pill-act pa-rose" onClick={() => addPages(25)}>+25 pág.</button>
              <button className="pill-act pa-ghost" onClick={onOpen}>Atualizar</button>
            </div>
          </>
        )}
        {b.status === 'lido' && <div className="small">{b.rating ? '★'.repeat(b.rating) + '☆'.repeat(5 - b.rating) : 'Sem nota'}{b.finishedAt ? `, terminado em ${shortLabel(b.finishedAt)}` : ''}</div>}
      </div>
    </div>
  );
}

async function logPages(b: Book, toPage: number) {
  const from = b.currentPage ?? 0;
  const delta = toPage - from;
  const patch: Partial<Book> = { currentPage: toPage };
  if (b.pages && toPage >= b.pages) { patch.status = 'lido'; patch.finishedAt = todayKey(); }
  await update<'book'>(b.id, patch);
  if (delta > 0) await create('readlog', { date: todayKey(), bookId: b.id, pages: delta, toPage });
  toast(patch.status === 'lido' ? `Terminou "${b.title}"` : `Página ${toPage}`);
}

function BookSheet({ book, onClose }: { book: Book | null; onClose: () => void }) {
  const [page, setPage] = useState('');
  const [quote, setQuote] = useState('');
  const [review, setReview] = useState('');
  const [confirmEl, ask] = useConfirm();
  const books = useAll('book');
  const b = book ? books?.find((x) => x.id === book.id) ?? book : null;
  useEffect(() => { if (b) { setPage(String(b.currentPage ?? '')); setReview(b.review ?? ''); } }, [book?.id]);
  if (!b) return <Sheet open={false} onClose={onClose} title=""><span /></Sheet>;
  return (
    <Sheet open={!!book} onClose={onClose} title={b.title} sub={b.authors.join(', ')}
      footer={<>
        <button className="btn btn-soft" style={{ flex: '0 0 auto' }} aria-label="Remover livro" onClick={async () => { if (await ask({ title: 'Remover este livro da estante?', ok: 'Remover', danger: true })) { await deleteRecord(b.id, 'Livro removido'); onClose(); } }}><Trash2 size={18} /></button>
        <button className="btn btn-ink" onClick={async () => { if (review !== (b.review ?? '')) await update<'book'>(b.id, { review }); onClose(); }}>Pronto</button>
      </>}>
      <span className="label" style={{ marginTop: 0 }}>Estante</span>
      <div className="chips">{STATUS.map((s) => <Chip key={s.id} on={b.status === s.id} onClick={() => update<'book'>(b.id, { status: s.id, startedAt: s.id === 'lendo' && !b.startedAt ? todayKey() : b.startedAt, finishedAt: s.id === 'lido' ? (b.finishedAt ?? todayKey()) : b.finishedAt })}>{s.label === 'Lidos' ? 'Lido' : s.label === 'Parados' ? 'Parado' : s.label}</Chip>)}</div>
      <span className="label">Página atual {b.pages ? `(de ${b.pages})` : ''}</span>
      <div className="row"><input inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value)} aria-label="Página atual" />
        <button className="btn btn-ink" onClick={() => { const n = Number(page); if (n >= 0) logPages(b, n); }}>Salvar</button></div>
      {!b.pages && (
        <><span className="label">Total de páginas</span>
          <input inputMode="numeric" defaultValue="" onBlur={(e) => e.target.value && update<'book'>(b.id, { pages: Number(e.target.value) })} aria-label="Total de páginas" /></>
      )}
      <span className="label">Nota</span>
      <div className="stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n} estrelas`} onClick={() => update<'book'>(b.id, { rating: b.rating === n ? undefined : n })}><Star size={22} fill={(b.rating ?? 0) >= n ? 'currentColor' : 'none'} /></button>)}</div>
      <span className="label">Trechos marcados</span>
      {b.quotes.map((q) => (
        <div key={q.id} className="row-item"><span className="grow small" style={{ fontStyle: 'italic' }}>"{q.text}"{q.page ? ` (p. ${q.page})` : ''}</span>
          <button className="icon-btn" aria-label="Remover trecho" onClick={() => update<'book'>(b.id, { quotes: b.quotes.filter((x) => x.id !== q.id) })}><Trash2 size={16} /></button></div>
      ))}
      <div className="row"><input value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="Copie um trecho" aria-label="Novo trecho" />
        <button className="btn btn-soft" onClick={() => { if (quote.trim()) { update<'book'>(b.id, { quotes: [...b.quotes, { id: uid(), text: quote.trim(), page: b.currentPage }] }); setQuote(''); } }}><Plus size={18} /></button></div>
      <span className="label">O que achei</span>
      <textarea value={review} onChange={(e) => setReview(e.target.value)} aria-label="Resenha" />
      {confirmEl}
    </Sheet>
  );
}
