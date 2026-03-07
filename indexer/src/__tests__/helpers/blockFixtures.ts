/**
 * Block fixture builders — produce realistic OPNet getBlock() return shapes
 * with properly encoded event data using buildEventData().
 *
 * Used by budget, pipeline, and integration tests.
 */
import { buildEventData } from './eventData.js';

// Default addresses (32-byte hex)
const DEFAULT_POOL   = '0x' + 'aa'.repeat(32);
const DEFAULT_WRITER = '0x' + 'bb'.repeat(32);
const DEFAULT_BUYER  = '0x' + 'cc'.repeat(32);
const DEFAULT_ROUTER = '0x' + 'dd'.repeat(32);

interface BlockFixture {
    transactions: Array<{
        id: string;
        events: Array<{
            contractAddress: string;
            type: string;
            data: string;
        }>;
    }>;
}

// ---------------------------------------------------------------------------
// OptionWritten
// ---------------------------------------------------------------------------

interface OptionWrittenParams {
    optionId?: bigint;
    writer?: string;
    optionType?: number;
    strikePrice?: bigint;
    underlyingAmount?: bigint;
    premium?: bigint;
    expiryBlock?: bigint;
    txId?: string;
}

export function buildOptionWrittenBlock(
    blockNum: number,
    poolHex: string = DEFAULT_POOL,
    params: OptionWrittenParams = {},
): BlockFixture {
    const data = buildEventData([
        { type: 'u256',    value: params.optionId ?? 1n },
        { type: 'address', value: params.writer ?? DEFAULT_WRITER },
        { type: 'u8',      value: params.optionType ?? 0 },
        { type: 'u256',    value: params.strikePrice ?? 50_000_000n },
        { type: 'u256',    value: params.underlyingAmount ?? 1_000_000n },
        { type: 'u256',    value: params.premium ?? 500_000n },
        { type: 'u64',     value: params.expiryBlock ?? BigInt(blockNum + 1000) },
    ]);

    return {
        transactions: [{
            id: params.txId ?? `0xtx_written_${blockNum}`,
            events: [{
                contractAddress: poolHex,
                type: 'OptionWritten',
                data,
            }],
        }],
    };
}

// ---------------------------------------------------------------------------
// OptionPurchased
// ---------------------------------------------------------------------------

interface OptionPurchasedParams {
    optionId?: bigint;
    buyer?: string;
    writer?: string;
    premium?: bigint;
    writerAmount?: bigint;
    currentBlock?: bigint;
    txId?: string;
}

export function buildOptionPurchasedBlock(
    blockNum: number,
    poolHex: string = DEFAULT_POOL,
    params: OptionPurchasedParams = {},
): BlockFixture {
    const data = buildEventData([
        { type: 'u256',    value: params.optionId ?? 1n },
        { type: 'address', value: params.buyer ?? DEFAULT_BUYER },
        { type: 'address', value: params.writer ?? DEFAULT_WRITER },
        { type: 'u256',    value: params.premium ?? 500_000n },
        { type: 'u256',    value: params.writerAmount ?? 495_000n },
        { type: 'u64',     value: params.currentBlock ?? BigInt(blockNum) },
    ]);

    return {
        transactions: [{
            id: params.txId ?? `0xtx_purchased_${blockNum}`,
            events: [{
                contractAddress: poolHex,
                type: 'OptionPurchased',
                data,
            }],
        }],
    };
}

// ---------------------------------------------------------------------------
// OptionCancelled
// ---------------------------------------------------------------------------

interface OptionCancelledParams {
    optionId?: bigint;
    writer?: string;
    returnAmount?: bigint;
    fee?: bigint;
    txId?: string;
}

export function buildOptionCancelledBlock(
    blockNum: number,
    poolHex: string = DEFAULT_POOL,
    params: OptionCancelledParams = {},
): BlockFixture {
    const data = buildEventData([
        { type: 'u256',    value: params.optionId ?? 1n },
        { type: 'address', value: params.writer ?? DEFAULT_WRITER },
        { type: 'u256',    value: params.returnAmount ?? 900_000n },
        { type: 'u256',    value: params.fee ?? 10_000n },
    ]);

    return {
        transactions: [{
            id: params.txId ?? `0xtx_cancelled_${blockNum}`,
            events: [{
                contractAddress: poolHex,
                type: 'OptionCancelled',
                data,
            }],
        }],
    };
}

