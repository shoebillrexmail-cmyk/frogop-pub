/**
 * OptionsPoolBtcUnderlying (Type 2) - BTC underlying, OP20 quote
 *
 * Writer locks BTC collateral for CALL options via dual-path escrow.
 * Writer locks OP20 premium token for PUT options (same as base).
 * Premium and strike are denominated in OP20 (quote token).
 *
 * CALL writeOptionBtc: verify BTC UTXO output to escrow P2WSH, create option
 * CALL exercise: buyer pays OP20 strike, option marked EXERCISED, BTC claimable
 * CALL cancel/settle: mark state, writer reclaims BTC via CLTV off-chain
 *
 * PUT operations: same as base (OP20 collateral)
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
    MAX_EXPIRY_BLOCKS,
    CANCEL_FEE_BPS,
    BUY_FEE_BPS,
    EXERCISE_FEE_BPS,
    PRECISION,
    EXTENDED_SLOTS_POINTER,
} from './constants';

import { Option } from './storage';

import {
    OptionWrittenEvent,
    OptionWrittenBtcEvent,
    OptionCancelledEvent,
    OptionPurchasedEvent,
    OptionExercisedEvent,
    OptionExpiredEvent,
    BtcClaimableEvent,
} from './events';

import { OptionsPoolBase } from './base';

// =============================================================================
// ADDITIONAL STORAGE POINTERS
// =============================================================================

const BRIDGE_POINTER: u16 = Blockchain.nextPointer;

// Extended option storage slots (beyond base 7 slots)
// Slot 7: btcCollateralAmount (u256, satoshis)
// Slot 8: escrowScriptHash (bytes32)

// =============================================================================
// CONTRACT
// =============================================================================

@final
export class OptionsPoolBtcUnderlying extends OptionsPoolBase {

    private _bridge: StoredAddress | null = null;

    private get bridgeStore(): StoredAddress {
        if (!this._bridge) {
            this._bridge = new StoredAddress(BRIDGE_POINTER);
        }
        return this._bridge!;
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
    // WRITE OPTION — BTC collateral for CALL, OP20 for PUT
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
    @emit('OptionWrittenBtc')
    public writeOptionBtc(calldata: Calldata): BytesWriter {
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

        if (optionType == CALL) {
            // HIGH-1 (CEI reorder): Verify BTC output BEFORE ID allocation

            // MED-1: Guard u256→u64 truncation
            if (underlyingAmount.hi1 != 0 || underlyingAmount.hi2 != 0 || underlyingAmount.lo2 != 0) {
                throw new Revert('Underlying amount overflows u64');
            }
            const btcAmountSats: u64 = underlyingAmount.lo1;

            // CRIT-2: Use registered pubkey instead of fake derived key
            const writerPubkey = this.getRegisteredPubkeyInternal(writer);

            // LOW-6: Validate pubkey length before escrow script query
            if (writerPubkey.length != 33) {
                throw new Revert('Invalid writer pubkey length');
            }

            const placeholderBuyer = new Uint8Array(33);
            placeholderBuyer[0] = 0x02;
            const cltvBlock = expiryBlock + this.getGracePeriod();
            const escrowHash = this.queryEscrowScriptHash(placeholderBuyer, writerPubkey, cltvBlock);

            // Verify BTC output exists in this transaction (before ID allocation)
            const verified = this.queryVerifyBtcOutput(escrowHash, btcAmountSats);
            if (!verified) {
                throw new Revert('BTC collateral output not found');
            }

            // Now allocate ID (after verification)
            const optionId = this._nextId.value;
            this._nextId.value = SafeMath.add(optionId, u256.One);

            // Store option
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

            // Store BTC-specific data in extended slots
            this.setBtcCollateral(optionId, underlyingAmount);
            this.setEscrowHash(optionId, escrowHash);

            // Emit event with escrow info
            const event = new BytesWriter(232);
            event.writeU256(optionId);
            event.writeAddress(writer);
            event.writeU8(optionType);
            event.writeU256(strikePrice);
            event.writeU256(underlyingAmount);
            event.writeU256(premium);
            event.writeU64(expiryBlock);
            event.writeBytes(escrowHash);
            Blockchain.emit(new OptionWrittenBtcEvent(event));

            const result = new BytesWriter(32);
            result.writeU256(optionId);
            return result;
        } else {
            // PUT: OP20 premium token collateral (same as base)
            const optionId = this._nextId.value;
            this._nextId.value = SafeMath.add(optionId, u256.One);

            const collateralAmount = SafeMath.div(SafeMath.mul(strikePrice, underlyingAmount), PRECISION);

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

            this._transferFrom(this._premiumToken.value, writer, Blockchain.contractAddress, collateralAmount);

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
    }

    // -------------------------------------------------------------------------
    // BUY OPTION — OP20 premium payment (same as base)
    // -------------------------------------------------------------------------

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

        // Premium is in OP20 (quote token)
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

        // Transfer OP20 premium: buyer → writer + fee recipient
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

    // -------------------------------------------------------------------------
    // EXERCISE
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

        const graceEnd = option.expiryBlock + this.getGracePeriod();
        if (currentBlock >= graceEnd) {
            throw new Revert('Grace period ended');
        }

        const strikeValue = SafeMath.div(SafeMath.mul(option.strikePrice, option.underlyingAmount), PRECISION);

        this.options.setStatus(optionId, EXERCISED);

        let exerciseFee: u256 = u256.Zero;

        if (option.optionType == CALL) {
            // CALL: buyer pays OP20 strike to writer, BTC collateral becomes claimable
            exerciseFee = SafeMath.div(
                SafeMath.add(
                    SafeMath.mul(strikeValue, u256.fromU64(EXERCISE_FEE_BPS)),
                    u256.fromU64(9999)
                ),
                u256.fromU64(10000)
            );
            const writerReceives = SafeMath.sub(strikeValue, exerciseFee);

            // Buyer pays OP20 strike
            this._transferFrom(this._premiumToken.value, caller, option.writer, writerReceives);
            this._transferFrom(this._premiumToken.value, caller, this.feeRecipientStore.value, exerciseFee);

            // Emit BtcClaimable event with escrow details
            const escrowHash = this.getEscrowHash(optionId);
            const btcAmount = this.getBtcCollateral(optionId);

            const claimEvent = new BytesWriter(128);
            claimEvent.writeU256(optionId);
            claimEvent.writeAddress(option.buyer);
            claimEvent.writeU256(btcAmount);
            claimEvent.writeBytes(escrowHash);
            Blockchain.emit(new BtcClaimableEvent(claimEvent));
        } else {
            // PUT: buyer sends BTC underlying via UTXO, receives OP20 strike value
            // CRIT-2: Use registered pubkey instead of fake derived key
            const writerPubkey = this.getRegisteredPubkeyInternal(option.writer);

            // LOW-6: Validate pubkey length
            if (writerPubkey.length != 33) {
                throw new Revert('Invalid writer pubkey length');
            }

            // MED-1: Guard u256→u64 truncation
            if (option.underlyingAmount.hi1 != 0 || option.underlyingAmount.hi2 != 0 || option.underlyingAmount.lo2 != 0) {
                throw new Revert('Underlying amount overflows u64');
            }
            const btcAmountSats: u64 = option.underlyingAmount.lo1;

            // Generate CSV script hash for writer to receive the BTC
            const csvHash = this.queryCsvScriptHash(writerPubkey, 6);
            const verified = this.queryVerifyBtcOutput(csvHash, btcAmountSats);
            if (!verified) {
                throw new Revert('BTC underlying payment not found');
            }

            exerciseFee = SafeMath.div(
                SafeMath.add(
                    SafeMath.mul(strikeValue, u256.fromU64(EXERCISE_FEE_BPS)),
                    u256.fromU64(9999)
                ),
                u256.fromU64(10000)
            );
            const buyerReceives = SafeMath.sub(strikeValue, exerciseFee);

            // Transfer OP20 collateral to buyer
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
    // CANCEL
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

        this.options.setStatus(optionId, CANCELLED);

        if (option.optionType == CALL) {
            // MED-3: Type 2 CALL cancel has no on-chain fee because BTC collateral
            // is in a P2WSH escrow, not held by the contract. The writer reclaims
            // BTC via the CLTV path off-chain after expiry. No OP20 movement occurs.
            const escrowHash = this.getEscrowHash(optionId);
            const btcAmount = this.getBtcCollateral(optionId);

            const event = new BytesWriter(128);
            event.writeU256(optionId);
            event.writeAddress(option.writer);
            event.writeU256(btcAmount);
            event.writeBytes(escrowHash);
            Blockchain.emit(new OptionCancelledEvent(event));
        } else {
            // PUT: OP20 collateral returned (same as base)
            const collateralAmount = SafeMath.div(SafeMath.mul(option.strikePrice, option.underlyingAmount), PRECISION);
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

            this._transfer(this._premiumToken.value, option.writer, returnAmount);
            if (fee > u256.Zero) {
                this._transfer(this._premiumToken.value, this.feeRecipientStore.value, fee);
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

    // -------------------------------------------------------------------------
    // SETTLE
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
        const graceEnd = option.expiryBlock + this.getGracePeriod();
        if (currentBlock < graceEnd) {
            throw new Revert('Grace period not ended');
        }

        this.options.setStatus(optionId, EXPIRED);

        if (option.optionType == CALL) {
            // CALL: BTC collateral. Writer reclaims via CLTV off-chain.
            const escrowHash = this.getEscrowHash(optionId);
            const btcAmount = this.getBtcCollateral(optionId);

            const event = new BytesWriter(128);
            event.writeU256(optionId);
            event.writeAddress(option.writer);
            event.writeU256(btcAmount);
            event.writeBytes(escrowHash);
            Blockchain.emit(new OptionExpiredEvent(event));
        } else {
            // PUT: OP20 collateral returned to writer
            const collateralAmount = SafeMath.div(SafeMath.mul(option.strikePrice, option.underlyingAmount), PRECISION);
            this._transfer(this._premiumToken.value, option.writer, collateralAmount);

            const event = new BytesWriter(100);
            event.writeU256(optionId);
            event.writeAddress(option.writer);
            event.writeU256(collateralAmount);
            Blockchain.emit(new OptionExpiredEvent(event));
        }

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    // -------------------------------------------------------------------------
    // EXTENDED STORAGE (BTC-specific slots 7 & 8)
    // MED-2: Uses EXTENDED_SLOTS_POINTER instead of hardcoded 0xFFFF
    // -------------------------------------------------------------------------

    private setBtcCollateral(optionId: u256, amount: u256): void {
        const key = this.extendedSlotKey(optionId, 7);
        Blockchain.setStorageAt(key, amount.toUint8Array(true));
    }

    private getBtcCollateral(optionId: u256): u256 {
        const key = this.extendedSlotKey(optionId, 7);
        return u256.fromUint8ArrayBE(Blockchain.getStorageAt(key));
    }

    private setEscrowHash(optionId: u256, hash: Uint8Array): void {
        const key = this.extendedSlotKey(optionId, 8);
        Blockchain.setStorageAt(key, hash);
    }

    private getEscrowHash(optionId: u256): Uint8Array {
        const key = this.extendedSlotKey(optionId, 8);
        return Blockchain.getStorageAt(key);
    }

    /**
     * Generate a SHA256 key for extended option storage slots.
     * Uses EXTENDED_SLOTS_POINTER from constants (MED-2 fix).
     */
    private extendedSlotKey(optionId: u256, slot: u8): Uint8Array {
        const writer = new BytesWriter(35);
        writer.writeU16(EXTENDED_SLOTS_POINTER);
        writer.writeU256(optionId);
        writer.writeU8(slot);
        return sha256(writer.getBuffer());
    }

    // -------------------------------------------------------------------------
    // BRIDGE HELPERS
    // -------------------------------------------------------------------------

    private queryEscrowScriptHash(buyerPub: Uint8Array, writerPub: Uint8Array, cltvBlock: u64): Uint8Array {
        const calldata = new BytesWriter(78);
        calldata.writeSelector(encodeSelector('generateEscrowScriptHash(bytes32,bytes32,uint64)'));
        calldata.writeBytes(buyerPub);
        calldata.writeBytes(writerPub);
        calldata.writeU64(cltvBlock);

        const result = Blockchain.call(this.bridgeStore.value, calldata, true);
        if (!result.success) {
            throw new Revert('Bridge generateEscrowScriptHash failed');
        }

        return result.data.readBytes(32);
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
