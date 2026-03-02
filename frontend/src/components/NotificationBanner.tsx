/**
 * NotificationBanner — slide-in alert for status change notifications.
 *
 * Displays notifications when option statuses change (e.g., sold, exercised).
 * Auto-dismisses after 8 seconds.
 */
import { useEffect } from 'react';

export interface Notification {
    id: string;
    message: string;
    type: 'info' | 'success' | 'warning';
    timestamp: number;
}

interface NotificationBannerProps {
    notifications: Notification[];
    onDismiss: (id: string) => void;
}

const TYPE_STYLES: Record<string, string> = {
    info: 'border-cyan-700 bg-cyan-900/20 text-cyan-300',
    success: 'border-green-700 bg-green-900/20 text-green-300',
    warning: 'border-amber-700 bg-amber-900/20 text-amber-300',
};

const AUTO_DISMISS_MS = 8000;

export function NotificationBanner({ notifications, onDismiss }: NotificationBannerProps) {
    // Auto-dismiss oldest notification
    useEffect(() => {
        if (notifications.length === 0) return;
        const oldest = notifications[0];
        const elapsed = Date.now() - oldest.timestamp;
        const remaining = Math.max(AUTO_DISMISS_MS - elapsed, 0);
        const timer = setTimeout(() => onDismiss(oldest.id), remaining);
        return () => clearTimeout(timer);
    }, [notifications, onDismiss]);

    if (notifications.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm" data-testid="notification-banner">
            {notifications.slice(0, 3).map((n) => (
                <div
                    key={n.id}
                    className={`border rounded-lg px-4 py-3 text-xs font-mono flex items-start gap-2 shadow-lg animate-slide-in ${TYPE_STYLES[n.type]}`}
                    role="alert"
                >
                    <span className="flex-1">{n.message}</span>
                    <button
                        onClick={() => onDismiss(n.id)}
                        className="text-terminal-text-muted hover:text-terminal-text-primary text-sm leading-none ml-2"
                        aria-label="Dismiss notification"
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
}
