// Marca pessoal: pautas do LinkedIn e o ritmo de posts. O ritual da manhã lembra; o da noite guarda as ideias.
import { useState } from 'react';
import { Linkedin, Plus, Trash2 } from 'lucide-react';
import { useAll, useSettings } from '../db/hooks';
import { create, remove, update } from '../db/db';
import { shortLabel, todayKey, WEEKDAY_SHORT } from '../lib/dates';
import { brandToday } from '../domain/ritual';
import { PageHead } from './common';
import { Chip } from '../ui/ui';
import type { Post } from '../db/types';

const STATUS: { id: Post['status']; label: string }[] = [
  { id: 'ideia', label: 'Ideia' }, { id: 'rascunho', label: 'Rascunho' }, { id: 'agendado', label: 'Agendado' }, { id: 'publicado', label: 'Publicado' }
];

export function BrandScreen() {
  const settings = useSettings();
  const posts = useAll('post');
  const [title, setTitle] = useState('');
  const [filter, setFilter] = useState<Post['status'] | 'abertas'>('abertas');
  const [open, setOpen] = useState<string>();
  if (!settings || !posts) return <div className="screen no-nav" />;
  const today = todayKey();
  const b = brandToday(settings, posts, today);
  const br = settings.brand ?? {};
  const saveBrand = (x: Partial<NonNullable<typeof settings.brand>>) => update<'settings'>('settings', { brand: { ...br, ...x } });
  const list = posts.filter((x) => !x.deleted && (filter === 'abertas' ? x.status !== 'publicado' : x.status === filter))
    .sort((a, z) => (a.date ?? '9') .localeCompare(z.date ?? '9') || z.createdAt - a.createdAt);
  const add = async () => { if (!title.trim()) return; await create('post', { title: title.trim(), status: 'ideia' } as any); setTitle(''); };
  return (
    <div className="screen no-nav" data-testid="brand-screen">
      <PageHead title="Marca pessoal" withDate={false} />
      <section className="block b-paper">
        <div className="row between"><b><Linkedin size={16} style={{ verticalAlign: '-3px' }} /> LinkedIn</b><span className="small num">{b.publishedWeek} de {b.perWeek || '–'} na semana</span></div>
        <span className="rt-label" style={{ marginTop: 12 }}>Posts por semana</span>
        <div className="chips">{[0, 1, 2, 3, 4].map((n) => <Chip key={n} on={(br.perWeek ?? 0) === n && !br.off} onClick={() => void saveBrand({ perWeek: n, off: n === 0 })}>{n === 0 ? 'Desligado' : n}</Chip>)}</div>
        <span className="rt-label">Dias de lembrar no ritual da manhã</span>
        <div className="chips">{[1, 2, 3, 4, 5, 6, 7].map((n) => <Chip key={n} on={(br.days ?? []).includes(n)} onClick={() => void saveBrand({ days: (br.days ?? []).includes(n) ? (br.days ?? []).filter((x) => x !== n) : [...(br.days ?? []), n].sort() })}>{WEEKDAY_SHORT[n]}</Chip>)}</div>
      </section>
      <div className="row" style={{ gap: 8, margin: '16px 0 10px' }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova pauta" style={{ flex: 1 }} onKeyDown={(e) => e.key === 'Enter' && void add()} data-testid="post-new" />
        <button className="btn btn-ink btn-sm" onClick={() => void add()} disabled={!title.trim()} aria-label="Adicionar pauta"><Plus size={18} /></button>
      </div>
      <div className="chips" style={{ marginBottom: 12 }}>
        <Chip on={filter === 'abertas'} onClick={() => setFilter('abertas')}>Em aberto</Chip>
        <Chip on={filter === 'publicado'} onClick={() => setFilter('publicado')}>Publicados</Chip>
      </div>
      <div className="list">
        {list.length === 0 && <p className="small muted">{filter === 'publicado' ? 'Nada publicado ainda.' : 'Nenhuma pauta em aberto. As ideias do ritual da noite aparecem aqui.'}</p>}
        {list.map((x) => (
          <div key={x.id} className="lib-item" style={{ flexDirection: 'column', alignItems: 'stretch' }} data-testid="post-row">
            <button className="row between" style={{ textAlign: 'left', gap: 10 }} onClick={() => setOpen(open === x.id ? undefined : x.id)}>
              <span className="grow"><b>{x.title}</b><br /><span className="small muted">{STATUS.find((s) => s.id === x.status)?.label}{x.date ? ` · ${shortLabel(x.date)}` : ''}</span></span>
            </button>
            {open === x.id && <div style={{ marginTop: 10 }}>
              <textarea rows={3} defaultValue={x.note ?? ''} placeholder="Ângulo, gancho, estrutura" onBlur={(e) => void update<'post'>(x.id, { note: e.target.value.trim() || undefined })} />
              <div className="chips" style={{ marginTop: 8 }}>
                {STATUS.map((s) => <Chip key={s.id} on={x.status === s.id} onClick={() => void update<'post'>(x.id, { status: s.id, date: s.id === 'agendado' || s.id === 'publicado' ? x.date ?? today : x.date })}>{s.label}</Chip>)}
              </div>
              {(x.status === 'agendado' || x.status === 'publicado') && <input type="date" value={x.date ?? today} onChange={(e) => void update<'post'>(x.id, { date: e.target.value })} style={{ marginTop: 8 }} />}
              <button className="link small" style={{ marginTop: 8, color: 'var(--wine)' }} onClick={() => void remove(x.id)}><Trash2 size={13} style={{ verticalAlign: '-2px' }} /> Apagar</button>
            </div>}
          </div>
        ))}
      </div>
    </div>
  );
}
