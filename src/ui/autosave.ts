// Gravação automática: a regra do app é não ter botão de salvar. Toque grava na hora; texto grava um instante depois
// que ela para de digitar; sair da tela grava o que faltava.
import { useEffect, useRef } from 'react';

/**
 * Grava `value` com `write` sempre que ele mudar em relação ao que foi carregado.
 * - `ready`: só depois de carregar o que já existe (o valor nesse momento vira a referência e não é gravado).
 * - `scope`: muda quando a tela passa a mostrar outro registro (outro dia, outro período); a referência recomeça.
 * - `delay`: espera em ms (texto); 0 grava na hora.
 * Devolve `flush`, para um botão "Pronto" gravar antes de sair.
 */
export function useAutoSave<T>(value: T, write: (v: T) => Promise<unknown> | void, opts: { ready: boolean; scope?: string; delay?: number }) {
  const { ready, scope = '', delay = 600 } = opts;
  const base = useRef<{ scope: string; json: string } | null>(null);
  const latest = useRef({ value, write, scope });
  latest.current = { value, write, scope };
  const json = JSON.stringify(value ?? null);
  // A referência é o valor no momento em que fica pronto (ou quando o escopo muda).
  if (ready && (!base.current || base.current.scope !== scope)) base.current = { scope, json };
  const flush = useRef(async () => {
    const b = base.current;
    const cur = latest.current;
    if (!b || b.scope !== cur.scope) return;
    const j = JSON.stringify(cur.value ?? null);
    if (j === b.json) return;
    b.json = j;
    await cur.write(cur.value);
  });
  useEffect(() => {
    if (!ready || !base.current || base.current.json === json) return;
    const id = setTimeout(() => void flush.current(), delay);
    return () => clearTimeout(id);
  }, [json, ready, scope]);
  useEffect(() => () => { void flush.current(); }, []);
  return () => flush.current();
}
