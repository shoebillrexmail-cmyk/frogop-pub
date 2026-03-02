/**
 * useNotifications — manages notification state and browser Notification API.
 */
import { useState, useCallback } from 'react';
import type { Notification } from '../components/NotificationBanner.tsx';

export function useNotifications() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [browserPermission, setBrowserPermission] = useState<NotificationPermission | null>(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            return Notification.permission;
        }
        return null;
    });

    const requestPermission = useCallback(async () => {
        if (typeof window === 'undefined' || !('Notification' in window)) return;
        const stored = localStorage.getItem('frogop_notif_dismissed');
        if (stored === 'true') return;
        try {
            const perm = await Notification.requestPermission();
            setBrowserPermission(perm);
            if (perm === 'denied') {
                localStorage.setItem('frogop_notif_dismissed', 'true');
            }
        } catch {
            // Permission request failed silently
        }
    }, []);

    const addNotification = useCallback((message: string, type: Notification['type'] = 'info') => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setNotifications((prev) => [...prev, { id, message, type, timestamp: Date.now() }]);

        // Browser notification
        if (browserPermission === 'granted') {
            try {
                new window.Notification('FroGop', { body: message, tag: id });
            } catch {
                // Notification API not available in this context
            }
        }
    }, [browserPermission]);

    const dismissNotification = useCallback((id: string) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, []);

    return {
        notifications,
        addNotification,
        dismissNotification,
        requestPermission,
        browserPermission,
    };
}
