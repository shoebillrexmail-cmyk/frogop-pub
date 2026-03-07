/**
 * useOnboardingState — tracks whether the onboarding overlay has been completed.
 */
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'frogop_onboarding_complete';

function shouldShow(walletConnected: boolean): boolean {
    if (!walletConnected) return false;
    try {
        return !localStorage.getItem(STORAGE_KEY);
    } catch {
        return false;
    }
}

export function useOnboardingState(walletConnected: boolean) {
    const [showOnboarding, setShowOnboarding] = useState(() => shouldShow(walletConnected));

    const completeOnboarding = useCallback(() => {
        setShowOnboarding(false);
        try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* noop */ }
    }, []);

    const resetOnboarding = useCallback(() => {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
        setShowOnboarding(true);
    }, []);

    return { showOnboarding, completeOnboarding, resetOnboarding };
}
