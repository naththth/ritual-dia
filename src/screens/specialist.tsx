// As especialistas de cada área e a montagem do plano em conversa: ela pergunta, monta, você comenta, ela ajusta.
import { Fragment, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Send, Sparkles } from 'lucide-react';
import { Sheet } from '../ui/ui';
import { toast } from '../state/store';
import { all } from '../db/db';
import { planFor } from '../domain/rules';
import { savePlan } from '../domain/actions';
import { todayKey } from '../lib/dates';
import { MicButton, appendText } from '../ui/Dictation';
import { aiAvailable, askAI, skinContext, trainingContext, foodContext, applyTrainingResult, applyFoodResult } from '../domain/ai';

export type Domain = 'skin' | 'training' | 'food';

export const SPECIALISTS: Record<Domain, { who: string; role: string; how: string[] }> = {
  skin: {
    who: 'Dermatologista e tricologista', role: 'Cuida de rosto, corpo e cabelo',
    how: [
      'Monta rotina no estilo coreano, em camadas, e encaixa todos os produtos que você tem em uso: o que não cabe todo dia entra em rodízio na semana.',
      'Ordem certa de aplicação, do mais leve ao mais denso, e protetor solar toda manhã.',
      'Ativos fortes com cuidado: nunca retinoide e ácido esfoliante na mesma aplicação, e menos ativo quando a pele está sensibilizada. A rosácea pesa nas escolhas.',
      'Não prescreve remédio nem mexe no que sua dermatologista indicou. Sinal de alerta (lesão que muda, queda súbita, irritação que não passa) é motivo para consulta presencial.',
      'Segue o que você prefere; quando não dá, diz o porquê e propõe a alternativa mais próxima.'
    ]
  },
  training: {
    who: 'Treinadora de força e endurance', role: 'Treino, carga e recuperação',
    how: [
      'Musculação sempre de corpo todo, com foco em ficar forte para a vida e seguir melhorando o corpo que você construiu ao sair da obesidade.',
      'Progressão de carga planejada, semanas mais leves a cada 4 a 6 semanas, e volume suficiente para ganhar e manter massa magra mesmo em déficit.',
      'Usa FTP, TSS, VFC, sono e o seu esforço percebido para dosar a semana com o triathlon.',
      'Dor não é para treinar por cima: ajusta o exercício e, se persistir, indica avaliação. Tontura, dor no peito ou queda brusca de rendimento pedem parar e procurar médico.',
      'Segue o que você prefere; quando não dá, diz o porquê e propõe a alternativa mais próxima.'
    ]
  },
  food: {
    who: 'Nutricionista esportiva', role: 'Alimentação, treino e Mounjaro',
    how: [
      'Aproveita a janela do Mounjaro para construir hábitos que se sustentem depois dele: proteína alta em todas as refeições, fibra, água e comida de verdade.',
      'Preserva massa magra e abastece o treino: carboidrato onde o treino pede, nunca corte agressivo.',
      'O objetivo de longo prazo é não voltar à obesidade: rotina que você consegue manter, sem dieta de fome nem culpa.',
      'Respeita o plano da sua nutricionista e aponta divergências em vez de contradizer. Não mexe em medicação.',
      'Segue o que você prefere; quando não dá, diz o porquê e propõe a alternativa mais próxima.'
    ]
  }
};

/** "Como a especialista trabalha": os critérios dela, em linguagem simples. */
export function SpecialistCard({ domain }: { domain: Domain }) {
  const [open, setOpen] = useState(false);
  const s = SPECIALISTS[domain];
  return (
    <section className="block b-paper spec-card" data-testid={`spec-${domain}`}>
      <button className="row between tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span><b>{s.who}</b><br /><span className="small muted">{s.role} · como ela trabalha</span></span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <ul className="spec-list">{s.how.map((h) => <li key={h}>{h}</li>)}</ul>}
    </section>
  );
}

