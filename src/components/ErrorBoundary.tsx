import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Captura erros inesperados de renderização: mostra uma mensagem amigável e
 * recarrega a aplicação sozinha, para o totem nunca ficar travado.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; autoReloadMs?: number }, State> {
  state: State = { error: null };
  private timer: number | undefined;

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro na aplicação', error, info.componentStack);
    this.timer = window.setTimeout(() => this.recover(), this.props.autoReloadMs ?? 6000);
  }

  componentWillUnmount() {
    window.clearTimeout(this.timer);
  }

  recover = () => {
    window.clearTimeout(this.timer);
    window.location.hash = '';
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="massa-root items-center justify-center gap-6 p-8 text-center" role="alert">
        <p className="font-display text-4xl font-bold">Ops! Algo deu errado.</p>
        <p className="text-xl opacity-80">A pesquisa será reiniciada em instantes.</p>
        <button
          type="button"
          onClick={this.recover}
          className="massa-btn"
        >
          REINICIAR AGORA
        </button>
      </div>
    );
  }
}
