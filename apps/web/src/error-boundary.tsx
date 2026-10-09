import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Last-resort fallback so a single broken component never blanks the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-text">Something went wrong</h1>
        <p className="text-sm text-muted">
          Please reload the page. If it keeps happening, contact support.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 h-10 rounded-[var(--radius-control)] bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          Reload
        </button>
      </main>
    );
  }
}