/* ---------- Conversa ---------- */
interface Q { id: string; texto: string; opcoes?: string[] }
interface NotFollowed { pedido: string; motivo: string; alternativa?: string }
interface Msg { from: 'ai' | 'me'; text: string; questions?: Q[]; notFollowed?: NotFollowed[]; draft?: boolean }
/** Rascunho legível: seções recolhíveis, cada uma com grupos em tópicos. */
interface Group { label: string; items: string[]; tone?: 'add' | 'remove' }
interface Section { title: string; sub?: string; open?: boolean; groups: Group[]; text?: string }

const DAYS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const AREA_LABEL: Record<string, string> = { rosto: 'Rosto', corpo: 'Corpo', cabelo: 'Cabelo' };

/** O que muda por área: o contexto enviado, como mostrar o rascunho e como aplicar. */
async function adapter(domain: Domain, herText: string) {
  if (domain === 'skin') {
    const { ctx, decode, nameOfAlias } = await skinContext(todayKey());
    const prod = (c: string) => nameOfAlias(String(c));
    const byArea = (codes: string[], tone?: Group['tone']): Group[] => {
      const out: Group[] = [];
      for (const ar of ['rosto', 'corpo', 'cabelo']) {
        const items = codes.map(prod).filter((p) => p && (p.area ?? 'rosto') === ar).map((p) => p!.name);
        if (items.length) out.push({ label: AREA_LABEL[ar], items, tone });
      }
      return out;
    };
    const dayOf = (pp: any, d: number) => pp?.days?.[d] ?? pp?.days?.[String(d)] ?? {};
    return {
      ctx,
      describe: (r: any): Section[] => {
        const out: Section[] = [];
        const dg = r.diagnostico ?? {};
        const diag = ['rosto', 'corpo', 'cabelo'].filter((k) => dg[k]).map((k) => `${AREA_LABEL[k]}: ${dg[k]}`).join('\n\n');
        if (diag) out.push({ title: 'Diagnóstico', groups: [], text: diag });
        for (const per of ['am', 'pm'] as const) {
          const base: string[] = r[per]?.base ?? [];
          out.push({ title: per === 'am' ? 'Manhã, todos os dias' : 'Noite, todos os dias', sub: `${base.length} ${base.length === 1 ? 'passo' : 'passos'}, na ordem`, open: true, groups: byArea(base) });
        }
        for (let d = 1; d <= 7; d++) {
          const groups: Group[] = [];
          for (const per of ['am', 'pm'] as const) {
            const day = dayOf(r[per], d);
            const add = byArea(day.add ?? [], 'add').map((g) => ({ ...g, label: `${per === 'am' ? 'Manhã' : 'Noite'} · ${g.label} · entra` }));
            const rem = byArea(day.remove ?? [], 'remove').map((g) => ({ ...g, label: `${per === 'am' ? 'Manhã' : 'Noite'} · ${g.label} · sai` }));
            groups.push(...add, ...rem);
          }
          const n = groups.reduce((a, g) => a + g.items.length, 0);
          out.push({ title: DAYS[d], sub: n ? `${n} ${n === 1 ? 'mudança' : 'mudanças'} em relação a todos os dias` : 'Igual a todos os dias', groups });
        }
        const rec = [...(r.recovery?.am ?? []), ...(r.recovery?.pm ?? [])];
        if (rec.length) out.push({ title: 'Recuperação (quando a pele pedir)', groups: [...byArea(r.recovery?.am ?? []).map((g) => ({ ...g, label: `Manhã · ${g.label}` })), ...byArea(r.recovery?.pm ?? []).map((g) => ({ ...g, label: `Noite · ${g.label}` }))] });
        if (r.observacoes) out.push({ title: 'Observações', groups: [], text: String(r.observacoes) });
        return out;
      },
      apply: async (r: any) => {
        const plan = decode(r);
        const cur = planFor(await all('plan'), 'skin', todayKey());
        await savePlan('skin', cur, { skin: { ...plan.skin, body: undefined, hair: undefined } });
      },
      slim: (c: any) => ({ ...c, produtos: (c.produtos ?? []).map((p: any) => ({ id: p.id, nome: p.nome, marca: p.marca, tipo: p.tipo, area: p.area, ativo: p.ativo, ativos: p.ativos })) })
    };
  }
  if (domain === 'training') {
    const ctx = await trainingContext();
    return {
      ctx,
      describe: (r: any): Section[] => {
        const tpl = (k: string) => (r.templates ?? []).find((t: any) => t.key === k);
        const days: Section[] = [1, 2, 3, 4, 5, 6, 7].map((d) => {
          const ts = (r.week?.[String(d)] ?? []).map(tpl).filter(Boolean);
          return { title: DAYS[d], sub: ts.length ? ts.map((t: any) => t.name).join(' + ') : 'Descanso', groups: ts.map((t: any) => ({ label: `${t.name} · ${t.duration} min${t.time ? ` · ${t.time}` : ''}`, items: Array.isArray(t.exercicios) && t.exercicios.length ? t.exercicios : (t.steps ?? []).map((st: any) => `${st.label}: ${st.minutes} min a ${st.pct}% do FTP`) })) };
        });
        return [{ title: 'Semana', open: true, groups: [{ label: 'Resumo', items: days.map((d) => `${d.title}: ${d.sub}`) }] }, ...days, ...(r.resumo ? [{ title: 'Lógica da semana', groups: [], text: String(r.resumo) }] : [])];
      },
      slim: (c: any) => c,
      apply: async (r: any) => {
        const week = await applyTrainingResult(r);
        const cur = planFor(await all('plan'), 'training', todayKey());
        await savePlan('training', cur, { training: week });
      }
    };
  }
  const ctx = await foodContext(herText);
  return {
    ctx,
    describe: (r: any): Section[] => {
      const meal = (k: string) => (r.refeicoes ?? []).find((m: any) => m.key === k);
      const MT: Record<string, string> = { cafe: 'Café da manhã', almoco: 'Almoço', lanche: 'Lanche', jantar: 'Jantar', ceia: 'Ceia' };
      const meals: Section = { title: 'Refeições do plano', open: true, groups: (r.refeicoes ?? []).map((m: any) => ({ label: `${MT[m.mealType] ?? m.mealType} · ${m.name}`, items: (m.items ?? []).map((i: any) => `${String(i.foodId).replace(/^novo:/, '')} · ${i.portion}`) })) };
      const days: Section[] = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ title: DAYS[d], groups: [{ label: 'Refeições', items: Object.entries(r.week?.[String(d)] ?? {}).map(([mt, k]) => `${MT[mt] ?? mt}: ${meal(String(k))?.name ?? '—'}`) }] }));
      return [meals, ...days, ...(r.resumo ? [{ title: 'Lógica do plano', groups: [], text: String(r.resumo) }] : [])];
    },
    slim: (c: any) => c,
    apply: async (r: any) => {
      const { week } = await applyFoodResult(r);
      const cur = planFor(await all('plan'), 'food', todayKey());
      await savePlan('food', cur, { food: week });
    }
  };
}

