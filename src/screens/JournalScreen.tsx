import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pin, Plus, Search, Trash2 } from 'lucide-react';
import { PageHead, useBack } from './common';
import { MicButton, appendText } from '../ui/Dictation';
import { useAll, useByDate } from '../db/hooks';
import { useApp, toast } from '../state/store';
import { create, update, upsert } from '../db/db';
import { deleteRecord } from '../domain/actions';
import { Chip, Sheet, Empty, useConfirm } from '../ui/ui';
import { shortLabel, todayKey } from '../lib/dates';
import type { Journal, Note } from '../db/types';

const SCALES: { key: 'energy' | 'mood' | 'sleep' | 'stress'; label: string; low: string; high: string }[] = [
  { key: 'energy', label: 'Energia', low: 'baixa', high: 'alta' },
  { key: 'mood', label: 'Humor', low: 'para baixo', high: 'ótimo' },
  { key: 'sleep', label: 'Sono', low: 'ruim', high: 'ótimo' },
  { key: 'stress', label: 'Estresse', low: 'tranquila', high: 'alto' }
];
const TAGS = ['Produtiva', 'Focada', 'Cansada', 'Leve', 'Ansiosa', 'Social', 'Descanso', 'Treino bom', 'Dia cheio'];

export function JournalScreen() {
  const date = useApp((s) => s.date);
  const nav = useNavigate();
  const back = useBack();
  const entry = useByDate('journal', date)?.[0];
  const notes = useByDate('note', date);
  const [d, setD] = useState<Partial<Journal>>({ tags: [] });
  const [loaded, setLoaded] = useState('');
  const [noteOpen, setNoteOpen] = useState<Partial<Note> | null>(null);
  const key = `${date}:${entry?.updatedAt ?? 'none'}`;
  useEffect(() => { if (loaded !== key) { setLoaded(key); setD(entry ? { ...entry } : { tags: [] }); } }, [key]);
  const set = (p: Partial<Journal>) => setD((x) => ({ ...x, ...p }));
  const save = async () => {
    await upsert('journal', `journal:${date}`, { date, tags: d.tags ?? [], energy: d.energy, mood: d.mood, sleep: d.sleep, stress: d.stress, text: d.text?.trim() || undefined, gratitude: d.gratitude?.trim() || undefined });
    toast('Dia registrado');
    back();
  };
  return (
    <div className="screen no-nav" data-testid="journal-screen">
      <PageHead title="Diário" />
      {SCALES.map((s) => (
        <div key={s.key} style={{ marginBottom: 12 }}>
          <div className="row between"><span className="label" style={{ margin: '8px 0 6px' }}>{s.label}</span><span className="tiny muted">{s.low} a {s.high}</span></div>
          <div className="scale5" role="radiogroup" aria-label={s.label}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} role="radio" aria-checked={d[s.key] === n} className={d[s.key] === n ? 'on' : ''} onClick={() => set({ [s.key]: d[s.key] === n ? undefined : n } as any)} aria-label={`${s.label} ${n}`}>{n}</button>
            ))}
          </div>
        </div>
      ))}
      <span className="label">Como foi</span>
      <div className="chips">{TAGS.map((t) => <Chip key={t} on={d.tags?.includes(t)} onClick={() => set({ tags: d.tags?.includes(t) ? d.tags.filter((x) => x !== t) : [...(d.tags ?? []), t] })}>{t}</Chip>)}</div>
      <span className="label">O dia em poucas linhas <span className="muted small">(opcional)</span></span>
      <textarea value={d.text ?? ''} onChange={(e) => set({ text: e.target.value })} aria-label="Texto do diário" style={{ minHeight: 110 }} />
      <MicButton label="Contar por voz" onText={(t) => setD((x) => ({ ...x, text: appendText(x.text, t) }))} />
      <span className="label">Algo bom de hoje <span className="muted small">(opcional)</span></span>
      <input value={d.gratitude ?? ''} onChange={(e) => set({ gratitude: e.target.value })} aria-label="Algo bom de hoje" />
      <button className="btn btn-ink btn-block" style={{ marginTop: 16 }} onClick={save} data-testid="journal-save">Salvar o dia</button>

      <div className="section"><h2 className="section-title">Notas de {date === todayKey() ? 'hoje' : shortLabel(date)}</h2><button className="link" onClick={() => nav('/notas')}>Todas as notas</button></div>
      {(notes ?? []).map((n) => <NoteRow key={n.id} n={n} onOpen={() => setNoteOpen(n)} />)}
      <button className="btn btn-soft btn-block" onClick={() => setNoteOpen({ date, text: '', tags: [] })}><Plus size={18} />Nova nota</button>
      <NoteSheet note={noteOpen} onClose={() => setNoteOpen(null)} />
    </div>
  );
}

