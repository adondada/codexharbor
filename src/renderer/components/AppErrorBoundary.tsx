import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('CodexHarbor renderer recovered from a fatal render error.', error, info);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <main className="fatal-render-error">
        <AlertTriangle size={34} />
        <span className="eyebrow">THREAD COULD NOT BE RENDERED</span>
        <h1>Codex returned data this client did not understand.</h1>
        <p>The window stayed alive and the raw error is shown below. Reload after updating CodexHarbor, or return to the thread list.</p>
        <pre>{this.state.error.message || String(this.state.error)}</pre>
        <button className="primary-button" onClick={() => window.location.reload()}><RefreshCw size={15} /> Reload CodexHarbor</button>
      </main>
    );
  }
}
