/**
 * OptionsPool (Type 0) - OP20/OP20 option pool
 *
 * Extends OptionsPoolBase with state-changing methods:
 * writeOption, cancelOption, buyOption, exercise, settle,
 * transferOption, rollOption, batchCancel, batchSettle.
 *
 * All view methods, storage, constants, events, and token
 * transfer helpers are inherited from OptionsPoolBase.
 */

import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    Revert,
    SafeMath,
} from '@btc-vision/btc-runtime/runtime';

import {
    CALL,
    OPEN,
    PURCHASED,
    EXERCISED,
    EXPIRED,
    CANCELLED,
    GRACE_PERIOD_BLOCKS,
    MAX_EXPIRY_BLOCKS,
    CANCEL_FEE_BPS,
    BUY_FEE_BPS,
    EXERCISE_FEE_BPS,
    MAX_BATCH_SIZE,
    PRECISION,
} from './constants';

import { Option } from './storage';

import {
    OptionWrittenEvent,
    OptionCancelledEvent,
    OptionPurchasedEvent,
    OptionExercisedEvent,
    OptionExpiredEvent,
    OptionTransferredEvent,
    OptionRolledEvent,
} from './events';

import { OptionsPoolBase } from './base';

// =============================================================================
// CONTRACT IMPLEMENTATION
// =============================================================================

@final
export class OptionsPool extends OptionsPoolBase {

    // -------------------------------------------------------------------------
    // STATE-CHANGING METHODS
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

        option.status = CANCELLED;
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

