/**
 * useStatusChangeDetector — detects when option statuses change between renders.
 *
 * Compares previous vs current options array and fires a callback when
 * transitions are detected (e.g., OPEN → PURCHASED, PURCHASED → EXERCISED).
 */
import { useEffect, useRef, useCallback } from 'react';
import type { OptionData } from '../services/types.ts';
import { OptionStatus } from '../services/types.ts';

export interface StatusChange {
    optionId: bigint;
    oldStatus: number;
    newStatus: number;
    writer: string;
    buyer: string;
}

const STATUS_LABELS: Record<number, string> = {
    [OptionStatus.OPEN]: 'OPEN',
    [OptionStatus.PURCHASED]: 'PURCHASED',
    [OptionStatus.EXERCISED]: 'EXERCISED',
    [OptionStatus.EXPIRED]: 'EXPIRED',
    [OptionStatus.CANCELLED]: 'CANCELLED',
};

export function getStatusLabel(status: number): string {
    return STATUS_LABELS[status] ?? `STATUS_${status}`;
}

/**
 * Returns a human-readable message for a status change, contextualized by role.
 */
export function describeChange(change: StatusChange, walletHex: string | null): string {
    const id = change.optionId.toString();
    const isWriter = walletHex !== null && change.writer.toLowerCase() === walletHex.toLowerCase();
    const isBuyer = walletHex !== null && change.buyer.toLowerCase() === walletHex.toLowerCase();

    if (change.newStatus === OptionStatus.PURCHASED) {
        if (isWriter) return `Option #${id} was purchased by a buyer`;
        return `Option #${id} is now purchased`;
    }
    if (change.newStatus === OptionStatus.EXERCISED) {
        if (isWriter) return `Option #${id} was exercised against you`;
        if (isBuyer) return `You exercised Option #${id}`;
        return `Option #${id} was exercised`;
    }
    if (change.newStatus === OptionStatus.CANCELLED) {
        if (isWriter) return `Option #${id} was cancelled`;
        return `Option #${id} was cancelled by the writer`;
    }
    if (change.newStatus === OptionStatus.EXPIRED) {
        return `Option #${id} has expired`;
    }
    return `Option #${id}: ${getStatusLabel(change.oldStatus)} → ${getStatusLabel(change.newStatus)}`;
}

export function useStatusChangeDetector(
    options: OptionData[],
    onChanges: (changes: StatusChange[]) => void,
) {
    const prevMapRef = useRef<Map<string, number>>(new Map());
    const initialized = useRef(false);

    const stableCallback = useCallback((...args: [StatusChange[]]) => onChanges(...args), [onChanges]);

    useEffect(() => {
        const currentMap = new Map<string, number>();
        const changes: StatusChange[] = [];

        for (const opt of options) {
            const key = opt.id.toString();
            currentMap.set(key, opt.status);

            if (initialized.current) {
                const prevStatus = prevMapRef.current.get(key);
                if (prevStatus !== undefined && prevStatus !== opt.status) {
                    changes.push({
                        optionId: opt.id,
                        oldStatus: prevStatus,
                        newStatus: opt.status,
                        writer: opt.writer,
                        buyer: opt.buyer,
                    });
                }
            }
        }

        prevMapRef.current = currentMap;

        if (!initialized.current) {
            initialized.current = true;
            return;
        }

        if (changes.length > 0) {
            stableCallback(changes);
        }
    }, [options, stableCallback]);
}
