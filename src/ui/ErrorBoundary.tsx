import { Component, type ReactNode } from 'react';

/** Se uma tela quebrar, mostra o motivo e um caminho de volta em vez de uma tela parada. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app" style={{ padding: 24, minHeight: '100dvh', display: 'grid', alignContent: 'center', gap: 12 }}>
        <span className="wordmark">Ritual</span>
        <p>Algo nesta tela falhou. Seus dados estão guardados no aparelho.</p>
        <pre className="small" style={{ whiteSpace: 'pre-wrap', background: 'var(--paper-2)', padding: 12, borderRadius: 12 }}>{String(this.state.error?.message ?? this.state.error)}</pre>
        <button className="btn btn-ink" onClick={() => { window.location.hash = '#/'; window.location.reload(); }}>Voltar para o início</button>
      </div>
    );
  }
}
