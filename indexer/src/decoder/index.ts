/**
 * Event decoder — plain async module (no worker_threads needed in Workers).
 *
 * Receives block data, decodes OptionsPool events, returns D1PreparedStatements
 * for batching. Caller commits the batch atomically.
 *
 * NOTE: parseEventData() is a stub pending contract event ABI confirmation.
 * The contract encodes events with AssemblyScript BytesWriter. Once field order
 * is confirmed from the contract source, replace the stub with BytesReader decoding.
 */
import type { TxEvent, OptionRow, FeeEventRow } from '../types/index.js';
import { OptionStatus, FeeEventType } from '../types/index.js';
import {
    stmtInsertOption,
    stmtUpdateOptionStatus,
    stmtInsertFeeEvent,
} from '../db/queries.js';

const EV_WRITTEN   = 'OptionWritten';
const EV_CANCELLED = 'OptionCancelled';
const EV_PURCHASED = 'OptionPurchased';
const EV_EXERCISED = 'OptionExercised';
// settle() emits OptionExpiredEvent with type string 'OptionExpired', not 'OptionSettled'
const EV_SETTLED   = 'OptionExpired';
// There is no FeeCollected event — fee data is embedded inline in each action event

// Mirror of GRACE_PERIOD_BLOCKS in src/contracts/pool/contract.ts
const GRACE_PERIOD_BLOCKS = 144;

/** Decode all events for a single block into an array of D1 statements to batch. */
export function decodeBlock(
    db: D1Database,
    blockNumber: number,
    txs: Array<{ id: string; events: TxEvent[] }>,
    trackedPools: Set<string>,
): D1PreparedStatement[] {
    const stmts: D1PreparedStatement[] = [];

    for (const tx of txs) {
        for (const event of tx.events) {
            if (!trackedPools.has(event.contractAddress)) continue;
            try {
                const s = decodeEvent(db, event, blockNumber, tx.id);
                if (s) stmts.push(...s);
            } catch (err) {
                console.warn(
                    `[decoder] Skipping malformed event type=${event.type} block=${blockNumber} tx=${tx.id}:`,
                    err,
                );
            }
        }
    }

    return stmts;
}

function decodeEvent(
    db: D1Database,
    event: TxEvent,
    blockNumber: number,
    txId: string,
): D1PreparedStatement[] | null {
    switch (event.type) {
        case EV_WRITTEN:   return handleWritten(db, event, blockNumber, txId);
        case EV_CANCELLED: return handleCancelled(db, event, blockNumber, txId);
        case EV_PURCHASED: return handlePurchased(db, event, blockNumber, txId);
        case EV_EXERCISED: return handleExercised(db, event, blockNumber, txId);
        case EV_SETTLED:   return handleSettled(db, event, blockNumber, txId);
        default:           return null;
    }
}

// ---------------------------------------------------------------------------
// Per-event handlers
// ---------------------------------------------------------------------------

function handleWritten(
    db: D1Database,
    event: TxEvent,
    blockNumber: number,
    txId: string,
): D1PreparedStatement[] {
    // OptionWritten: [optionId U256, writer Address, optionType U8,
    //   strikePrice U256, underlyingAmount U256, premium U256, expiryBlock U64]
    // Note: graceEndBlock is NOT emitted — it is derived (expiryBlock + GRACE_PERIOD_BLOCKS)
    const f = parseEventData(event.data, [
        'optionId', 'writer', 'optionType', 'strikePrice',
        'underlyingAmount', 'premium', 'expiryBlock',
    ]);
    if (!f) return [];

    const row: OptionRow = {
        pool_address:    event.contractAddress,
        option_id:       Number(f['optionId']),
        writer:          f['writer'] ?? '',
        buyer:           null,
        option_type:     Number(f['optionType']),
        strike_price:    f['strikePrice'] ?? '0',
        underlying_amt:  f['underlyingAmount'] ?? '0',
        premium:         f['premium'] ?? '0',
        expiry_block:    Number(f['expiryBlock']),
        // graceEndBlock is not in the event — derive from expiryBlock + GRACE_PERIOD_BLOCKS
        grace_end_block: Number(f['expiryBlock']) + GRACE_PERIOD_BLOCKS,
        status:          OptionStatus.OPEN,
        created_block:   blockNumber,
        created_tx:      txId,
        updated_block:   null,
        updated_tx:      null,
    };
    return [stmtInsertOption(db, row)];
}

