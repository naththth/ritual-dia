// Abre a especialista certa já com o pedido escrito (ela revisa e envia).
import type { NavigateFunction } from 'react-router-dom';
import { useApp } from '../state/store';

export type AskDomain = 'training' | 'skin' | 'food' | 'mind';
const ROUTE: Record<AskDomain, string> = { training: '/treino', skin: '/cuidados', food: '/alimentacao', mind: '/mente' };
export const AREA_TO_DOMAIN: Record<string, AskDomain> = { treino: 'training', alimentacao: 'food', cuidados: 'skin', mente: 'mind', sono: 'mind' };
export const WHO: Record<AskDomain, string> = { training: 'a treinadora', skin: 'a dermatologista', food: 'a nutricionista', mind: 'a especialista da Mente' };

export function askSpecialist(nav: NavigateFunction, domain: AskDomain, text: string) {
  nav(ROUTE[domain]);
  setTimeout(() => useApp.getState().setAsk({ domain, text }), 350);
}
