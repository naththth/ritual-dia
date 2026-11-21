// Imagem que remete à atividade. Planejado: foto do exercício principal em duotom (força e LPO) ou a cena do esporte
// (corrida, pedal, natação). Depois de feito, o treino passa a mostrar a foto real colorida (SessionHero).
import type { StrengthExercise } from '../db/types';
import { coverExercise } from '../domain/session';
import { photoUrl } from '../screens/session-ui';
import { SkyScene, SportScene } from './art';

const BASE = ((import.meta as any).env?.BASE_URL ?? '/') as string;
export type ActKind = 'swim' | 'bike' | 'run' | 'strength' | 'lpo' | 'calm';

export function activityKind(...names: (string | undefined)[]): ActKind {
  const t = names.filter(Boolean).join(' ').toLowerCase();
  if (/nata|swim|piscina|nado/.test(t)) return 'swim';
  if (/lpo|levantamento ol|arranco|arremesso|clean|snatch/.test(t)) return 'lpo';
  if (/pedal|bike|ciclis|whoosh|bicicleta|spinning/.test(t)) return 'bike';
  if (/corr|run|trote|caminh/.test(t)) return 'run';
  if (/ioga|yoga|mobilidade|alongamento|descanso|pilates|respira/.test(t)) return 'calm';
  return 'strength';
}

/** Capa (faixa larga) ou miniatura quadrada da atividade. */
export function ActivityArt({ kind, exercises, thumb }: { kind: ActKind; exercises?: StrengthExercise[]; thumb?: boolean }) {
  const cls = `act-art ${thumb ? 'act-thumb' : 'act-cover'} act-${kind}`;
  if (kind === 'strength' || kind === 'lpo') {
    const cover = exercises?.length ? coverExercise(exercises) : undefined;
    const src = cover ? photoUrl(cover) : `${BASE}ex/${kind === 'lpo' ? 'arranco' : 'agachamento'}.jpg`;
    return <span className={cls} aria-hidden><img src={src} alt="" loading="lazy" /></span>;
  }
  return <span className={cls} aria-hidden>{kind === 'calm' ? <SkyScene period="am" /> : <SportScene sport={kind} />}</span>;
}
