// A dermatologista na área de Cuidados: ela conta como a pele está, o que comprou, o que mudou,
// e a especialista ajusta a rotina do dia ou da semana. Mudança de rotina só vale depois do aprovo.
import { all, byDateRange, create, get, remove, update, upsert, uid } from '../db/db';
import { addDays, isoWeekday, todayKey, type DateKey } from '../lib/dates';
import { planFor, planSaveTarget, plannedSkin, plannedTraining } from './rules';
import { wellnessForAI } from './wellness';
import { askAI } from './ai';
import { areaOf, GROUPS } from './defaults';
import { applyWeekChanges, emptySkinPlan, OWNED, productStep, type RoutineChange } from './skinSteps';
import { chatMemory, undoLog, type SkinProposal, type SpecMsg } from './specchat';
import type { Product, ProductGroup, ProductStatus } from '../db/types';

const DAY = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const DAY_LONG = ['todos os dias', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const PER = { am: 'Manhã', pm: 'Noite' } as const;
const STATUSES: ProductStatus[] = ['em_uso', 'guardado', 'acabou', 'quero_comprar', 'conferir', 'arquivado'];
const hhmm = (d = new Date()) => d.toTimeString().slice(0, 5);
const ddmm = (d: string) => `${DAY[isoWeekday(d)]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Produtos que entram na conversa: os que ela tem e os que estão no plano (com código curto p1, p2…). */
async function productCodes() {
  const today = todayKey();
  const all_ = await all('product');
  const plan = planFor(await all('plan'), 'skin', today);
  const inPlan = new Set<string>();
  for (const per of ['am', 'pm'] as const) {
    const pp = plan?.skin?.[per];
    pp?.base.forEach((id) => inPlan.add(id));
    Object.values(pp?.days ?? {}).forEach((d) => [...d.add, ...d.remove].forEach((id) => inPlan.add(id)));
    plan?.skin?.recovery?.[per]?.forEach((id) => inPlan.add(id));
  }
  const list = all_.filter((p) => OWNED.has(p.status) || inPlan.has(p.id) || p.status === 'acabou').sort((a, b) => a.brand.localeCompare(b.brand));
  const code = new Map(list.map((p, i) => [p.id, `p${i + 1}`]));
  const byCode = new Map(list.map((p, i) => [`p${i + 1}`, p]));
  return { list, code, byCode, plan };
}

export function describeChange(c: RoutineChange, name: (id: string) => string) {
  const when = c.date ? `${PER[c.period]} de ${ddmm(c.date)}` : c.weekday ? `${PER[c.period]} de ${DAY_LONG[c.weekday]}` : `${PER[c.period]}, todos os dias`;
  const parts = [c.add.length ? `entra ${c.add.map(name).join(', ')}` : '', c.remove.length ? `sai ${c.remove.map(name).join(', ')}` : ''].filter(Boolean);
  return `${when}: ${parts.join('; ')}.`;
}

export async function askDerm(text: string, history: SpecMsg[], images?: { mime: string; data: string }[]): Promise<SpecMsg> {
  const today = todayKey();
  const { list, code, byCode, plan } = await productCodes();
  const c = (id: string) => code.get(id);
  const codes = (ids: string[]) => ids.map(c).filter(Boolean) as string[];
  const [settings, plans, tmpls, mods] = await Promise.all([get<'settings'>('settings'), all('plan'), all('wtemplate'), all('modality')]);
  const [skips, extras, logs, workouts, wellness] = await Promise.all([
    byDateRange('skip', today, addDays(today, 7)), byDateRange('extra', addDays(today, -7), addDays(today, 7)),
    byDateRange('skin', addDays(today, -14), today), byDateRange('workout', addDays(today, -3), today),
    byDateRange('wellness', addDays(today, -3), today)
  ]);
  const dayMods = { skips, extras };
  const modName = (id?: string) => mods.find((m) => m.id === id)?.name ?? '';
  const period = (per: 'am' | 'pm') => {
    const pp = plan?.skin?.[per];
    const days: Record<string, { entra: string[]; sai: string[] }> = {};
    for (let d = 1; d <= 7; d++) { const x = pp?.days?.[d]; if (x && (x.add.length || x.remove.length)) days[d] = { entra: codes(x.add), sai: codes(x.remove) }; }
    return { todos_os_dias: codes(pp?.base ?? []), por_dia: days };
  };
  const ctx = {
    hoje: today, hora_agora: hhmm(), dia_semana_hoje: isoWeekday(today),
    fala_dela: text, fotos_nesta_mensagem: images?.length || undefined,
    ...(await chatMemory('skin', history, 'dermatologista')),
    produtos: list.map((p) => ({
      codigo: c(p.id), marca: p.brand, nome: p.name, area: p.area ?? 'rosto', etapa: productStep(p), tipo: p.group, situacao: p.status,
      ativo_forte: !!p.active || undefined, periodo_preferido: p.period, ativos: p.info?.actives, para_que_serve: p.info?.purpose, modo_de_uso: p.info?.howToUse, cuidados: p.info?.cautions
    })),
    plano_semanal: plan?.skin ? { manha: period('am'), noite: period('pm'), recuperacao: { manha: codes(plan.skin.recovery?.am ?? []), noite: codes(plan.skin.recovery?.pm ?? []) }, diagnostico: plan.skin.diagnosis } : null,
    // Hoje e os próximos 6 dias como estão de fato: plano + o que já foi combinado para cada dia.
    proximos_dias: Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d) => {
      const p = planFor(plans, 'skin', d);
      const reg = logs.filter((l) => l.date === d).map((l) => l.period);
      return {
        data: d, dia_semana: isoWeekday(d),
        manha: codes(plannedSkin(p, d, 'am', list, false, dayMods)), noite: codes(plannedSkin(p, d, 'pm', list, false, dayMods)),
        ja_registrado: reg.length ? reg : undefined,
        treinos: plannedTraining(planFor(plans, 'training', d), d, extras).map((id) => tmpls.find((t) => t.id === id)).filter(Boolean).map((t) => `${t!.name}${t!.time ? ` às ${t!.time}` : ''} (${modName(t!.modalityId)})`)
      };
    }),
    registros_recentes: logs.sort((a, b) => a.date.localeCompare(b.date)).map((l) => ({ data: l.date, periodo: l.period, condicao: l.condition, sinais: Object.keys(l.signals ?? {}).length ? l.signals : undefined, usados: codes(l.productIds), pulou: l.skipped || undefined, recuperacao: l.recovery || undefined, obs: l.note })),
    treinos_feitos: workouts.map((w) => ({ data: w.date, modalidade: modName(w.modalityId), minutos: w.duration })),
    sono_e_recuperacao: wellness.sort((a, b) => a.date.localeCompare(b.date)).map(wellnessForAI),
    preferencias_de_cuidados: settings?.aiPrefs?.skin ?? ''
  };
  const r = await askAI<any>('skin_coach', ctx, images);

  const { undo, snap } = undoLog();
  const done: string[] = [];
  const failed: string[] = [];
  let proposal: SkinProposal | undefined;
  const created = new Map<string, Product>();
  const resolve = (x: unknown): string | undefined => {
    const s = String(x ?? '');
    if (s.startsWith('novo:')) return created.get(s.slice(5).trim().toLowerCase())?.id;
    return byCode.get(s)?.id;
  };
  const acoes: any[] = Array.isArray(r?.acoes) ? r.acoes : [];
  // Cadastro primeiro: a proposta da mesma resposta pode usar o produto novo.
  acoes.sort((a, b) => (a?.tipo === 'cadastrar_produto' ? -1 : 0) - (b?.tipo === 'cadastrar_produto' ? -1 : 0));
  for (const a of acoes) {
    try {
      if (a?.tipo === 'guardar_preferencia') {
        const t = String(a.texto ?? '').trim();
        const s = await get<'settings'>('settings');
        if (!t || !s) continue;
        await snap('settings');
        const cur = s.aiPrefs?.skin?.trim();
        await update<'settings'>('settings', { aiPrefs: { ...(s.aiPrefs ?? {}), skin: cur ? `${cur}\n${t}` : t } });
        done.push(`Guardei para as próximas rotinas: ${t.replace(/\.$/, '')}.`);
      } else if (a?.tipo === 'cadastrar_produto') {
        const name = String(a.nome ?? '').trim();
        if (!name) continue;
        const group: ProductGroup = GROUPS.some((g) => g.id === a.tipo_produto) ? a.tipo_produto : a.area === 'cabelo' ? 'cabelo' : a.area === 'corpo' ? 'corpo' : 'hidratacao';
        const area = ['rosto', 'corpo', 'cabelo'].includes(a.area) ? a.area : areaOf(group);
        const id = uid('product');
        undo.push({ id });
        const p = await create('product', {
          id, brand: String(a.marca ?? '').trim(), name, group, area, status: 'em_uso',
          period: ['am', 'pm', 'ambos'].includes(a.periodo) ? a.periodo : 'ambos', active: !!a.ativo_forte,
          step: a.etapa === 'banho' || a.etapa === 'pos' ? a.etapa : undefined,
          info: a.para_que_serve ? { purpose: String(a.para_que_serve), confidence: 'baixa' } : undefined
        });
        created.set(name.toLowerCase(), p);
        done.push(`Cadastrei ${[p.brand, p.name].filter(Boolean).join(' ')} nos seus produtos.`);
      } else if (a?.tipo === 'atualizar_produto') {
        const id = resolve(a.produto);
        const p = id ? await get<'product'>(id) : undefined;
        if (!p) { failed.push('Não achei o produto citado.'); continue; }
        const patch: Partial<Product> = {};
        const what: string[] = [];
        if (STATUSES.includes(a.situacao) && a.situacao !== p.status) { patch.status = a.situacao; what.push(({ em_uso: 'em uso', guardado: 'guardado', acabou: 'acabou', quero_comprar: 'quero comprar', conferir: 'para conferir', arquivado: 'arquivado' } as Record<string, string>)[a.situacao]); }
        if ((a.etapa === 'banho' || a.etapa === 'pos') && a.etapa !== productStep(p)) { patch.step = a.etapa; what.push(a.etapa === 'banho' ? 'vai no banho' : 'vai depois do banho'); }
        if (!what.length) continue;
        await snap(p.id);
        await update<'product'>(p.id, patch);
        done.push(`${p.name}: ${what.join(', ')}.`);
      } else if (a?.tipo === 'propor_rotina') {
        const scope = a.escopo === 'semana' ? 'semana' : 'dia';
        const changes: RoutineChange[] = [];
        for (const m of Array.isArray(a.mudancas) ? a.mudancas : []) {
          const per = m?.periodo === 'am' || m?.periodo === 'manha' ? 'am' : m?.periodo === 'pm' || m?.periodo === 'noite' ? 'pm' : undefined;
          if (!per) continue;
          const add = (Array.isArray(m.entra) ? m.entra : []).map(resolve).filter(Boolean) as string[];
          const rem = (Array.isArray(m.sai) ? m.sai : []).map(resolve).filter(Boolean) as string[];
          if (!add.length && !rem.length) continue;
          if (scope === 'dia') {
            const d = String(m.data ?? '') as DateKey;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < today || d > addDays(today, 13)) continue;
            changes.push({ period: per, date: d, add, remove: rem });
          } else {
            const wd = Number(m.dia_semana ?? 0);
            if (!(wd >= 0 && wd <= 7)) continue;
            changes.push({ period: per, weekday: wd, add, remove: rem });
          }
        }
        if (!changes.length) { failed.push('A proposta de rotina veio sem mudanças que eu consiga aplicar.'); continue; }
        proposal = { kind: 'skin', scope, title: String(a.titulo ?? '').trim() || (scope === 'dia' ? 'Rotina do dia' : 'Rotina da semana'), changes, note: String(a.nota ?? '').trim() || undefined };
      }
    } catch (e: any) { failed.push(String(e?.message ?? e)); }
  }
  const msgText = String(r?.mensagem ?? '').trim().replace(/\bp(\d+)\b/g, (m0, n) => byCode.get(`p${n}`)?.name ?? m0);
  return {
    from: 'ai', at: Date.now(),
    text: msgText || (done.length || proposal ? 'Feito.' : 'Não entendi o que mudar. Pode contar de outro jeito?'),
    proposal, done: done.length ? done : undefined, failed: failed.length ? failed : undefined,
    suggestion: String(r?.sugestao_plano ?? '').trim() || undefined,
    undo: undo.length ? undo : undefined
  };
}

/** Aprovado por ela: o combinado do dia entra como "entra/sai" naquela data; o da semana vira uma nova versão do plano, a partir de hoje. */
export async function approveDerm(p: SkinProposal): Promise<{ undo: { id: string; before?: any }[]; done: string[] }> {
  const { undo, snap } = undoLog();
  const products = await all('product');
  const name = (id: string) => products.find((x) => x.id === id)?.name ?? '?';
  const done: string[] = [];
  if (p.scope === 'dia') {
    for (const c of p.changes) {
      const d = c.date!;
      for (const id of c.add) {
        const sk = `skip:${d}:skin:${c.period}:${id}`;
        if (await get(sk)) { await snap(sk); await remove(sk); }
        const ex = `extra:${d}:skin:${c.period}:${id}`;
        await snap(ex);
        await upsert('extra', ex, { date: d, domain: 'skin', ref: `${c.period}:${id}`, by: 'dermato' });
      }
      for (const id of c.remove) {
        const ex = `extra:${d}:skin:${c.period}:${id}`;
        if (await get(ex)) { await snap(ex); await remove(ex); }
        const sk = `skip:${d}:skin:${c.period}:${id}`;
        await snap(sk);
        await upsert('skip', sk, { date: d, domain: 'skin', ref: `${c.period}:${id}` });
      }
      done.push(describeChange(c, name));
    }
  } else {
    const today = todayKey();
    const cur = planFor(await all('plan'), 'skin', today);
    const skin = applyWeekChanges(cur?.skin ?? emptySkinPlan(), p.changes);
    const target = planSaveTarget(cur, today);
    if (target.mode === 'update') { await snap(target.id); await update<'plan'>(target.id, { skin }); }
    else { const id = uid('plan'); undo.push({ id }); await create('plan', { id, domain: 'skin', validFrom: target.validFrom, skin } as any); }
    for (const c of p.changes) done.push(describeChange(c, name));
    done.push('A rotina da semana vale a partir de hoje; os dias anteriores ficam como estavam.');
  }
  return { undo, done };
}