function handleCancelled(
    db: D1Database,
    event: TxEvent,
    blockNumber: number,
    txId: string,
): D1PreparedStatement[] {
    // OptionCancelled: [optionId U256, writer Address, returnAmount U256, fee U256]
    const f = parseEventData(event.data, ['optionId', 'writer', 'returnAmount', 'fee']);
    if (!f) return [];
    const optionId = Number(f['optionId']);
    const stmts = [
        stmtUpdateOptionStatus(db, event.contractAddress, optionId, OptionStatus.CANCELLED, null, blockNumber, txId),
    ];
    const fee = f['fee'] ?? '0';
    if (fee !== '0') {
        stmts.push(stmtInsertFeeEvent(db, {
            pool_address: event.contractAddress, option_id: optionId,
            event_type: FeeEventType.CANCEL, fee_recipient: event.contractAddress,
            token: '', amount: fee, block_number: blockNumber, tx_id: txId,
        }));
    }
    return stmts;
}

function handlePurchased(
    db: D1Database,
    event: TxEvent,
    blockNumber: number,
    txId: string,
): D1PreparedStatement[] {
    // OptionPurchased: [optionId U256, buyer Address, writer Address,
    //   premium U256, writerAmount U256, currentBlock U64]
    // protocolFee is not a dedicated field — compute as premium - writerAmount
    const f = parseEventData(event.data, ['optionId', 'buyer', 'writer', 'premium', 'writerAmount', 'currentBlock']);
    if (!f) return [];
    const optionId = Number(f['optionId']);
    const stmts = [
        stmtUpdateOptionStatus(db, event.contractAddress, optionId, OptionStatus.PURCHASED, f['buyer'] ?? null, blockNumber, txId),
    ];
    const premium = BigInt(f['premium'] ?? '0');
    const writerAmount = BigInt(f['writerAmount'] ?? '0');
    const fee = premium >= writerAmount ? String(premium - writerAmount) : '0';
    if (fee !== '0') {
        stmts.push(stmtInsertFeeEvent(db, {
            pool_address: event.contractAddress, option_id: optionId,
            event_type: FeeEventType.BUY, fee_recipient: event.contractAddress,
            token: '', amount: fee, block_number: blockNumber, tx_id: txId,
        }));
    }
    return stmts;
}

function handleExercised(
    db: D1Database,
    event: TxEvent,
    blockNumber: number,
    txId: string,
): D1PreparedStatement[] {
    // OptionExercised: [optionId U256, buyer Address, writer Address,
    //   optionType U8, underlyingAmount U256, strikeValue U256, exerciseFee U256]
    const f = parseEventData(event.data, ['optionId', 'buyer', 'writer', 'optionType', 'underlyingAmount', 'strikeValue', 'exerciseFee']);
    if (!f) return [];
    const optionId = Number(f['optionId']);
    const stmts = [
        stmtUpdateOptionStatus(db, event.contractAddress, optionId, OptionStatus.EXERCISED, null, blockNumber, txId),
    ];
    const fee = f['exerciseFee'] ?? '0';
    if (fee !== '0') {
        stmts.push(stmtInsertFeeEvent(db, {
            pool_address: event.contractAddress, option_id: optionId,
            event_type: FeeEventType.EXERCISE, fee_recipient: event.contractAddress,
            token: '', amount: fee, block_number: blockNumber, tx_id: txId,
        }));
    }
    return stmts;
}

function handleSettled(
    db: D1Database,
    event: TxEvent,
    blockNumber: number,
    txId: string,
): D1PreparedStatement[] {
    // OptionExpired (from settle()): [optionId U256, writer Address, collateralAmount U256]
    const f = parseEventData(event.data, ['optionId', 'writer', 'collateralAmount']);
    if (!f) return [];
    return [stmtUpdateOptionStatus(db, event.contractAddress, Number(f['optionId']), OptionStatus.SETTLED, null, blockNumber, txId)];
}

// ---------------------------------------------------------------------------
// Hex decode stub
// ---------------------------------------------------------------------------
// TODO (Story 7.3): replace with BytesReader from @btc-vision/transaction.
// Contract events are encoded with AssemblyScript BytesWriter in field order.
// Once contract event source is confirmed, implement real decoding here.
// Until then, returns null so handlers emit no DB writes (safe no-op).
function parseEventData(
    _data: string,
    _fields: string[],
): Record<string, string | undefined> | null {
    return null;
}
