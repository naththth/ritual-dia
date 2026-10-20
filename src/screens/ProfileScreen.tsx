// Perfil e objetivos: o que a IA precisa saber para orientar alimentação, treino e pele com base em evidência.
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { PageHead, useBack } from './common';
import { useSettings } from '../db/hooks';
import { update } from '../db/db';
import { Chip } from '../ui/ui';
import { toast } from '../state/store';
import { aiAvailable, aiTargets } from '../domain/ai';
import type { Profile } from '../db/types';

const GOALS: [NonNullable<Profile['goal']>, string, string][] = [
  ['perder_gordura', 'Perder gordura', 'déficit calórico, proteína alta'],
  ['recomposicao', 'Recomposição', 'perder gordura e ganhar músculo'],
  ['ganhar_massa', 'Ganhar massa', 'superávit leve'],
  ['performance', 'Performance', 'render melhor nos treinos e provas'],
  ['manter', 'Manter', 'equilíbrio e constância']
];
const ACTIVITY: [NonNullable<Profile['activity']>, string][] = [['sedentario', 'Sentada a maior parte'], ['leve', 'Leve'], ['moderado', 'Moderada'], ['alto', 'Alta'], ['muito_alto', 'Muito alta']];
const RESTR = ['Sem lactose', 'Sem glúten', 'Vegetariana', 'Pouco açúcar', 'Sem carne vermelha', 'Sem frutos do mar'];
const CONCERNS = ['Acne', 'Cravos', 'Textura', 'Manchas', 'Oleosidade', 'Sensibilidade', 'Rosácea', 'Linhas finas', 'Desidratação'];
const SKIN = ['Oleosa', 'Mista', 'Normal', 'Seca'];
const DAYS = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

