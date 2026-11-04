// Radar do dia: o app olha os números e avisa o que importa agora, com a referência por trás de cada aviso.
// Regras simples e explicáveis, sem IA, para responder na hora e sem custo.
export type RadarTone = 'food' | 'water' | 'training' | 'recovery' | 'skin' | 'weather';
export interface RadarItem { id: string; tone: RadarTone; title: string; text: string; why?: string; action?: { label: string; to: string }; prio: number }

export interface RadarInput {
  nowMin: number; today: boolean; dayFrac: number;
  weightKg?: number;
  protein?: { eaten: number; goal?: number; nextMealTarget?: number; nextMealId?: string };
  kcal?: { eaten: number; goal?: number };
  water?: { ml: number; goal?: number };
  post?: { minsAgo: number; demanding: boolean; name: string; nextMealId?: string };
  sleepH?: number; hrv?: number; hrvAvg?: number; form?: number; plannedIntense?: boolean;
  weather?: { uvMax?: number; tMax?: number; humidity?: number };
  skin?: { amDone: boolean; pmDone: boolean; pmTime: string; amTime: string };
}

const hm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const L = (ml: number) => (ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export function radar(i: RadarInput): RadarItem[] {
  const out: RadarItem[] = [];
  if (i.post) {
    const kg = i.weightKg;
    const p = kg ? `${Math.round(0.3 * kg)} a ${Math.round(0.4 * kg)} g` : '20 a 40 g';
    const c = i.post.demanding && kg ? ` e ${Math.round(0.8 * kg)} a ${Math.round(1.2 * kg)} g de carboidrato nas próximas horas` : '';
    out.push({ id: 'post', tone: 'training', prio: 100, title: 'Janela pós-treino aberta', text: `${i.post.name} terminou há ${i.post.minsAgo} min. Mire ${p} de proteína${c}.`, why: 'Posição da ISSN sobre timing de nutrientes (2017).', action: { label: 'Registrar refeição', to: `/alimentacao/refeicao${i.post.nextMealId ? `?m=${i.post.nextMealId}` : ''}` } });
  }
  if (i.today && i.protein?.goal && i.dayFrac >= 0.3) {
    const expected = i.protein.goal * i.dayFrac;
    if (i.protein.eaten < expected * 0.7) {
      const nxt = i.protein.nextMealTarget ? ` Na próxima refeição, cerca de ${Math.round(i.protein.nextMealTarget)} g.` : '';
      out.push({ id: 'protein', tone: 'food', prio: 80, title: 'Proteína atrasada', text: `${Math.round(i.protein.eaten)} de ${Math.round(i.protein.goal)} g até agora; pelo horário, o esperado seria ~${Math.round(expected)} g.${nxt}`, why: 'Distribuir em 0,3 a 0,4 g/kg por refeição favorece a síntese muscular (Schoenfeld & Aragon, 2018).', action: { label: 'Ver o ideal', to: '/alimentacao' } });
    }
  }
  if (i.today && i.water?.goal && i.dayFrac >= 0.25) {
    const expected = i.water.goal * i.dayFrac;
    if (i.water.ml < expected * 0.7) out.push({ id: 'water', tone: 'water', prio: 60 + (i.weather?.tMax && i.weather.tMax >= 28 ? 15 : 0), title: 'Água abaixo do ritmo', text: `${L(i.water.ml)} de ${L(i.water.goal)} L; pelo horário, o ideal seria ~${L(expected)} L.`, action: { label: 'Registrar água', to: '/alimentacao' } });
  }
  if (i.today && i.kcal?.goal && i.kcal.eaten > i.kcal.goal * 1.12) {
    out.push({ id: 'kcal', tone: 'food', prio: 40, title: 'Meta de calorias passou', text: `${Math.round(i.kcal.eaten - i.kcal.goal)} kcal acima hoje. Não compense restringindo amanhã; um dia fora não muda a tendência.` });
  }
  if (i.sleepH != null && i.sleepH < 6.5) {
    out.push({ id: 'sleep', tone: 'recovery', prio: i.plannedIntense ? 75 : 55, title: `Noite curta: ${Math.floor(i.sleepH)}h${String(Math.round((i.sleepH % 1) * 60)).padStart(2, '0')}`, text: i.plannedIntense ? 'Com treino intenso hoje, mantenha o volume e baixe um pouco a intensidade se o esforço subir. Cafeína só até o começo da tarde.' : 'Priorize deitar mais cedo hoje. Cafeína só até o começo da tarde.', why: 'Restrição de sono reduz desempenho e aumenta a percepção de esforço (Fullagar et al., 2015).' });
  }
  if (i.hrv && i.hrvAvg && i.hrv < i.hrvAvg * 0.85) {
    out.push({ id: 'hrv', tone: 'recovery', prio: 65, title: 'VFC abaixo da sua média', text: `${Math.round(i.hrv)} ms hoje contra ${Math.round(i.hrvAvg)} ms na média de 7 dias. Bom dia para intensidade moderada e recuperação.`, why: 'Treino guiado pela VFC (Plews et al., 2013; Kiviniemi et al., 2007).' });
  }
  if (i.form != null && i.form <= -25) {
    out.push({ id: 'form', tone: 'training', prio: 62, title: 'Fadiga acumulada alta', text: `Forma em ${Math.round(i.form)}. Abaixo de -25 o risco de excesso sobe; um dia leve ou de descanso ajuda a absorver a carga.`, action: { label: 'Ver treino', to: '/treino' } });
  }
  const uv = i.weather?.uvMax;
  if (uv != null && uv >= 6) {
    out.push({ id: 'uv', tone: 'weather', prio: i.skin && !i.skin.amDone ? 70 : 45, title: `UV ${uv >= 8 ? 'muito alto' : 'alto'} hoje: ${Math.round(uv)}`, text: 'Protetor de manhã e reaplicação a cada 2 h se ficar ao ar livre. Treino ao ar livre fica melhor antes das 10h ou depois das 16h.', action: i.skin && !i.skin.amDone ? { label: 'Rotina da manhã', to: '/pele?p=am' } : undefined });
  }
  if (i.weather?.tMax != null && i.weather.tMax >= 29) {
    out.push({ id: 'heat', tone: 'weather', prio: 50, title: `Calor: ${Math.round(i.weather.tMax)}°C`, text: 'Some 0,5 a 1 L de água ao dia e, em treino acima de 60 min, reponha sódio. Na fase lútea, o calor pesa mais no esforço.', why: 'ACSM, reposição de líquidos no exercício (2007).' });
  }
  if (i.weather?.humidity != null && i.weather.humidity < 40) {
    out.push({ id: 'dry', tone: 'skin', prio: 30, title: 'Ar seco', text: `Umidade em ${Math.round(i.weather.humidity)}%. Reforce o hidratante e evite banho muito quente para proteger a barreira da pele.` });
  }
  if (i.today && i.skin && !i.skin.pmDone && i.nowMin >= hm(i.skin.pmTime) + 30) {
    out.push({ id: 'pm', tone: 'skin', prio: 58, title: 'Rotina da noite pendente', text: 'Dá para registrar em um toque com "Usei tudo".', action: { label: 'Abrir a noite', to: '/pele?p=pm' } });
  }
  return out.sort((a, b) => b.prio - a.prio);
}
