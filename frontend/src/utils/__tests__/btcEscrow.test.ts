/**
 * btcEscrow — unit tests for shared BTC escrow utilities.
 */
import { describe, it, expect, vi } from 'vitest';
import { deriveP2wshAddress, buildBtcExtraOutput } from '../btcEscrow.ts';
import { networks } from '@btc-vision/bitcoin';

// Mock @btc-vision/bitcoin
vi.mock('@btc-vision/bitcoin', () => {
    const testnetObj = { bech32: 'tb', label: 'testnet' };
    const bitcoinObj = { bech32: 'bc', label: 'mainnet' };
    const mockPayments = {
        p2wsh: vi.fn(({ hash, network }: { hash: Uint8Array; network: { label?: string } }) => ({
            address: `tb1q_mock_${Buffer.from(hash).toString('hex').slice(0, 8)}_${network?.label ?? 'testnet'}`,
        })),
    };
    return {
        payments: mockPayments,
        networks: { testnet: testnetObj, bitcoin: bitcoinObj },
        toBytes32: vi.fn((buf: Uint8Array) => buf),
    };
});

describe('deriveP2wshAddress', () => {
    it('strips 0x prefix from script hash', () => {
        const addr = deriveP2wshAddress('0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
        expect(addr).toContain('mock');
        expect(addr).toContain('abcdef12');
    });

    it('handles bare hex without 0x prefix', () => {
        const addr = deriveP2wshAddress('abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
        expect(addr).toContain('abcdef12');
    });

    it('uses testnet network by default', () => {
        const addr = deriveP2wshAddress('0x' + 'aa'.repeat(32));
        expect(addr).toContain('testnet');
    });

    it('accepts custom network', () => {
        const addr = deriveP2wshAddress('0x' + 'bb'.repeat(32), networks.bitcoin);
        expect(addr).toContain('mainnet');
    });
});

describe('buildBtcExtraOutput', () => {
    it('returns address and value', () => {
        const output = buildBtcExtraOutput('tb1qfakeaddr', 50000n);
        expect(output.address).toBe('tb1qfakeaddr');
        // Runtime value is bigint despite TypeScript number type annotation (branded bigint for Satoshi)
        expect(output.value).toBe(50000n as unknown as number);
    });

    it('preserves bigint at runtime (branded Satoshi type)', () => {
        const output = buildBtcExtraOutput('tb1qtest', 100n);
        // The `as unknown as number` is a compile-time cast; runtime stays bigint
        expect(BigInt(output.value)).toBe(100n);
    });

    it('handles zero amount', () => {
        const output = buildBtcExtraOutput('tb1qzero', 0n);
        expect(BigInt(output.value)).toBe(0n);
    });

    it('preserves large satoshi values', () => {
        const output = buildBtcExtraOutput('tb1qlarge', 10_000_000n);
        expect(BigInt(output.value)).toBe(10_000_000n);
    });
});
