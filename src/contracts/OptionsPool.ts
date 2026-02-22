import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    BytesReader,
    Calldata,
    Revert,
    SafeMath,
    StoredAddress,
    StoredU256,
    StoredBoolean,
    Upgradeable,
    encodeSelector,
    Selector,
    EMPTY_BUFFER,
    NetEvent,
} from '@btc-vision/btc-runtime/runtime';
import { sha256 } from '@btc-vision/btc-runtime/runtime/env/global';

const CALL: u8 = 0;
const PUT: u8 = 1;

const OPEN: u8 = 0;
const PURCHASED: u8 = 1;
const EXERCISED: u8 = 2;
const EXPIRED: u8 = 3;
const CANCELLED: u8 = 4;

const GRACE_PERIOD_BLOCKS: u64 = 144;
const MAX_EXPIRY_BLOCKS: u64 = 52560;
const CANCEL_FEE_BPS: u64 = 100;

// Storage pointers (must be const outside class, before OptionStorage class)
const underlyingPointer: u16 = Blockchain.nextPointer;
const premiumTokenPointer: u16 = Blockchain.nextPointer;
const nextIdPointer: u16 = Blockchain.nextPointer;
const lockedPointer: u16 = Blockchain.nextPointer;
const accumulatedFeesPointer: u16 = Blockchain.nextPointer;
const optionsPointer: u16 = Blockchain.nextPointer;

class Option {
    id: u256 = u256.Zero;
    writer: Address = Address.zero();
    buyer: Address = Address.zero();
    strikePrice: u256 = u256.Zero;
    underlyingAmount: u256 = u256.Zero;
    premium: u256 = u256.Zero;
    expiryBlock: u64 = 0;
    createdBlock: u64 = 0;
    optionType: u8 = CALL;
    status: u8 = OPEN;
}

class OptionStorage {
    private basePointer: u16;

    constructor(pointer: u16) {
        this.basePointer = pointer;
    }

    private getKey(optionId: u256, fieldOffset: u8): Uint8Array {
        const writer = new BytesWriter(34);
        writer.writeU16(this.basePointer);
        writer.writeU256(optionId);
        writer.writeU8(fieldOffset);
        return sha256(writer.getBuffer());
    }

    setWriter(optionId: u256, writer: Address): void {
        Blockchain.setStorageAt(this.getKey(optionId, 0), writer);
    }

    getWriter(optionId: u256): Address {
        const data = Blockchain.getStorageAt(this.getKey(optionId, 0));
        return Address.fromUint8Array(data);
    }

    setBuyer(optionId: u256, buyer: Address): void {
        Blockchain.setStorageAt(this.getKey(optionId, 1), buyer);
    }

    getBuyer(optionId: u256): Address {
        const data = Blockchain.getStorageAt(this.getKey(optionId, 1));
        return Address.fromUint8Array(data);
    }

    setStrikePrice(optionId: u256, price: u256): void {
        Blockchain.setStorageAt(this.getKey(optionId, 2), price.toUint8Array(true));
    }

    getStrikePrice(optionId: u256): u256 {
        const data = Blockchain.getStorageAt(this.getKey(optionId, 2));
        return u256.fromUint8ArrayBE(data);
    }

    setUnderlyingAmount(optionId: u256, amount: u256): void {
        Blockchain.setStorageAt(this.getKey(optionId, 3), amount.toUint8Array(true));
    }

    getUnderlyingAmount(optionId: u256): u256 {
        const data = Blockchain.getStorageAt(this.getKey(optionId, 3));
        return u256.fromUint8ArrayBE(data);
    }

    setPremium(optionId: u256, premium: u256): void {
        Blockchain.setStorageAt(this.getKey(optionId, 4), premium.toUint8Array(true));
    }

    getPremium(optionId: u256): u256 {
        const data = Blockchain.getStorageAt(this.getKey(optionId, 4));
        return u256.fromUint8ArrayBE(data);
    }

