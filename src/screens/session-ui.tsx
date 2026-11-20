// Treino de força já feito, aberto: capa com a foto do levantamento principal, números da sessão,
// "Como foi" em destaque e um card por exercício (escada para pirâmide, número grande para séries retas).
import { useState, type ReactNode } from 'react';
import { ChevronDown, HeartPulse, Flame, TrendingUp, Pencil } from 'lucide-react';
import type { StrengthExercise, Workout } from '../db/types';
import { loadsPerSet, repsPerSet, topLoad, exerciseVolume } from '../domain/strength';
import { exercisePhotoKey, isPyramid, comparableHistory, compareChip, planText, sessionTotals, coverExercise, sessionGroups, ddmm } from '../domain/session';

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
