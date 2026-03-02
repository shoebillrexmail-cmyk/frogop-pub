/**
 * useExpiryAlerts — fires browser notifications when purchased options
 * enter the grace window (144 blocks / ~24h before grace ends).
 *
 * Tracks which option IDs have already been alerted to avoid repeats.
 */
import { useEffect, useRef, useMemo, useCallback } from 'react';
import type { OptionData } from '../services/types.ts';
import { OptionStatus } from '../services/types.ts';

const ALERT_STORAGE_KEY = 'frogop_expiry_alerted';

function getAlerted(): Set<string> {
    try {
        const raw = localStorage.getItem(ALERT_STORAGE_KEY);
        if (!raw) return new Set();
        return new Set(JSON.parse(raw) as string[]);
    } catch {
        return new Set();
    }
}

function saveAlerted(ids: Set<string>) {
    try {
        localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify([...ids]));
    } catch { /* noop */ }
}

export interface ExpiryAlert {
    optionId: string;
    blocksLeft: bigint;
    urgency: 'warning' | 'urgent';
}

export function useExpiryAlerts(
    purchasedOptions: OptionData[],
    currentBlock: bigint | undefined,
    gracePeriodBlocks: bigint | undefined,
    walletHex: string | null,
): ExpiryAlert[] {
    const alertedRef = useRef(getAlerted());
    const graceBlocks = gracePeriodBlocks ?? 144n;

    // Compute alerts for purchased options owned by this wallet
    const alerts = useMemo(() => {
        const result: ExpiryAlert[] = [];
        if (currentBlock === undefined || !walletHex) return result;

        for (const opt of purchasedOptions) {
            if (opt.status !== OptionStatus.PURCHASED) continue;
            if (opt.buyer.toLowerCase() !== walletHex.toLowerCase()) continue;

            const graceEnds = opt.expiryBlock + graceBlocks;
            const blocksLeft = graceEnds - currentBlock;

            if (blocksLeft <= 0n) continue; // already expired
            if (blocksLeft > 1008n) continue; // more than 7 days — no alert

            const urgency = blocksLeft < 144n ? 'urgent' : 'warning';
            result.push({ optionId: opt.id.toString(), blocksLeft, urgency });
        }
        return result;
    }, [purchasedOptions, currentBlock, graceBlocks, walletHex]);

    // Fire browser notifications for new alerts
    const fireNotification = useCallback((alert: ExpiryAlert) => {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        const blocksNum = Number(alert.blocksLeft);
        const hours = Math.round(blocksNum * 10 / 60);
        const title = alert.urgency === 'urgent'
            ? `Exercise Option #${alert.optionId} NOW!`
            : `Option #${alert.optionId} grace ending`;
        const body = `~${hours}h left to exercise before grace period expires.`;
        new Notification(title, { body, icon: '/frogop-icon.png' });
    }, []);

    useEffect(() => {
        for (const alert of alerts) {
            if (!alertedRef.current.has(alert.optionId)) {
                alertedRef.current.add(alert.optionId);
                fireNotification(alert);
            }
        }
        saveAlerted(alertedRef.current);
    }, [alerts, fireNotification]);

    return alerts;
}
