import { Component, type ReactNode } from 'react';
import { RefreshCw, House } from 'lucide-react';

/** Se uma tela quebrar, mostra o motivo e dois caminhos (tentar de novo ou voltar ao Hoje), na identidade do app. */
export class ErrorBoundary extends Component<{ children: ReactNode; inline?: boolean }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={this.props.inline ? 'screen err-screen' : 'app err-screen'} data-area="geral">
        <span className="wordmark">Ritual<i style={{ fontStyle: 'normal', color: 'var(--wine)' }}>.</i></span>
        <h1 className="page-big" style={{ marginTop: 28 }}>Algo travou<br /><span className="lt">nesta tela</span></h1>
        <p style={{ color: 'var(--ink-2)', fontSize: 16, lineHeight: 1.5 }}>Seus dados estão guardados no aparelho. Tente de novo; se repetir, volte ao Hoje e me conte o que estava fazendo.</p>
        <details className="err-det"><summary>Detalhe técnico</summary><pre>{String(this.state.error?.message ?? this.state.error)}</pre></details>
        <div className="row" style={{ gap: 10, marginTop: 8 }}>
          <button className="btn btn-ink" onClick={() => this.setState({ error: undefined })}><RefreshCw size={18} /> Tentar de novo</button>
          <button className="btn btn-soft" onClick={() => { window.location.hash = '#/'; window.location.reload(); }}><House size={18} /> Hoje</button>
        </div>
      </div>
    );
  }
}
