import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { strings } from '@/lib/strings';
import { ErrorState } from './error-state';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Last line of defence for render errors inside a workspace region. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Sentry wiring lands with observability; keep the console signal for now.
    console.error('[TradeOS] render error', error, info.componentStack);
  }

  private readonly reset = () => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <ErrorState
            title={strings.errors.genericTitle}
            body={strings.errors.genericBody}
            detail={this.state.error.message}
            className="m-4"
            action={
              <Button variant="outline" size="sm" onClick={this.reset}>
                {strings.errors.reload}
              </Button>
            }
          />
        )
      );
    }
    return this.props.children;
  }
}
