// Sua semana: números com a semana anterior ao lado, gráfico cruzado, padrões que são só dela e a leitura da equipe
// com os ajustes da próxima semana, cada um levado à especialista que cuida dele.
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Brain, Check, ChevronLeft, ChevronRight, Dumbbell, Moon, Pill, RefreshCw, Sparkles, Utensils, Coffee, Scale, Sun } from 'lucide-react';
import { useAll, useRecord } from '../db/hooks';
import { create, update } from '../db/db';
import { addDays, isoWeekday, shortLabel, todayKey, weekStart, type DateKey } from '../lib/dates';
import { aiAvailable } from '../domain/ai';
import { aiWeekCross, weekData, weekToRead, type Pattern } from '../domain/week';
import { toast } from '../state/store';
import { PageHead } from './common';
import { MindChart } from './mind';
import { askSpecialist, AREA_TO_DOMAIN, WHO } from './askspec';

const f1 = (n?: number) => (n == null ? '–' : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

function Delta({ now, prev, good = 'up', unit = '' }: { now?: number; prev?: number; good?: 'up' | 'down' | 'none'; unit?: string }) {
  if (now == null || prev == null) return null;
  const d = now - prev;
  if (Math.abs(d) < 0.05) return <span className="wk-delta">igual à anterior</span>;
  const better = good === 'none' ? undefined : (good === 'up') === d > 0;
  return <span className={`wk-delta ${better === undefined ? '' : better ? 'good' : 'bad'}`}>{d > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{f1(Math.abs(d))}{unit}</span>;
}

function Tile({ icon, v, l, delta, k }: { icon: JSX.Element; v: string; l: string; delta?: JSX.Element | null; k: number }) {
  return (
    <div className="wk-tile" style={{ animationDelay: `${k * 60}ms` }}>
      <span className="wk-ic">{icon}</span>
      <b className="wk-v num">{v}</b>
      <span className="wk-l">{l}</span>
      {delta}
    </div>
  );
}

function PatternCard({ p, k }: { p: Pattern; k: number }) {
  const max = Math.max(Math.abs(p.a), Math.abs(p.b), p.unit === 'h' ? 9 : 3);
  const w = (x: number) => `${Math.max(6, (Math.abs(x) / max) * 100)}%`;
  const fmt = (x: number) => (p.unit === 'h' ? `${f1(x)} h` : x > 0 ? `+${f1(x)}` : f1(x));
  return (
    <div className="wk-pattern" style={{ animationDelay: `${k * 80}ms` }} data-testid={`pattern-${p.id}`}>
      <b>{p.title}</b>
      <p className="small">{p.text}</p>
      <div className="wk-cmp"><span>{p.labelA}</span><i style={{ width: w(p.a) }} className="a" /><span className="num">{fmt(p.a)}</span></div>
      <div className="wk-cmp"><span>{p.labelB}</span><i style={{ width: w(p.b) }} className="b" /><span className="num">{fmt(p.b)}</span></div>
      <span className="tiny muted">{p.n} dias comparados</span>
    </div>
  );
}

const AREA_ICON: Record<string, JSX.Element> = { treino: <Dumbbell size={16} />, alimentacao: <Utensils size={16} />, mente: <Brain size={16} />, cuidados: <Sparkles size={16} />, sono: <Moon size={16} /> };

export function WeekScreen() {
  const nav = useNavigate();
  const [from, setFrom] = useState<DateKey>(weekToRead());
  const data = useLiveQuery(() => weekData(from), [from]);
  const review = useRecord<'review'>(`review:cross:${from}`);
  const [busy, setBusy] = useState(false);
  const tasks = useAll('task');
  // Ajuste da próxima semana vira tarefa na segunda seguinte, com o porquê na descrição. Não duplica.
  const toTask = async (n: { acao: string; por_que?: string }, k: number) => {
    const sourceId = `week:${from}:${k}`;
    if (tasks?.some((t) => t.sourceId === sourceId && !t.deleted)) return;
    await create('task', { title: n.acao, description: n.por_que, categoryId: 'cat:compromissos', priority: 'media', status: 'pendente', tags: ['semana'], subtasks: [], history: [{ at: Date.now(), text: 'Criada na leitura da semana' }], plannedDate: addDays(from, 7), sourceId } as any);
    toast(`Na sua lista para ${shortLabel(addDays(from, 7))}`);
  };
  const closed = addDays(from, 6) <= todayKey() || isoWeekday(todayKey()) === 7 && from === weekStart(todayKey());
  const gen = async () => {
    setBusy(true);
    try { await aiWeekCross(from); } catch (e: any) { toast(`Não consegui gerar a leitura: ${e.message}`, undefined, 'error'); }
    finally { setBusy(false); }
  };
  // Semana fechada e sem leitura: a equipe escreve sozinha ao abrir.
  useEffect(() => { if (review === null && closed && aiAvailable() && !busy && data && data.stats.days.length) void gen(); }, [review, from, !!data]);
  const s = data?.stats;
  return (
    <div className="screen no-nav week-screen" data-testid="week-screen">
      <PageHead title="Sua semana" withDate={false} />
      <div className="wk-nav">
        <button className="icon-btn" aria-label="Semana anterior" onClick={() => setFrom(addDays(from, -7))}><ChevronLeft size={20} /></button>
        <span><b>{shortLabel(from)}</b> a <b>{shortLabel(addDays(from, 6))}</b></span>
        <button className="icon-btn" aria-label="Próxima semana" disabled={addDays(from, 7) > todayKey()} onClick={() => setFrom(addDays(from, 7))}><ChevronRight size={20} /></button>
      </div>
      {s && <>
        <div className="wk-grid">
          <Tile k={0} icon={<Moon size={16} />} v={s.sleep != null ? `${f1(s.sleep)} h` : '–'} l="sono médio" delta={<Delta now={s.sleep} prev={s.sleepPrev} unit=" h" />} />
          <Tile k={1} icon={<Sun size={16} />} v={s.mood != null ? (s.mood > 0 ? '+' : '') + f1(s.mood) : '–'} l={`humor médio · ${s.checkins} noites`} delta={<Delta now={s.mood} prev={s.moodPrev} good="none" />} />
          <Tile k={2} icon={<Dumbbell size={16} />} v={`${s.trainMin} min`} l={s.plannedMin ? `de ${s.plannedMin} planejados` : 'de treino'} delta={<Delta now={s.trainMin} prev={s.trainPrev} unit=" min" />} />
          <Tile k={3} icon={<Utensils size={16} />} v={s.protein != null ? `${Math.round(s.protein)} g` : '–'} l={s.kcal != null ? `proteína · ${Math.round(s.kcal)} kcal` : 'proteína por dia'} />
          <Tile k={4} icon={<Pill size={16} />} v={s.dosesDue ? `${Math.round((s.doses / s.dosesDue) * 100)}%` : '–'} l="doses tomadas" />
          <Tile k={5} icon={s.weightTo != null ? <Scale size={16} /> : <Coffee size={16} />} v={s.weightTo != null ? `${f1(s.weightTo)} kg` : s.caffeine != null ? `${Math.round(s.caffeine)} mg` : '–'} l={s.weightTo != null ? 'peso no fim' : 'café por dia'} delta={s.weightTo != null ? <Delta now={s.weightTo} prev={s.weightFrom} good="down" unit=" kg" /> : <Delta now={s.caffeine} prev={s.caffeinePrev} good="down" unit=" mg" />} />
        </div>

        <section className="block b-paper anim-rise">
          <div className="bh"><h2>Humor, sono e remédios</h2></div>
          <MindChart days={s.days} />
        </section>

        <section className="block wk-team anim-rise" data-testid="week-review">
          <div className="bh"><h2><Sparkles size={18} style={{ verticalAlign: '-2px' }} /> Leitura da equipe</h2>
            {review && <button className="icon-btn" aria-label="Refazer" disabled={busy} onClick={() => void gen()}><RefreshCw size={16} className={busy ? 'spin' : ''} /></button>}</div>
          {busy && !review && <div className="wk-skel"><i /><i /><i /></div>}
          {!busy && !review && <>
            <p className="small">{closed ? 'A equipe ainda não leu esta semana.' : 'A semana ainda está em andamento. Dá para pedir uma leitura parcial.'}</p>
            <button className="pill-act pa-lilac" disabled={!aiAvailable()} onClick={() => void gen()} data-testid="week-gen">Pedir a leitura</button>
          </>}
          {review && <>
            {review.title && <h3 className="wk-title">{review.title}</h3>}
            <p className="wk-text">{review.text}</p>
            {review.highlights.length > 0 && <><span className="label">Funcionou</span><ul className="wk-ul good">{review.highlights.map((x) => <li key={x}>{x}</li>)}</ul></>}
            {review.weighed?.length ? <><span className="label">Pesou</span><ul className="wk-ul bad">{review.weighed.map((x) => <li key={x}>{x}</li>)}</ul></> : null}
          </>}
        </section>

        {review?.next?.length ? (
          <section className="anim-rise">
            <h2 className="section-title" style={{ margin: '18px 0 10px' }}>Para a próxima semana</h2>
            {review.next.map((n, k) => {
              const dom = AREA_TO_DOMAIN[n.area] ?? 'mind';
              return (
                <div key={n.acao} className="wk-next" style={{ animationDelay: `${k * 70}ms` }} data-testid="week-next">
                  <span className={`wk-area a-${n.area}`}>{AREA_ICON[n.area]}</span>
                  <div className="grow">
                    <b>{n.acao}</b>
                    {n.por_que && <p className="small" style={{ margin: '2px 0 8px' }}>{n.por_que}</p>}
                    <div className="row wrap" style={{ gap: 6 }}>
                      {tasks?.some((t) => t.sourceId === `week:${from}:${k}` && !t.deleted)
                        ? <span className="wk-added small" data-testid="week-task-added"><Check size={14} strokeWidth={3} /> Na sua lista</span>
                        : <button className="pill-act pa-lilac" style={{ minHeight: 34 }} onClick={() => void toTask(n, k)} data-testid="week-to-task">Virar tarefa</button>}
                      <button className="pill-act pa-ghost" style={{ minHeight: 34 }} onClick={() => askSpecialist(nav, dom, `Para a próxima semana: ${n.acao}`)}>Combinar com {WHO[dom]}</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        ) : null}

        <h2 className="section-title" style={{ margin: '22px 0 10px' }}>Padrões que são seus</h2>
        {data!.patterns.length ? data!.patterns.map((p, k) => <PatternCard key={p.id} p={p} k={k} />) : (
          <p className="small muted" data-testid="patterns-empty">Ainda não há dias suficientes para comparar. Os padrões aparecem com algumas semanas de check-ins, sono e café registrados, e ficam mais confiáveis com o tempo.</p>
        )}
        {review && <ConcludeRead id={review.id} doneAt={review.doneAt} />}
      </>}
    </div>
  );
}

/** Fim da leitura: concluída, o convite sai do Hoje. Dá para desfazer. */
function ConcludeRead({ id, doneAt }: { id: string; doneAt?: DateKey }) {
  const set = async (v?: DateKey) => {
    await update<'review'>(id, { doneAt: v });
    toast(v ? 'Leitura concluída. O convite saiu do Hoje.' : 'Leitura reaberta', v ? () => void update<'review'>(id, { doneAt: undefined }) : undefined);
  };
  return doneAt ? (
    <div className="wk-done" data-testid="week-done">
      <span className="wk-done-ic"><Check size={16} strokeWidth={3} /></span>
      <span className="grow small">Leitura concluída em {shortLabel(doneAt)}.</span>
      <button className="link small" onClick={() => void set(undefined)}>Reabrir</button>
    </div>
  ) : (
    <button className="rt-primary wk-conclude" onClick={() => void set(todayKey())} data-testid="week-conclude">
      <Check size={18} strokeWidth={3} /> Concluir leitura
    </button>
  );
}

/** Convite no Hoje: domingo à noite e segunda, a leitura da semana, até ela concluir a leitura. */
export function WeekTeaser({ date }: { date: DateKey }) {
  const nav = useNavigate();
  const wd = isoWeekday(date);
  const h = new Date().getHours();
  const from = weekToRead(date);
  const review = useRecord<'review'>(`review:cross:${from}`);
  if (date !== todayKey() || !((wd === 7 && h >= 17) || wd === 1) || review === undefined || review?.doneAt) return null;
  return (
    <button className="week-teaser anim-rise" onClick={() => nav('/semana')} data-testid="week-teaser">
      <span className="wt-bars" aria-hidden><i /><i /><i /><i /><i /></span>
      <span className="grow"><b>Sua semana {review ? 'foi lida' : 'está pronta para ler'}</b><br /><span className="small">Números, padrões e o que ajustar na próxima, com a equipe.</span></span>
      <ChevronRight size={20} />
    </button>
  );
}