    setExpiryBlock(optionId: u256, blockNum: u64): void {
        const key = this.getKey(optionId, 5);
        const data = new Uint8Array(32);
        const view = new DataView(data.buffer);
        view.setBigUint64(24, blockNum as u64, false);
        Blockchain.setStorageAt(key, data);
    }

    getExpiryBlock(optionId: u256): u64 {
        const data = Blockchain.getStorageAt(this.getKey(optionId, 5));
        const view = new DataView(data.buffer);
        return view.getBigUint64(24, false) as u64;
    }

    setCreatedBlock(optionId: u256, blockNum: u64): void {
        const key = this.getKey(optionId, 6);
        const data = new Uint8Array(32);
        const view = new DataView(data.buffer);
        view.setBigUint64(24, blockNum as u64, false);
        Blockchain.setStorageAt(key, data);
    }

    getCreatedBlock(optionId: u256): u64 {
        const data = Blockchain.getStorageAt(this.getKey(optionId, 6));
        const view = new DataView(data.buffer);
        return view.getBigUint64(24, false) as u64;
    }

    setOptionType(optionId: u256, optionType: u8): void {
        const data = new Uint8Array(32);
        data[31] = optionType;
        Blockchain.setStorageAt(this.getKey(optionId, 7), data);
    }

    getOptionType(optionId: u256): u8 {
        const data = Blockchain.getStorageAt(this.getKey(optionId, 7));
        return data[31];
    }

    setStatus(optionId: u256, status: u8): void {
        const data = new Uint8Array(32);
        data[31] = status;
        Blockchain.setStorageAt(this.getKey(optionId, 8), data);
    }

    getStatus(optionId: u256): u8 {
        const data = Blockchain.getStorageAt(this.getKey(optionId, 8));
        return data[31];
    }

    exists(optionId: u256): boolean {
        const key = this.getKey(optionId, 0);
        return Blockchain.hasStorageAt(key);
    }

    get(optionId: u256): Option {
        const option = new Option();
        option.id = optionId;
        option.writer = this.getWriter(optionId);
        option.buyer = this.getBuyer(optionId);
        option.strikePrice = this.getStrikePrice(optionId);
        option.underlyingAmount = this.getUnderlyingAmount(optionId);
        option.premium = this.getPremium(optionId);
        option.expiryBlock = this.getExpiryBlock(optionId);
        option.createdBlock = this.getCreatedBlock(optionId);
        option.optionType = this.getOptionType(optionId);
        option.status = this.getStatus(optionId);
        return option;
    }

    set(optionId: u256, option: Option): void {
        this.setWriter(optionId, option.writer);
        this.setBuyer(optionId, option.buyer);
        this.setStrikePrice(optionId, option.strikePrice);
        this.setUnderlyingAmount(optionId, option.underlyingAmount);
        this.setPremium(optionId, option.premium);
        this.setExpiryBlock(optionId, option.expiryBlock);
        this.setCreatedBlock(optionId, option.createdBlock);
        this.setOptionType(optionId, option.optionType);
        this.setStatus(optionId, option.status);
    }
}

@final
export class OptionsPool extends Upgradeable {
    protected readonly upgradeDelay: u64 = 144;

    private _underlying!: StoredAddress;
    private _premiumToken!: StoredAddress;
    private _nextId!: StoredU256;
    private _locked!: StoredBoolean;
    private _accumulatedFees!: StoredU256;
    private _options!: OptionStorage;

    public constructor() {
        super();

        this._underlying = new StoredAddress(underlyingPointer);
        this._premiumToken = new StoredAddress(premiumTokenPointer);
        this._nextId = new StoredU256(nextIdPointer, EMPTY_BUFFER);
        this._locked = new StoredBoolean(lockedPointer, false);
        this._accumulatedFees = new StoredU256(accumulatedFeesPointer, EMPTY_BUFFER);
        this._options = new OptionStorage(optionsPointer);
    }

