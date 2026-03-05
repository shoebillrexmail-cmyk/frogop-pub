/**
 * OptionsPoolBtcQuote (Type 1) - OP20 underlying, BTC quote
 *
 * Premium and strike are denominated in BTC (satoshis).
 * Underlying collateral is OP20 tokens.
 *
 * Uses two-phase commit for BTC payments:
 * 1. reserveOption() — locks option, calculates BTC amount
 * 2. executeReservation() — verifies BTC UTXO output, completes purchase
 *
 * Exercise (CALL): buyer pays BTC strike via UTXO, receives OP20 underlying
 * Exercise (PUT): same as base (OP20 collateral returned)
 * Cancel/Settle: same as base (OP20 collateral)
 *
 * HIGH-6: OPNet Transaction Output Model
 * ----------------------------------------
 * On OPNet, smart contract calls are embedded in Bitcoin transactions via
 * Tapscript-encoded calldata. The same Bitcoin transaction that invokes the
 * contract method also carries standard Bitcoin outputs (UTXOs). This means
 * `Blockchain.tx.outputs` contains the BTC outputs of the calling transaction.
 * For CALL exercise, the buyer constructs a Bitcoin transaction that:
 *   (a) includes the exercise contract call in a Tapscript input, AND
 *   (b) includes a P2WSH output paying the strike amount to the writer's CSV address.
 * Both happen atomically within the same Bitcoin transaction.
 */

import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    Revert,
    SafeMath,
    StoredAddress,
    StoredU256,
    EMPTY_BUFFER,
    encodeSelector,
} from '@btc-vision/btc-runtime/runtime';
import { sha256 } from '@btc-vision/btc-runtime/runtime/env/global';

import {
    CALL,
    OPEN,
    PURCHASED,
    EXERCISED,
    EXPIRED,
    CANCELLED,
    RESERVED,
    GRACE_PERIOD_BLOCKS,
    MAX_EXPIRY_BLOCKS,
    CANCEL_FEE_BPS,
    BUY_FEE_BPS,
    EXERCISE_FEE_BPS,
    PRECISION,
    RESERVATION_EXPIRY_BLOCKS,
    EXTENDED_SLOTS_POINTER,
} from './constants';

import { Option } from './storage';

import {
    OptionWrittenEvent,
    OptionCancelledEvent,
    OptionPurchasedEvent,
    OptionExercisedEvent,
    OptionExpiredEvent,
    OptionReservedEvent,
    ReservationExecutedEvent,
    ReservationCancelledEvent,
    OptionRestoredEvent,
} from './events';

import { OptionsPoolBase } from './base';
import {
    ReservationStorage,
    Reservation,
    RESERVATION_PENDING,
    RESERVATION_EXECUTED,
} from './reservation-storage';

// =============================================================================
// ADDITIONAL STORAGE POINTERS
// =============================================================================

const BRIDGE_POINTER: u16 = Blockchain.nextPointer;
const NEXT_RESERVATION_ID_POINTER: u16 = Blockchain.nextPointer;
const RESERVATIONS_BASE_POINTER: u16 = Blockchain.nextPointer;

/** Extended option slot indices */
const SLOT_CSV_HASH: u8 = 9;

// =============================================================================
// CONTRACT
// =============================================================================

@final
export class OptionsPoolBtcQuote extends OptionsPoolBase {

    private _bridge: StoredAddress | null = null;
    private _nextReservationId: StoredU256 | null = null;
    private _reservations: ReservationStorage | null = null;

    private get bridgeStore(): StoredAddress {
        if (!this._bridge) {
            this._bridge = new StoredAddress(BRIDGE_POINTER);
        }
        return this._bridge!;
    }

    private get nextReservationId(): StoredU256 {
        if (!this._nextReservationId) {
            this._nextReservationId = new StoredU256(NEXT_RESERVATION_ID_POINTER, EMPTY_BUFFER);
        }
        return this._nextReservationId!;
    }

    private get reservations(): ReservationStorage {
        if (!this._reservations) {
            this._reservations = new ReservationStorage(RESERVATIONS_BASE_POINTER);
        }
        return this._reservations!;
    }

