// Pauta: o card recolhível no Hoje, a seção do menu (edição do dia, arquivo e salvas), a notícia aberta e os ajustes.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Bookmark, BookmarkCheck, Check, ChevronDown, ChevronRight, ListPlus, Minus, Newspaper, Plus, RefreshCw, Share2, SlidersHorizontal, Target, X } from 'lucide-react';
import { useAll, useRecord } from '../db/hooks';
import type { NewsPrefs, Pauta, PautaItem, PautaLente } from '../db/types';
import { todayKey, isoWeekday, WEEKDAY_SHORT, MONTHS_SHORT, dayNum, monthIdx, longDate, WEEKDAY_LONG, type DateKey } from '../lib/dates';
import {
  AREA, CAPA_COR, NIVEL_CURTO, NIVEL_PCT, NIVEL_TXT, PREFS_PADRAO, follow, isRead, itemToTask, itensOf, latestFio, lenteOf, markRead,
  pautaId, prefsOf, readCount, requestPauta, savePrefs, savedItems, toggleSaved, totalMinutes, vote
} from '../domain/pauta';
import { Capa, NewsImage } from '../ui/capa';
import { PageHead, TopBar, useBack } from './common';
import { Seg, Switch, TimeInput } from '../ui/ui';
import { toast } from '../state/store';
import { useSync } from '../sync/sync';

