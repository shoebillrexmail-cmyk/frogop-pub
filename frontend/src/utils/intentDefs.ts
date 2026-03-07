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
        tagline: 'Generate income by writing options on tokens you already hold',
        riskLevel: 'low',
        strategies: ['covered-call', 'write-put'],
        role: 'writer',
    },
    {
        id: 'protect',
        label: 'Protect My Position',
        tagline: 'Buy insurance to limit downside risk on your portfolio',
        riskLevel: 'low',
        strategies: ['protective-put', 'collar'],
        role: 'buyer',
    },
    {
        id: 'speculate-up',
        label: 'Bet on Price Going Up',
        tagline: 'Leveraged upside exposure with capped risk',
        riskLevel: 'high',
        strategies: ['bull-call-spread'],
        role: 'buyer',
    },
    {
        id: 'speculate-down',
        label: 'Bet on Price Going Down',
        tagline: 'Profit from a price decline with limited risk',
        riskLevel: 'high',
        strategies: ['bear-put-spread'],
        role: 'buyer',
    },
    {
        id: 'earn-both',
        label: 'Earn on Both Sides',
        tagline: 'Earn premium from both upside and downside volatility',
        riskLevel: 'medium',
        strategies: ['collar', 'bull-call-spread', 'bear-put-spread'],
        role: 'writer',
    },
    {
        id: 'power-user',
        label: 'I Know What I Want',
        tagline: 'Jump straight to the option chain',
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
    return id === 'protect' || id === 'speculate-up' || id === 'speculate-down';
}