const TITLE: Record<Domain, string> = { skin: 'Montar a rotina', training: 'Montar a semana de treino', food: 'Montar o plano de alimentação' };

export function PlanChat({ domain, open, onClose, onApplied }: { domain: Domain; open: boolean; onClose: () => void; onApplied?: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [input, setInput] = useState('');
  const [view, setView] = useState<Section[] | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<HTMLDivElement>(null);
  const spec = SPECIALISTS[domain];

  // Ao chegar resposta, mostra o começo dela (não o fim do rascunho); enquanto espera, o fim da conversa.
  useEffect(() => {
    if (busy) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    else lastRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [msgs.length, busy]);
  useEffect(() => {
    if (!open) return;
    setMsgs([]); setDraft(null); setAnswers({}); setInput(''); setView(null);
    void step('perguntas', []);
  }, [open]);

  const convo = (list: Msg[]) => list.map((m) => ({ quem: m.from === 'me' ? 'ela' : 'especialista', texto: m.text }));
  const herText = (list: Msg[]) => list.filter((m) => m.from === 'me').map((m) => m.text).join('\n\n');

  async function step(etapa: 'perguntas' | 'montar' | 'ajustar', list: Msg[], current?: any) {
    setBusy(etapa === 'perguntas' ? 'Pensando no que perguntar…' : etapa === 'montar' ? 'Montando com tudo o que você disse… leva uns 30 a 60 segundos.' : 'Ajustando…');
    try {
      const a = await adapter(domain, herText(list));
      const r = await askAI<any>('plan_chat', { ...(etapa === 'perguntas' ? a.slim(a.ctx) : a.ctx), dominio: domain, etapa, conversa: convo(list), rascunho: etapa === 'ajustar' ? current : undefined });
      const nf: NotFollowed[] = Array.isArray(r.nao_segui) ? r.nao_segui.filter((x: any) => x?.pedido) : [];
      if (etapa === 'perguntas') {
        const qs: Q[] = Array.isArray(r.perguntas) ? r.perguntas.filter((q: any) => q?.texto).slice(0, 3) : [];
        setMsgs([...list, { from: 'ai', text: String(r.mensagem ?? ''), questions: qs }]);
        if (!qs.length) await step('montar', [...list, { from: 'ai', text: String(r.mensagem ?? '') }]);
        return;
      }
      let next = current;
      if (etapa === 'montar') { const { mensagem, nao_segui, ...plan } = r; next = plan; }
      else if (r.alteracoes && typeof r.alteracoes === 'object') next = { ...current, ...r.alteracoes };
      setDraft(next);
      setView(a.describe(next));
      setMsgs([...list, { from: 'ai', text: String(r.mensagem ?? r.resumo ?? ''), notFollowed: nf, draft: etapa === 'montar' || !!r.alteracoes }]);
    } catch (e: any) {
      setMsgs([...list, { from: 'ai', text: `Não consegui responder agora: ${e.message}` }]);
    } finally { setBusy(null); }
  }

  const lastQ = [...msgs].reverse().find((m) => m.questions?.length);
  // O rascunho aparece logo depois da mensagem que o criou ou mudou; respostas sem mudança vêm abaixo dele.
  const draftAt = msgs.map((m) => !!m.draft).lastIndexOf(true);
  const lastAi = msgs.map((m) => m.from).lastIndexOf('ai');
  const draftEl = view && draft ? (
          <div className="draft" data-testid="chat-draft">
            <div className="draft-head"><b>{msgs.filter((m) => m.draft).length > 1 ? 'Rascunho atualizado' : 'Rascunho'}</b><span className="tiny muted">Toque nos dias para abrir</span></div>
            {view.map((sec, i) => (
              <details key={`${sec.title}-${i}`} className="dsec" open={sec.open}>
                <summary><span className="dsec-t">{sec.title}</span>{sec.sub && <span className="dsec-s">{sec.sub}</span>}</summary>
                {sec.text && <p className="dsec-text">{sec.text}</p>}
                {sec.groups.map((g, k) => (
                  <div key={k} className={`dgroup ${g.tone ?? ''}`}>
                    <span className="dg-l">{g.label}</span>
                    <ol>{g.items.map((it, j) => <li key={j}>{it}</li>)}</ol>
                  </div>
                ))}
              </details>
            ))}
          </div>
        
  ) : null;
  const answering = !draft && !!lastQ && !busy;
  const submitAnswers = () => {
    const parts = (lastQ?.questions ?? []).map((q) => (answers[q.id] ? `${q.texto} ${answers[q.id]}` : '')).filter(Boolean);
    const extra = input.trim();
    const text = [...parts, extra].filter(Boolean).join('\n') || 'Pode montar.';
    const list = [...msgs, { from: 'me' as const, text }];
    setMsgs(list); setInput('');
    void step('montar', list);
  };
  const send = () => {
    const t = input.trim();
    if (!t || busy) return;
    const list = [...msgs, { from: 'me' as const, text: t }];
    setMsgs(list); setInput('');
    void step(draft ? 'ajustar' : 'montar', list, draft);
  };
  const apply = async () => {
    setBusy('Salvando o plano…');
    try {
      const a = await adapter(domain, herText(msgs));
      await a.apply(draft);
      toast('Plano salvo. Vale a partir de hoje.');
      onApplied?.(); onClose();
    } catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(null); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={TITLE[domain]} sub={spec.who} testId="plan-chat"
      footer={draft ? (
        <>
          <button className="btn btn-soft" onClick={onClose} disabled={!!busy}>Descartar</button>
          <button className="btn btn-ink grow" onClick={apply} disabled={!!busy} data-testid="chat-apply">Usar este plano</button>
        </>
      ) : undefined}>
      <div className="chat" data-testid="chat-log">
        {msgs.map((m, i) => (
          <Fragment key={i}>
          <div ref={i === lastAi ? lastRef : undefined} className={`bubble ${m.from}`}>
            {m.text && <p>{m.text}</p>}
            {m.notFollowed?.length ? (
              <div className="nf" data-testid="chat-not-followed">
                <b>O que não segui do seu pedido</b>
                <ul>{m.notFollowed.map((n, k) => <li key={k}><b>{n.pedido}.</b> {n.motivo}{n.alternativa ? <><br /><i>No lugar:</i> {n.alternativa}</> : null}</li>)}</ul>
              </div>
            ) : null}
            {m.questions?.length && m === lastQ && !draft ? (
              <div className="qs">
                {m.questions.map((q) => (
                  <div key={q.id} className="q" data-testid="chat-question">
                    <p className="small" style={{ fontWeight: 700, margin: '8px 0 6px' }}>{q.texto}</p>
                    <div className="chips">{(q.opcoes ?? []).map((o) => <button key={o} className={`chip ${answers[q.id] === o ? 'on' : ''}`} onClick={() => setAnswers((x) => ({ ...x, [q.id]: x[q.id] === o ? '' : o }))}>{o}</button>)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {i === draftAt && draftEl}
          </Fragment>
        ))}
        {busy && <div className="bubble ai typing" data-testid="chat-busy"><Sparkles size={15} /> {busy}</div>}
        <div ref={endRef} />
      </div>
      {!busy && (answering || msgs.length > 0) && (
        <div className="chat-input">
          <textarea value={input} onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(140, e.target.scrollHeight)}px`; }} rows={1} aria-label="Mensagem para a especialista" data-testid="chat-input"
            placeholder={answering ? 'Algo a acrescentar? (opcional)' : draft ? 'Comente ou peça um ajuste' : domain === 'food' ? 'Cole a sua dieta ou conte o que quer' : 'Escreva para a especialista'} />
          <MicButton compact label="Falar" onText={(t) => setInput((x) => appendText(x, t))} />
          {answering
            ? <button className="chat-send" onClick={submitAnswers} aria-label="Montar" data-testid="chat-build"><Sparkles size={18} /><span>Montar</span></button>
            : <button className="chat-send icon" onClick={send} disabled={!input.trim()} aria-label="Enviar" data-testid="chat-send"><Send size={18} /></button>}
        </div>
      )}
    </Sheet>
  );
}

/** Botão que abre a conversa com a especialista. */
export function ChatButton({ domain, label }: { domain: Domain; label: string }) {
  const [open, setOpen] = useState(false);
  const ok = aiAvailable();
  return (
    <>
      <button className="btn btn-wine btn-block" style={{ margin: '8px 0' }} disabled={!ok} onClick={() => setOpen(true)} data-testid="ai-build">
        <Sparkles size={18} />{ok ? label : `${label} (entre com Google e conecte-se)`}
      </button>
      <PlanChat domain={domain} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
