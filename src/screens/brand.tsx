// Marca pessoal: posts do LinkedIn (programados, publicados e pautas) e o ritmo de posts.
// O ritual da manhã lembra; o da noite guarda as ideias.
import { useState } from 'react';
import { Linkedin, Plus, Trash2, ChevronRight, Images } from 'lucide-react';
import { useAll, useSettings } from '../db/hooks';
import { create, remove, update } from '../db/db';
import { shortLabel, todayKey, WEEKDAY_SHORT } from '../lib/dates';
import { brandToday } from '../domain/ritual';
import { Chip, Sheet } from '../ui/ui';
import type { Post, PostMetrics } from '../db/types';

const STATUS: { id: Post['status']; label: string }[] = [
  { id: 'ideia', label: 'Ideia' }, { id: 'rascunho', label: 'Rascunho' }, { id: 'agendado', label: 'Programado' }, { id: 'publicado', label: 'Publicado' }
];
type Tab = 'agendado' | 'publicado' | 'pautas';
const fmt = (n?: number | null) => (n == null ? undefined : n.toLocaleString('pt-BR'));

/** Linha curta de alcance para a lista. */
function reachLine(m?: PostMetrics) {
  if (!m) return '';
  return [fmt(m.impressoes) && `${fmt(m.impressoes)} impressões`, fmt(m.usuarios_alcancados) && `${fmt(m.usuarios_alcancados)} pessoas`].filter(Boolean).join(' - ');
}

const DEMO_LABEL: Record<string, string> = { nivel_de_experiencia: 'Senioridade', localidade: 'Localidade', setor: 'Setor', tamanho_da_empresa: 'Porte', empresa: 'Empresa' };

function Metrics({ m }: { m: PostMetrics }) {
  const cells: [string, string | undefined][] = [
    ['Impressões', fmt(m.impressoes)], ['Pessoas alcançadas', fmt(m.usuarios_alcancados)],
    ['Reações', fmt(m.reacoes)], ['Comentários', fmt(m.comentarios)], ['Compartilhamentos', fmt(m.compartilhamentos)],
    ['Visitas ao perfil', fmt(m.visualizacoes_do_perfil)], ['Seguidores novos', fmt(m.seguidores_obtidos)],
    ['Na sua rede', m.impressoes_na_rede_pct != null ? `${m.impressoes_na_rede_pct}%` : undefined]
  ];
  const shown = cells.filter(([, v]) => v != null);
  const demo = Object.entries(m.demografia_principal ?? {});
  return (
    <div data-testid="post-metrics">
      <span className="rt-label">Alcance</span>
      <div className="li-metrics">{shown.map(([k, v]) => <div key={k} className="li-metric"><b className="num">{v}</b><span>{k}</span></div>)}</div>
      {demo.length > 0 && <>
        <span className="rt-label">Quem mais viu</span>
        {demo.map(([k, d]) => (
          <div key={k} className="row-item" style={{ minHeight: 44 }}>
            <span className="small muted" style={{ width: 92, flex: '0 0 auto' }}>{DEMO_LABEL[k] ?? k}</span>
            <span className="grow small">{d.valor}</span>
            <span className="small num">{d.pct}%</span>
          </div>
        ))}
      </>}
    </div>
  );
}

function PostSheet({ post, onClose }: { post?: Post; onClose: () => void }) {
  const today = todayKey();
  const [i, setI] = useState(0);
  const x = post;
  const imgs = x?.images ?? [];
  return (
    <Sheet open={!!x} onClose={() => { setI(0); onClose(); }} title={x ? (x.pilar ?? 'Post') : ''} sub={x ? [STATUS.find((s) => s.id === x.status)?.label, x.date && shortLabel(x.date)].filter(Boolean).join(' - ') : ''} testId="post-sheet">
      {x && <>
        {imgs.length > 0 && <>
          <div className="li-gallery" onScroll={(e) => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / el.clientWidth)); }}>
            {imgs.map((src, k) => <img key={k} src={src} alt={k === 0 ? (x.imageNote ?? '') : ''} />)}
          </div>
          {imgs.length > 1 && <p className="tiny muted" style={{ textAlign: 'center', margin: '6px 0 0' }}>{i + 1} de {imgs.length} - deslize para ver</p>}
        </>}
        {!imgs.length && x.imageNote && <p className="small muted" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 6 }}><Images size={14} /> A arte deste post não veio com o arquivo.</p>}
        {x.text ? <p className="li-text" data-testid="post-text">{x.text}</p> : <p className="li-text"><b>{x.title}</b></p>}
        {x.metrics && <Metrics m={x.metrics} />}
        {!x.text && <textarea rows={3} defaultValue={x.note ?? ''} placeholder="Ângulo, gancho, estrutura" onBlur={(e) => void update<'post'>(x.id, { note: e.target.value.trim() || undefined })} style={{ marginTop: 8 }} />}
        <span className="rt-label">Situação</span>
        <div className="chips">
          {STATUS.map((s) => <Chip key={s.id} on={x.status === s.id} onClick={() => void update<'post'>(x.id, { status: s.id, date: s.id === 'agendado' || s.id === 'publicado' ? x.date ?? today : x.date })}>{s.label}</Chip>)}
        </div>
        {(x.status === 'agendado' || x.status === 'publicado') && <input type="date" value={x.date ?? today} onChange={(e) => void update<'post'>(x.id, { date: e.target.value })} style={{ marginTop: 8 }} />}
        <button className="link small" style={{ marginTop: 14, color: 'var(--wine)', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { void remove(x.id); onClose(); }}><Trash2 size={14} /> Apagar</button>
      </>}
    </Sheet>
  );
}

