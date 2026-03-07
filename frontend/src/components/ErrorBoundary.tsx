/**
 * ErrorBoundary — catches render errors and shows recovery UI.
 *
 * React error boundaries must be class components (componentDidCatch).
 * Use at layout level to prevent white-screen crashes and at widget level
 * to contain failures to individual sections.
 */
import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
    /** Custom fallback UI. If not provided, default recovery card is shown. */
    fallback?: ReactNode;
    /** Compact inline fallback for widget-level boundaries. */
    inline?: boolean;
    /** Label shown in compact fallback (e.g. "Price Chart"). */
    label?: string;
    /** Called when an error is caught. */
    onError?: (error: Error, info: ErrorInfo) => void;
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('[ErrorBoundary]', error, info.componentStack);
        this.props.onError?.(error, info);
    }

    private handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render(): ReactNode {
        if (!this.state.hasError) return this.props.children;

        // Custom fallback
        if (this.props.fallback) return this.props.fallback;

        // Compact inline fallback for widget-level boundaries
        if (this.props.inline) {
            return (
                <div className="flex items-center justify-center py-8 px-4">
                    <div className="text-center">
                        <p className="text-terminal-text-muted text-xs font-mono mb-2">
                            Failed to load {this.props.label ?? 'component'}
                        </p>
                        <button
                            onClick={this.handleRetry}
                            className="text-accent text-xs font-mono hover:underline"
                            data-testid="error-retry"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            );
        }

        // Full-page fallback for layout-level boundary
        return (
            <div className="flex items-center justify-center min-h-[50vh] px-4" data-testid="error-boundary-fallback">
                <div className="bg-terminal-bg-elevated border border-rose-700/50 rounded-xl p-8 max-w-md text-center">
                    <h2 className="text-lg font-bold text-rose-400 font-mono mb-2">
                        Something went wrong
                    </h2>
                    <p className="text-terminal-text-muted text-sm font-mono mb-4">
                        {this.state.error?.message ?? 'An unexpected error occurred.'}
                    </p>
                    <div className="flex gap-3 justify-center">
                        <button
                            onClick={this.handleRetry}
                            className="btn-secondary px-4 py-2 text-sm rounded font-mono"
                            data-testid="error-retry"
                        >
                            Try again
                        </button>
                        <button
                            onClick={() => window.location.reload()}
                            className="text-terminal-text-muted text-sm font-mono hover:text-terminal-text-secondary"
                        >
                            Reload page
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