    // -------------------------------------------------------------------------
    // DEPLOYMENT
    // -------------------------------------------------------------------------

    public override onDeployment(calldata: Calldata): void {
        super.onDeployment(calldata);

        const bridgeAddr = calldata.readAddress();
        if (bridgeAddr.equals(Address.zero())) {
            throw new Revert('Bridge address cannot be zero');
        }
        this.bridgeStore.value = bridgeAddr;
    }

    // -------------------------------------------------------------------------
    // VIEW: getBridge
    // -------------------------------------------------------------------------

    @view
    @method('bridge')
    @returns({ name: 'address', type: ABIDataTypes.ADDRESS })
    public getBridge(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeAddress(this.bridgeStore.value);
        return writer;
    }

    // -------------------------------------------------------------------------
    // VIEW: getReservation
    // -------------------------------------------------------------------------

    @view
    @method({ name: 'reservationId', type: ABIDataTypes.UINT256 })
    public getReservation(calldata: Calldata): BytesWriter {
        const reservationId = calldata.readU256();

        if (!this.reservations.exists(reservationId)) {
            throw new Revert('Reservation not found');
        }

        const r = this.reservations.get(reservationId);

        const writer = new BytesWriter(32 * 4 + 32 + 8 + 1);
        writer.writeU256(r.id);
        writer.writeU256(r.optionId);
        writer.writeAddress(r.buyer);
        writer.writeU256(r.btcAmount);
        writer.writeBytes(r.csvScriptHash);
        writer.writeU64(r.expiryBlock);
        writer.writeU8(r.status);

        return writer;
    }

    // -------------------------------------------------------------------------
    // WRITE OPTION (same as type 0 — OP20 collateral)
    // -------------------------------------------------------------------------