export function BrandPosts() {
  const settings = useSettings();
  const posts = useAll('post');
  const [title, setTitle] = useState('');
  const [tab, setTab] = useState<Tab>('agendado');
  const [openId, setOpenId] = useState<string>();
  if (!settings || !posts) return null;
  const today = todayKey();
  const b = brandToday(settings, posts, today);
  const br = settings.brand ?? {};
  const saveBrand = (x: Partial<NonNullable<typeof settings.brand>>) => update<'settings'>('settings', { brand: { ...br, ...x } });
  const live = posts.filter((x) => !x.deleted);
  const sched = live.filter((x) => x.status === 'agendado').sort((a, z) => (a.date ?? '9').localeCompare(z.date ?? '9'));
  const pub = live.filter((x) => x.status === 'publicado').sort((a, z) => (z.date ?? '').localeCompare(a.date ?? ''));
  const ideas = live.filter((x) => x.status === 'ideia' || x.status === 'rascunho').sort((a, z) => z.createdAt - a.createdAt);
  const list = tab === 'agendado' ? sched : tab === 'publicado' ? pub : ideas;
  const add = async () => { if (!title.trim()) return; await create('post', { title: title.trim(), status: 'ideia' } as any); setTitle(''); };
  const next = sched[0];
  return (
    <div data-testid="brand-posts">
      <section className="block b-paper">
        <div className="row between"><b><Linkedin size={16} style={{ verticalAlign: '-3px' }} /> LinkedIn</b><span className="small num">{b.publishedWeek} de {b.perWeek || '–'} na semana</span></div>
        {next && <button className="li-next tap" onClick={() => setOpenId(next.id)} data-testid="post-next">
          <span className="small muted">Próximo post - {next.date ? shortLabel(next.date) : 'sem data'}</span>
          <b>{next.title}</b>
        </button>}
      </section>
      <div className="chips" style={{ margin: '16px 0 12px' }}>
        <Chip on={tab === 'agendado'} onClick={() => setTab('agendado')}>Programados{sched.length ? ` (${sched.length})` : ''}</Chip>
        <Chip on={tab === 'publicado'} onClick={() => setTab('publicado')}>Publicados{pub.length ? ` (${pub.length})` : ''}</Chip>
        <Chip on={tab === 'pautas'} onClick={() => setTab('pautas')}>Pautas{ideas.length ? ` (${ideas.length})` : ''}</Chip>
      </div>
      {tab === 'pautas' && <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova pauta" style={{ flex: 1 }} onKeyDown={(e) => e.key === 'Enter' && void add()} data-testid="post-new" />
        <button className="btn btn-ink btn-sm" onClick={() => void add()} disabled={!title.trim()} aria-label="Adicionar pauta"><Plus size={18} /></button>
      </div>}
      <div className="list">
        {list.length === 0 && <p className="small muted">{tab === 'publicado' ? 'Nada publicado ainda.' : tab === 'agendado' ? 'Nenhum post programado.' : 'Nenhuma pauta. As ideias do ritual da noite aparecem aqui.'}</p>}
        {list.map((x) => (
          <button key={x.id} className="li-row tap" onClick={() => setOpenId(x.id)} data-testid="post-row">
            {x.images?.[0] ? <img className="li-thumb" src={x.images[0]} alt="" loading="lazy" /> : <span className="li-thumb li-nothumb"><Linkedin size={20} /></span>}
            <span className="grow">
              <span className="li-title">{x.title}</span>
              <span className="small muted">{[x.pilar, x.date && shortLabel(x.date), x.images && x.images.length > 1 && `carrossel de ${x.images.length}`].filter(Boolean).join(' - ') || STATUS.find((s) => s.id === x.status)?.label}</span>
              {x.status === 'publicado' && reachLine(x.metrics) && <span className="small li-reach">{reachLine(x.metrics)}</span>}
            </span>
            <ChevronRight size={18} style={{ flex: '0 0 auto' }} />
          </button>
        ))}
      </div>
      <section className="block b-paper" style={{ marginTop: 18 }}>
        <span className="rt-label" style={{ marginTop: 0 }}>Posts por semana</span>
        <div className="chips">{[0, 1, 2, 3, 4].map((n) => <Chip key={n} on={(br.perWeek ?? 0) === n && !br.off} onClick={() => void saveBrand({ perWeek: n, off: n === 0 })}>{n === 0 ? 'Desligado' : n}</Chip>)}</div>
        <span className="rt-label">Dias de lembrar no ritual da manhã</span>
        <div className="chips">{[1, 2, 3, 4, 5, 6, 7].map((n) => <Chip key={n} on={(br.days ?? []).includes(n)} onClick={() => void saveBrand({ days: (br.days ?? []).includes(n) ? (br.days ?? []).filter((x) => x !== n) : [...(br.days ?? []), n].sort() })}>{WEEKDAY_SHORT[n]}</Chip>)}</div>
      </section>
      <PostSheet post={live.find((x) => x.id === openId)} onClose={() => setOpenId(undefined)} />
    </div>
  );
}