function NoteRow({ n, onOpen }: { n: Note; onOpen: () => void }) {
  return (
    <button className="lib-item" onClick={onOpen} data-testid="note-row">
      <span className="grow">
        <span style={{ fontWeight: 700 }}>{n.pinned && <Pin size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />}{n.title || n.text.split('\n')[0].slice(0, 60)}</span><br />
        <span className="small muted">{shortLabel(n.date)}{n.tags.length ? `, ${n.tags.join(', ')}` : ''}</span>
      </span>
    </button>
  );
}

export function NoteSheet({ note, onClose }: { note: Partial<Note> | null; onClose: () => void }) {
  const [d, setD] = useState<Partial<Note>>({});
  const [tag, setTag] = useState('');
  const [confirmEl, ask] = useConfirm();
  useEffect(() => { if (note) setD({ ...note }); }, [note]);
  const save = async () => {
    if (!d.text?.trim() && !d.title?.trim()) { onClose(); return; }
    const data = { date: d.date ?? todayKey(), title: d.title?.trim() || undefined, text: d.text ?? '', tags: d.tags ?? [], pinned: !!d.pinned };
    if (d.id) await update<'note'>(d.id, data); else await create('note', data);
    toast('Nota salva');
    onClose();
  };
  return (
    <Sheet open={!!note} onClose={onClose} title={d.id ? 'Nota' : 'Nova nota'} sub={d.date ? shortLabel(d.date) : undefined}
      footer={<>
        {d.id && <button className="btn btn-soft" style={{ flex: '0 0 auto' }} aria-label="Excluir nota" onClick={async () => { if (await ask({ title: 'Excluir esta nota?', ok: 'Excluir', danger: true })) { await deleteRecord(d.id!, 'Nota excluída'); onClose(); } }}><Trash2 size={18} /></button>}
        <button className="btn btn-soft" style={{ flex: '0 0 auto' }} aria-pressed={!!d.pinned} aria-label="Fixar nota" onClick={() => setD({ ...d, pinned: !d.pinned })}><Pin size={18} fill={d.pinned ? 'currentColor' : 'none'} /></button>
        <button className="btn btn-ink" onClick={save} data-testid="note-save">Salvar</button>
      </>}>
      <input value={d.title ?? ''} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Título (opcional)" aria-label="Título da nota" />
      <textarea value={d.text ?? ''} onChange={(e) => setD({ ...d, text: e.target.value })} placeholder="Escreva aqui" aria-label="Texto da nota" style={{ minHeight: 180, marginTop: 8 }} autoFocus={!d.id} />
      <span className="label">Etiquetas</span>
      <div className="chips" style={{ marginBottom: 8 }}>{(d.tags ?? []).map((t) => <Chip key={t} on onClick={() => setD({ ...d, tags: d.tags!.filter((x) => x !== t) })}>{t} <span className="x">✕</span></Chip>)}</div>
      <div className="row"><input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Nova etiqueta" aria-label="Nova etiqueta" />
        <button className="btn btn-soft" onClick={() => { const v = tag.trim().toLowerCase(); if (v && !(d.tags ?? []).includes(v)) setD({ ...d, tags: [...(d.tags ?? []), v] }); setTag(''); }}><Plus size={18} /></button></div>
      {confirmEl}
    </Sheet>
  );
}

export function NotesScreen() {
  const notes = useAll('note');
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [open, setOpen] = useState<Partial<Note> | null>(null);
  const tags = useMemo(() => Array.from(new Set((notes ?? []).flatMap((n) => n.tags))).sort(), [notes]);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = (notes ?? [])
    .filter((n) => (!tag || n.tags.includes(tag)) && (!q || norm(`${n.title ?? ''} ${n.text} ${n.tags.join(' ')}`).includes(norm(q))))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (a.date < b.date ? 1 : -1) || b.updatedAt - a.updatedAt);
  return (
    <div className="screen no-nav" data-testid="notes-screen">
      <PageHead title="Notas" withDate={false} />
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--ink-2)' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nas notas" style={{ paddingLeft: 40 }} aria-label="Buscar nas notas" />
      </div>
      {tags.length > 0 && <div className="chips scroll" style={{ marginBottom: 8 }}>{tags.map((t) => <Chip key={t} on={tag === t} onClick={() => setTag(tag === t ? '' : t)}>{t}</Chip>)}</div>}
      <button className="btn btn-ink btn-block" onClick={() => setOpen({ date: todayKey(), text: '', tags: [] })}><Plus size={18} />Nova nota</button>
      {list.map((n) => <NoteRow key={n.id} n={n} onOpen={() => setOpen(n)} />)}
      {list.length === 0 && <Empty text={q || tag ? 'Nenhuma nota encontrada.' : 'Nenhuma nota ainda.'} />}
      <NoteSheet note={open} onClose={() => setOpen(null)} />
    </div>
  );
}
