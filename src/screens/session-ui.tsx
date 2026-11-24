// Treino de força já feito, aberto: capa com a foto do levantamento principal, números da sessão,
// "Como foi" em destaque e um card por exercício (escada para pirâmide, número grande para séries retas).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, HeartPulse, Flame, TrendingUp, Pencil, Timer, ListChecks, Layers, TrendingDown, Minus, Check } from 'lucide-react';
import type { SetMark, StrengthExercise, StrengthProgress, Workout } from '../db/types';
import { marksOf, plannedSet, sameAsPlan } from '../domain/strengthLog';
import { loadsPerSet, repsPerSet, topLoad, exerciseVolume } from '../domain/strength';
import { exercisePhotoKey, isPyramid, comparableHistory, compareChip, planText, sessionTotals, coverExercise, sessionGroups, ddmm, planLines, planIntro, restText, type PlanLine } from '../domain/session';

const BASE = ((import.meta as any).env?.BASE_URL ?? '/') as string;
export const photoUrl = (e: Pick<StrengthExercise, 'name' | 'group'>) => `${BASE}ex/${exercisePhotoKey(e.name, e.group)}.jpg`;
const num = (n: number) => Math.round(n).toLocaleString('pt-BR');
const kgs = (n?: number) => (n == null ? '' : String(Math.round(n * 10) / 10).replace('.', ','));

