import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUp } from 'lucide-react';
import { applyImport, parseImport, type ParsedImport } from '../domain/import';
import { signInWithGoogle, supabase, useSync } from '../sync/sync';
import { update } from '../db/db';
import { toast } from '../state/store';
import { Chip } from '../ui/ui';
import { useSettings } from '../db/hooks';

export function Onboarding() {
  const session = useSync((s) => s.session);
  const settings = useSettings();
  const [step, setStep] = useState<'start' | 'import'>(session || settings?.importedAt ? 'import' : 'start');
  return step === 'start' ? <Start onLocal={() => setStep('import')} /> : <ImportStep />;
}

function Start({ onLocal }: { onLocal: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="screen no-nav" data-testid="onboarding">
      <div className="hero">
        <span className="wordmark">Ritual</span>
        <h1 style={{ marginTop: 36 }}>Seu dia,<b>em poucos toques.</b></h1>
        <p>Tarefas, pele, alimentação, treino e hábitos, todos presos à mesma data. Você monta o plano; o dia chega sugerido e você confirma.</p>
      </div>
      <div className="stack" style={{ marginTop: 28 }}>
        {supabase && (
          <button className="btn btn-ink btn-block" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await signInWithGoogle(); } catch (e: any) { toast(`Não foi possível entrar: ${e?.message ?? 'erro'}`, undefined, 'error'); setBusy(false); }
          }}>Entrar com Google</button>
        )}
        <button className="btn btn-line btn-block" onClick={onLocal} data-testid="start-local">Começar só neste aparelho</button>
        <p className="small muted" style={{ textAlign: 'center' }}>Entrando com Google, seus registros ficam guardados na sua nuvem privada e aparecem em qualquer aparelho. Dá para entrar depois, em Ajustes.</p>
      </div>
    </div>
  );
}

function ImportStep() {
  const nav = useNavigate();
  const settings = useSettings();
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const read = async (f?: File) => {
    if (!f) return;
    setError('');
    try {
      const p = parseImport(JSON.parse(await f.text()));
      setParsed(p);
      setTags(p.preview.tagSuggestions.map((t) => t.tag));
    } catch (e: any) {
      setError(e?.message?.startsWith('Arquivo') ? e.message : 'Não consegui ler esse arquivo. Confira se é o JSON de importação.');
    } finally { if (input.current) input.current.value = ''; }
  };
  const finish = async (toReview: boolean) => {
    if (settings) await update<'settings'>('settings', { onboarded: !toReview });
    nav(toReview ? '/revisao' : '/', { replace: true });
  };
  return (
    <div className="screen no-nav" data-testid="import-step">
      <div className="hero" style={{ paddingTop: 24 }}>
        <span className="wordmark">Ritual</span>
        <h1 style={{ marginTop: 28, fontSize: 42 }}>Trazer<b>seus dados</b></h1>
        <p>Escolha o arquivo de importação que está no seu celular. Ele é lido aqui mesmo; nada dele fica no código do app.</p>
      </div>
      {!parsed && !result && (
        <div className="stack">
          <button className="btn btn-ink btn-block" onClick={() => input.current?.click()} data-testid="pick-file"><FileUp size={18} />Escolher arquivo</button>
          <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => read(e.target.files?.[0])} data-testid="file-input" />
          {error && <p className="notice" role="alert">{error}</p>}
          <button className="btn btn-ghost btn-block" onClick={() => finish(false)}>Começar sem importar</button>
        </div>
      )}
      {parsed && !result && (
        <div className="block b-paper" data-testid="import-preview">
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>O que vai entrar</h2>
          <p className="small" style={{ margin: 0 }}>{parsed.preview.tasks} tarefas sem dia marcado, {parsed.preview.habits} hábitos, {parsed.preview.goals} meta, {parsed.preview.products} produtos de pele para revisar e {parsed.preview.foods} alimentos sugeridos.</p>
          {parsed.preview.tagSuggestions.length > 0 && (
            <>
              <span className="label">Etiquetas sugeridas para facilitar a busca</span>
              {parsed.preview.tagSuggestions.map((t) => (
                <div key={t.tag} style={{ marginBottom: 10 }}>
                  <Chip on={tags.includes(t.tag)} onClick={() => setTags(tags.includes(t.tag) ? tags.filter((x) => x !== t.tag) : [...tags, t.tag])}>{t.tag}</Chip>
                  <div className="tiny muted" style={{ marginTop: 4 }}>{t.titles.join('; ')}</div>
                </div>
              ))}
            </>
          )}
          <button className="btn btn-ink btn-block" style={{ marginTop: 14 }} data-testid="do-import" onClick={async () => setResult(await applyImport(parsed, tags))}>Importar</button>
          <button className="btn btn-ghost btn-block" onClick={() => setParsed(null)}>Escolher outro arquivo</button>
        </div>
      )}
      {result && (
        <div className="block b-olive" data-testid="import-done">
          <h2 style={{ fontSize: 22 }}>Pronto</h2>
          <p style={{ margin: '6px 0 14px' }}>{result.created} itens importados{result.skipped ? `; ${result.skipped} já existiam e não foram duplicados` : ''}. Agora vamos conferir quais produtos de pele você tem hoje.</p>
          <button className="btn btn-ink btn-block" onClick={() => finish(true)} data-testid="go-review">Revisar produtos</button>
          <button className="btn btn-ghost btn-block" onClick={() => finish(false)}>Fazer isso depois</button>
        </div>
      )}
    </div>
  );
}
