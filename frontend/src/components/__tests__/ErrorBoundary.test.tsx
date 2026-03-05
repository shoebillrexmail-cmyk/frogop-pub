/**
 * ErrorBoundary tests — catch render errors, show fallback, retry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary.tsx';

// Component that throws on render
function ThrowOnRender({ shouldThrow }: { shouldThrow: boolean }) {
    if (shouldThrow) throw new Error('Test render error');
    return <div data-testid="child">OK</div>;
}

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ErrorBoundary', () => {
    it('renders children when no error', () => {
        render(
            <ErrorBoundary>
                <div data-testid="child">Hello</div>
            </ErrorBoundary>,
        );
        expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('shows default fallback when child throws', () => {
        render(
            <ErrorBoundary>
                <ThrowOnRender shouldThrow />
            </ErrorBoundary>,
        );
        expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
        expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
        expect(screen.getByText(/Test render error/)).toBeInTheDocument();
    });

    it('shows custom fallback when provided', () => {
        render(
            <ErrorBoundary fallback={<div data-testid="custom">Custom fallback</div>}>
                <ThrowOnRender shouldThrow />
            </ErrorBoundary>,
        );
        expect(screen.getByTestId('custom')).toBeInTheDocument();
    });

    it('shows inline compact fallback with label', () => {
        render(
            <ErrorBoundary inline label="Price Chart">
                <ThrowOnRender shouldThrow />
            </ErrorBoundary>,
        );
        expect(screen.getByText(/Failed to load Price Chart/)).toBeInTheDocument();
        expect(screen.getByTestId('error-retry')).toBeInTheDocument();
    });

    it('retry button resets error state', () => {
        // We need a component that can toggle between throwing and not
        let shouldThrow = true;
        function Toggleable() {
            if (shouldThrow) throw new Error('first render');
            return <div data-testid="child">Recovered</div>;
        }

        const { rerender } = render(
            <ErrorBoundary>
                <Toggleable />
            </ErrorBoundary>,
        );

        expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();

        // Toggle off the throw, then retry
        shouldThrow = false;
        fireEvent.click(screen.getByText('Try again'));

        // After retry, the boundary re-renders children
        // Need to rerender to pick up the state change
        rerender(
            <ErrorBoundary>
                <Toggleable />
            </ErrorBoundary>,
        );
        expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('calls onError callback when error caught', () => {
        const onError = vi.fn();
        render(
            <ErrorBoundary onError={onError}>
                <ThrowOnRender shouldThrow />
            </ErrorBoundary>,
        );
        expect(onError).toHaveBeenCalledOnce();
        expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error);
        expect(onError.mock.calls[0]![0].message).toBe('Test render error');
    });

    it('does not affect siblings outside the boundary', () => {
        render(
            <div>
                <div data-testid="sibling">Safe</div>
                <ErrorBoundary>
                    <ThrowOnRender shouldThrow />
                </ErrorBoundary>
            </div>,
        );
        expect(screen.getByTestId('sibling')).toBeInTheDocument();
        expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    });
});