export function ProfileScreen() {
  const settings = useSettings();
  const back = useBack();
  const [p, setP] = useState<Profile>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  useEffect(() => { if (settings && !loaded) { setP(settings.profile ?? {}); setLoaded(true); } }, [settings, loaded]);
  if (!settings) return null;
  const set = (x: Partial<Profile>) => setP((o) => ({ ...o, ...x }));
  const num = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : undefined);
  const save = async (quiet = false) => { await update<'settings'>('settings', { profile: { ...p, updatedAt: Date.now() } }); if (!quiet) toast('Perfil salvo'); };
  const diet = p.diet ?? { restrictions: [] };
  const tr = p.training ?? {};
  const skin = p.skin ?? { concerns: [] };
  const toggleIn = (arr: string[] = [], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const calc = async () => {
    setBusy(true);
    try { await save(true); setRes(await aiTargets()); } catch (e: any) { toast(e.message, undefined, 'error'); } finally { setBusy(false); }
  };
  const apply = async () => {
    await update<'settings'>('settings', { targets: { kcal: res.kcal, p: res.proteina_g, c: res.carbo_g, f: res.gordura_g }, waterGoalMl: res.agua_ml ?? settings.waterGoalMl, targetsNote: res.metodo });
    toast('Metas aplicadas');
    back();
  };

  return (
    <div className="screen no-nav" data-testid="profile-screen">
      <PageHead title="Perfil e objetivos" withDate={false} />
      <p className="small" style={{ marginTop: 0 }}>É a base que a IA usa para montar alimentação, treino e pele. Responda o que quiser; o que faltar ela avisa. O que suas profissionais (nutricionista, treinador, dermatologista) definirem sempre prevalece.</p>

      <section className="block b-paper">
        <h2 style={{ fontSize: 20 }}>Corpo</h2>
        <div className="nutr-grid">
          <label className="nutr-cell"><span>Altura (cm)</span><input inputMode="numeric" value={p.heightCm ?? ''} onChange={(e) => set({ heightCm: num(e.target.value) })} aria-label="Altura" /></label>
          <label className="nutr-cell"><span>Peso (kg)</span><input inputMode="decimal" value={p.weightKg ?? ''} onChange={(e) => set({ weightKg: num(e.target.value) })} aria-label="Peso" /></label>
          <label className="nutr-cell"><span>Ano de nascimento</span><input inputMode="numeric" value={p.birthYear ?? ''} onChange={(e) => set({ birthYear: num(e.target.value) })} aria-label="Ano de nascimento" /></label>
          <label className="nutr-cell"><span>% de gordura (se souber)</span><input inputMode="decimal" value={p.bodyFatPct ?? ''} onChange={(e) => set({ bodyFatPct: num(e.target.value) })} aria-label="Percentual de gordura" /></label>
        </div>
        <span className="label">Sexo biológico (para o cálculo de gasto)</span>
        <div className="chips"><Chip on={p.sex === 'F'} onClick={() => set({ sex: 'F' })}>Feminino</Chip><Chip on={p.sex === 'M'} onClick={() => set({ sex: 'M' })}>Masculino</Chip></div>
        <span className="label">Atividade fora dos treinos</span>
        <div className="chips">{ACTIVITY.map(([k, l]) => <Chip key={k} on={p.activity === k} onClick={() => set({ activity: k })}>{l}</Chip>)}</div>
      </section>

      <section className="block b-paper">
        <h2 style={{ fontSize: 20 }}>Objetivo</h2>
        {GOALS.map(([k, l, d]) => (
          <button key={k} className={`goal-opt ${p.goal === k ? 'on' : ''}`} onClick={() => set({ goal: k })}><b>{l}</b><span className="small">{d}</span></button>
        ))}
        {(p.goal === 'perder_gordura' || p.goal === 'recomposicao' || p.goal === 'ganhar_massa') && (
          <>
            <span className="label">Ritmo</span>
            <div className="chips"><Chip on={p.pace !== 'moderado'} onClick={() => set({ pace: 'leve' })}>Leve, preservando treino</Chip><Chip on={p.pace === 'moderado'} onClick={() => set({ pace: 'moderado' })}>Moderado</Chip></div>
          </>
        )}
        <span className="label">Prova ou marco (opcional)</span>
        <input value={p.event ?? ''} onChange={(e) => set({ event: e.target.value })} placeholder="Ex.: triathlon sprint em março" aria-label="Prova ou marco" />
      </section>

      <section className="block b-honey">
        <h2 style={{ fontSize: 20 }}>Alimentação</h2>
        <span className="label" style={{ marginTop: 0 }}>Restrições</span>
        <div className="chips">{RESTR.map((r) => <Chip key={r} on={diet.restrictions.includes(r)} onClick={() => set({ diet: { ...diet, restrictions: toggleIn(diet.restrictions, r) } })}>{r}</Chip>)}</div>
        <span className="label">Gosta / não gosta</span>
        <input value={diet.likes ?? ''} onChange={(e) => set({ diet: { ...diet, likes: e.target.value } })} placeholder="Gosta de: ovos, iogurte, frutas…" aria-label="Alimentos que gosta" />
        <input value={diet.dislikes ?? ''} onChange={(e) => set({ diet: { ...diet, dislikes: e.target.value } })} placeholder="Não gosta de: …" aria-label="Alimentos que não gosta" style={{ marginTop: 8 }} />
        <span className="label">Refeições por dia</span>
        <div className="chips">{[3, 4, 5, 6].map((n) => <Chip key={n} on={diet.mealsPerDay === n} onClick={() => set({ diet: { ...diet, mealsPerDay: n } })}>{n}</Chip>)}</div>
        <span className="label">Acompanhamento</span>
        <div className="chips"><Chip on={!!diet.followsNutritionist} onClick={() => set({ diet: { ...diet, followsNutritionist: !diet.followsNutritionist } })}>Tenho nutricionista</Chip></div>
      </section>

      <section className="block b-blue">
        <h2 style={{ fontSize: 20 }}>Treino</h2>
        <span className="label" style={{ marginTop: 0 }}>Dias disponíveis</span>
        <div className="chips">{[1, 2, 3, 4, 5, 6, 7].map((d) => <Chip key={d} on={(tr.daysAvailable ?? []).includes(d)} onClick={() => set({ training: { ...tr, daysAvailable: (toggleIn((tr.daysAvailable ?? []).map(String), String(d))).map(Number).sort() } })}>{DAYS[d]}</Chip>)}</div>
        <span className="label">Tempo por sessão</span>
        <div className="chips">{[30, 45, 60, 90].map((m) => <Chip key={m} on={tr.minutesPerSession === m} onClick={() => set({ training: { ...tr, minutesPerSession: m } })}>{m} min</Chip>)}</div>
        <span className="label">Equipamento e limitações</span>
        <input value={tr.equipment ?? ''} onChange={(e) => set({ training: { ...tr, equipment: e.target.value } })} placeholder="Academia completa, rolo com potência…" aria-label="Equipamento" />
        <input value={tr.limitations ?? ''} onChange={(e) => set({ training: { ...tr, limitations: e.target.value } })} placeholder="Dores ou limitações a respeitar" aria-label="Limitações" style={{ marginTop: 8 }} />
      </section>

      <section className="block b-rose">
        <h2 style={{ fontSize: 20 }}>Pele</h2>
        <span className="label" style={{ marginTop: 0 }}>Tipo</span>
        <div className="chips">{SKIN.map((t) => <Chip key={t} on={skin.type === t} onClick={() => set({ skin: { ...skin, type: t } })}>{t}</Chip>)}</div>
        <span className="label">Queixas</span>
        <div className="chips">{CONCERNS.map((c) => <Chip key={c} on={skin.concerns.includes(c)} onClick={() => set({ skin: { ...skin, concerns: toggleIn(skin.concerns, c) } })}>{c}</Chip>)}</div>
        <span className="label">Acompanhamento</span>
        <div className="chips"><Chip on={!!skin.followsDerm} onClick={() => set({ skin: { ...skin, followsDerm: !skin.followsDerm } })}>Tenho dermatologista</Chip><Chip on={!!skin.sensitive} onClick={() => set({ skin: { ...skin, sensitive: !skin.sensitive } })}>Pele sensível</Chip></div>
        <input value={skin.prescriptions ?? ''} onChange={(e) => set({ skin: { ...skin, prescriptions: e.target.value } })} placeholder="O que a dermatologista prescreveu (opcional)" aria-label="Prescrições da dermatologista" style={{ marginTop: 8 }} />
      </section>

      <button className="btn btn-ink btn-block" onClick={() => save()} data-testid="profile-save">Salvar perfil</button>

      <section className="block b-paper" style={{ marginTop: 16 }} data-testid="targets-ai">
        <h2 style={{ fontSize: 20 }}>Metas de calorias e macros</h2>
        <p className="small" style={{ marginTop: 4 }}>A IA calcula a partir do seu perfil, dos treinos reais e do plano da nutricionista, com os métodos usados em nutrição esportiva, e mostra a conta.</p>
        <button className="btn btn-wine btn-block" disabled={busy || !aiAvailable()} onClick={calc} data-testid="targets-calc"><Sparkles size={18} />{busy ? 'Calculando…' : 'Calcular minhas metas'}</button>
        {res && (
          <div style={{ marginTop: 12 }} data-testid="targets-result">
            {res.kcal == null ? <p className="small"><b>Falta para calcular:</b> {res.falta || 'peso, altura, idade e sexo'}.</p> : <>
            <div className="macro-row"><span><b className="num">{res.kcal}</b>kcal</span><span>P {res.proteina_g} g</span><span>C {res.carbo_g} g</span><span>G {res.gordura_g} g</span>{res.agua_ml ? <span>Água {res.agua_ml / 1000} L</span> : null}</div>
            {res.dia_de_treino_forte && <p className="small" style={{ margin: '6px 0 0' }}><b>Dias de treino forte:</b> {res.dia_de_treino_forte}</p>}
            <p className="small" style={{ whiteSpace: 'pre-line' }}><b>Como chegou nisso.</b> {res.metodo}</p>
            {res.observacoes && <p className="small" style={{ whiteSpace: 'pre-line' }}>{res.observacoes}</p>}
            {res.falta && <p className="small muted">Para afinar: {res.falta}</p>}
            <button className="btn btn-ink btn-block" onClick={apply} data-testid="targets-apply">Usar essas metas</button>
            </>}
          </div>
        )}
        {settings.targetsNote && !res && <p className="small muted" style={{ marginBottom: 0 }}>Metas atuais: {settings.targets?.kcal ?? '–'} kcal. {settings.targetsNote}</p>}
      </section>
    </div>
  );
}