/** Capa e números da sessão. */
export function SessionHero({ w }: { w: Workout }) {
  const exs = w.exercises ?? [];
  const cover = coverExercise(exs);
  const t = sessionTotals(exs);
  const m = w.metrics;
  const tiles: { k: string; icon: ReactNode; tone: string; v: ReactNode; l: string }[] = [];
  if (m?.avgHr) tiles.push({ k: 'hr', icon: <HeartPulse size={18} />, tone: 'rose', v: <>{Math.round(m.avgHr)}{m.maxHr ? <small>/{Math.round(m.maxHr)}</small> : null}</>, l: m.maxHr ? 'FC méd/máx' : 'FC média' });
  if (m?.kcal) tiles.push({ k: 'kcal', icon: <Flame size={18} />, tone: 'honey', v: num(m.kcal), l: 'kcal' });
  if (m?.tss) tiles.push({ k: 'tss', icon: <TrendingUp size={18} />, tone: 'blue', v: Math.round(m.tss), l: 'TSS · carga' });
  return (
    <section className="ss-hero" data-testid="session-hero">
      <div className="ss-cover">
        {cover && <img src={photoUrl(cover)} alt={cover.name} loading="lazy" />}
        {sessionGroups(exs) && <span className="ss-tag">{sessionGroups(exs)}</span>}
      </div>
      <div className="ss-sheet">
        <div className="ss-top">
          <div>
            {w.duration ? <span className="ss-big"><b className="num">{w.duration}</b><span>min</span></span> : null}
            <span className="ss-sub">{t.exercises} {t.exercises === 1 ? 'exercício' : 'exercícios'} · {t.sets} {t.sets === 1 ? 'série' : 'séries'}</span>
          </div>
          {t.volume > 0 && <div className="ss-vol"><b className="num">{num(t.volume)}</b><span>kg levantados</span></div>}
        </div>
        {tiles.length > 0 && (
          <div className="ss-tiles" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
            {tiles.map((x) => (
              <div key={x.k} className="ss-tile"><span className={`ss-ic ic-${x.tone}`} aria-hidden>{x.icon}</span><b className="num">{x.v}</b><span>{x.l}</span></div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const RPE_WORD = ['', 'muito leve', 'muito leve', 'leve', 'leve', 'moderado', 'moderado', 'puxado', 'puxado', 'muito puxado', 'máximo'];
const rpeTone = (i: number) => (i <= 3 ? 'r1' : i <= 6 ? 'r2' : i <= 8 ? 'r3' : 'r4');

/** "Como foi": com registro, mostra o esforço e as palavras dela; sem registro, abre o formulário. */
export function FeelCard({ w, editor }: { w: Workout; editor: ReactNode }) {
  const [edit, setEdit] = useState(!(w.rpe || w.feeling));
  if (edit) {
    return (
      <section className="ss-feel editing" data-testid="feel-card">
        <span className="ss-k">Como foi?</span>
        {editor}
        {(w.rpe || w.feeling) ? <button className="ss-done" onClick={() => setEdit(false)} data-testid="feel-done">Pronto</button> : null}
      </section>
    );
  }
  return (
    <section className="ss-feel" data-testid="feel-card">
      <div className="ss-feel-h">
        <span className="ss-k">Como foi</span>
        {w.rpe ? <span className="ss-rpe-v">Esforço <b className="num">{w.rpe}</b>/10 · {RPE_WORD[w.rpe]}</span> : null}
      </div>
      {w.rpe ? <div className="ss-rpe" role="img" aria-label={`Esforço ${w.rpe} de 10`}>{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < w.rpe! ? rpeTone(i + 1) : ''} />)}</div> : null}
      {w.feeling ? <p className="ss-quote">“{w.feeling.trim()}”</p> : null}
      <button className="ss-edit" onClick={() => setEdit(true)} data-testid="feel-edit"><Pencil size={14} />Editar</button>
    </section>
  );
}

/** Lista de exercícios da sessão. */
export function SessionExercises({ w, history }: { w: Workout; history: Workout[] }) {
  const exs = w.exercises ?? [];
  return (
    <section className="ss-exs" data-testid="exercise-summary">
      <h3 className="ss-h">Exercícios</h3>
      {exs.map((e) => <ExerciseCard key={e.id} e={e} history={history} date={w.date} />)}
    </section>
  );
}

function Stair({ e, small, label, cols, scale }: { e: Pick<StrengthExercise, 'sets' | 'reps' | 'setReps' | 'loadKg' | 'setLoads'>; small?: boolean; label?: string; cols?: number; scale?: number }) {
  const ls = loadsPerSet(e);
  const rs = repsPerSet(e);
  const max = Math.max(...ls.map((n) => n ?? 0), 1);
  const H = small ? 52 : 104;
  const ref = scale ?? max; // na comparação, as duas escadas usam a mesma régua
  return (
    <div className={`ss-stair ${small ? 'sm' : ''}`} style={{ gridTemplateColumns: `repeat(${cols ?? ls.length}, minmax(0, 1fr))` }}
      role="img" aria-label={label ?? ls.map((n, i) => `${rs[i]} repetições com ${kgs(n)} kg`).join(', ')}>
      {ls.map((n, i) => {
        const top = n != null && n === max;
        return (
          <div key={i} className="ss-step">
            {!small && <b className={`num ${top ? 'top' : ''}`}>{kgs(n)}</b>}
            <i className={top ? 'top' : n != null && n >= max * 0.85 ? 's3' : n != null && n >= max * 0.65 ? 's2' : 's1'} style={{ height: Math.max(8, Math.round(((n ?? 0) / ref) * H)) }} />
            {!small && <span className="num">×{rs[i]}</span>}
          </div>
        );
      })}
    </div>
  );
}

function ExerciseCard({ e, history, date }: { e: StrengthExercise; history: Workout[]; date: string }) {
  const [open, setOpen] = useState(false);
  const pyr = isPyramid(e);
  const top = topLoad(e);
  const vol = exerciseVolume(e);
  const chip = compareChip(e, history, date);
  const plan = planText(e);
  const past = comparableHistory(e, history, date, 2);
  const last = past[0];
  const ls = loadsPerSet(e);
  const rs = repsPerSet(e);
  const reps = e.setReps?.length ? rs.join('/') : String(e.reps);
  // Mini histórico das séries retas: as duas sessões comparáveis anteriores e hoje.
  const trail = !pyr && top != null && past.length ? [...past].reverse().map((p) => ({ d: ddmm(p.date), v: p.top ?? 0, today: false })).concat({ d: 'hoje', v: top, today: true }) : [];
  const tMax = Math.max(...trail.map((x) => x.v), 1);
  return (
    <article className={`ss-ex ${open ? 'open' : ''}`} data-testid="ex-card">
      <button className="ss-ex-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <img src={photoUrl(e)} alt="" loading="lazy" />
        <span className="ss-ex-main">
          <b className="ss-ex-n">{e.name}</b>
          {pyr ? <span className="ss-chips"><span className="ss-chip c-blue">Pirâmide</span><span className="ss-chip c-paper">{e.sets} séries</span></span>
            : <span className="ss-line"><b className="num">{e.sets}×{reps}</b>{top != null ? <span className="num">{kgs(top)} kg</span> : null}</span>}
        </span>
        <ChevronDown size={20} className="ss-chev" aria-hidden />
      </button>

      {pyr && <Stair e={e} />}
      {trail.length > 1 && (
        <div className="ss-trail" style={{ gridTemplateColumns: `repeat(${trail.length}, minmax(0, 1fr))` }}>
          {trail.map((x, i) => (
            <div key={i}><i className={x.today ? 'today' : i === trail.length - 2 ? 'prev' : ''} style={{ height: Math.max(8, Math.round((x.v / tMax) * 40)) }} /><span className={x.today ? 'today' : ''}>{x.d} · {kgs(x.v)}</span></div>
          ))}
        </div>
      )}

      {(chip || plan) && (
        <span className="ss-chips">
          {chip && <span className={`ss-chip t-${chip.tone}`} data-testid="ex-compare">{chip.text}</span>}
          {plan && <span className="ss-chip c-rose">{plan}</span>}
        </span>
      )}

      {pyr && (vol || last) ? (
        <div className="ss-foot">
          {vol ? <div><span>Volume</span><b className="num">{num(vol)} kg</b></div> : null}
          {last?.top ? <div><span>Topo anterior · {ddmm(last.date)}</span><b className="num">{kgs(last.top)} kg <small>×{repsPerSet(last.ex)[loadsPerSet(last.ex).lastIndexOf(last.top)] ?? ''}</small></b></div> : null}
        </div>
      ) : null}

      {open && (
        <div className="ss-ex-body">
          <ol className="ss-sets">
            {ls.map((n, i) => (
              <li key={i}>
                <b className={`ss-n ${n != null && n === top && pyr ? 'top' : ''}`}>{i + 1}</b>
                <span className="ss-bar"><i style={{ width: `${top ? Math.round(((n ?? 0) / top) * 100) : 0}%` }} /></span>
                <span className="num">{rs[i]}{n != null ? ` × ${kgs(n)} kg` : ' reps'}</span>
              </li>
            ))}
          </ol>
          {!pyr && vol ? <p className="ss-note">Volume {num(vol)} kg</p> : null}
          {pyr && last && (
            <div className="ss-cmp">
              <span className="ss-k2">Comparado a {ddmm(last.date)}</span>
              <div className="ss-cmp-row"><span>{ddmm(last.date)}</span><Stair e={last.ex} small cols={Math.max(last.ex.sets, e.sets)} scale={Math.max(last.top ?? 0, top ?? 0)} label={`Em ${ddmm(last.date)}: ${last.ex.sets} séries até ${kgs(last.top)} kg`} /></div>
              <div className="ss-cmp-row"><span>Hoje</span><Stair e={e} small cols={Math.max(last.ex.sets, e.sets)} scale={Math.max(last.top ?? 0, top ?? 0)} label={`Hoje: ${e.sets} séries até ${kgs(top)} kg`} /></div>
              <div className="ss-cmp-n">
                <div><span>Topo</span><b>{kgs(last.top)} → {kgs(top)} kg</b></div>
                <div><span>Séries</span><b>{last.ex.sets} → {e.sets}</b></div>
                <div><span>Volume</span><b>{num(last.volume ?? 0)} → {num(vol ?? 0)}</b></div>
              </div>
            </div>
          )}
          {!pyr && past.length > 0 && <p className="ss-note">{past.map((p) => `${ddmm(p.date)}: ${p.ex.sets}×${p.ex.setReps?.length ? repsPerSet(p.ex).join('/') : p.ex.reps}, ${kgs(p.top)} kg`).join(' · ')}</p>}
        </div>
      )}
    </article>
  );
}

// ── Musculação planejada: o mesmo desenho da sessão feita, antes de fazer ──

/** Por que a carga é essa, em poucas palavras (vem da sugestão de carga pelo último treino). */
function whyChip(why?: string): { tone: string; text: string } | undefined {
  if (!why) return undefined;
  if (/^subiu/.test(why)) return { tone: 'up', text: 'Subiu: cumpriu o último' };
  if (/^mantida/.test(why)) return { tone: 'same', text: 'Mantida: último foi puxado' };
  if (/abaixo/.test(why)) return { tone: 'down', text: 'Baixou: faltaram repetições' };
  return undefined;
}

/** Treino de força planejado, aberto: números da sessão, como fazer, um card por exercício e as ações. */
export function PlanSession({ note, muscles, exercises, why, actions, progress, onMark, onSkip }: {
  note?: string; muscles?: string[]; exercises: StrengthExercise[]; why: Record<string, string>; actions: ReactNode;
  progress?: Pick<StrengthProgress, 'sets' | 'skipped'>; onMark: (e: StrengthExercise, i: number, m: SetMark | null) => void; onSkip: (e: StrengthExercise, skip: boolean) => void;
}) {
  const lines = planLines(note, exercises);
  const intro = planIntro(note);
  const rest = restText(note);
  const sets = exercises.reduce((a, e) => a + e.sets, 0);
  const third = rest ? { icon: <Timer size={18} />, v: rest, l: 'de descanso' } : muscles?.length ? { icon: <Layers size={18} />, v: muscles.join(', ').toLowerCase(), l: 'foco' } : undefined;
  return (
    <div className="tp" data-testid="planned-strength">
      <div className="tp-nums" style={{ gridTemplateColumns: `repeat(${third ? 3 : 2}, minmax(0, 1fr))` }}>
        <div className="tp-num"><span className="ss-ic ic-blue" aria-hidden><ListChecks size={18} /></span><b className="num">{exercises.length}</b><span>{exercises.length === 1 ? 'exercício' : 'exercícios'}</span></div>
        <div className="tp-num"><span className="ss-ic ic-honey" aria-hidden><Layers size={18} /></span><b className="num">{sets}</b><span>{sets === 1 ? 'série' : 'séries'}</span></div>
        {third && <div className="tp-num"><span className="ss-ic ic-rose" aria-hidden>{third.icon}</span><b className={third.l === 'foco' ? 'tp-word' : 'num'}>{third.v}</b><span>{third.l}</span></div>}
      </div>
      {intro && (
        <section className="tp-how" data-testid="plan-how">
          <span className="ss-k">Como fazer</span>
          <p>{intro}</p>
        </section>
      )}
      <section className="ss-exs tp-exs" data-testid="strength-note">
        {lines.map((l, i) => <PlanExerciseCard key={l.e.id} n={i + 1} l={l} why={why[l.e.id]} marks={marksOf(progress, l.e)} skipped={!!progress?.skipped?.includes(l.e.id)} onMark={(j, m) => onMark(l.e, j, m)} onSkip={(sk) => onSkip(l.e, sk)} />)}
      </section>
      {actions}
    </div>
  );
}

function PlanExerciseCard({ n, l, why, marks, skipped, onMark, onSkip }: {
  n: number; l: PlanLine; why?: string; marks: (SetMark | null)[]; skipped: boolean;
  onMark: (i: number, m: SetMark | null) => void; onSkip: (skip: boolean) => void;
}) {
  const { e } = l;
  const chip = whyChip(why);
  const done = marks.filter(Boolean).length;
  const all = done === e.sets;
  if (skipped) {
    return (
      <article className="ss-ex tp-ex is-skip" data-testid="plan-ex">
        <div className="tp-skip-row">
          <span className="ss-ex-n">{l.label}</span>
          <span className="tp-skip-k">Não feito</span>
          <button className="link small" onClick={() => onSkip(false)} data-testid="ex-unskip">Desfazer</button>
        </div>
      </article>
    );
  }
  return (
    <article className={`ss-ex tp-ex ${all ? 'is-done' : ''}`} data-testid="plan-ex">
      <div className="ss-ex-head">
        <span className="tp-ph"><img src={photoUrl(e)} alt="" loading="lazy" /><i className="num" aria-hidden>{all ? <Check size={14} strokeWidth={3.2} /> : n}</i></span>
        <span className="ss-ex-main">
          <b className="ss-ex-n">{l.label}</b>
          <span className="ss-line"><b className="num">{e.sets}×{l.reps}</b>{l.extra ? <span className="tp-extra">{l.extra}</span> : null}</span>
        </span>
      </div>
      {/* Planejado em cima, realizado embaixo: uma linha por série, com o ✓ para "fiz como planejado"
          e os campos para escrever o que fez quando foi diferente. Tudo grava sozinho. */}
      <div className="tp-setbox">
        <div className="tp-setbox-h">
          <span className="tp-load-k">{done ? `${done} de ${e.sets} séries feitas` : 'Toque no ✓ ou escreva o que fez'}</span>
          {l.meta && <span className="tp-why-wrap" data-testid="plan-meta">Meta {l.meta}</span>}
        </div>
        <ol className="tp-rows">
          {Array.from({ length: e.sets }, (_, i) => <SetRow key={i} i={i} plan={plannedSet(e, i)} mark={marks[i]} onMark={(m) => onMark(i, m)} />)}
        </ol>
        {chip && <span className={`tp-why t-${chip.tone}`} title={why}>{chip.tone === 'up' ? <TrendingUp size={14} /> : chip.tone === 'down' ? <TrendingDown size={14} /> : <Minus size={14} />}Carga {chip.text.charAt(0).toLowerCase() + chip.text.slice(1)}</span>}
      </div>
      {!done && <button className="tp-skip link small" onClick={() => onSkip(true)} data-testid="ex-skip">Não fiz este exercício</button>}
    </article>
  );
}

/** Uma série: o plano à esquerda, o ✓ à direita e, embaixo, repetições e carga feitas.
 *  Os campos já mostram o plano em cinza; escrever um número marca a série como feita com esse valor. */
function SetRow({ i, plan, mark, onMark }: { i: number; plan: SetMark; mark: SetMark | null; onMark: (m: SetMark | null) => void }) {
  const fmtKg = (v?: number) => (v == null ? '' : kgs(v));
  // Campo vazio = igual ao plano (o plano aparece em cinza; depois do ✓, em petróleo). Só o que for diferente fica escrito,
  // então para corrigir ela digita direto, sem apagar nada antes.
  const shownReps = (m: SetMark | null) => (m && m.reps !== plan.reps ? String(m.reps) : '');
  const shownKg = (m: SetMark | null) => (m && (m.kg ?? null) !== (plan.kg ?? null) ? fmtKg(m.kg) : '');
  const [reps, setReps] = useState(shownReps(mark));
  const [kg, setKg] = useState(shownKg(mark));
  const focus = useRef(false);
  const sync = () => { setReps(shownReps(mark)); setKg(shownKg(mark)); };
  // O que veio de fora (✓, outro aparelho) aparece nos campos, a menos que ela esteja digitando neles.
  useEffect(() => { if (!focus.current) sync(); }, [mark?.reps, mark?.kg, !!mark]);
  const commit = (r: string, k: string) => {
    const rv = r.trim() === '' ? undefined : parseInt(r, 10);
    const kv = k.trim() === '' ? undefined : Number(k.replace(',', '.'));
    if ((rv != null && Number.isNaN(rv)) || (kv != null && Number.isNaN(kv))) return;
    if (rv == null && kv == null && !mark) return;
    onMark({ reps: rv ?? plan.reps, kg: kv ?? plan.kg });
  };
  const diff = !!mark && !sameAsPlan(mark, plan);
  return (
    <li className={`tp-row ${mark ? 'on' : ''} ${diff ? 'diff' : ''}`} data-testid="set-row">
      <div className="tp-row-main">
        <span className="tp-row-plan"><span className="tp-row-n num">{i + 1}ª</span> Plano <b className="num">{plan.reps}{plan.kg != null ? ` × ${kgs(plan.kg)} kg` : ' reps'}</b></span>
        <div className="tp-row-fields">
          <label className="tp-f"><input inputMode="numeric" value={reps} placeholder={String(plan.reps)} aria-label={`Repetições feitas na ${i + 1}ª série`} data-testid="set-reps"
            onFocus={() => { focus.current = true; }} onBlur={() => { focus.current = false; }}
            onChange={(ev) => { const v = ev.target.value.replace(/[^\d]/g, ''); setReps(v); commit(v, kg); }} /><span>{plan.kg != null || mark?.kg != null ? '×' : 'reps'}</span></label>
          {plan.kg != null || mark?.kg != null ? (
            <label className="tp-f"><input inputMode="decimal" value={kg} placeholder={fmtKg(plan.kg)} aria-label={`Carga usada na ${i + 1}ª série, em kg`} data-testid="set-kg"
              onFocus={() => { focus.current = true; }} onBlur={() => { focus.current = false; }}
              onChange={(ev) => { const v = ev.target.value.replace(/[^\d,.]/g, ''); setKg(v); commit(reps, v); }} /><span>kg</span></label>
          ) : null}
        </div>
      </div>
      <button className="tp-check" aria-pressed={!!mark} aria-label={mark ? `Desmarcar a ${i + 1}ª série` : `${i + 1}ª série feita como planejado`} data-testid="set-check"
        onClick={() => onMark(mark ? null : plan)}><Check size={20} strokeWidth={3} /></button>
    </li>
  );
}
