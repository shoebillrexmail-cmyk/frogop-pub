/**
 * poolGrouping — groups inverse pool pairs for display on the pool list page.
 *
 * Inverse pairs share the same two tokens but in opposite directions:
 *   MOTO/PILL ↔ PILL/MOTO,  MOTO/BTC ↔ BTC/MOTO,  PILL/BTC ↔ BTC/PILL
 *
 * Unpaired pools (no matching inverse) get their own single-pool group.
 */
import type { PoolEntry } from '../services/types.ts';
import type { PoolConfig } from '../../../shared/pool-config.types.ts';

export interface PoolGroup {
    /** Alphabetically-sorted market label, e.g. "BTC ↔ MOTO" */
    market: string;
    /** Canonical token pair (alphabetical order) for stable sorting */
    sortKey: string;
    /** One or two pools in this group */
    pools: [PoolEntry, PoolEntry?];
    /** Pool configs parallel to pools array (for type badge, etc.) */
    configs: [PoolConfig | null, (PoolConfig | null)?];
}

/** Direction explainer for a pool: what the user locks and earns. */
export function directionLabel(pool: PoolEntry, poolType: 0 | 1 | 2): string {
    const u = pool.underlyingSymbol ?? 'Token A';
    const p = pool.premiumSymbol ?? 'Token B';
    if (poolType === 1) return `Lock ${u}, earn sats`;
    if (poolType === 2) return `Lock BTC, earn ${p}`;
    return `Lock ${u}, earn ${p}`;
}

/**
 * Group pools into inverse pairs by matching token addresses.
 * Two pools are an inverse pair when pool A's underlying === pool B's premium
 * AND pool A's premium === pool B's underlying.
 */
export function groupInversePairs(
    pools: PoolEntry[],
    findConfig: (pool: PoolEntry) => PoolConfig | null,
): PoolGroup[] {
    const used = new Set<string>();
    const groups: PoolGroup[] = [];

    for (let i = 0; i < pools.length; i++) {
        if (used.has(pools[i].address)) continue;

        const a = pools[i];
        let inverse: PoolEntry | undefined;
        let inverseIdx = -1;

        // Find matching inverse (same token pair, opposite direction)
        for (let j = i + 1; j < pools.length; j++) {
            if (used.has(pools[j].address)) continue;
            const b = pools[j];
            if (
                a.underlying.toLowerCase() === b.premiumToken.toLowerCase() &&
                a.premiumToken.toLowerCase() === b.underlying.toLowerCase()
            ) {
                inverse = b;
                inverseIdx = j;
                break;
            }
        }

        const symA = a.underlyingSymbol ?? 'A';
        const symB = a.premiumSymbol ?? 'B';
        const sorted = [symA, symB].sort();
        const market = `${sorted[0]} ↔ ${sorted[1]}`;
        const sortKey = `${sorted[0]}_${sorted[1]}`;

        const configA = findConfig(a);

        if (inverse && inverseIdx >= 0) {
            used.add(a.address);
            used.add(inverse.address);
            const configB = findConfig(inverse);
            groups.push({ market, sortKey, pools: [a, inverse], configs: [configA, configB] });
        } else {
            used.add(a.address);
            groups.push({ market, sortKey, pools: [a, undefined], configs: [configA, undefined] });
        }
    }

    // Sort groups alphabetically by market
    groups.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return groups;
}
