import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { isUnloading } from '@/platform/lifecycle';
import { Button, EmptyState } from '@/ui';

interface State {
  error: Error | null;
}

/** Last-resort recovery UI. It never touches stored data: reloading is always safe. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (!isUnloading()) console.error('Overtone render error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="screen" style={{ paddingBlock: 'var(--safe-top)' }}>
        <EmptyState
          title="Something went wrong"
          action={<Button onClick={() => window.location.reload()}>Reload Overtone</Button>}
        >
          Your songs are stored on this device and have not been changed. Reloading usually fixes
          this.
        </EmptyState>
        <details style={{ padding: 'var(--space-16)', color: 'var(--text-secondary)' }}>
          <summary>Technical details</summary>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {this.state.error.message}
          </pre>
        </details>
      </main>
    );
  }
}
