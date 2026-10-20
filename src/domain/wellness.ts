// Regras para sono vindo do relógio: noites incompletas não entram nas médias nem na leitura da IA.
import type { Wellness } from '../db/types';

/** Abaixo disso o registro do relógio é suspeito (relógio saiu, bateria acabou) até ela confirmar. */
export const SHORT_SLEEP_H = 5;

export function isSuspicious(w?: Partial<Wellness>) {
  return !!w && w.sleepH != null && w.sleepH < SHORT_SLEEP_H && !w.sleepFlag && w.sleepManualH == null;
}

/** Sono que vale para contas e IA: estimativa dela, senão o do relógio, exceto quando a noite foi marcada incompleta ou ainda é suspeita. */
export function effectiveSleep(w?: Partial<Wellness>): { h: number; estimated: boolean } | undefined {
  if (!w) return undefined;
  if (w.sleepManualH != null) return { h: w.sleepManualH, estimated: true };
  if (w.sleepFlag === 'incompleto' || isSuspicious(w)) return undefined;
  return w.sleepH != null ? { h: w.sleepH, estimated: false } : undefined;
}

/** VFC de noite incompleta não é comparável: fica fora. */
export function effectiveHrv(w?: Partial<Wellness>) {
  if (!w || w.sleepFlag === 'incompleto' || isSuspicious(w)) return undefined;
  return w.hrv;
}

/** Formato enxuto para mandar à IA. */
export function wellnessForAI(w: Wellness) {
  const s = effectiveSleep(w);
  return {
    data: w.date,
    sono_h: s?.h,
    sono_estimado_por_ela: s?.estimated || undefined,
    noite_sem_registro_confiavel: (w.sleepFlag === 'incompleto' || isSuspicious(w)) && !s ? true : undefined,
    dormiu_pouco_confirmado: w.sleepFlag === 'confirmado' || undefined,
    sono_pontos: s && !s.estimated ? w.sleepScore : undefined,
    vfc: effectiveHrv(w), fc_repouso: w.restingHR, body_battery: w.bodyBattery, passos: w.steps
  };
}