// ---------------------------------------------------------------------------
// SwapExecuted
// ---------------------------------------------------------------------------

interface SwapExecutedParams {
    buyer?: string;
    amountIn?: bigint;
    amountOut?: bigint;
    totalFees?: bigint;
    txId?: string;
}

export function buildSwapExecutedBlock(
    blockNum: number,
    routerHex: string = DEFAULT_ROUTER,
    params: SwapExecutedParams = {},
): BlockFixture {
    const data = buildEventData([
        { type: 'address', value: params.buyer ?? DEFAULT_BUYER },
        { type: 'u64',     value: params.amountIn ?? 50_000n },
        { type: 'u256',    value: params.amountOut ?? 750_000_000_000_000_000_000n },
        { type: 'u256',    value: params.totalFees ?? 500n },
    ]);

    return {
        transactions: [{
            id: params.txId ?? `0xtx_swap_${blockNum}`,
            events: [{
                contractAddress: routerHex,
                type: 'SwapExecuted',
                data,
            }],
        }],
    };
}

// ---------------------------------------------------------------------------
// OptionTransferred
// ---------------------------------------------------------------------------

interface OptionTransferredParams {
    optionId?: bigint;
    from?: string;
    to?: string;
    txId?: string;
}

export function buildOptionTransferredBlock(
    blockNum: number,
    poolHex: string = DEFAULT_POOL,
    params: OptionTransferredParams = {},
): BlockFixture {
    const data = buildEventData([
        { type: 'u256',    value: params.optionId ?? 1n },
        { type: 'address', value: params.from ?? DEFAULT_BUYER },
        { type: 'address', value: params.to ?? '0x' + 'ee'.repeat(32) },
    ]);

    return {
        transactions: [{
            id: params.txId ?? `0xtx_transferred_${blockNum}`,
            events: [{
                contractAddress: poolHex,
                type: 'OptionTransferred',
                data,
            }],
        }],
    };
}

// ---------------------------------------------------------------------------
// Empty block (no transactions or events)
// ---------------------------------------------------------------------------

export function buildEmptyBlock(): BlockFixture {
    return { transactions: [] };
}

// ---------------------------------------------------------------------------
// Mixed block (multiple event types in one block)
// ---------------------------------------------------------------------------

export function buildMixedBlock(
    blockNum: number,
    poolHex: string = DEFAULT_POOL,
    routerHex: string = DEFAULT_ROUTER,
): BlockFixture {
    const writtenData = buildEventData([
        { type: 'u256',    value: 1n },
        { type: 'address', value: DEFAULT_WRITER },
        { type: 'u8',      value: 0 },
        { type: 'u256',    value: 50_000_000n },
        { type: 'u256',    value: 1_000_000n },
        { type: 'u256',    value: 500_000n },
        { type: 'u64',     value: BigInt(blockNum + 1000) },
    ]);

    const purchasedData = buildEventData([
        { type: 'u256',    value: 1n },
        { type: 'address', value: DEFAULT_BUYER },
        { type: 'address', value: DEFAULT_WRITER },
        { type: 'u256',    value: 500_000n },
        { type: 'u256',    value: 495_000n },
        { type: 'u64',     value: BigInt(blockNum) },
    ]);

    const swapData = buildEventData([
        { type: 'address', value: DEFAULT_BUYER },
        { type: 'u64',     value: 50_000n },
        { type: 'u256',    value: 750_000_000_000_000_000_000n },
        { type: 'u256',    value: 500n },
    ]);

    return {
        transactions: [
            {
                id: `0xtx_written_${blockNum}`,
                events: [{
                    contractAddress: poolHex,
                    type: 'OptionWritten',
                    data: writtenData,
                }],
            },
            {
                id: `0xtx_purchased_${blockNum}`,
                events: [{
                    contractAddress: poolHex,
                    type: 'OptionPurchased',
                    data: purchasedData,
                }],
            },
            {
                id: `0xtx_swap_${blockNum}`,
                events: [{
                    contractAddress: routerHex,
                    type: 'SwapExecuted',
                    data: swapData,
                }],
            },
        ],
    };
}

// Re-export defaults for test convenience
export { DEFAULT_POOL, DEFAULT_WRITER, DEFAULT_BUYER, DEFAULT_ROUTER };
