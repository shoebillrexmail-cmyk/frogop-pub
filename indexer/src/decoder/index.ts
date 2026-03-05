/**
 * Event decoder — plain async module (no worker_threads needed in Workers).
 *
 * Receives block data, decodes OptionsPool events, returns D1PreparedStatements
 * for batching. Caller commits the batch atomically.
 *
 * Event data encoding: OPNet RPC returns event data as base64-encoded bytes
 * written by AssemblyScript BytesWriter (big-endian, no padding).
 * Field order is derived from contract source (src/contracts/pool/contract.ts).
 */
import type { TxEvent, OptionRow, FeeEventRow, SwapEventRow } from '../types/index.js';
import { OptionStatus, FeeEventType } from '../types/index.js';
import {
    stmtInsertOption,
    stmtUpdateOptionStatus,
    stmtInsertFeeEvent,
    stmtInsertSwapEvent,
    stmtUpdateOptionBuyer,
    stmtInsertOptionTransfer,
} from '../db/queries.js';

const EV_WRITTEN   = 'OptionWritten';
const EV_CANCELLED = 'OptionCancelled';
const EV_PURCHASED = 'OptionPurchased';
const EV_EXERCISED = 'OptionExercised';
// settle() emits OptionExpiredEvent with type string 'OptionExpired', not 'OptionSettled'
const EV_SETTLED   = 'OptionExpired';
const EV_TRANSFERRED = 'OptionTransferred';
// There is no FeeCollected event — fee data is embedded inline in each action event
const EV_SWAP_EXECUTED = 'SwapExecuted';

// Phase 2: BTC pool events
const EV_OPTION_RESERVED         = 'OptionReserved';
const EV_RESERVATION_EXECUTED    = 'ReservationExecuted';
const EV_RESERVATION_CANCELLED   = 'ReservationCancelled';
const EV_OPTION_WRITTEN_BTC      = 'OptionWrittenBtc';
const EV_BTC_CLAIMABLE           = 'BtcClaimable';

// Mirror of GRACE_PERIOD_BLOCKS in src/contracts/pool/contract.ts
const GRACE_PERIOD_BLOCKS = 144;

/**
 * Decode all events for a single block into an array of D1 statements to batch.
 * @param swapLabelMap - hex address → token label ("MOTO", "PILL") for NativeSwap contracts.
 *   Events from these addresses are decoded as SwapExecuted. Optional for backwards compat.
 */