    public override onDeployment(calldata: Calldata): void {
        super.onDeployment(calldata);

        const underlying = calldata.readAddress();
        const premiumToken = calldata.readAddress();

        this._underlying.value = underlying;
        this._premiumToken.value = premiumToken;
    }

    public override execute(method: Selector, calldata: Calldata): BytesWriter {
        switch (method) {
            case encodeSelector('underlying()'):
                return this.getUnderlying(calldata);
            case encodeSelector('premiumToken()'):
                return this.getPremiumToken(calldata);
            case encodeSelector('writeOption(uint8,uint256,uint64,uint256,uint256)'):
                return this.writeOption(calldata);
            case encodeSelector('cancelOption(uint256)'):
                return this.cancelOption(calldata);
            case encodeSelector('buyOption(uint256)'):
                return this.buyOption(calldata);
            case encodeSelector('exercise(uint256)'):
                return this.exercise(calldata);
            case encodeSelector('settle(uint256)'):
                return this.settle(calldata);
            case encodeSelector('getOption(uint256)'):
                return this.getOption(calldata);
            case encodeSelector('optionCount()'):
                return this.optionCount(calldata);
            case encodeSelector('accumulatedFees()'):
                return this.accumulatedFees(calldata);
            case encodeSelector('gracePeriodBlocks()'):
                return this.gracePeriodBlocks(calldata);
            case encodeSelector('maxExpiryBlocks()'):
                return this.maxExpiryBlocks(calldata);
            case encodeSelector('cancelFeeBps()'):
                return this.cancelFeeBps(calldata);
            case encodeSelector('calculateCollateral(uint8,uint256,uint256)'):
                return this.calculateCollateral(calldata);
            default:
                return super.execute(method, calldata);
        }
    }

    @method()
    @returns({ name: 'token', type: ABIDataTypes.ADDRESS })
    public getUnderlying(calldata: Calldata): BytesWriter {
        const underlying = this._underlying.value;
        const writer = new BytesWriter(32);
        writer.writeAddress(underlying);
        return writer;
    }

    @method()
    @returns({ name: 'token', type: ABIDataTypes.ADDRESS })
    public getPremiumToken(calldata: Calldata): BytesWriter {
        const premiumToken = this._premiumToken.value;
        const writer = new BytesWriter(32);
        writer.writeAddress(premiumToken);
        return writer;
    }

