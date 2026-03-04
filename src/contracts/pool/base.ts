/**
 * OptionsPoolBase - Shared base class for all option pool types
 *
 * Contains: storage management, view methods, fee management,
 * token transfer helpers, and deployment logic.
 *
 * Subclasses:
 * - OptionsPool (type 0): OP20/OP20 pools
 * - OptionsPoolBtcQuote (type 1): OP20 underlying, BTC quote
 * - OptionsPoolBtcUnderlying (type 2): BTC underlying, OP20 quote
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
    ReentrancyGuard,
    ReentrancyLevel,
    encodeSelector,
} from '@btc-vision/btc-runtime/runtime';

import {
    CALL,
    PRECISION,
    BUY_FEE_BPS,
    EXERCISE_FEE_BPS,
    CANCEL_FEE_BPS,
    GRACE_PERIOD_BLOCKS,
    MAX_EXPIRY_BLOCKS,
    UNDERLYING_POINTER,
    PREMIUM_TOKEN_POINTER,
    NEXT_ID_POINTER,
    FEE_RECIPIENT_POINTER,
    OPTIONS_BASE_POINTER,
} from './constants';

import { OptionStorage } from './storage';
import { FeeRecipientUpdatedEvent } from './events';

// =============================================================================
// BASE CONTRACT
// =============================================================================

export class OptionsPoolBase extends ReentrancyGuard {
    protected readonly reentrancyLevel: ReentrancyLevel = ReentrancyLevel.STANDARD;

    protected _underlying: StoredAddress;
    protected _premiumToken: StoredAddress;
    protected _nextId: StoredU256;

    private _feeRecipient: StoredAddress | null = null;
    private _options: OptionStorage | null = null;

    public constructor() {
        super();
        this._underlying = new StoredAddress(UNDERLYING_POINTER);
        this._premiumToken = new StoredAddress(PREMIUM_TOKEN_POINTER);
        this._nextId = new StoredU256(NEXT_ID_POINTER, EMPTY_BUFFER);
    }

    protected get feeRecipientStore(): StoredAddress {
        if (!this._feeRecipient) {
            this._feeRecipient = new StoredAddress(FEE_RECIPIENT_POINTER);
        }
        return this._feeRecipient!;
    }

    protected get options(): OptionStorage {
        if (!this._options) {
            this._options = new OptionStorage(OPTIONS_BASE_POINTER);
        }
        return this._options!;
    }

    // -------------------------------------------------------------------------
    // DEPLOYMENT
    // -------------------------------------------------------------------------

    public override onDeployment(calldata: Calldata): void {
        super.onDeployment(calldata);

        const underlying = calldata.readAddress();
        const premiumToken = calldata.readAddress();
        const feeRecipientAddr = calldata.readAddress();

        if (feeRecipientAddr.equals(Address.zero())) {
            throw new Revert('Fee recipient cannot be zero');
        }

        this._underlying.value = underlying;
        this._premiumToken.value = premiumToken;
        this.feeRecipientStore.value = feeRecipientAddr;
    }

    // -------------------------------------------------------------------------
    // VIEW METHODS
    // -------------------------------------------------------------------------

    @view
    @method('underlying')
    @returns({ name: 'underlying', type: ABIDataTypes.ADDRESS })
    public getUnderlying(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeAddress(this._underlying.value);
        return writer;
    }

    @view
    @method('premiumToken')
    @returns({ name: 'premiumToken', type: ABIDataTypes.ADDRESS })
    public getPremiumToken(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeAddress(this._premiumToken.value);
        return writer;
    }

    @view
    @method({ name: 'optionId', type: ABIDataTypes.UINT256 })
    public getOption(calldata: Calldata): BytesWriter {
        const optionId = calldata.readU256();

        if (!this.options.exists(optionId)) {
            throw new Revert('Option not found');
        }

        const option = this.options.get(optionId);

        const writer = new BytesWriter(32 * 6 + 8 + 2);
        writer.writeU256(option.id);
        writer.writeAddress(option.writer);
        writer.writeAddress(option.buyer);
        writer.writeU8(option.optionType);
        writer.writeU256(option.strikePrice);
        writer.writeU256(option.underlyingAmount);
        writer.writeU256(option.premium);
        writer.writeU64(option.expiryBlock);
        writer.writeU8(option.status);

        return writer;
    }

    @view
    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    public optionCount(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this._nextId.value);
        return writer;
    }

    /**
     * Return a batch of options starting at startId (inclusive).
     * Each record: id(32) writer(32) buyer(32) optionType(1) strikePrice(32)
     *              underlyingAmount(32) premium(32) expiryBlock(8) status(1) = 202 bytes.
     * Capped at 9 options per call (2048-byte OPNet response limit).
     */
    @view
    @method(
        { name: 'startId', type: ABIDataTypes.UINT256 },
        { name: 'count', type: ABIDataTypes.UINT256 },
    )
    public getOptionsBatch(calldata: Calldata): BytesWriter {
        const startId = calldata.readU256();
        const requestedCount = calldata.readU256();

        const totalOptions = this._nextId.value;

        if (!u256.lt(startId, totalOptions)) {
            const writer = new BytesWriter(32);
            writer.writeU256(u256.Zero);
            return writer;
        }

        const maxBatch: u256 = u256.fromU64(9);
        let actualCount: u256 = requestedCount;
        if (u256.gt(actualCount, maxBatch)) {
            actualCount = maxBatch;
        }

        const available = SafeMath.sub(totalOptions, startId);
        if (u256.gt(actualCount, available)) {
            actualCount = available;
        }

        const count: i32 = i32(u32(actualCount.lo1));
        const writer = new BytesWriter(32 + 202 * count);
        writer.writeU256(actualCount);

        let i: u256 = u256.Zero;
        while (u256.lt(i, actualCount)) {
            const optionId = SafeMath.add(startId, i);
            const opt = this.options.get(optionId);
            writer.writeU256(opt.id);
            writer.writeAddress(opt.writer);
            writer.writeAddress(opt.buyer);
            writer.writeU8(opt.optionType);
            writer.writeU256(opt.strikePrice);
            writer.writeU256(opt.underlyingAmount);
            writer.writeU256(opt.premium);
            writer.writeU64(opt.expiryBlock);
            writer.writeU8(opt.status);
            i = SafeMath.add(i, u256.One);
        }

        return writer;
    }

    @view
    @method('feeRecipient')
    @returns({ name: 'recipient', type: ABIDataTypes.ADDRESS })
    public feeRecipientMethod(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeAddress(this.feeRecipientStore.value);
        return writer;
    }

    @view
    @method('buyFeeBps')
    @returns({ name: 'bps', type: ABIDataTypes.UINT64 })
    public buyFeeBpsMethod(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(8);
        writer.writeU64(BUY_FEE_BPS);
        return writer;
    }

    @view
    @method('exerciseFeeBps')
    @returns({ name: 'bps', type: ABIDataTypes.UINT64 })
    public exerciseFeeBpsMethod(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(8);
        writer.writeU64(EXERCISE_FEE_BPS);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'blocks', type: ABIDataTypes.UINT64 })
    public gracePeriodBlocks(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(8);
        writer.writeU64(GRACE_PERIOD_BLOCKS);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'blocks', type: ABIDataTypes.UINT64 })
    public maxExpiryBlocks(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(8);
        writer.writeU64(MAX_EXPIRY_BLOCKS);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'bps', type: ABIDataTypes.UINT64 })
    public cancelFeeBps(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(8);
        writer.writeU64(CANCEL_FEE_BPS);
        return writer;
    }

    @view
    @method(
        { name: 'optionType', type: ABIDataTypes.UINT8 },
        { name: 'strikePrice', type: ABIDataTypes.UINT256 },
        { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'collateral', type: ABIDataTypes.UINT256 })
    public calculateCollateral(calldata: Calldata): BytesWriter {
        const optionType = calldata.readU8();
        const strikePrice = calldata.readU256();
        const underlyingAmount = calldata.readU256();

        let collateralAmount: u256;
        if (optionType == CALL) {
            collateralAmount = underlyingAmount;
        } else {
            collateralAmount = SafeMath.div(SafeMath.mul(strikePrice, underlyingAmount), PRECISION);
        }

        const writer = new BytesWriter(32);
        writer.writeU256(collateralAmount);
        return writer;
    }

    // -------------------------------------------------------------------------
    // FEE MANAGEMENT
    // -------------------------------------------------------------------------

    @method('updateFeeRecipient', { name: 'newRecipient', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('FeeRecipientUpdated')
    public updateFeeRecipientMethod(calldata: Calldata): BytesWriter {
        const caller = Blockchain.tx.sender;
        if (!caller.equals(this.feeRecipientStore.value)) {
            throw new Revert('Only fee recipient');
        }

        const newAddr = calldata.readAddress();
        if (newAddr.equals(Address.zero())) {
            throw new Revert('Zero address not allowed');
        }

        this.feeRecipientStore.value = newAddr;

        const event = new BytesWriter(64);
        event.writeAddress(caller);
        event.writeAddress(newAddr);
        Blockchain.emit(new FeeRecipientUpdatedEvent(event));

        const result = new BytesWriter(1);
        result.writeBoolean(true);
        return result;
    }

    // -------------------------------------------------------------------------
    // INTERNAL HELPERS
    // -------------------------------------------------------------------------

    protected _transferFrom(token: Address, from: Address, to: Address, amount: u256): void {
        const calldata = new BytesWriter(100);
        calldata.writeSelector(encodeSelector('transferFrom(address,address,uint256)'));
        calldata.writeAddress(from);
        calldata.writeAddress(to);
        calldata.writeU256(amount);

        const result = Blockchain.call(token, calldata, true);
        if (!result.success) {
            throw new Revert('Token transferFrom failed');
        }
    }

    protected _transfer(token: Address, to: Address, amount: u256): void {
        // Use transferFrom(self, to, amount) — when from == msg.sender (pool == pool),
        // the OP20 _spendAllowance check is bypassed. This avoids cross-contract
        // `tx.sender` ambiguity that causes `transfer(to, amount)` to fail.
        const calldata = new BytesWriter(100);
        calldata.writeSelector(encodeSelector('transferFrom(address,address,uint256)'));
        calldata.writeAddress(Blockchain.contractAddress);
        calldata.writeAddress(to);
        calldata.writeU256(amount);

        const result = Blockchain.call(token, calldata, false);
        if (!result.success) {
            throw new Revert('Transfer out failed');
        }
    }
}
