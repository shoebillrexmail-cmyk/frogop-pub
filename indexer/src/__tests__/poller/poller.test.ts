/**
 * Poller unit tests.
 *
 * opnet (JSONRpcProvider), db/queries, and decoder are all mocked.
 * Tests verify: block range logic, batch commit, skip on empty block,
 * graceful handling of missing blocks, and MAX_BLOCKS_PER_RUN cap.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---- Mocks (hoisted) -------------------------------------------------------
vi.mock('opnet', () => ({
    JSONRpcProvider: vi.fn(),
}));

vi.mock('../../db/queries.js', () => ({
    getLastIndexedBlock:     vi.fn(),
    stmtSetLastIndexedBlock: vi.fn((_db: unknown, n: unknown) => ({ _cursor: n })),
    stmtInsertPriceSnapshot: vi.fn((_db: unknown, row: unknown) => ({ _snapshot: row })),
    stmtUpsertCandle:        vi.fn((_db: unknown, row: unknown) => ({ _candle: row })),
    stmtPruneOldSnapshots:   vi.fn((_db: unknown, _c: unknown) => ({ _prune: 'snapshots' })),
    stmtPruneOldSwapEvents:  vi.fn((_db: unknown, _c: unknown) => ({ _prune: 'swaps' })),
    getSnapshotsInRange:     vi.fn().mockResolvedValue([]),
    getSwapEventsInBlockRange: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../decoder/index.js', () => ({
    decodeBlock: vi.fn().mockReturnValue([]),
}));

import { vi as _vi } from 'vitest';
import { pollNewBlocks } from '../../poller/index.js';
import * as queries      from '../../db/queries.js';
import * as decoder      from '../../decoder/index.js';
import { JSONRpcProvider } from 'opnet';
import type { Env } from '../../types/index.js';

// ---- Typed mock helpers ----------------------------------------------------
const mockGetLastIndexedBlock    = vi.mocked(queries.getLastIndexedBlock);
const mockStmtSetLastIndexedBlock = vi.mocked(queries.stmtSetLastIndexedBlock);
const mockDecodeBlock            = vi.mocked(decoder.decodeBlock);
const MockJSONRpcProvider        = vi.mocked(JSONRpcProvider);

// ---- Shared provider mock instance ----------------------------------------
let mockProvider: {
    getBlockNumber:   ReturnType<typeof vi.fn>;
    getBlock:         ReturnType<typeof vi.fn>;
    getPublicKeyInfo: ReturnType<typeof vi.fn>;
    call:             ReturnType<typeof vi.fn>;
};

// ---- Shared mock DB --------------------------------------------------------
const mockBatch = vi.fn().mockResolvedValue([]);
const mockDb    = { batch: mockBatch } as unknown as D1Database;

// ---- Env fixture -----------------------------------------------------------
const mockEnv: Env = {
    DB:               mockDb,
    OPNET_NETWORK:    'testnet',
    OPNET_RPC_URL:    'https://testnet.opnet.org',
    POOL_ADDRESSES:   'opt1abc',
    FACTORY_ADDRESS:  '',
    MAX_BLOCKS_PER_RUN: '5',
    NATIVESWAP_CONTRACT:       '',
    NATIVESWAP_TOKEN_ADDRESSES: '',
    NATIVESWAP_LABELS:         'MOTO,PILL',
};

/** Build a fake block with a transactions array */
function fakeBlock(txs: Array<{ id: string; events: unknown[] }> = []) {
    return { transactions: txs };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = {
        getBlockNumber:   vi.fn(),
        getBlock:         vi.fn(),
        getPublicKeyInfo: vi.fn(),
        call:             vi.fn(),
    };
    // getPublicKeyInfo resolves pool address to a hex string
    mockProvider.getPublicKeyInfo.mockResolvedValue({
        toString: () => '0xpool_hex',
    });
    // JSONRpcProvider constructor → always return mockProvider
    MockJSONRpcProvider.mockImplementation(() => mockProvider as never);
});

// ---------------------------------------------------------------------------
describe('pollNewBlocks — block range logic', () => {
    it('does nothing when already up to date', async () => {
        mockGetLastIndexedBlock.mockResolvedValue(100);
        mockProvider.getBlockNumber.mockResolvedValue(100);
        await pollNewBlocks(mockEnv);
        expect(mockProvider.getBlock).not.toHaveBeenCalled();
        expect(mockBatch).not.toHaveBeenCalled();
    });

    it('processes one new block', async () => {
        mockGetLastIndexedBlock.mockResolvedValue(99);
        mockProvider.getBlockNumber.mockResolvedValue(100);
        mockProvider.getBlock.mockResolvedValue(fakeBlock());
        await pollNewBlocks(mockEnv);
        expect(mockProvider.getBlock).toHaveBeenCalledOnce();
        expect(mockProvider.getBlock).toHaveBeenCalledWith(100n, true);
    });

    it('processes multiple blocks in order', async () => {
        mockGetLastIndexedBlock.mockResolvedValue(97);
        mockProvider.getBlockNumber.mockResolvedValue(100);
        mockProvider.getBlock.mockResolvedValue(fakeBlock());
        await pollNewBlocks(mockEnv);
        expect(mockProvider.getBlock).toHaveBeenCalledTimes(3);
        const calls = mockProvider.getBlock.mock.calls.map(c => Number(c[0]));
        expect(calls).toEqual([98, 99, 100]);
    });

    it('caps processing at MAX_BLOCKS_PER_RUN', async () => {
        // MAX_BLOCKS_PER_RUN = 5; gap is 20 → only 5 processed
        mockGetLastIndexedBlock.mockResolvedValue(80);
        mockProvider.getBlockNumber.mockResolvedValue(100);
        mockProvider.getBlock.mockResolvedValue(fakeBlock());
        await pollNewBlocks(mockEnv);
        expect(mockProvider.getBlock).toHaveBeenCalledTimes(5);
    });
});

