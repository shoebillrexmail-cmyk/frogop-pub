/**
 * intentDefs — intent definitions for the Trade wizard.
 *
 * Each intent represents a user goal (earn yield, protect, speculate, etc.)
 * and maps to applicable strategy types from strategyMath.
 */
import type { StrategyType, RiskLevel } from './strategyMath.ts';

export type IntentId =
    | 'earn-yield'
    | 'protect'
    | 'speculate-up'
    | 'speculate-down'
    | 'expect-volatility'
    | 'earn-both'
    | 'power-user';

export interface IntentDef {
    id: IntentId;
    label: string;
    tagline: string;
    riskLevel: RiskLevel;
    strategies: StrategyType[];
    role: 'writer' | 'buyer' | 'mixed';
}

const INTENTS: readonly IntentDef[] = [
    {
        id: 'earn-yield',
        label: 'Earn Yield on Holdings',
        tagline: 'List your tokens on the marketplace and earn fees from other users',
        riskLevel: 'low',
        strategies: ['covered-call', 'write-put'],
        role: 'writer',
    },
    {
        id: 'protect',
        label: 'Protect My Position',
        tagline: 'Buy protection from another user to limit losses if the price drops',
        riskLevel: 'low',
        strategies: ['protective-put', 'collar'],
        role: 'buyer',
    },
    {
        id: 'speculate-up',
        label: 'Bet on Price Going Up',
        tagline: 'Profit if the price rises, with your maximum loss capped',
        riskLevel: 'high',
        strategies: ['long-call', 'bull-call-spread'],
        role: 'buyer',
    },
    {
        id: 'speculate-down',
        label: 'Bet on Price Going Down',
        tagline: 'Profit if the price drops — choose capped or uncapped gains',
        riskLevel: 'high',
        strategies: ['long-put', 'bear-put-spread'],
        role: 'buyer',
    },
    {
        id: 'expect-volatility',
        label: 'Expect a Big Move',
        tagline: 'Profit from a large price swing in either direction',
        riskLevel: 'high',
        strategies: ['long-straddle', 'long-strangle'],
        role: 'buyer',
    },
    {
        id: 'earn-both',
        label: 'Earn on Both Sides',
        tagline: 'List offers in both directions and earn fees from other users',
        riskLevel: 'medium',
        strategies: ['collar', 'bull-call-spread', 'bear-put-spread'],
        role: 'writer',
    },
    {
        id: 'power-user',
        label: 'I Know What I Want',
        tagline: 'Jump straight to the full marketplace',
        riskLevel: 'low',
        strategies: [],
        role: 'mixed',
    },
] as const;

export function getAllIntents(): readonly IntentDef[] {
    return INTENTS;
}

export function getIntentById(id: string): IntentDef | undefined {
    return INTENTS.find((i) => i.id === id);
}

/** Returns true if this intent requires existing options on-chain to be useful (buyer role). */
export function intentNeedsLiquidity(id: IntentId): boolean {
    return id === 'protect' || id === 'speculate-up' || id === 'speculate-down' || id === 'expect-volatility';
}
