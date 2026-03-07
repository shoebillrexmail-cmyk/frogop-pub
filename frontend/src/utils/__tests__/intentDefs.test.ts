import { describe, it, expect } from 'vitest';
import { getAllIntents, getIntentById } from '../intentDefs.ts';

describe('intentDefs', () => {
    it('defines exactly 7 intents', () => {
        expect(getAllIntents()).toHaveLength(7);
    });

    it('has all required intent IDs', () => {
        const ids = getAllIntents().map((i) => i.id);
        expect(ids).toContain('earn-yield');
        expect(ids).toContain('protect');
        expect(ids).toContain('speculate-up');
        expect(ids).toContain('speculate-down');
        expect(ids).toContain('expect-volatility');
        expect(ids).toContain('earn-both');
        expect(ids).toContain('power-user');
    });

    it('getIntentById returns correct intent', () => {
        const intent = getIntentById('earn-yield');
        expect(intent).toBeDefined();
        expect(intent!.label).toBe('Earn Yield on Holdings');
        expect(intent!.riskLevel).toBe('low');
        expect(intent!.role).toBe('writer');
        expect(intent!.strategies).toContain('covered-call');
    });

    it('getIntentById returns undefined for unknown ID', () => {
        expect(getIntentById('nonexistent')).toBeUndefined();
    });

    it('power-user has no strategies', () => {
        const pu = getIntentById('power-user');
        expect(pu!.strategies).toHaveLength(0);
    });

    it('all intents have required fields', () => {
        for (const intent of getAllIntents()) {
            expect(intent.id).toBeTruthy();
            expect(intent.label).toBeTruthy();
            expect(intent.tagline).toBeTruthy();
            expect(['low', 'medium', 'high']).toContain(intent.riskLevel);
            expect(['writer', 'buyer', 'mixed']).toContain(intent.role);
        }
    });
});