// ---------------------------------------------------------------------------
describe('pollNewBlocks — per-block behaviour', () => {
    beforeEach(() => {
        mockGetLastIndexedBlock.mockResolvedValue(99);
        mockProvider.getBlockNumber.mockResolvedValue(100);
    });

    it('calls decodeBlock with block number and txs', async () => {
        const txs = [{ id: '0xtx', events: [] }];
        mockProvider.getBlock.mockResolvedValue(fakeBlock(txs));
        await pollNewBlocks(mockEnv);
        expect(mockDecodeBlock).toHaveBeenCalledOnce();
        const [, blockNumber, decodedTxs] = mockDecodeBlock.mock.calls[0]!;
        expect(blockNumber).toBe(100);
        expect(decodedTxs).toHaveLength(1);
    });

    it('commits event stmts + cursor together in one batch', async () => {
        const fakeStmt = { _t: 'fake_event_stmt' };
        mockDecodeBlock.mockReturnValueOnce([fakeStmt] as never);
        mockProvider.getBlock.mockResolvedValue(fakeBlock());
        await pollNewBlocks(mockEnv);
        // First batch call = processBlock; additional calls from pruneOldData
        expect(mockBatch).toHaveBeenCalled();
        const [batchArgs] = mockBatch.mock.calls[0]!;
        // Should contain the event stmt AND the cursor stmt
        expect(batchArgs).toContain(fakeStmt);
        expect(batchArgs.some((s: unknown) => (s as Record<string, unknown>)['_cursor'] === 100)).toBe(true);
    });

    it('still commits cursor when block has no events', async () => {
        mockDecodeBlock.mockReturnValueOnce([]);
        mockProvider.getBlock.mockResolvedValue(fakeBlock());
        await pollNewBlocks(mockEnv);
        // First batch call = processBlock cursor; additional from pruneOldData
        expect(mockBatch).toHaveBeenCalled();
        const [batchArgs] = mockBatch.mock.calls[0]!;
        // Only cursor stmt (no event stmts)
        expect(batchArgs).toHaveLength(1);
        expect((batchArgs[0] as Record<string, unknown>)['_cursor']).toBe(100);
    });

    it('skips block gracefully when getBlock returns null', async () => {
        mockProvider.getBlock.mockResolvedValue(null);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await pollNewBlocks(mockEnv);
        // processBlock batch should NOT have been called (block was skipped)
        // but pruneOldData still runs — verify no cursor stmt in any batch call
        const allBatchArgs = mockBatch.mock.calls.flatMap(c => c[0] as unknown[]);
        expect(allBatchArgs.every((s: unknown) => (s as Record<string, unknown>)['_cursor'] === undefined)).toBe(true);
        warnSpy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
describe('resolvePoolAddresses', () => {
    it('resolves bech32 pool addresses to hex for event matching', async () => {
        mockGetLastIndexedBlock.mockResolvedValue(99);
        mockProvider.getBlockNumber.mockResolvedValue(100);
        mockProvider.getBlock.mockResolvedValue(fakeBlock());
        await pollNewBlocks(mockEnv);
        // getPublicKeyInfo should have been called for 'opt1abc'
        expect(mockProvider.getPublicKeyInfo).toHaveBeenCalledWith('opt1abc', true);
        // decodeBlock should receive a Set containing the resolved hex
        const [, , , trackedPools] = mockDecodeBlock.mock.calls[0]!;
        expect((trackedPools as Set<string>).has('0xpool_hex')).toBe(true);
    });

    it('handles getPublicKeyInfo errors gracefully (skips that pool)', async () => {
        mockProvider.getPublicKeyInfo.mockRejectedValueOnce(new Error('RPC fail'));
        mockGetLastIndexedBlock.mockResolvedValue(99);
        mockProvider.getBlockNumber.mockResolvedValue(100);
        mockProvider.getBlock.mockResolvedValue(fakeBlock());
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(pollNewBlocks(mockEnv)).resolves.not.toThrow();
        errorSpy.mockRestore();
        // Pool not resolved → trackedPools is empty → decodeBlock gets empty Set
        const [, , , trackedPools] = mockDecodeBlock.mock.calls[0]!;
        expect((trackedPools as Set<string>).size).toBe(0);
    });
});

// ---------------------------------------------------------------------------
describe('pollNewBlocks — passes swapLabelMap to decodeBlock', () => {
    it('passes swap label map as 5th argument to decodeBlock', async () => {
        const envWithSwap: Env = {
            ...mockEnv,
            NATIVESWAP_CONTRACT:       '0xrouter_hex',
            NATIVESWAP_TOKEN_ADDRESSES: '0xmoto_hex',
            NATIVESWAP_LABELS:         'MOTO',
        };
        mockGetLastIndexedBlock.mockResolvedValue(99);
        mockProvider.getBlockNumber.mockResolvedValue(100);
        mockProvider.getBlock.mockResolvedValue(fakeBlock());
        mockProvider.getPublicKeyInfo.mockResolvedValue({ toString: () => '0xpool_hex' });
        // provider.call mock for getQuote
        mockProvider.call.mockResolvedValue('0x' + '00'.repeat(32));
        await pollNewBlocks(envWithSwap);
        expect(mockDecodeBlock).toHaveBeenCalledOnce();
        const args = mockDecodeBlock.mock.calls[0]!;
        // 5th argument should be a Map (swapLabelMap with router hex)
        expect(args[4]).toBeInstanceOf(Map);
        expect((args[4] as Map<string, string>).has('0xrouter_hex')).toBe(true);
    });
});
