import { describe, it, expect } from 'vitest';
import { formatBytes, formatCountdown, formatFeeRate, formatNumber } from '../networkFormat';

describe('formatBytes', () => {
    it('formats 0 bytes', () => {
        expect(formatBytes(0)).toBe('0 B');
    });

    it('formats negative as 0', () => {
        expect(formatBytes(-100)).toBe('0 B');
    });

    it('formats bytes', () => {
        expect(formatBytes(512)).toBe('512 B');
    });

    it('formats kilobytes', () => {
        expect(formatBytes(128 * 1024)).toBe('128.0 KB');
    });

    it('formats megabytes', () => {
        expect(formatBytes(4.8 * 1024 * 1024)).toBe('4.8 MB');
    });

    it('formats gigabytes', () => {
        expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
    });
});

describe('formatCountdown', () => {
    it('formats positive seconds', () => {
        expect(formatCountdown(272)).toBe('4:32');
    });

    it('pads seconds with leading zero', () => {
        expect(formatCountdown(5)).toBe('0:05');
    });

    it('returns overdue for 0', () => {
        expect(formatCountdown(0)).toBe('overdue');
    });

    it('returns overdue for negative', () => {
        expect(formatCountdown(-10)).toBe('overdue');
    });

    it('formats exact minutes', () => {
        expect(formatCountdown(120)).toBe('2:00');
    });
});

describe('formatFeeRate', () => {
    it('formats fee rate', () => {
        expect(formatFeeRate(2)).toBe('2.0 sat/vB');
    });

    it('formats fractional fee rate', () => {
        expect(formatFeeRate(1.5)).toBe('1.5 sat/vB');
    });

    it('formats negative as 0', () => {
        expect(formatFeeRate(-1)).toBe('0.0 sat/vB');
    });

    it('formats zero', () => {
        expect(formatFeeRate(0)).toBe('0.0 sat/vB');
    });
});

describe('formatNumber', () => {
    it('formats thousands with commas', () => {
        expect(formatNumber(2813)).toBe('2,813');
    });

    it('formats zero', () => {
        expect(formatNumber(0)).toBe('0');
    });

    it('formats large numbers', () => {
        expect(formatNumber(1234567)).toBe('1,234,567');
    });

    it('formats small numbers without separators', () => {
        expect(formatNumber(42)).toBe('42');
    });
});