    @method({ name: 'optionId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'option', type: ABIDataTypes.TUPLE, components: [
        { name: 'id', type: ABIDataTypes.UINT256 },
        { name: 'writer', type: ABIDataTypes.ADDRESS },
        { name: 'buyer', type: ABIDataTypes.ADDRESS },
        { name: 'optionType', type: ABIDataTypes.UINT8 },
        { name: 'strikePrice', type: ABIDataTypes.UINT256 },
        { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
        { name: 'premium', type: ABIDataTypes.UINT256 },
        { name: 'expiryBlock', type: ABIDataTypes.UINT64 },
        { name: 'status', type: ABIDataTypes.UINT8 },
    ]})
    public getOption(calldata: Calldata): BytesWriter {
        const optionId = calldata.readU256();

        if (!this._options.exists(optionId)) {
            throw new Revert('Option not found');
        }

        const option = this._options.get(optionId);

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

    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    public optionCount(calldata: Calldata): BytesWriter {
        const count = this._nextId.value;
        const writer = new BytesWriter(32);
        writer.writeU256(count);
        return writer;
    }

    @method()
    @returns({ name: 'fees', type: ABIDataTypes.UINT256 })
    public accumulatedFees(calldata: Calldata): BytesWriter {
        const fees = this._accumulatedFees.value;
        const writer = new BytesWriter(32);
        writer.writeU256(fees);
        return writer;
    }

    @method()
    @returns({ name: 'blocks', type: ABIDataTypes.UINT64 })
    public gracePeriodBlocks(calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(8);
        writer.writeU64(GRACE_PERIOD_BLOCKS);
        return writer;
    }

    @method()
    @returns({ name: 'blocks', type: ABIDataTypes.UINT64 })
    public maxExpiryBlocks(calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(8);
        writer.writeU64(MAX_EXPIRY_BLOCKS);
        return writer;
    }

    @method()
    @returns({ name: 'bps', type: ABIDataTypes.UINT64 })
    public cancelFeeBps(calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(8);
        writer.writeU64(CANCEL_FEE_BPS);
        return writer;
    }

    @method({ name: 'optionType', type: ABIDataTypes.UINT8 }, { name: 'strikePrice', type: ABIDataTypes.UINT256 }, { name: 'underlyingAmount', type: ABIDataTypes.UINT256 })
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public calculateCollateral(calldata: Calldata): BytesWriter {
        const optionType = calldata.readU8();
        const strikePrice = calldata.readU256();
        const underlyingAmount = calldata.readU256();

        let collateralAmount: u256;
        if (optionType == CALL) {
            collateralAmount = underlyingAmount;
        } else {
            collateralAmount = SafeMath.mul(strikePrice, underlyingAmount);
        }

        const writer = new BytesWriter(32);
        writer.writeU256(collateralAmount);
        return writer;
    }

    @method(
        { name: 'optionType', type: ABIDataTypes.UINT8 },
        { name: 'strikePrice', type: ABIDataTypes.UINT256 },
        { name: 'expiryBlock', type: ABIDataTypes.UINT64 },
        { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
        { name: 'premium', type: ABIDataTypes.UINT256 },
    )
    @emit('OptionWritten')
    @returns({ name: 'optionId', type: ABIDataTypes.UINT256 })
    public writeOption(calldata: Calldata): BytesWriter {
        if (this._locked.value) {
            throw new Revert('ReentrancyGuard: LOCKED');
        }
        this._locked.value = true;

        const optionType = calldata.readU8();
        const strikePrice = calldata.readU256();
        const expiryBlock = calldata.readU64();
        const underlyingAmount = calldata.readU256();
        const premium = calldata.readU256();
        const writer = Blockchain.tx.sender;

        if (optionType > 1) {
            this._locked.value = false;
            throw new Revert('Invalid option type');
        }
        if (strikePrice.equals(u256.Zero)) {
            this._locked.value = false;
            throw new Revert('Strike must be > 0');
        }
        if (underlyingAmount.equals(u256.Zero)) {
            this._locked.value = false;
            throw new Revert('Amount must be > 0');
        }
        if (premium.equals(u256.Zero)) {
            this._locked.value = false;
            throw new Revert('Premium must be > 0');
        }

        const currentBlock = Blockchain.block.number;
        if (expiryBlock <= currentBlock) {
            this._locked.value = false;
            throw new Revert('Expiry in past');
        }
        if (expiryBlock > currentBlock + MAX_EXPIRY_BLOCKS) {
            this._locked.value = false;
            throw new Revert('Expiry too far');
        }

        let collateralToken: Address;
        let collateralAmount: u256;

        if (optionType == CALL) {
            collateralToken = this._underlying.value;
            collateralAmount = underlyingAmount;
        } else {
            collateralToken = this._premiumToken.value;
            collateralAmount = SafeMath.mul(strikePrice, underlyingAmount);
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

        this._options.set(optionId, option);

        this._transferFrom(collateralToken, writer, Blockchain.contractAddress, collateralAmount);

        const event = new BytesWriter(200);
        event.writeU256(optionId);
        event.writeAddress(writer);
        event.writeU8(optionType);
        event.writeU256(strikePrice);
        event.writeU256(underlyingAmount);
        event.writeU256(premium);
        event.writeU64(expiryBlock);
        Blockchain.emit(new NetEvent('OptionWritten', event.getBuffer()));

        const result = new BytesWriter(32);
        result.writeU256(optionId);

        this._locked.value = false;
        return result;
    }

    @method({ name: 'optionId', type: ABIDataTypes.UINT256 })
    @emit('OptionCancelled')
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public cancelOption(calldata: Calldata): BytesWriter {
        if (this._locked.value) {
            throw new Revert('ReentrancyGuard: LOCKED');
        }
        this._locked.value = true;

        const optionId = calldata.readU256();

        if (!this._options.exists(optionId)) {
            this._locked.value = false;
            throw new Revert('Option not found');
        }

        const option = this._options.get(optionId);
        const caller = Blockchain.tx.sender;

        if (!caller.equals(option.writer)) {
            this._locked.value = false;
            throw new Revert('Not writer');
        }
        if (option.status != OPEN) {
            this._locked.value = false;
            throw new Revert('Not open');
        }

        let collateralToken: Address;
        let collateralAmount: u256;

        if (option.optionType == CALL) {
            collateralToken = this._underlying.value;
            collateralAmount = option.underlyingAmount;
        } else {
            collateralToken = this._premiumToken.value;
            collateralAmount = SafeMath.mul(option.strikePrice, option.underlyingAmount);
        }

        const fee = SafeMath.div(
            SafeMath.mul(collateralAmount, u256.fromU64(CANCEL_FEE_BPS)),
            u256.fromU64(10000)
        );
        const returnAmount = SafeMath.sub(collateralAmount, fee);

        option.status = CANCELLED;
        this._options.setStatus(optionId, CANCELLED);

        this._transfer(collateralToken, option.writer, returnAmount);

        const currentFees = this._accumulatedFees.value;
        this._accumulatedFees.value = SafeMath.add(currentFees, fee);

        const event = new BytesWriter(100);
        event.writeU256(optionId);
        event.writeAddress(option.writer);
        event.writeU256(returnAmount);
        event.writeU256(fee);
        Blockchain.emit(new NetEvent('OptionCancelled', event.getBuffer()));

        const result = new BytesWriter(1);
        result.writeBoolean(true);

        this._locked.value = false;
        return result;
    }

    @method({ name: 'optionId', type: ABIDataTypes.UINT256 })
    @emit('OptionPurchased')
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public buyOption(calldata: Calldata): BytesWriter {
        if (this._locked.value) {
            throw new Revert('ReentrancyGuard: LOCKED');
        }
        this._locked.value = true;

        const optionId = calldata.readU256();

        if (!this._options.exists(optionId)) {
            this._locked.value = false;
            throw new Revert('Option not found');
        }

        const option = this._options.get(optionId);
        const buyer = Blockchain.tx.sender;

        if (option.status != OPEN) {
            this._locked.value = false;
            throw new Revert('Not open');
        }

        const currentBlock = Blockchain.block.number;
        if (currentBlock >= option.expiryBlock) {
            this._locked.value = false;
            throw new Revert('Already expired');
        }

        if (buyer.equals(option.writer)) {
            this._locked.value = false;
            throw new Revert('Writer cannot buy own option');
        }

        this._options.setBuyer(optionId, buyer);
        this._options.setStatus(optionId, PURCHASED);

        this._transferFrom(this._premiumToken.value, buyer, option.writer, option.premium);

        const event = new BytesWriter(100);
        event.writeU256(optionId);
        event.writeAddress(buyer);
        event.writeAddress(option.writer);
        event.writeU256(option.premium);
        event.writeU64(currentBlock);
        Blockchain.emit(new NetEvent('OptionPurchased', event.getBuffer()));

        const result = new BytesWriter(1);
        result.writeBoolean(true);

        this._locked.value = false;
        return result;
    }

    @method({ name: 'optionId', type: ABIDataTypes.UINT256 })
    @emit('OptionExercised')
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public exercise(calldata: Calldata): BytesWriter {
        if (this._locked.value) {
            throw new Revert('ReentrancyGuard: LOCKED');
        }
        this._locked.value = true;

        const optionId = calldata.readU256();

        if (!this._options.exists(optionId)) {
            this._locked.value = false;
            throw new Revert('Option not found');
        }

        const option = this._options.get(optionId);
        const caller = Blockchain.tx.sender;

        if (option.status != PURCHASED) {
            this._locked.value = false;
            throw new Revert('Not purchased');
        }

        if (!caller.equals(option.buyer)) {
            this._locked.value = false;
            throw new Revert('Not buyer');
        }

        const currentBlock = Blockchain.block.number;
        if (currentBlock < option.expiryBlock) {
            this._locked.value = false;
            throw new Revert('Not yet expired');
        }

        const graceEnd = option.expiryBlock + GRACE_PERIOD_BLOCKS;
        if (currentBlock >= graceEnd) {
            this._locked.value = false;
            throw new Revert('Grace period ended');
        }

        const strikeValue = SafeMath.mul(option.strikePrice, option.underlyingAmount);

        this._options.setStatus(optionId, EXERCISED);

        if (option.optionType == CALL) {
            this._transferFrom(this._premiumToken.value, caller, option.writer, strikeValue);
            this._transfer(this._underlying.value, caller, option.underlyingAmount);
        } else {
            this._transferFrom(this._underlying.value, caller, option.writer, option.underlyingAmount);
            this._transfer(this._premiumToken.value, caller, strikeValue);
        }

        const event = new BytesWriter(100);
        event.writeU256(optionId);
        event.writeAddress(option.buyer);
        event.writeAddress(option.writer);
        event.writeU8(option.optionType);
        event.writeU256(option.underlyingAmount);
        event.writeU256(strikeValue);
        Blockchain.emit(new NetEvent('OptionExercised', event.getBuffer()));

        const result = new BytesWriter(1);
        result.writeBoolean(true);

        this._locked.value = false;
        return result;
    }

    @method({ name: 'optionId', type: ABIDataTypes.UINT256 })
    @emit('OptionExpired')
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public settle(calldata: Calldata): BytesWriter {
        if (this._locked.value) {
            throw new Revert('ReentrancyGuard: LOCKED');
        }
        this._locked.value = true;

        const optionId = calldata.readU256();

        if (!this._options.exists(optionId)) {
            this._locked.value = false;
            throw new Revert('Option not found');
        }

        const option = this._options.get(optionId);

        if (option.status != PURCHASED) {
            this._locked.value = false;
            throw new Revert('Not purchased');
        }

        const currentBlock = Blockchain.block.number;
        const graceEnd = option.expiryBlock + GRACE_PERIOD_BLOCKS;
        if (currentBlock < graceEnd) {
            this._locked.value = false;
            throw new Revert('Grace period not ended');
        }

        let collateralToken: Address;
        let collateralAmount: u256;

        if (option.optionType == CALL) {
            collateralToken = this._underlying.value;
            collateralAmount = option.underlyingAmount;
        } else {
            collateralToken = this._premiumToken.value;
            collateralAmount = SafeMath.mul(option.strikePrice, option.underlyingAmount);
        }

        this._options.setStatus(optionId, EXPIRED);

        this._transfer(collateralToken, option.writer, collateralAmount);

        const event = new BytesWriter(100);
        event.writeU256(optionId);
        event.writeAddress(option.writer);
        event.writeU256(collateralAmount);
        Blockchain.emit(new NetEvent('OptionExpired', event.getBuffer()));

        const result = new BytesWriter(1);
        result.writeBoolean(true);

        this._locked.value = false;
        return result;
    }

    private _transferFrom(token: Address, from: Address, to: Address, amount: u256): void {
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

    private _transfer(token: Address, to: Address, amount: u256): void {
        const calldata = new BytesWriter(68);
        calldata.writeSelector(encodeSelector('transfer(address,uint256)'));
        calldata.writeAddress(to);
        calldata.writeU256(amount);

        const result = Blockchain.call(token, calldata, true);
        if (!result.success) {
            throw new Revert('Token transfer failed');
        }
    }
}