export function decodeBlock(
    db: D1Database,
    blockNumber: number,
    txs: Array<{ id: string; events: TxEvent[] }>,
    trackedPools: Set<string>,
    swapLabelMap: Map<string, string> = new Map(),
): D1PreparedStatement[] {
    const stmts: D1PreparedStatement[] = [];

    for (const tx of txs) {
        for (const event of tx.events) {
            // Normalize contract address to lowercase for consistent DB storage
            const normalizedEvent = { ...event, contractAddress: event.contractAddress.toLowerCase() };

            // Check NativeSwap contracts (SwapExecuted events)
            const tokenLabel = swapLabelMap.get(normalizedEvent.contractAddress);
            if (tokenLabel && normalizedEvent.type === EV_SWAP_EXECUTED) {
                try {
                    const s = handleSwapExecuted(db, normalizedEvent, blockNumber, tx.id, tokenLabel);
                    if (s) stmts.push(s);
                } catch (err) {
                    console.warn(
                        `[decoder] Skipping malformed SwapExecuted block=${blockNumber} tx=${tx.id}:`,
                        err,
                    );
                }
                continue;
            }

            if (!trackedPools.has(normalizedEvent.contractAddress)) continue;
            try {
                const s = decodeEvent(db, normalizedEvent, blockNumber, tx.id);
                if (s) stmts.push(...s);
            } catch (err) {
                console.warn(
                    `[decoder] Skipping malformed event type=${normalizedEvent.type} block=${blockNumber} tx=${tx.id}:`,
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
        case EV_SETTLED:      return handleSettled(db, event, blockNumber, txId);
        case EV_TRANSFERRED: return handleTransferred(db, event, blockNumber, txId);
        // Phase 2: BTC pool events
        case EV_OPTION_RESERVED:       return handleOptionReserved(db, event, blockNumber, txId);
        case EV_RESERVATION_EXECUTED:  return handleReservationExecuted(db, event, blockNumber, txId);
        case EV_RESERVATION_CANCELLED: return handleReservationCancelled(db, event, blockNumber, txId);
        case EV_OPTION_WRITTEN_BTC:    return handleWrittenBtc(db, event, blockNumber, txId);
        case EV_BTC_CLAIMABLE:         return null; // Informational event, no DB update needed
        default:                       return null;
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
        { name: 'optionId',        type: 'u256'    },
        { name: 'writer',          type: 'address' },
        { name: 'optionType',      type: 'u8'      },
        { name: 'strikePrice',     type: 'u256'    },
        { name: 'underlyingAmount', type: 'u256'   },
        { name: 'premium',         type: 'u256'    },
        { name: 'expiryBlock',     type: 'u64'     },
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
    const f = parseEventData(event.data, [
        { name: 'optionId',     type: 'u256'    },
        { name: 'writer',       type: 'address' },
        { name: 'returnAmount', type: 'u256'    },
        { name: 'fee',          type: 'u256'    },
    ]);
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
    const f = parseEventData(event.data, [
        { name: 'optionId',     type: 'u256'    },
        { name: 'buyer',        type: 'address' },
        { name: 'writer',       type: 'address' },
        { name: 'premium',      type: 'u256'    },
        { name: 'writerAmount', type: 'u256'    },
        { name: 'currentBlock', type: 'u64'     },
    ]);
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
    const f = parseEventData(event.data, [
        { name: 'optionId',         type: 'u256'    },
        { name: 'buyer',            type: 'address' },
        { name: 'writer',           type: 'address' },
        { name: 'optionType',       type: 'u8'      },
        { name: 'underlyingAmount', type: 'u256'    },
        { name: 'strikeValue',      type: 'u256'    },
        { name: 'exerciseFee',      type: 'u256'    },
    ]);
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
    const f = parseEventData(event.data, [
        { name: 'optionId',        type: 'u256'    },
        { name: 'writer',          type: 'address' },
        { name: 'collateralAmount', type: 'u256'   },
    ]);
    if (!f) return [];
    return [stmtUpdateOptionStatus(db, event.contractAddress, Number(f['optionId']), OptionStatus.EXPIRED, null, blockNumber, txId)];
}

function handleTransferred(
    db: D1Database,
    event: TxEvent,
    blockNumber: number,
    txId: string,
): D1PreparedStatement[] {
    // OptionTransferred: [optionId U256, from Address, to Address]
    const f = parseEventData(event.data, [
        { name: 'optionId', type: 'u256'    },
        { name: 'from',     type: 'address' },
        { name: 'to',       type: 'address' },
    ]);
    if (!f) return [];
    const optionId = Number(f['optionId']);
    return [
        stmtUpdateOptionBuyer(db, event.contractAddress, optionId, f['to'] ?? '', blockNumber, txId),
        stmtInsertOptionTransfer(db, {
            pool_address: event.contractAddress,
            option_id:    optionId,
            from_address: f['from'] ?? '',
            to_address:   f['to'] ?? '',
            block_number: blockNumber,
            tx_id:        txId,
        }),
    ];
}

// ---------------------------------------------------------------------------
// Phase 2: BTC pool event handlers
// ---------------------------------------------------------------------------

function handleOptionReserved(
    db: D1Database,
    event: TxEvent,
    blockNumber: number,
    txId: string,
): D1PreparedStatement[] {
    // OptionReserved: [reservationId U256, optionId U256, buyer ADDRESS,
    //   btcAmount U256, csvScriptHash ADDRESS, expiryBlock U64]
    const f = parseEventData(event.data, [
        { name: 'reservationId',  type: 'u256'    },
        { name: 'optionId',       type: 'u256'    },
        { name: 'buyer',          type: 'address' },
        { name: 'btcAmount',      type: 'u256'    },
        { name: 'csvScriptHash',  type: 'address' },
        { name: 'expiryBlock',    type: 'u64'     },
    ]);
    if (!f) return [];

    // Mark option as RESERVED (status 5)
    return [
        stmtUpdateOptionStatus(db, event.contractAddress, Number(f['optionId']), OptionStatus.RESERVED, null, blockNumber, txId),
    ];
}

function handleReservationExecuted(
    db: D1Database,
    event: TxEvent,
    blockNumber: number,
    txId: string,
): D1PreparedStatement[] {
    // ReservationExecuted: [reservationId U256, optionId U256, buyer ADDRESS]
    const f = parseEventData(event.data, [
        { name: 'reservationId', type: 'u256'    },
        { name: 'optionId',      type: 'u256'    },
        { name: 'buyer',         type: 'address' },
    ]);
    if (!f) return [];

    // Transition RESERVED → PURCHASED, set buyer
    return [
        stmtUpdateOptionStatus(db, event.contractAddress, Number(f['optionId']), OptionStatus.PURCHASED, f['buyer'] ?? null, blockNumber, txId),
        stmtUpdateOptionBuyer(db, event.contractAddress, Number(f['optionId']), f['buyer'] ?? '', blockNumber, txId),
    ];
}

function handleReservationCancelled(
    db: D1Database,
    event: TxEvent,
    blockNumber: number,
    txId: string,
): D1PreparedStatement[] {
    // ReservationCancelled: [reservationId U256, optionId U256]
    const f = parseEventData(event.data, [
        { name: 'reservationId', type: 'u256' },
        { name: 'optionId',      type: 'u256' },
    ]);
    if (!f) return [];

    // Transition RESERVED → OPEN (reservation expired, option available again)
    return [
        stmtUpdateOptionStatus(db, event.contractAddress, Number(f['optionId']), OptionStatus.OPEN, null, blockNumber, txId),
    ];
}

function handleWrittenBtc(
    db: D1Database,
    event: TxEvent,
    blockNumber: number,
    txId: string,
): D1PreparedStatement[] {
    // OptionWrittenBtc: [optionId U256, writer ADDRESS, optionType U8,
    //   strikePrice U256, underlyingAmount U256, premium U256, expiryBlock U64,
    //   btcCollateralAmount U256, escrowScriptHash ADDRESS]
    const f = parseEventData(event.data, [
        { name: 'optionId',            type: 'u256'    },
        { name: 'writer',              type: 'address' },
        { name: 'optionType',          type: 'u8'      },
        { name: 'strikePrice',         type: 'u256'    },
        { name: 'underlyingAmount',    type: 'u256'    },
        { name: 'premium',             type: 'u256'    },
        { name: 'expiryBlock',         type: 'u64'     },
        { name: 'btcCollateralAmount', type: 'u256'    },
        { name: 'escrowScriptHash',    type: 'address' },
    ]);
    if (!f) return [];

    // Insert option same as regular write, with BTC collateral info in premium field
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
        grace_end_block: Number(f['expiryBlock']) + GRACE_PERIOD_BLOCKS,
        status:          OptionStatus.OPEN,
        created_block:   blockNumber,
        created_tx:      txId,
        updated_block:   null,
        updated_tx:      null,
    };
    return [stmtInsertOption(db, row)];
}

// ---------------------------------------------------------------------------
// NativeSwap event handler
// ---------------------------------------------------------------------------

function handleSwapExecuted(
    db: D1Database,
    event: TxEvent,
    blockNumber: number,
    txId: string,
    tokenLabel: string,
): D1PreparedStatement | null {
    // SwapExecuted: [buyer ADDRESS, amountIn U64, amountOut U256, totalFees U256]
    const f = parseEventData(event.data, [
        { name: 'buyer',     type: 'address' },
        { name: 'amountIn',  type: 'u64'     },
        { name: 'amountOut', type: 'u256'    },
        { name: 'totalFees', type: 'u256'    },
    ]);
    if (!f) return null;

    return stmtInsertSwapEvent(db, {
        token:       tokenLabel,
        block_number: blockNumber,
        tx_id:       txId,
        buyer:       f['buyer'] ?? '',
        sats_in:     f['amountIn'] ?? '0',
        tokens_out:  f['amountOut'] ?? '0',
        fees:        f['totalFees'] ?? '0',
    });
}

// ---------------------------------------------------------------------------
// Binary reader (mirrors AssemblyScript BytesWriter — big-endian, no padding)
// ---------------------------------------------------------------------------

type FieldType = 'u8' | 'u64' | 'u256' | 'address';
type FieldDef  = { name: string; type: FieldType };

class Reader {
    private pos = 0;
    constructor(private readonly buf: Uint8Array) {}

    private next(): number {
        if (this.pos >= this.buf.length) throw new Error('Buffer underflow');
        return this.buf[this.pos++] as number;
    }

    readU8(): number {
        return this.next();
    }

    readU64(): bigint {
        let v = 0n;
        for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(this.next());
        return v;
    }

    readU256(): bigint {
        let v = 0n;
        for (let i = 0; i < 32; i++) v = (v << 8n) | BigInt(this.next());
        return v;
    }

    readAddress(): string {
        const hex = Array.from(this.buf.slice(this.pos, this.pos + 32))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        this.pos += 32;
        return '0x' + hex;
    }
}

/**
 * Decode base64-encoded event data into a named-field map.
 * Returns null on any parse error so callers can safely skip malformed events.
 * OPNet RPC encodes event data as base64; fields are written big-endian by
 * AssemblyScript BytesWriter in the order listed in `fields`.
 */
function parseEventData(
    data: string,
    fields: FieldDef[],
): Record<string, string | undefined> | null {
    if (!data) return null;
    try {
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const reader = new Reader(bytes);
        const result: Record<string, string> = {};
        for (const field of fields) {
            switch (field.type) {
                case 'u256':    result[field.name] = reader.readU256().toString();   break;
                case 'u64':     result[field.name] = reader.readU64().toString();    break;
                case 'u8':      result[field.name] = String(reader.readU8());        break;
                case 'address': result[field.name] = reader.readAddress();           break;
            }
        }
        return result;
    } catch {
        return null;
    }
}
