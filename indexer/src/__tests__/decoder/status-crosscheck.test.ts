/**
 * Cross-validation: indexer OptionStatus enum MUST match the contract constants.
 *
 * Contract source of truth (OptionsPool):
 *   OPEN=0, PURCHASED=1, EXERCISED=2, EXPIRED=3, CANCELLED=4
 *
 * This test would have caught the previous mismatch where the indexer
 * had CANCELLED=3 and SETTLED=4 instead of EXPIRED=3 and CANCELLED=4.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../db/queries.js', () => ({
    stmtInsertOption:       vi.fn((_db: unknown, row: unknown) => ({ _t: 'INSERT_OPTION',  row })),
    stmtUpdateOptionStatus: vi.fn(
        (_db: unknown, pool: unknown, id: unknown, status: unknown,
         buyer: unknown, block: unknown, tx: unknown) =>
            ({ _t: 'UPDATE_STATUS', pool, id, status, buyer, block, tx }),
    ),
    stmtInsertFeeEvent:       vi.fn((_db: unknown, ev: unknown) => ({ _t: 'INSERT_FEE', ev })),
    stmtInsertSwapEvent:      vi.fn((_db: unknown, row: unknown) => ({ _t: 'INSERT_SWAP', row })),
    stmtUpdateOptionBuyer:    vi.fn((_db: unknown, ...a: unknown[]) => ({ _t: 'UPDATE_BUYER', a })),
    stmtInsertOptionTransfer: vi.fn((_db: unknown, row: unknown) => ({ _t: 'INSERT_TRANSFER', row })),
}));

import { OptionStatus } from '../../types/index.js';
import { decodeBlock } from '../../decoder/index.js';
import * as queries from '../../db/queries.js';
import { buildEventData } from '../helpers/eventData.js';

const mockUpdateStatus = vi.mocked(queries.stmtUpdateOptionStatus);
const mockDb   = {} as D1Database;
const POOL_HEX = '0xdeadbeef000000000000000000000000deadbeef000000000000000000000001';
const TX_ID    = '0xabc123';
const BLOCK    = 5000;
const WRITER_HEX = '0x' + 'aa'.repeat(32);

function singleEventTx(type: string, data: string) {
    return [{ id: TX_ID, events: [{ contractAddress: POOL_HEX, type, data }] }];
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('OptionStatus enum matches contract constants', () => {
    it('OPEN = 0', () => expect(OptionStatus.OPEN).toBe(0));
    it('PURCHASED = 1', () => expect(OptionStatus.PURCHASED).toBe(1));
    it('EXERCISED = 2', () => expect(OptionStatus.EXERCISED).toBe(2));
    it('EXPIRED = 3', () => expect(OptionStatus.EXPIRED).toBe(3));
    it('CANCELLED = 4', () => expect(OptionStatus.CANCELLED).toBe(4));

    it('RESERVED = 5', () => expect(OptionStatus.RESERVED).toBe(5));

    it('enum has exactly 6 members', () => {
        const members = Object.values(OptionStatus).filter(v => typeof v === 'number');
        expect(members).toHaveLength(6);
    });
});

describe('Decoder maps events to correct status codes', () => {
    it('OptionCancelled event → status 4 (CANCELLED)', () => {
        const data = buildEventData([
            { type: 'u256',    value: 7n        },
            { type: 'address', value: WRITER_HEX },
            { type: 'u256',    value: 900_000n   },
            { type: 'u256',    value: 0n         },
        ]);
        decodeBlock(mockDb, BLOCK, singleEventTx('OptionCancelled', data), new Set([POOL_HEX]));
        const [, , , status] = mockUpdateStatus.mock.calls[0]!;
        expect(status).toBe(4);
        expect(status).toBe(OptionStatus.CANCELLED);
    });

    it('OptionExpired (settle) event → status 3 (EXPIRED)', () => {
        const data = buildEventData([
            { type: 'u256',    value: 11n         },
            { type: 'address', value: WRITER_HEX   },
            { type: 'u256',    value: 2_000_000n   },
        ]);
        decodeBlock(mockDb, BLOCK, singleEventTx('OptionExpired', data), new Set([POOL_HEX]));
        const [, , , status] = mockUpdateStatus.mock.calls[0]!;
        expect(status).toBe(3);
        expect(status).toBe(OptionStatus.EXPIRED);
    });
});