const dLabel = (d: DateKey) => `${WEEKDAY_SHORT[isoWeekday(d)]}, ${dayNum(d)} ${MONTHS_SHORT[monthIdx(d)]}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pad2 = (n: number) => String(n).padStart(2, '0');

function nowMin() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
function hourMin(h: string) { return /^\d{2}:\d{2}$/.test(h) ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3)) : 390; }

/** Selo da lente na cor da capa. */
function LensTag({ id, lentes, n }: { id: string; lentes: PautaLente[]; n?: number }) {
  const l = lenteOf(id, lentes);
  const c = CAPA_COR[l.capa];
  return <span className="pt-tag" style={{ background: c.bg, color: c.ink }}>{n ? `${pad2(n)} · ` : ''}{l.curto}</span>;
}

/** Montando, deu erro ou ainda não saiu: o mesmo bloco no Hoje e na Pauta. */
function PautaStatus({ p, date, compact }: { p: Pauta | null; date: DateKey; compact?: boolean }) {
  const logged = !!useSync((s) => s.session);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (p?.status === 'gerando' && logged) void follow(); }, [p?.status, logged]);
  const ask = async (force: boolean) => {
    setBusy(true);
    try { await requestPauta(force); } catch (e: any) { toast(e?.message ?? 'Não deu para montar a Pauta agora.'); } finally { setBusy(false); }
  };
  const today = date === todayKey();
  if (p?.status === 'gerando' || busy) {
    return (
      <div className={`pt-status ${compact ? 'compact' : ''}`} data-testid="pauta-gerando">
        <span className="pt-spin" aria-hidden><RefreshCw size={18} /></span>
        <span className="grow"><b>Montando a Pauta de hoje</b><br /><span className="small muted">Lendo os jornais da manhã. Leva uns 2 minutos.</span></span>
      </div>
    );
  }
  if (p?.status === 'erro') {
    return (
      <div className={`pt-status ${compact ? 'compact' : ''}`} data-testid="pauta-erro">
        <span className="grow"><b>A Pauta de {today ? 'hoje' : dLabel(date)} não saiu</b><br /><span className="small muted">A busca falhou{(p.tentativas ?? 0) < 3 ? '; tento de novo sozinha em alguns minutos' : ''}.</span></span>
        {today && logged && <button className="btn btn-ink btn-sm" onClick={() => void ask(true)}>Tentar agora</button>}
      </div>
    );
  }
  if (!today) return compact ? null : <p className="small muted" style={{ margin: '8px 0' }}>Não houve Pauta neste dia.</p>;
  return (
    <div className={`pt-status ${compact ? 'compact' : ''}`} data-testid="pauta-vazia">
      <span className="grow"><b>A Pauta de hoje ainda não chegou</b><br /><span className="small muted">{logged ? 'Ela sai sozinha no horário dos ajustes.' : 'Entre com Google para receber a Pauta.'}</span></span>
      {logged && <button className="btn btn-ink btn-sm" onClick={() => void ask(false)} data-testid="pauta-montar">Montar agora</button>}
    </div>
  );
}

/* ---------------- Hoje ---------------- */
export function PautaToday({ date }: { date: DateKey }) {
  const nav = useNavigate();
  const p = useRecord<'pauta'>(pautaId(date));
  const prefsRec = useRecord<'newsprefs'>('newsprefs');
  const [open, setOpen] = useState(false);
  if (p === undefined || prefsRec === undefined) return null;
  const prefs = prefsOf(prefsRec);
  const today = date === todayKey();
  if (!p || p.status !== 'pronta') {
    // Antes do horário, ou num dia passado sem edição, o Hoje fica como estava.
    if (!today || (!p && nowMin() < hourMin(prefs.hora))) return null;
    return <section className="pt-card" aria-label="Pauta do dia"><PautaStatus p={p} date={date} compact /></section>;
  }
  const itens = itensOf(p);
  const [lead, ...rest] = itens;
  const go = (i: PautaItem) => nav(`/pauta/${date}/${i.id}`);
  return (
    <section className="pt-card" aria-label="Pauta do dia" data-testid="pauta-hoje">
      <div className="pt-head">
        <span className="pt-stack" aria-hidden>{itens.map((i) => <Capa key={i.id} capa={lenteOf(i.lente, prefs.lentes).capa} />)}</span>
        <button className="pt-head-t" onClick={() => setOpen(!open)} aria-expanded={open}>
          <b>Pauta do dia</b>
          <span className="small muted">{readCount(p)} de {itens.length} lidas · {totalMinutes(p)} min</span>
        </button>
        <button className={`pt-chev ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? 'Recolher a Pauta do dia' : 'Abrir a Pauta do dia'} data-testid="pauta-seta">
          <ChevronDown size={20} />
        </button>
      </div>
      {!open && (
        <div className="pt-teaser">
          {[...new Set(itens.map((i) => i.lente))].map((id) => <LensTag key={id} id={id} lentes={prefs.lentes} />)}
        </div>
      )}
      {open && (
        <div className="pt-open" data-testid="pauta-aberta">
          <button className="pt-lead" onClick={() => go(lead)}>
            <NewsImage src={lead.imagem} capa={lenteOf(lead.lente, prefs.lentes).capa} className="pt-lead-img" round={18} />
            <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}><LensTag id={lead.lente} lentes={prefs.lentes} /><span className="small muted">{[lead.fonte, `${lead.minutos ?? 4} min`].filter(Boolean).join(' · ')}</span></span>
            <span className="pt-lead-t">{lead.titulo}</span>
            {lead.impactos[0] && <span className="pt-afeta"><b>Te afeta:</b> {lead.impactos[0].texto}</span>}
          </button>
          {rest.map((i) => (
            <button key={i.id} className={`pt-row ${isRead(p, i.id) ? 'read' : ''}`} onClick={() => go(i)}>
              <NewsImage src={i.imagem} capa={lenteOf(i.lente, prefs.lentes).capa} className="pt-thumb" round={14} />
              <span className="grow pt-row-t">{i.titulo}</span>
              {isRead(p, i.id) && <Check size={18} strokeWidth={2.8} className="pt-ok" aria-label="Lida" />}
            </button>
          ))}
          <button className="btn btn-ink btn-block" onClick={() => nav(`/pauta?d=${date}`)} data-testid="pauta-tudo">Ver tudo detalhado <ArrowRight size={16} /></button>
        </div>
      )}
    </section>
  );
}