    @nonReentrant
    @method({ name: 'optionId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('OptionPurchased')
    public buyOption(calldata: Calldata): BytesWriter {
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

        if (buyer.equals(option.writer)) {
            throw new Revert('Writer cannot buy own option');
        }

        const buyFee = SafeMath.div(
            SafeMath.add(
                SafeMath.mul(option.premium, u256.fromU64(BUY_FEE_BPS)),
                u256.fromU64(9999)
            ),
            u256.fromU64(10000)
        );
        const writerAmount = SafeMath.sub(option.premium, buyFee);

        this.options.setBuyer(optionId, buyer);
        this.options.setStatus(optionId, PURCHASED);

        this._transferFrom(this._premiumToken.value, buyer, option.writer, writerAmount);
        this._transferFrom(this._premiumToken.value, buyer, this.feeRecipientStore.value, buyFee);

        const event = new BytesWriter(168);
        event.writeU256(optionId);
        event.writeAddress(buyer);
        event.writeAddress(option.writer);
        event.writeU256(option.premium);
        event.writeU256(writerAmount);
        event.writeU64(currentBlock);
        Blockchain.emit(new OptionPurchasedEvent(event));

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

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

        const strikeValue = SafeMath.div(SafeMath.mul(option.strikePrice, option.underlyingAmount), PRECISION);

        this.options.setStatus(optionId, EXERCISED);

        let exerciseFee: u256 = u256.Zero;

        if (option.optionType == CALL) {
            exerciseFee = SafeMath.div(
                SafeMath.add(
                    SafeMath.mul(option.underlyingAmount, u256.fromU64(EXERCISE_FEE_BPS)),
                    u256.fromU64(9999)
                ),
                u256.fromU64(10000)
            );
            const buyerReceives = SafeMath.sub(option.underlyingAmount, exerciseFee);
            this._transferFrom(this._premiumToken.value, caller, option.writer, strikeValue);
            this._transfer(this._underlying.value, caller, buyerReceives);
            this._transfer(this._underlying.value, this.feeRecipientStore.value, exerciseFee);
        } else {
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

    /**
     * Settle an expired option, returning collateral to the writer.
     * This method is intentionally permissionless — anyone can trigger settlement
     * after the grace period ends. This allows third-party keepers to clean up
     * expired options and return locked collateral without requiring writer action.
     * (LOW-2)
     */
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

    @nonReentrant
    @method(
        { name: 'optionId', type: ABIDataTypes.UINT256 },
        { name: 'to', type: ABIDataTypes.ADDRESS },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('OptionTransferred')
    public transferOption(calldata: Calldata): BytesWriter {
        const optionId = calldata.readU256();
        const newBuyer = calldata.readAddress();

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

        if (newBuyer.equals(Address.zero())) {
            throw new Revert('Invalid recipient');
        }

        if (newBuyer.equals(option.buyer)) {
            throw new Revert('Already owner');
        }

        const currentBlock = Blockchain.block.number;
        const graceEnd = option.expiryBlock + GRACE_PERIOD_BLOCKS;
        if (currentBlock >= graceEnd) {
            throw new Revert('Grace period ended');
        }

        this.options.setBuyer(optionId, newBuyer);

        const event = new BytesWriter(96);
        event.writeU256(optionId);
        event.writeAddress(option.buyer);
        event.writeAddress(newBuyer);
        Blockchain.emit(new OptionTransferredEvent(event));

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    // -------------------------------------------------------------------------
    // ROLL OPTION
    // -------------------------------------------------------------------------

    /**
     * Roll an option: cancel the existing one and create a new one with updated
     * parameters, atomically. The cancel event's returnAmount field reflects the
     * net collateral after the cancellation fee, not the full original collateral.
     * The rollEvent includes both old and new option IDs for correlation. (LOW-4)
     */
    @nonReentrant
    @method(
        { name: 'optionId', type: ABIDataTypes.UINT256 },
        { name: 'newStrikePrice', type: ABIDataTypes.UINT256 },
        { name: 'newExpiryBlock', type: ABIDataTypes.UINT64 },
        { name: 'newPremium', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'newOptionId', type: ABIDataTypes.UINT256 })
    @emit('OptionRolled')
    public rollOption(calldata: Calldata): BytesWriter {
        const optionId = calldata.readU256();
        const newStrikePrice = calldata.readU256();
        const newExpiryBlock = calldata.readU64();
        const newPremium = calldata.readU256();

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

        if (newStrikePrice == u256.Zero || newPremium == u256.Zero) {
            throw new Revert('Values must be > 0');
        }

        const currentBlock = Blockchain.block.number;
        if (newExpiryBlock <= currentBlock) {
            throw new Revert('Expiry in past');
        }
        if (newExpiryBlock > currentBlock + MAX_EXPIRY_BLOCKS) {
            throw new Revert('Expiry too far');
        }

        let collateralToken: Address;
        let oldCollateral: u256;
        let newCollateral: u256;

        if (option.optionType == CALL) {
            collateralToken = this._underlying.value;
            oldCollateral = option.underlyingAmount;
            newCollateral = option.underlyingAmount;
        } else {
            collateralToken = this._premiumToken.value;
            oldCollateral = SafeMath.div(SafeMath.mul(option.strikePrice, option.underlyingAmount), PRECISION);
            newCollateral = SafeMath.div(SafeMath.mul(newStrikePrice, option.underlyingAmount), PRECISION);
        }

        let fee: u256;
        if (currentBlock >= option.expiryBlock) {
            fee = u256.Zero;
        } else {
            fee = SafeMath.div(
                SafeMath.add(
                    SafeMath.mul(oldCollateral, u256.fromU64(CANCEL_FEE_BPS)),
                    u256.fromU64(9999)
                ),
                u256.fromU64(10000)
            );
        }

        this.options.setStatus(optionId, CANCELLED);

        if (fee > u256.Zero) {
            this._transfer(collateralToken, this.feeRecipientStore.value, fee);
        }

        const refundAfterFee = SafeMath.sub(oldCollateral, fee);
        if (u256.gt(newCollateral, refundAfterFee)) {
            const topUp = SafeMath.sub(newCollateral, refundAfterFee);
            this._transferFrom(collateralToken, caller, Blockchain.contractAddress, topUp);
        } else if (u256.lt(newCollateral, refundAfterFee)) {
            const surplus = SafeMath.sub(refundAfterFee, newCollateral);
            this._transfer(collateralToken, caller, surplus);
        }

        const newOptionId = this._nextId.value;
        this._nextId.value = SafeMath.add(newOptionId, u256.One);

        const newOption = new Option();
        newOption.id = newOptionId;
        newOption.writer = caller;
        newOption.buyer = Address.zero();
        newOption.strikePrice = newStrikePrice;
        newOption.underlyingAmount = option.underlyingAmount;
        newOption.premium = newPremium;
        newOption.expiryBlock = newExpiryBlock;
        newOption.createdBlock = currentBlock;
        newOption.optionType = option.optionType;
        newOption.status = OPEN;

        this.options.set(newOptionId, newOption);

        const cancelEvent = new BytesWriter(128);
        cancelEvent.writeU256(optionId);
        cancelEvent.writeAddress(caller);
        cancelEvent.writeU256(SafeMath.sub(oldCollateral, fee));
        cancelEvent.writeU256(fee);
        Blockchain.emit(new OptionCancelledEvent(cancelEvent));

        const writeEvent = new BytesWriter(200);
        writeEvent.writeU256(newOptionId);
        writeEvent.writeAddress(caller);
        writeEvent.writeU8(option.optionType);
        writeEvent.writeU256(newStrikePrice);
        writeEvent.writeU256(option.underlyingAmount);
        writeEvent.writeU256(newPremium);
        writeEvent.writeU64(newExpiryBlock);
        Blockchain.emit(new OptionWrittenEvent(writeEvent));

        const rollEvent = new BytesWriter(228);
        rollEvent.writeU256(optionId);
        rollEvent.writeU256(newOptionId);
        rollEvent.writeAddress(caller);
        rollEvent.writeU256(newStrikePrice);
        rollEvent.writeU64(newExpiryBlock);
        rollEvent.writeU256(newPremium);
        Blockchain.emit(new OptionRolledEvent(rollEvent));

        const result = new BytesWriter(32);
        result.writeU256(newOptionId);
        return result;
    }

    // -------------------------------------------------------------------------
    // BATCH OPERATIONS
    // -------------------------------------------------------------------------

    @nonReentrant
    @method(
        { name: 'count', type: ABIDataTypes.UINT256 },
        { name: 'id0', type: ABIDataTypes.UINT256 },
        { name: 'id1', type: ABIDataTypes.UINT256 },
        { name: 'id2', type: ABIDataTypes.UINT256 },
        { name: 'id3', type: ABIDataTypes.UINT256 },
        { name: 'id4', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('OptionCancelled')
    public batchCancel(calldata: Calldata): BytesWriter {
        const count = calldata.readU256();

        if (count == u256.Zero) {
            throw new Revert('Empty batch');
        }
        if (u256.gt(count, u256.fromU32(u32(MAX_BATCH_SIZE)))) {
            throw new Revert('Batch too large');
        }

        // MED-5: Explicit guard before u256→i32 narrowing
        if (u256.gt(count, u256.fromU32(u32(MAX_BATCH_SIZE)))) {
            throw new Revert('Batch too large');
        }
        const n: i32 = i32(u32(count.lo1));

        const ids: u256[] = new Array<u256>(5);
        for (let i: i32 = 0; i < 5; i++) {
            ids[i] = calldata.readU256();
        }

        // HIGH-3: Duplicate ID detection (O(n²), n≤5)
        for (let i: i32 = 0; i < n; i++) {
            for (let j: i32 = i + 1; j < n; j++) {
                if (u256.eq(ids[i], ids[j])) {
                    throw new Revert('Duplicate ID in batch');
                }
            }
        }

        const caller = Blockchain.tx.sender;
        const currentBlock = Blockchain.block.number;

        for (let i: i32 = 0; i < n; i++) {
            const optionId = ids[i];

            if (!this.options.exists(optionId)) {
                throw new Revert('Option not found');
            }

            const option = this.options.get(optionId);

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
        }

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    @nonReentrant
    @method(
        { name: 'count', type: ABIDataTypes.UINT256 },
        { name: 'id0', type: ABIDataTypes.UINT256 },
        { name: 'id1', type: ABIDataTypes.UINT256 },
        { name: 'id2', type: ABIDataTypes.UINT256 },
        { name: 'id3', type: ABIDataTypes.UINT256 },
        { name: 'id4', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'settledCount', type: ABIDataTypes.UINT256 })
    @emit('OptionExpired')
    public batchSettle(calldata: Calldata): BytesWriter {
        const count = calldata.readU256();

        if (count == u256.Zero) {
            throw new Revert('Empty batch');
        }
        if (u256.gt(count, u256.fromU32(u32(MAX_BATCH_SIZE)))) {
            throw new Revert('Batch too large');
        }

        // MED-5: Explicit guard before u256→i32 narrowing
        const n: i32 = i32(u32(count.lo1));

        const ids: u256[] = new Array<u256>(5);
        for (let i: i32 = 0; i < 5; i++) {
            ids[i] = calldata.readU256();
        }

        // HIGH-3: Duplicate ID detection (O(n²), n≤5)
        for (let i: i32 = 0; i < n; i++) {
            for (let j: i32 = i + 1; j < n; j++) {
                if (u256.eq(ids[i], ids[j])) {
                    throw new Revert('Duplicate ID in batch');
                }
            }
        }

        const currentBlock = Blockchain.block.number;
        let settledCount: u256 = u256.Zero;

        for (let i: i32 = 0; i < n; i++) {
            const optionId = ids[i];

            if (!this.options.exists(optionId)) {
                continue;
            }

            const option = this.options.get(optionId);

            if (option.status != PURCHASED) {
                continue;
            }

            const graceEnd = option.expiryBlock + GRACE_PERIOD_BLOCKS;
            if (currentBlock < graceEnd) {
                continue;
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

            settledCount = SafeMath.add(settledCount, u256.One);
        }

        const result = new BytesWriter(32);
        result.writeU256(settledCount);
        return result;
    }
}