    @nonReentrant
    @method(
        { name: 'optionType', type: ABIDataTypes.UINT8 },
        { name: 'strikePrice', type: ABIDataTypes.UINT256 },
        { name: 'expiryBlock', type: ABIDataTypes.UINT64 },
        { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
        { name: 'premium', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'optionId', type: ABIDataTypes.UINT256 })
    @emit('OptionWritten')
    public writeOption(calldata: Calldata): BytesWriter {
        const optionType = calldata.readU8();
        const strikePrice = calldata.readU256();
        const expiryBlock = calldata.readU64();
        const underlyingAmount = calldata.readU256();
        const premium = calldata.readU256();
        const writer = Blockchain.tx.sender;

        if (optionType > 1) {
            throw new Revert('Invalid option type');
        }
        if (strikePrice == u256.Zero || underlyingAmount == u256.Zero || premium == u256.Zero) {
            throw new Revert('Values must be > 0');
        }

        const currentBlock = Blockchain.block.number;
        if (expiryBlock <= currentBlock) {
            throw new Revert('Expiry in past');
        }
        if (expiryBlock > currentBlock + MAX_EXPIRY_BLOCKS) {
            throw new Revert('Expiry too far');
        }

        let collateralToken: Address;
        let collateralAmount: u256;

        if (optionType == CALL) {
            collateralToken = this._underlying.value;
            collateralAmount = underlyingAmount;
        } else {
            collateralToken = this._premiumToken.value;
            collateralAmount = SafeMath.div(SafeMath.mul(strikePrice, underlyingAmount), PRECISION);
        }

        const optionId = this._nextId.value;
        this._nextId.value = SafeMath.add(optionId, u256.One);

        const option = new Option();
        option.id = optionId;
        option.writer = writer;
        option.buyer = Address.zero();
        option.strikePrice = strikePrice;
        option.underlyingAmount = underlyingAmount;
        option.premium = premium;
        option.expiryBlock = expiryBlock;
        option.createdBlock = currentBlock;
        option.optionType = optionType;
        option.status = OPEN;

        this.options.set(optionId, option);

        this._transferFrom(collateralToken, writer, Blockchain.contractAddress, collateralAmount);

        const event = new BytesWriter(200);
        event.writeU256(optionId);
        event.writeAddress(writer);
        event.writeU8(optionType);
        event.writeU256(strikePrice);
        event.writeU256(underlyingAmount);
        event.writeU256(premium);
        event.writeU64(expiryBlock);
        Blockchain.emit(new OptionWrittenEvent(event));

        const result = new BytesWriter(32);
        result.writeU256(optionId);
        return result;
    }

    // -------------------------------------------------------------------------
    // RESERVE OPTION — Phase 1 of two-phase BTC commit
    // -------------------------------------------------------------------------

    @nonReentrant
    @method({ name: 'optionId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'reservationId', type: ABIDataTypes.UINT256 })
    @emit('OptionReserved')
    public reserveOption(calldata: Calldata): BytesWriter {
        const optionId = calldata.readU256();

        if (!this.options.exists(optionId)) {
            throw new Revert('Option not found');
        }

        const option = this.options.get(optionId);
        const buyer = Blockchain.tx.sender;

        if (option.status != OPEN) {
            throw new Revert('Not open');
        }

        const currentBlock = Blockchain.block.number;
        if (currentBlock >= option.expiryBlock) {
            throw new Revert('Already expired');
        }

        // HIGH-5: Ensure option doesn't expire before reservation window ends
        if (option.expiryBlock <= currentBlock + RESERVATION_EXPIRY_BLOCKS) {
            throw new Revert('Option expires before reservation window');
        }

        if (buyer.equals(option.writer)) {
            throw new Revert('Writer cannot buy own option');
        }

        // Query bridge for BTC price of premium token
        const btcPrice = this.queryBtcPrice(this._premiumToken.value);

        // Calculate BTC amount: (premium * btcPrice) / PRECISION
        const btcAmount = SafeMath.div(SafeMath.mul(option.premium, btcPrice), PRECISION);
        if (btcAmount.isZero()) {
            throw new Revert('BTC amount too small');
        }

        // MED-1: Guard u256→u64 truncation
        if (btcAmount.hi1 != 0 || btcAmount.hi2 != 0 || btcAmount.lo2 != 0) {
            throw new Revert('BTC amount overflows u64');
        }

        // CRIT-2: Use registered pubkey instead of fake derived key
        const writerPubkey = this.getRegisteredPubkeyInternal(option.writer);
        const csvScriptHash = this.queryCsvScriptHash(writerPubkey, 6);

        // Mark option as RESERVED
        this.options.setStatus(optionId, RESERVED);

        // Create reservation
        const reservationId = this.nextReservationId.value;
        this.nextReservationId.value = SafeMath.add(reservationId, u256.One);

        const reservation = new Reservation();
        reservation.id = reservationId;
        reservation.optionId = optionId;
        reservation.buyer = buyer;
        reservation.btcAmount = btcAmount;
        reservation.csvScriptHash = csvScriptHash;
        reservation.expiryBlock = currentBlock + RESERVATION_EXPIRY_BLOCKS;
        reservation.status = RESERVATION_PENDING;

        this.reservations.set(reservationId, reservation);

        // Emit event
        const event = new BytesWriter(160);
        event.writeU256(reservationId);
        event.writeU256(optionId);
        event.writeAddress(buyer);
        event.writeU256(btcAmount);
        event.writeBytes(csvScriptHash);
        event.writeU64(currentBlock + RESERVATION_EXPIRY_BLOCKS);
        Blockchain.emit(new OptionReservedEvent(event));

        const result = new BytesWriter(32);
        result.writeU256(reservationId);
        return result;
    }

    // -------------------------------------------------------------------------
    // EXECUTE RESERVATION — Phase 2 of two-phase BTC commit
    // -------------------------------------------------------------------------

    @nonReentrant
    @method({ name: 'reservationId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('ReservationExecuted')
    public executeReservation(calldata: Calldata): BytesWriter {
        const reservationId = calldata.readU256();

        if (!this.reservations.exists(reservationId)) {
            throw new Revert('Reservation not found');
        }

        const reservation = this.reservations.get(reservationId);

        if (reservation.status != RESERVATION_PENDING) {
            throw new Revert('Not pending');
        }

        const currentBlock = Blockchain.block.number;
        if (currentBlock >= reservation.expiryBlock) {
            throw new Revert('Reservation expired');
        }

        // MED-1: Guard u256→u64 truncation
        if (reservation.btcAmount.hi1 != 0 || reservation.btcAmount.hi2 != 0 || reservation.btcAmount.lo2 != 0) {
            throw new Revert('BTC amount overflows u64');
        }

        // Verify BTC output via bridge
        const btcAmountSats: u64 = reservation.btcAmount.lo1;
        const verified = this.queryVerifyBtcOutput(reservation.csvScriptHash, btcAmountSats);
        if (!verified) {
            throw new Revert('BTC output not found or insufficient');
        }

        // Transition option: RESERVED → PURCHASED
        const optionId = reservation.optionId;
        this.options.setBuyer(optionId, reservation.buyer);
        this.options.setStatus(optionId, PURCHASED);

        // HIGH-2: Store CSV script hash on the option for later use during exercise
        this.setCsvScriptHashForOption(optionId, reservation.csvScriptHash);

        // Mark reservation as executed
        this.reservations.setStatus(reservationId, RESERVATION_EXECUTED);

        // Emit event
        const event = new BytesWriter(96);
        event.writeU256(reservationId);
        event.writeU256(optionId);
        event.writeAddress(reservation.buyer);
        Blockchain.emit(new ReservationExecutedEvent(event));

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    // -------------------------------------------------------------------------
    // CANCEL RESERVATION — Cleanup expired reservations
    // -------------------------------------------------------------------------

    @nonReentrant
    @method({ name: 'reservationId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('ReservationCancelled')
    public cancelReservation(calldata: Calldata): BytesWriter {
        const reservationId = calldata.readU256();

        if (!this.reservations.exists(reservationId)) {
            throw new Revert('Reservation not found');
        }

        const reservation = this.reservations.get(reservationId);

        if (reservation.status != RESERVATION_PENDING) {
            throw new Revert('Not pending');
        }

        const currentBlock = Blockchain.block.number;
        if (currentBlock < reservation.expiryBlock) {
            throw new Revert('Not yet expired');
        }

        // Return option to OPEN state
        this.options.setStatus(reservation.optionId, OPEN);

        // Clear reservation
        this.reservations.clear(reservationId);

        // Emit cancellation event
        const cancelEvent = new BytesWriter(64);
        cancelEvent.writeU256(reservationId);
        cancelEvent.writeU256(reservation.optionId);
        Blockchain.emit(new ReservationCancelledEvent(cancelEvent));

        // LOW-1: Emit OptionRestored event so watchers know the option is available again
        const restoredEvent = new BytesWriter(32);
        restoredEvent.writeU256(reservation.optionId);
        Blockchain.emit(new OptionRestoredEvent(restoredEvent));

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    // -------------------------------------------------------------------------
    // EXERCISE — BTC strike payment for CALL, OP20 for PUT
    // -------------------------------------------------------------------------

    @nonReentrant
    @method({ name: 'optionId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('OptionExercised')
    public exercise(calldata: Calldata): BytesWriter {
        const optionId = calldata.readU256();

        if (!this.options.exists(optionId)) {
            throw new Revert('Option not found');
        }

        const option = this.options.get(optionId);
        const caller = Blockchain.tx.sender;

        if (option.status != PURCHASED) {
            throw new Revert('Not purchased');
        }

        if (!caller.equals(option.buyer)) {
            throw new Revert('Not buyer');
        }

        const currentBlock = Blockchain.block.number;
        if (currentBlock < option.expiryBlock) {
            throw new Revert('Not yet expired');
        }

        const graceEnd = option.expiryBlock + GRACE_PERIOD_BLOCKS;
        if (currentBlock >= graceEnd) {
            throw new Revert('Grace period ended');
        }

        this.options.setStatus(optionId, EXERCISED);

        const strikeValue = SafeMath.div(SafeMath.mul(option.strikePrice, option.underlyingAmount), PRECISION);
        let exerciseFee: u256 = u256.Zero;

        if (option.optionType == CALL) {
            // CALL: buyer pays BTC strike via UTXO, receives OP20 underlying

            // HIGH-2: Use stored CSV hash from reservation instead of re-deriving
            const csvScriptHash = this.getCsvScriptHashForOption(optionId);

            // MED-1: Guard u256→u64 truncation for strikeValue
            if (strikeValue.hi1 != 0 || strikeValue.hi2 != 0 || strikeValue.lo2 != 0) {
                throw new Revert('Strike value overflows u64');
            }
            const strikeValueSats: u64 = strikeValue.lo1;

            const verified = this.queryVerifyBtcOutput(csvScriptHash, strikeValueSats);
            if (!verified) {
                throw new Revert('BTC strike payment not found');
            }

            // Exercise fee on underlying (OP20)
            exerciseFee = SafeMath.div(
                SafeMath.add(
                    SafeMath.mul(option.underlyingAmount, u256.fromU64(EXERCISE_FEE_BPS)),
                    u256.fromU64(9999)
                ),
                u256.fromU64(10000)
            );
            const buyerReceives = SafeMath.sub(option.underlyingAmount, exerciseFee);

            // Release OP20 underlying to buyer (minus fee)
            this._transfer(this._underlying.value, caller, buyerReceives);
            this._transfer(this._underlying.value, this.feeRecipientStore.value, exerciseFee);
        } else {
            // PUT: buyer sends underlying OP20, receives strike value (OP20 premium token)
            exerciseFee = SafeMath.div(
                SafeMath.add(
                    SafeMath.mul(strikeValue, u256.fromU64(EXERCISE_FEE_BPS)),
                    u256.fromU64(9999)
                ),
                u256.fromU64(10000)
            );
            const buyerReceives = SafeMath.sub(strikeValue, exerciseFee);
            this._transferFrom(this._underlying.value, caller, option.writer, option.underlyingAmount);
            this._transfer(this._premiumToken.value, caller, buyerReceives);
            this._transfer(this._premiumToken.value, this.feeRecipientStore.value, exerciseFee);
        }

        const event = new BytesWriter(193);
        event.writeU256(optionId);
        event.writeAddress(option.buyer);
        event.writeAddress(option.writer);
        event.writeU8(option.optionType);
        event.writeU256(option.underlyingAmount);
        event.writeU256(strikeValue);
        event.writeU256(exerciseFee);
        Blockchain.emit(new OptionExercisedEvent(event));

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    // -------------------------------------------------------------------------
    // CANCEL — Same as type 0 (OP20 collateral returned)
    // -------------------------------------------------------------------------

    @nonReentrant
    @method({ name: 'optionId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('OptionCancelled')
    public cancelOption(calldata: Calldata): BytesWriter {
        const optionId = calldata.readU256();

        if (!this.options.exists(optionId)) {
            throw new Revert('Option not found');
        }

        const option = this.options.get(optionId);
        const caller = Blockchain.tx.sender;

        if (!caller.equals(option.writer)) {
            throw new Revert('Not writer');
        }
        if (option.status != OPEN) {
            throw new Revert('Not open');
        }

        let collateralToken: Address;
        let collateralAmount: u256;

        if (option.optionType == CALL) {
            collateralToken = this._underlying.value;
            collateralAmount = option.underlyingAmount;
        } else {
            collateralToken = this._premiumToken.value;
            collateralAmount = SafeMath.div(SafeMath.mul(option.strikePrice, option.underlyingAmount), PRECISION);
        }

        const currentBlock = Blockchain.block.number;
        let fee: u256;
        if (currentBlock >= option.expiryBlock) {
            fee = u256.Zero;
        } else {
            fee = SafeMath.div(
                SafeMath.add(
                    SafeMath.mul(collateralAmount, u256.fromU64(CANCEL_FEE_BPS)),
                    u256.fromU64(9999)
                ),
                u256.fromU64(10000)
            );
        }
        const returnAmount = SafeMath.sub(collateralAmount, fee);

        this.options.setStatus(optionId, CANCELLED);

        this._transfer(collateralToken, option.writer, returnAmount);
        if (fee > u256.Zero) {
            this._transfer(collateralToken, this.feeRecipientStore.value, fee);
        }

        const event = new BytesWriter(128);
        event.writeU256(optionId);
        event.writeAddress(option.writer);
        event.writeU256(returnAmount);
        event.writeU256(fee);
        Blockchain.emit(new OptionCancelledEvent(event));

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    // -------------------------------------------------------------------------
    // SETTLE — Same as type 0 (OP20 collateral returned after grace)
    // -------------------------------------------------------------------------

    @nonReentrant
    @method({ name: 'optionId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('OptionExpired')
    public settle(calldata: Calldata): BytesWriter {
        const optionId = calldata.readU256();

        if (!this.options.exists(optionId)) {
            throw new Revert('Option not found');
        }

        const option = this.options.get(optionId);

        if (option.status != PURCHASED) {
            throw new Revert('Not purchased');
        }

        const currentBlock = Blockchain.block.number;
        const graceEnd = option.expiryBlock + GRACE_PERIOD_BLOCKS;
        if (currentBlock < graceEnd) {
            throw new Revert('Grace period not ended');
        }

        let collateralToken: Address;
        let collateralAmount: u256;

        if (option.optionType == CALL) {
            collateralToken = this._underlying.value;
            collateralAmount = option.underlyingAmount;
        } else {
            collateralToken = this._premiumToken.value;
            collateralAmount = SafeMath.div(SafeMath.mul(option.strikePrice, option.underlyingAmount), PRECISION);
        }

        this.options.setStatus(optionId, EXPIRED);

        this._transfer(collateralToken, option.writer, collateralAmount);

        const event = new BytesWriter(100);
        event.writeU256(optionId);
        event.writeAddress(option.writer);
        event.writeU256(collateralAmount);
        Blockchain.emit(new OptionExpiredEvent(event));

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    // -------------------------------------------------------------------------
    // EXTENDED STORAGE (HIGH-2: stored CSV hash per option)
    // -------------------------------------------------------------------------

    private extendedSlotKey(optionId: u256, slot: u8): Uint8Array {
        const writer = new BytesWriter(35);
        writer.writeU16(EXTENDED_SLOTS_POINTER);
        writer.writeU256(optionId);
        writer.writeU8(slot);
        return sha256(writer.getBuffer());
    }

    private setCsvScriptHashForOption(optionId: u256, hash: Uint8Array): void {
        const key = this.extendedSlotKey(optionId, SLOT_CSV_HASH);
        Blockchain.setStorageAt(key, hash);
    }

    private getCsvScriptHashForOption(optionId: u256): Uint8Array {
        const key = this.extendedSlotKey(optionId, SLOT_CSV_HASH);
        const data = Blockchain.getStorageAt(key);
        if (data.length == 0) {
            throw new Revert('No CSV hash stored for option');
        }
        return data;
    }

    // -------------------------------------------------------------------------
    // BRIDGE HELPERS (cross-contract calls)
    // -------------------------------------------------------------------------

    private queryBtcPrice(token: Address): u256 {
        const calldata = new BytesWriter(36);
        calldata.writeSelector(encodeSelector('getBtcPrice(address)'));
        calldata.writeAddress(token);

        const result = Blockchain.call(this.bridgeStore.value, calldata, true);
        if (!result.success) {
            throw new Revert('Bridge getBtcPrice failed');
        }

        return result.data.readU256();
    }

    private queryCsvScriptHash(pubkey: Uint8Array, csvBlocks: u64): Uint8Array {
        const calldata = new BytesWriter(45);
        calldata.writeSelector(encodeSelector('generateCsvScriptHash(bytes32,uint64)'));
        calldata.writeBytes(pubkey);
        calldata.writeU64(csvBlocks);

        const result = Blockchain.call(this.bridgeStore.value, calldata, true);
        if (!result.success) {
            throw new Revert('Bridge generateCsvScriptHash failed');
        }

        return result.data.readBytes(32);
    }

    private queryVerifyBtcOutput(expectedHash: Uint8Array, expectedAmount: u64): bool {
        const calldata = new BytesWriter(44);
        calldata.writeSelector(encodeSelector('verifyBtcOutput(bytes32,uint64)'));
        calldata.writeBytes(expectedHash);
        calldata.writeU64(expectedAmount);

        const result = Blockchain.call(this.bridgeStore.value, calldata, true);
        if (!result.success) {
            throw new Revert('Bridge verifyBtcOutput failed');
        }

        return result.data.readBoolean();
    }
}