/** Linha do ritual da manhã: avisa que a Pauta está pronta, sem repetir as notícias. */
export function PautaRitualLine({ date }: { date: DateKey }) {
  const p = useRecord<'pauta'>(pautaId(date));
  const prefs = prefsOf(useRecord<'newsprefs'>('newsprefs'));
  if (!p || p.status !== 'pronta' || !prefs.avisarRitual) return null;
  return (
    <div className="rt-item" data-testid="rt-pauta"><span className="rt-ic"><Newspaper size={18} /></span>
      <span className="grow"><b>Sua Pauta está pronta</b><br /><span className="small">{itensOf(p).length} leituras, {totalMinutes(p)} min · no Hoje</span></span>
    </div>
  );
}

/* ---------------- Seção do menu ---------------- */
type Tab = 'edicao' | 'arquivo' | 'salvas';
export function PautaScreen() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const date = (sp.get('d') ?? todayKey()) as DateKey;
  const tab = (sp.get('t') ?? 'edicao') as Tab;
  const pautas = useAll('pauta');
  const prefs = prefsOf(useRecord<'newsprefs'>('newsprefs'));
  const p = pautas?.find((x) => x.date === date) ?? null;
  const itens = itensOf(p);
  const set = (k: Record<string, string>) => setSp({ d: date, t: tab, ...k }, { replace: true });
  const fio = useMemo(() => latestFio(pautas ?? []), [pautas]);
  return (
    <div className="screen pt-screen" data-testid="pauta-screen">
      <TopBar right={<button className="icon-btn" aria-label="Ajustes da Pauta" onClick={() => nav('/pauta/ajustes')} data-testid="pauta-ajustes"><SlidersHorizontal size={21} /></button>} />
      <header className="pt-mast">
        <div className="pt-rule thick" />
        <div className="pt-mast-row">
          <h1 className="pt-word">Pauta</h1>
          <div className="pt-mast-meta">
            <span className="pt-kicker">{date === todayKey() ? 'Edição da manhã' : 'Edição'}</span>
            <span className="small muted">{dLabel(date)}{itens.length ? ` · ${totalMinutes(p)} min` : ''}</span>
          </div>
        </div>
        <div className="pt-rule" />
        {itens.length > 0 && (
          <div className="pt-progress" aria-label={`${readCount(p)} de ${itens.length} lidas`}>
            {itens.map((i) => <span key={i.id} style={{ background: isRead(p, i.id) ? CAPA_COR[lenteOf(i.lente, prefs.lentes).capa].strong : undefined }} />)}
          </div>
        )}
      </header>
      <div className="seg-tabs" role="tablist" style={{ marginTop: 10 }}>
        {([['edicao', date === todayKey() ? 'Hoje' : dLabel(date)], ['arquivo', 'Arquivo'], ['salvas', 'Salvas']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => set({ t: k })} data-testid={`pt-tab-${k}`}>{l}</button>
        ))}
      </div>
      {tab === 'edicao' && (!p || p.status !== 'pronta' ? <div style={{ marginTop: 16 }}><PautaStatus p={p} date={date} /></div> : <Edition p={p} lentes={prefs.lentes} />)}
      {tab === 'edicao' && fio?.fio && date === todayKey() && (
        <section className="pt-fio" data-testid="pauta-fio">
          <svg className="pt-fio-art" width="170" height="90" viewBox="0 0 170 90" aria-hidden><path d="M8 70 C40 10 70 80 100 40 S150 20 162 12" stroke="#C0582C" strokeWidth="2" strokeDasharray="3 5" fill="none" /><circle cx="8" cy="70" r="6" fill="#6FA39A" /><circle cx="58" cy="48" r="6" fill="#EDC15A" /><circle cx="100" cy="40" r="6" fill="#CFC1DF" /><circle cx="162" cy="12" r="6" fill="#F2B48C" /></svg>
          <span className="pt-kicker" style={{ color: '#F2B48C' }}>O fio da semana</span>
          <h2>{fio.fio.titulo}</h2>
          <p>{fio.fio.texto}</p>
        </section>
      )}
      {tab === 'arquivo' && <Archive pautas={pautas ?? []} lentes={prefs.lentes} onPick={(d) => setSp({ d, t: 'edicao' }, { replace: true })} />}
      {tab === 'salvas' && <Saved pautas={pautas ?? []} lentes={prefs.lentes} />}
    </div>
  );
}

