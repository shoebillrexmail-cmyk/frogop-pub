/**
 * Decoder unit tests.
 *
 * The db/queries module is mocked — decodeBlock() returns the prepared
 * statement objects, but never executes them.  Tests inspect the returned
 * stmts array (and the args passed to the factory functions) to verify
 * correct field parsing, field order, and fee logic.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// vi.mock is hoisted before imports by vitest's preprocessor
vi.mock('../../db/queries.js', () => ({
    stmtInsertOption:      vi.fn((_db: unknown, row: unknown) => ({ _t: 'INSERT_OPTION',  row })),
    stmtUpdateOptionStatus: vi.fn(
        (_db: unknown, pool: unknown, id: unknown, status: unknown,
         buyer: unknown, block: unknown, tx: unknown) =>
            ({ _t: 'UPDATE_STATUS', pool, id, status, buyer, block, tx }),
    ),
    stmtInsertFeeEvent:    vi.fn((_db: unknown, ev: unknown) => ({ _t: 'INSERT_FEE', ev })),
}));

import { decodeBlock }            from '../../decoder/index.js';
import * as queries                from '../../db/queries.js';
import { buildEventData }          from '../helpers/eventData.js';
import { OptionStatus, FeeEventType } from '../../types/index.js';

// Typed access to mocked functions
const mockInsertOption      = vi.mocked(queries.stmtInsertOption);
const mockUpdateStatus      = vi.mocked(queries.stmtUpdateOptionStatus);
const mockInsertFee         = vi.mocked(queries.stmtInsertFeeEvent);

const mockDb   = {} as D1Database;
const POOL_HEX = '0xdeadbeef000000000000000000000000deadbeef000000000000000000000001';
const TX_ID    = '0xabc123';
const BLOCK    = 5000;

const WRITER_HEX = '0x' + 'aa'.repeat(32);
const BUYER_HEX  = '0x' + 'bb'.repeat(32);

/** Helper: build a minimal tx with a single event */
function singleEventTx(type: string, data: string) {
    return [{ id: TX_ID, events: [{ contractAddress: POOL_HEX, type, data }] }];
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
describe('decodeBlock — routing', () => {
    it('returns empty array for empty txs', () => {
        const stmts = decodeBlock(mockDb, BLOCK, [], new Set([POOL_HEX]));
        expect(stmts).toHaveLength(0);
    });

    it('ignores events from non-tracked pools', () => {
        const tx = [{ id: TX_ID, events: [{ contractAddress: '0xother', type: 'OptionWritten', data: '' }] }];
        const stmts = decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        expect(stmts).toHaveLength(0);
        expect(mockInsertOption).not.toHaveBeenCalled();
    });

    it('skips (warns) malformed events without throwing', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const tx = singleEventTx('OptionWritten', 'not-valid-base64!!!');
        // Should not throw; should log a warning
        expect(() => decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]))).not.toThrow();
        warnSpy.mockRestore();
    });

    it('returns null / empty for unknown event type', () => {
        const data = buildEventData([{ type: 'u256', value: 1n }]);
        const tx = singleEventTx('UnknownEvent', data);
        const stmts = decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        expect(stmts).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
describe('OptionWritten', () => {
    const OPTION_ID       = 42n;
    const STRIKE          = 50_000_000n;
    const UNDERLYING_AMT  = 1_000_000n;
    const PREMIUM         = 500_000n;
    const EXPIRY_BLOCK    = 6000n;
    const GRACE_PERIOD    = 144;

    function buildWrittenData() {
        return buildEventData([
            { type: 'u256',    value: OPTION_ID      },
            { type: 'address', value: WRITER_HEX      },
            { type: 'u8',      value: 0               }, // CALL
            { type: 'u256',    value: STRIKE           },
            { type: 'u256',    value: UNDERLYING_AMT   },
            { type: 'u256',    value: PREMIUM          },
            { type: 'u64',     value: EXPIRY_BLOCK     },
        ]);
    }

    it('calls stmtInsertOption with correctly decoded fields', () => {
        const tx = singleEventTx('OptionWritten', buildWrittenData());
        decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));

        expect(mockInsertOption).toHaveBeenCalledOnce();
        const [, row] = mockInsertOption.mock.calls[0]!;
        const r = row as unknown as Record<string, unknown>;
        expect(r['pool_address']).toBe(POOL_HEX);
        expect(r['option_id']).toBe(Number(OPTION_ID));
        expect(r['writer']).toBe(WRITER_HEX);
        expect(r['buyer']).toBeNull();
        expect(r['option_type']).toBe(0);
        expect(r['strike_price']).toBe(String(STRIKE));
        expect(r['underlying_amt']).toBe(String(UNDERLYING_AMT));
        expect(r['premium']).toBe(String(PREMIUM));
        expect(r['expiry_block']).toBe(Number(EXPIRY_BLOCK));
        expect(r['status']).toBe(OptionStatus.OPEN);
        expect(r['created_block']).toBe(BLOCK);
        expect(r['created_tx']).toBe(TX_ID);
    });

    it('derives grace_end_block = expiryBlock + GRACE_PERIOD_BLOCKS', () => {
        const tx = singleEventTx('OptionWritten', buildWrittenData());
        decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        const [, row] = mockInsertOption.mock.calls[0]!;
        const r = row as unknown as Record<string, unknown>;
        expect(r['grace_end_block']).toBe(Number(EXPIRY_BLOCK) + GRACE_PERIOD);
    });

    it('returns exactly 1 statement', () => {
        const tx = singleEventTx('OptionWritten', buildWrittenData());
        const stmts = decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        expect(stmts).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
describe('OptionCancelled', () => {
    function buildData(fee: bigint) {
        return buildEventData([
            { type: 'u256',    value: 7n        },
            { type: 'address', value: WRITER_HEX },
            { type: 'u256',    value: 900_000n   }, // returnAmount
            { type: 'u256',    value: fee         },
        ]);
    }

    it('emits only update statement when fee is 0', () => {
        const tx = singleEventTx('OptionCancelled', buildData(0n));
        const stmts = decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        expect(stmts).toHaveLength(1);
        expect(mockUpdateStatus).toHaveBeenCalledOnce();
        expect(mockInsertFee).not.toHaveBeenCalled();
    });

    it('emits update + fee statement when fee > 0', () => {
        const tx = singleEventTx('OptionCancelled', buildData(10_000n));
        const stmts = decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        expect(stmts).toHaveLength(2);
        expect(mockUpdateStatus).toHaveBeenCalledOnce();
        expect(mockInsertFee).toHaveBeenCalledOnce();
    });

    it('sets status to CANCELLED', () => {
        const tx = singleEventTx('OptionCancelled', buildData(0n));
        decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        const [, , , status] = mockUpdateStatus.mock.calls[0]!;
        expect(status).toBe(OptionStatus.CANCELLED);
    });

    it('records correct fee event type and amount', () => {
        const FEE = 10_000n;
        const tx = singleEventTx('OptionCancelled', buildData(FEE));
        decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        const [, ev] = mockInsertFee.mock.calls[0]!;
        const e = ev as Record<string, unknown>;
        expect(e['event_type']).toBe(FeeEventType.CANCEL);
        expect(e['amount']).toBe(String(FEE));
        expect(e['option_id']).toBe(7);
    });
});

// ---------------------------------------------------------------------------
describe('OptionPurchased', () => {
    const PREMIUM_AMT    = 500_000n;
    const WRITER_AMOUNT  = 495_000n;
    const EXPECTED_FEE   = PREMIUM_AMT - WRITER_AMOUNT;

    function buildData(premium: bigint, writerAmount: bigint) {
        return buildEventData([
            { type: 'u256',    value: 3n           },
            { type: 'address', value: BUYER_HEX     },
            { type: 'address', value: WRITER_HEX    },
            { type: 'u256',    value: premium        },
            { type: 'u256',    value: writerAmount   },
            { type: 'u64',     value: BigInt(BLOCK)  },
        ]);
    }

    it('sets buyer on the status update', () => {
        const tx = singleEventTx('OptionPurchased', buildData(PREMIUM_AMT, WRITER_AMOUNT));
        decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        const [, , , status, buyer] = mockUpdateStatus.mock.calls[0]!;
        expect(status).toBe(OptionStatus.PURCHASED);
        expect(buyer).toBe(BUYER_HEX);
    });

    it('computes fee as premium − writerAmount', () => {
        const tx = singleEventTx('OptionPurchased', buildData(PREMIUM_AMT, WRITER_AMOUNT));
        decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        const [, ev] = mockInsertFee.mock.calls[0]!;
        const e = ev as Record<string, unknown>;
        expect(e['event_type']).toBe(FeeEventType.BUY);
        expect(e['amount']).toBe(String(EXPECTED_FEE));
    });

    it('emits no fee statement when premium == writerAmount', () => {
        const tx = singleEventTx('OptionPurchased', buildData(500_000n, 500_000n));
        const stmts = decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        expect(stmts).toHaveLength(1);
        expect(mockInsertFee).not.toHaveBeenCalled();
    });

    it('clamps fee to 0 if writerAmount > premium (defensive)', () => {
        const tx = singleEventTx('OptionPurchased', buildData(100n, 200n));
        decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        // fee = '0' → no fee event emitted
        expect(mockInsertFee).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
describe('OptionExercised', () => {
    const EXERCISE_FEE = 100_000n;

    function buildData(fee: bigint) {
        return buildEventData([
            { type: 'u256',    value: 9n           },
            { type: 'address', value: BUYER_HEX     },
            { type: 'address', value: WRITER_HEX    },
            { type: 'u8',      value: 0              }, // CALL
            { type: 'u256',    value: 1_000_000n     }, // underlyingAmount
            { type: 'u256',    value: 50_000_000n    }, // strikeValue
            { type: 'u256',    value: fee             },
        ]);
    }

    it('sets status to EXERCISED', () => {
        const tx = singleEventTx('OptionExercised', buildData(EXERCISE_FEE));
        decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        const [, , , status] = mockUpdateStatus.mock.calls[0]!;
        expect(status).toBe(OptionStatus.EXERCISED);
    });

    it('records exercise fee event', () => {
        const tx = singleEventTx('OptionExercised', buildData(EXERCISE_FEE));
        decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        expect(mockInsertFee).toHaveBeenCalledOnce();
        const [, ev] = mockInsertFee.mock.calls[0]!;
        const e = ev as Record<string, unknown>;
        expect(e['event_type']).toBe(FeeEventType.EXERCISE);
        expect(e['amount']).toBe(String(EXERCISE_FEE));
    });

    it('emits no fee event when exerciseFee is 0', () => {
        const tx = singleEventTx('OptionExercised', buildData(0n));
        const stmts = decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        expect(stmts).toHaveLength(1);
        expect(mockInsertFee).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
describe('OptionExpired (settle)', () => {
    function buildData() {
        return buildEventData([
            { type: 'u256',    value: 11n           },
            { type: 'address', value: WRITER_HEX     },
            { type: 'u256',    value: 2_000_000n     }, // collateralAmount
        ]);
    }

    it('sets status to SETTLED', () => {
        const tx = singleEventTx('OptionExpired', buildData());
        decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        const [, , , status] = mockUpdateStatus.mock.calls[0]!;
        expect(status).toBe(OptionStatus.SETTLED);
    });

    it('emits exactly 1 statement (no fee event)', () => {
        const tx = singleEventTx('OptionExpired', buildData());
        const stmts = decodeBlock(mockDb, BLOCK, tx, new Set([POOL_HEX]));
        expect(stmts).toHaveLength(1);
        expect(mockInsertFee).not.toHaveBeenCalled();
    });
});
