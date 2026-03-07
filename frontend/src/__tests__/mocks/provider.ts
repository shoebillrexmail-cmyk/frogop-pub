/**
 * Mock OPNet JSONRpcProvider for Vitest tests.
 * Returns sensible defaults; override per-test with vi.mocked(...).mockResolvedValueOnce(...)
 */
import { vi } from 'vitest';

export const mockProvider = {
    getBlockNumber: vi.fn().mockResolvedValue(2336n),
    getBalance: vi.fn().mockResolvedValue(100_000_000n),
    call: vi.fn().mockResolvedValue({ revert: null, result: { readU256: () => 0n, readAddress: () => ({ toString: () => '0x0000' }) } }),
    getPublicKeyInfo: vi.fn().mockResolvedValue({ toString: () => '0xdeadbeef' }),
    utxoManager: {
        getUTXOs: vi.fn().mockResolvedValue([]),
        spentUTXO: vi.fn(),
    },
};

export function resetProviderMocks() {
    vi.clearAllMocks();
}