function Edition({ p, lentes }: { p: Pauta; lentes: PautaLente[] }) {
  const nav = useNavigate();
  const itens = itensOf(p);
  const [lead, ...rest] = itens;
  const pair = rest.slice(0, 2);
  const tail = rest.slice(2);
  const go = (i: PautaItem) => nav(`/pauta/${p.date}/${i.id}`);
  const capa = (i: PautaItem) => lenteOf(i.lente, lentes).capa;
  const Read = ({ i }: { i: PautaItem }) => isRead(p, i.id) ? <span className="pt-readdot" aria-label="Lida"><Check size={14} strokeWidth={3} /></span> : null;
  return (
    <div className="pt-edition" data-testid="pauta-edicao">
      <button className="pt-hero" onClick={() => go(lead)} data-testid="pauta-manchete">
        <span className="pt-hero-img"><NewsImage src={lead.imagem} capa={capa(lead)} /><span className="pt-badge">01 · Manchete</span><Read i={lead} /></span>
        <span className="pt-hero-body">
          <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}><LensTag id={lead.lente} lentes={lentes} /><span className="small muted">{[lead.fonte, `${lead.minutos ?? 4} min`].filter(Boolean).join(' · ')}</span></span>
          <span className="pt-hero-t">{lead.titulo}</span>
          {lead.impactos[0] && <span className="pt-afeta box"><Target size={17} /> <span><b>Te afeta:</b> {lead.impactos[0].texto}</span></span>}
        </span>
      </button>
      {pair.length > 0 && (
        <div className="pt-pair">
          {pair.map((i, k) => (
            <button key={i.id} className="pt-mini" onClick={() => go(i)}>
              <span className="pt-mini-img"><NewsImage src={i.imagem} capa={capa(i)} /><Read i={i} /></span>
              <span className="pt-mini-body"><span className="pt-num" style={{ color: CAPA_COR[capa(i)].ink }}>{pad2(k + 2)} · {lenteOf(i.lente, lentes).curto}</span><span className="pt-mini-t">{i.titulo}</span></span>
            </button>
          ))}
        </div>
      )}
      {tail.length > 0 && (
        <div className="pt-listcard">
          {tail.map((i, k) => (
            <button key={i.id} className="pt-li" onClick={() => go(i)}>
              <NewsImage src={i.imagem} capa={capa(i)} className="pt-thumb lg" round={16} />
              <span className="grow"><span className="pt-num" style={{ color: CAPA_COR[capa(i)].ink }}>{pad2(k + 4)} · {lenteOf(i.lente, lentes).curto} · {i.minutos ?? 4} min</span><span className="pt-li-t">{i.titulo}</span></span>
              {isRead(p, i.id) && <Check size={18} strokeWidth={2.8} className="pt-ok" aria-label="Lida" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Archive({ pautas, lentes, onPick }: { pautas: Pauta[]; lentes: PautaLente[]; onPick: (d: DateKey) => void }) {
  const list = pautas.filter((p) => p.status === 'pronta' && itensOf(p).length).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!list.length) return <p className="small muted" style={{ marginTop: 16 }}>As edições ficam guardadas aqui, uma por dia.</p>;
  return (
    <div className="pt-arch" data-testid="pauta-arquivo">
      {list.map((p) => {
        const it = itensOf(p);
        return (
          <button key={p.id} className="pt-arch-row" onClick={() => onPick(p.date)}>
            <span className="pt-fan" aria-hidden>{it.slice(0, 3).map((i) => <Capa key={i.id} capa={lenteOf(i.lente, lentes).capa} round={10} />)}</span>
            <span className="grow"><b>{cap(WEEKDAY_LONG[isoWeekday(p.date)])}, {longDate(p.date)}</b><br /><span className="small muted">Manchete: {lenteOf(it[0].lente, lentes).curto} · {readCount(p)} de {it.length} lidas</span></span>
            <ChevronRight size={18} className="muted" />
          </button>
        );
      })}
    </div>
  );
}

function Saved({ pautas, lentes }: { pautas: Pauta[]; lentes: PautaLente[] }) {
  const nav = useNavigate();
  const list = savedItems(pautas);
  if (!list.length) return <p className="small muted" style={{ marginTop: 16 }}>Toque no marcador de uma notícia para guardar aqui.</p>;
  return (
    <div className="pt-listcard" style={{ marginTop: 14 }} data-testid="pauta-salvas">
      {list.map(({ date, item }) => (
        <button key={item.id} className="pt-li" onClick={() => nav(`/pauta/${date}/${item.id}`)}>
          <NewsImage src={item.imagem} capa={lenteOf(item.lente, lentes).capa} className="pt-thumb lg" round={16} />
          <span className="grow"><span className="pt-num muted">{dLabel(date)} · {lenteOf(item.lente, lentes).curto}</span><span className="pt-li-t">{item.titulo}</span></span>
        </button>
      ))}
    </div>
  );
}

/* ---------------- Notícia aberta ---------------- */
export function PautaNewsScreen() {
  const { date = '', id = '' } = useParams();
  const nav = useNavigate();
  const back = useBack();
  const p = useRecord<'pauta'>(pautaId(date));
  const prefs = prefsOf(useRecord<'newsprefs'>('newsprefs'));
  const itens = itensOf(p);
  const idx = itens.findIndex((i) => i.id === id);
  const item = itens[idx];
  // Abrir a notícia conta como lida; o botão de baixo desfaz.
  useEffect(() => { if (item && p && !isRead(p, item.id)) void markRead(date, item.id, true); }, [item?.id, p?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (p === undefined) return null;
  if (!item) return <div className="screen"><PageHead title="Notícia" withDate={false} /><p className="muted">Essa notícia não está mais aqui.</p></div>;
  const l = lenteOf(item.lente, prefs.lentes);
  const next = itens[idx + 1];
  const saved = !!p?.salvas?.includes(item.id);
  const voto = p?.votos?.[item.id];
  const read = isRead(p, item.id);
  const tasked = !!p?.tarefas?.includes(item.id);
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: item.titulo, url: item.url }); else { await navigator.clipboard.writeText(item.url); toast('Link copiado.'); } } catch { /* cancelou */ }
  };
  const impacts = item.impactos;
  return (
    <div className="pt-news" data-testid="pauta-noticia">
      <div className="pt-news-hero">
        <NewsImage src={item.imagem} capa={l.capa} />
        <button className="pt-float l" aria-label="Voltar" onClick={back}><ArrowRight size={20} style={{ transform: 'rotate(180deg)' }} /></button>
        <span className="pt-float-r">
          <button className="pt-float" aria-label="Compartilhar" onClick={() => void share()}><Share2 size={19} /></button>
          <button className="pt-float" aria-label={saved ? 'Tirar das salvas' : 'Salvar notícia'} aria-pressed={saved} onClick={() => void toggleSaved(date, item.id)} data-testid="pauta-salvar">{saved ? <BookmarkCheck size={19} /> : <Bookmark size={19} />}</button>
        </span>
      </div>
      <article className="pt-sheet">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><span className="pt-count">{pad2(idx + 1)} / {pad2(itens.length)}</span><LensTag id={item.lente} lentes={prefs.lentes} /></div>
        <h1 className="pt-news-t">{item.titulo}</h1>
        <div className="row" style={{ gap: 10 }}>
          <span className="pt-src-dot" aria-hidden>{(item.fonte ?? '?').charAt(0)}</span>
          <span className="small muted" style={{ lineHeight: 1.35 }}><b className="ink">{item.fonte ?? 'Fonte'}</b><br />{[item.data ? dLabel(item.data as DateKey) : undefined, `leitura original ${item.minutos ?? 4} min`].filter(Boolean).join(' · ')}</span>
        </div>

        <h2 className="pt-k"><i />O que aconteceu</h2>
        <p className="pt-body">{item.resumo}</p>

        {item.porque && (
          <section className="pt-why">
            <svg className="pt-why-q" width="70" height="60" viewBox="0 0 70 60" aria-hidden><path d="M8 50 C8 26 18 12 32 8 L34 16 C26 20 22 28 22 34 L32 34 L32 50 Z M40 50 C40 26 50 12 64 8 L66 16 C58 20 54 28 54 34 L64 34 L64 50 Z" fill="#C0582C" opacity="0.55" /></svg>
            <span className="pt-kicker" style={{ color: '#F2B48C' }}>Por que importa</span>
            <p>{item.porque}</p>
          </section>
        )}

        {impacts.length > 0 && (<>
          <h2 className="pt-k"><i />Como te afeta</h2>
          <div className="pt-impacts">
            {impacts.map((x, k) => {
              const c = CAPA_COR[AREA[x.area].capa];
              const len = 2 * Math.PI * 18;
              return (
                <div key={x.area} className={`pt-imp ${impacts.length % 2 === 1 && k === impacts.length - 1 ? 'wide' : ''}`} style={{ background: c.bg, color: c.ink }}>
                  <span className="row" style={{ gap: 10 }}>
                    <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden><circle cx="23" cy="23" r="18" fill="none" stroke="#FAF6EC" strokeWidth="6" opacity="0.6" /><circle cx="23" cy="23" r="18" fill="none" stroke={c.ink} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${len * NIVEL_PCT[x.nivel]} ${len}`} transform="rotate(-90 23 23)" /></svg>
                    <span aria-label={`${AREA[x.area].nome}, ${NIVEL_TXT[x.nivel]}`}><b style={{ fontSize: 15 }}>{AREA[x.area].nome}</b><br /><span style={{ fontSize: 12.5, fontWeight: 700 }}>{NIVEL_CURTO[x.nivel]}</span></span>
                  </span>
                  <span className="pt-imp-t">{x.texto}</span>
                </div>
              );
            })}
          </div>
        </>)}

        {item.acao && (
          <div className="pt-todo">
            <span className="pt-todo-ic"><ListPlus size={21} /></span>
            <span className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span><b>Pra levar adiante:</b> {item.acao}</span>
              <button className="btn btn-line btn-sm" style={{ alignSelf: 'flex-start' }} disabled={tasked} onClick={async () => { await itemToTask(date, item); toast('Virou tarefa na DBC.'); }} data-testid="pauta-tarefa">{tasked ? <><Check size={15} /> Está nas tarefas</> : 'Virar tarefa · DBC'}</button>
            </span>
          </div>
        )}

        {!!item.tambem?.length && (
          <div style={{ marginTop: 18 }}>
            <div className="small muted" style={{ marginBottom: 8 }}>Também cobriram</div>
            <div className="chips">{item.tambem.map((t) => <span key={t} className="chip" style={{ cursor: 'default' }}>{t}</span>)}</div>
          </div>
        )}

        <a className="btn btn-ink btn-block" style={{ marginTop: 20, textDecoration: 'none' }} href={item.url} target="_blank" rel="noopener noreferrer" data-testid="pauta-fonte">{item.verificado === false ? 'Buscar a matéria' : 'Ler a matéria na fonte'} <ArrowUpRight size={16} /></a>

        <div className="pt-vote">
          <span className="small muted">Essa notícia foi útil pra você?</span>
          <div className="pt-vote-b">
            <button className={`btn btn-sm ${voto === 'mais' ? 'btn-ink' : 'btn-line'}`} aria-pressed={voto === 'mais'} onClick={() => void vote(date, item, 'mais')} data-testid="pauta-mais"><Plus size={16} /> Mais assim</button>
            <button className={`btn btn-sm ${voto === 'menos' ? 'btn-ink' : 'btn-line'}`} aria-pressed={voto === 'menos'} onClick={() => void vote(date, item, 'menos')} data-testid="pauta-menos"><Minus size={16} /> Menos assim</button>
          </div>
          <span className="small muted" style={{ textAlign: 'center' }}>Cada toque ajusta as próximas edições. Tocar de novo desfaz.</span>
        </div>
      </article>
      <div className="pt-bottom">
        <button className="btn btn-line" onClick={() => void markRead(date, item.id, !read)} aria-pressed={read} data-testid="pauta-lida">{read ? <><Check size={16} /> Lida</> : 'Marcar como lida'}</button>
        {next ? <button className="btn btn-wine" onClick={() => nav(`/pauta/${date}/${next.id}`, { replace: true })} data-testid="pauta-proxima">Próxima · {lenteOf(next.lente, prefs.lentes).curto}</button>
          : <button className="btn btn-wine" onClick={() => nav(`/pauta?d=${date}`)}>Voltar à edição</button>}
      </div>
    </div>
  );
}

/* ---------------- Ajustes ---------------- */
const NIVEIS: { id: PautaLente['nivel']; label: string }[] = [{ id: 'sempre', label: 'Sempre' }, { id: 'asvezes', label: 'Às vezes' }, { id: 'nao', label: 'Não' }];
type Draft = Omit<NewsPrefs, 'id' | 'kind' | 'createdAt' | 'updatedAt'>;

function ChipEditor({ label, items, onChange, tone, testId }: { label: string; items: string[]; onChange: (v: string[]) => void; tone: 'blue' | 'rose'; testId: string }) {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (t && !items.includes(t)) onChange([...items, t]); setV(''); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="small muted" style={{ fontWeight: 600 }}>{label}</span>
      <div className="chips">
        {items.map((x) => <button key={x} className={`pt-chipx ${tone}`} onClick={() => onChange(items.filter((y) => y !== x))} aria-label={`Tirar ${x}`}>{x} <X size={14} /></button>)}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Adicionar" data-testid={testId} />
        <button className="btn btn-line btn-sm" onClick={add} disabled={!v.trim()}>Adicionar</button>
      </div>
    </div>
  );
}

export function PautaSettingsScreen() {
  const rec = useRecord<'newsprefs'>('newsprefs');
  const logged = !!useSync((s) => s.session);
  const [d, setD] = useState<Draft | undefined>();
  const [savedAt, setSavedAt] = useState<string>();
  const [nova, setNova] = useState('');
  useEffect(() => { if (rec !== undefined && !d) { const { id, kind, createdAt, updatedAt, deleted, dirty, ...rest } = (prefsOf(rec) as any); void id; void kind; void createdAt; void updatedAt; void deleted; void dirty; setD(rest); } }, [rec]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;
  const up = (patch: Partial<Draft>) => { setD({ ...d, ...patch }); setSavedAt(undefined); };
  const setLens = (id: string, nivel: PautaLente['nivel']) => up({ lentes: d.lentes.map((l) => (l.id === id ? { ...l, nivel } : l)) });
  const addLens = () => {
    const nome = nova.trim(); if (!nome) return;
    up({ lentes: [...d.lentes, { id: `l${Date.now().toString(36)}`, nome, nivel: 'asvezes', capa: 'vida' }] }); setNova('');
  };
  const save = async () => { await savePrefs(d); const n = new Date(); setSavedAt(`${pad2(n.getHours())}:${pad2(n.getMinutes())}`); };
  const redo = async () => { try { await requestPauta(true); toast('Refazendo a Pauta de hoje.'); } catch (e: any) { toast(e?.message ?? 'Não deu agora.'); } };
  return (
    <div className="screen" data-testid="pauta-settings">
      <PageHead title="" withDate={false} />
      <section className="pt-set-hero">
        <h1>Sua Pauta, do seu jeito</h1>
        <p>Você define as lentes. A IA escolhe as 5 do dia e explica por quê.</p>
        <span className="pt-set-fan" aria-hidden><Capa capa="saude" round={16} /><Capa capa="dinheiro" round={16} /><Capa capa="carreira" round={16} /></span>
      </section>

      <div className="pt-set-grid">
        <div className="pt-set-card pt-set-row">
          <span style={{ fontWeight: 650, fontSize: 15 }}>Pronta às</span>
          <TimeInput value={d.hora} onChange={(hora) => up({ hora })} label="Horário da Pauta" style={{ fontFamily: 'var(--f-display)', fontSize: 24, fontWeight: 800 }} />
        </div>
        <div className="pt-set-card">
          <span style={{ fontWeight: 650, fontSize: 15 }}>Tamanho do resumo</span>
          <Seg value={d.resumo} onChange={(resumo) => up({ resumo })} label="Tamanho do resumo" options={[{ id: 'curto', label: 'Curto' }, { id: 'padrao', label: 'Padrão' }, { id: 'profundo', label: 'Profundo' }]} />
        </div>
      </div>
      <div className="pt-set-card" style={{ marginTop: 10 }}>
        <Switch on={d.avisarRitual} onChange={(avisarRitual) => up({ avisarRitual })} label="Avisar no ritual da manhã" hint="Uma linha dizendo que a Pauta está pronta, sem repetir as notícias." />
      </div>

      <section className="pt-set-card" style={{ marginTop: 12 }}>
        <h2 className="pt-set-h">Lentes</h2>
        <p className="small muted" style={{ margin: '2px 0 4px' }}>Sempre: prioridade todos os dias. Às vezes: só quando for relevante.</p>
        {d.lentes.map((l) => (
          <div key={l.id} className="pt-lens" data-testid={`lente-${l.id}`}>
            <Capa capa={l.capa} className="pt-thumb" round={14} />
            <span className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="row between" style={{ gap: 8 }}><b style={{ fontSize: 15, lineHeight: 1.25 }}>{l.nome}</b>{!PREFS_PADRAO.lentes.some((x) => x.id === l.id) && <button className="icon-btn" style={{ width: 32, height: 32, flexBasis: 32 }} aria-label={`Tirar a lente ${l.nome}`} onClick={() => up({ lentes: d.lentes.filter((x) => x.id !== l.id) })}><X size={16} /></button>}</span>
              <Seg value={l.nivel} onChange={(n) => setLens(l.id, n)} label={`Frequência de ${l.nome}`} options={NIVEIS} />
            </span>
          </div>
        ))}
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <input value={nova} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLens()} placeholder="Nova lente" data-testid="lente-nova" />
          <button className="btn btn-line btn-sm" onClick={addLens} disabled={!nova.trim()}>Criar</button>
        </div>
      </section>

      <section className="pt-set-card" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 className="pt-set-h">Fontes</h2>
        <ChipEditor label="Prefiro" items={d.preferir} onChange={(preferir) => up({ preferir })} tone="blue" testId="fonte-prefiro" />
        <ChipEditor label="Evitar" items={d.evitar} onChange={(evitar) => up({ evitar })} tone="rose" testId="fonte-evitar" />
      </section>

      <section className="pt-set-card" style={{ marginTop: 12 }}>
        <label htmlFor="pt-ctx"><h2 className="pt-set-h">O que mais devo saber</h2></label>
        <textarea id="pt-ctx" rows={4} value={d.contexto} onChange={(e) => up({ contexto: e.target.value })} placeholder="Ex.: estou planejando as metas de 2027; quero ver movimentos de concorrentes sempre que houver." style={{ marginTop: 8, resize: 'none' }} data-testid="pauta-contexto" />
      </section>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn btn-wine btn-block" onClick={() => void save()} data-testid="pauta-salvar-ajustes">Salvar ajustes</button>
        {savedAt && <span className="small" style={{ color: 'var(--ok)', textAlign: 'center', fontWeight: 600 }} data-testid="pauta-salvo">Salvo às {savedAt} · vale a partir da próxima edição</span>}
        {savedAt && logged && <button className="link small" style={{ alignSelf: 'center' }} onClick={() => void redo()}>Refazer a de hoje com estes ajustes</button>}
      </div>
    </div>
  );
}
