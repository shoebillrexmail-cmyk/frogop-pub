/**
 * OptionsPool - A pool for trading options on a specific token pair
 * 
 * This contract manages options for a single underlying/premium token pair.
 * Writers can create options (CALL or PUT), and buyers can purchase them.
 * Options can be exercised, settled, or cancelled according to the protocol rules.
 * 
 * ## Storage Pattern Explanation
 * 
 * Following OPNet best practices, we use a hybrid storage pattern:
 * 
 * ### Critical Fields (3 fields in constructor):
 * - underlying: The underlying token address
 * - premiumToken: The token used for premium payments
 * - nextId: Counter for option IDs
 * 
 * ### Lazy-Loaded Fields (initialized on first access):
 * - locked: Reentrancy guard boolean
 * - accumulatedFees: Protocol fees collected
 * - options: Option storage (complex nested structure)
 * 
 * This pattern avoids the WASM start function gas limit while maintaining
 * all required functionality.
 * 
 * ## Gas Optimization
 * 
 * - Cold storage reads: ~21M gas (first access to lazy fields)
 * - Warm storage reads: ~5K gas (subsequent accesses)
 * - Write operations: ~20M gas
 * 
 * ## Option Lifecycle
 * 
 * 1. Writer calls writeOption() - Creates option, locks collateral
 * 2. Buyer calls buyOption() - Pays premium, receives option rights
 * 3. At expiry:
 *    - Buyer can exercise() (within grace period)
 *    - Anyone can settle() (after grace period)
 * 4. Writer can cancelOption() (before purchase, with fee)
 * 
 * @author Frogop Team
 * @version 1.0.0
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
    StoredBoolean,
    OP_NET,
    encodeSelector,
    Selector,
    EMPTY_BUFFER,
    NetEvent,
} from '@btc-vision/btc-runtime/runtime';
// =============================================================================
// CONSTANTS
// =============================================================================

/** Option type: CALL - Right to buy underlying at strike price */
const CALL: u8 = 0;

/** Option type: PUT - Right to sell underlying at strike price */
const PUT: u8 = 1;

/** Option status: OPEN - Available for purchase */
const OPEN: u8 = 0;

/** Option status: PURCHASED - Bought by buyer, not yet exercised */
const PURCHASED: u8 = 1;

/** Option status: EXERCISED - Buyer exercised the option */
const EXERCISED: u8 = 2;

/** Option status: EXPIRED - Expired without exercise */
const EXPIRED: u8 = 3;

/** Option status: CANCELLED - Writer cancelled before purchase */
const CANCELLED: u8 = 4;

/** Grace period after expiry for exercise (in blocks) ~1 day */
const GRACE_PERIOD_BLOCKS: u64 = 144;

/** Maximum expiry time from creation (in blocks) ~1 year */
const MAX_EXPIRY_BLOCKS: u64 = 52560;

/** Cancellation fee in basis points (100 = 1%) */
const CANCEL_FEE_BPS: u64 = 100;

// =============================================================================
// STORAGE POINTER DEFINITIONS
// =============================================================================

const UNDERLYING_POINTER: u16 = 10;
const PREMIUM_TOKEN_POINTER: u16 = 11;
const NEXT_ID_POINTER: u16 = 12;
const ACCUMULATED_FEES_POINTER: u16 = 101;

/**
 * Optimized Option Storage Pointers
 * 
 * Uses direct pointer arithmetic instead of SHA256 hashing.
 * Each option occupies 7 contiguous storage slots.
 * 
 * Layout for optionId:
 *   [base + id*7 + 0] = writer (Address)
 *   [base + id*7 + 1] = buyer (Address)
 *   [base + id*7 + 2] = strikePrice (u256)
 *   [base + id*7 + 3] = underlyingAmount (u256)
 *   [base + id*7 + 4] = premium (u256)
 *   [base + id*7 + 5] = expiryBlock | createdBlock (packed u64|u64)
 *   [base + id*7 + 6] = optionType | status (packed u8|u8)
 */
const OPTIONS_BASE_POINTER: u16 = 200;
const SLOTS_PER_OPTION: u8 = 7;

const LOCKED_POINTER: u16 = 300;

// =============================================================================
// EVENTS
// =============================================================================

/** Emitted when a new option is written */
class OptionWrittenEvent extends NetEvent {
    constructor(data: BytesWriter) {
        super('OptionWritten', data);
    }
}

/** Emitted when an option is cancelled */
class OptionCancelledEvent extends NetEvent {
    constructor(data: BytesWriter) {
        super('OptionCancelled', data);
    }
}

/** Emitted when an option is purchased */
class OptionPurchasedEvent extends NetEvent {
    constructor(data: BytesWriter) {
        super('OptionPurchased', data);
    }
}

/** Emitted when an option is exercised */
class OptionExercisedEvent extends NetEvent {
    constructor(data: BytesWriter) {
        super('OptionExercised', data);
    }
}

/** Emitted when an option expires */
class OptionExpiredEvent extends NetEvent {
    constructor(data: BytesWriter) {
        super('OptionExpired', data);
    }
}

// =============================================================================
// DATA STRUCTURES
// =============================================================================

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

/**
 * Optimized Option Storage
 * 
 * Uses direct pointer arithmetic for O(1) access without SHA256 overhead.
 * Gas savings: ~90% reduction in option read/write operations.
 * 
 * Storage Layout (7 slots per option):
 *   0: writer (Address)
 *   1: buyer (Address)
 *   2: strikePrice (u256)
 *   3: underlyingAmount (u256)
 *   4: premium (u256)
 *   5: expiryBlock (u64) | createdBlock (u64) - packed
 *   6: optionType (u8) | status (u8) - packed
 */
class OptionStorage {
    private basePointer: u16;
    
    constructor(pointer: u16) {
        this.basePointer = pointer;
    }
    
    private getSlotPointer(optionId: u256, slot: u8): Uint8Array {
        const idU64 = optionId.toU64();
        const ptr = this.basePointer + u16(idU64 * u64(SLOTS_PER_OPTION)) + u16(slot);
        const key = new Uint8Array(32);
        key[30] = u8((ptr >> 8) & 0xFF);
        key[31] = u8(ptr & 0xFF);
        return key;
    }
    
    setWriter(optionId: u256, writer: Address): void {
        Blockchain.setStorageAt(this.getSlotPointer(optionId, 0), writer);
    }
    
    getWriter(optionId: u256): Address {
        return Address.fromUint8Array(Blockchain.getStorageAt(this.getSlotPointer(optionId, 0)));
    }
    
    setBuyer(optionId: u256, buyer: Address): void {
        Blockchain.setStorageAt(this.getSlotPointer(optionId, 1), buyer);
    }
    
    getBuyer(optionId: u256): Address {
        return Address.fromUint8Array(Blockchain.getStorageAt(this.getSlotPointer(optionId, 1)));
    }
    
    setStrikePrice(optionId: u256, price: u256): void {
        Blockchain.setStorageAt(this.getSlotPointer(optionId, 2), price.toUint8Array(true));
    }
    
    getStrikePrice(optionId: u256): u256 {
        return u256.fromUint8ArrayBE(Blockchain.getStorageAt(this.getSlotPointer(optionId, 2)));
    }
    
    setUnderlyingAmount(optionId: u256, amount: u256): void {
        Blockchain.setStorageAt(this.getSlotPointer(optionId, 3), amount.toUint8Array(true));
    }
    
    getUnderlyingAmount(optionId: u256): u256 {
        return u256.fromUint8ArrayBE(Blockchain.getStorageAt(this.getSlotPointer(optionId, 3)));
    }
    
    setPremium(optionId: u256, premium: u256): void {
        Blockchain.setStorageAt(this.getSlotPointer(optionId, 4), premium.toUint8Array(true));
    }
    
    getPremium(optionId: u256): u256 {
        return u256.fromUint8ArrayBE(Blockchain.getStorageAt(this.getSlotPointer(optionId, 4)));
    }
    
    private packBlocks(expiryBlock: u64, createdBlock: u64): Uint8Array {
        const data = new Uint8Array(32);
        for (let i = 0; i < 8; i++) {
            data[16 + i] = u8((expiryBlock >> u64(56 - i * 8)) & 0xFF);
            data[24 + i] = u8((createdBlock >> u64(56 - i * 8)) & 0xFF);
        }
        return data;
    }
    
    setExpiryAndCreatedBlock(optionId: u256, expiryBlock: u64, createdBlock: u64): void {
        Blockchain.setStorageAt(this.getSlotPointer(optionId, 5), this.packBlocks(expiryBlock, createdBlock));
    }
    
    getExpiryBlock(optionId: u256): u64 {
        const data = Blockchain.getStorageAt(this.getSlotPointer(optionId, 5));
        let result: u64 = 0;
        for (let i = 0; i < 8; i++) {
            result = (result << 8) | u64(data[16 + i]);
        }
        return result;
    }
    
    getCreatedBlock(optionId: u256): u64 {
        const data = Blockchain.getStorageAt(this.getSlotPointer(optionId, 5));
        let result: u64 = 0;
        for (let i = 0; i < 8; i++) {
            result = (result << 8) | u64(data[24 + i]);
        }
        return result;
    }
    
    setExpiryBlock(optionId: u256, blockNum: u64): void {
        const createdBlock = this.getCreatedBlock(optionId);
        Blockchain.setStorageAt(this.getSlotPointer(optionId, 5), this.packBlocks(blockNum, createdBlock));
    }
    
    setCreatedBlock(optionId: u256, blockNum: u64): void {
        const expiryBlock = this.getExpiryBlock(optionId);
        Blockchain.setStorageAt(this.getSlotPointer(optionId, 5), this.packBlocks(expiryBlock, blockNum));
    }
    
    private packTypeAndStatus(optionType: u8, status: u8): Uint8Array {
        const data = new Uint8Array(32);
        data[30] = optionType;
        data[31] = status;
        return data;
    }
    
    setOptionType(optionId: u256, optionType: u8): void {
        const status = this.getStatus(optionId);
        Blockchain.setStorageAt(this.getSlotPointer(optionId, 6), this.packTypeAndStatus(optionType, status));
    }
    
    getOptionType(optionId: u256): u8 {
        return Blockchain.getStorageAt(this.getSlotPointer(optionId, 6))[30];
    }
    
    setStatus(optionId: u256, status: u8): void {
        const optionType = this.getOptionType(optionId);
        Blockchain.setStorageAt(this.getSlotPointer(optionId, 6), this.packTypeAndStatus(optionType, status));
    }
    
    getStatus(optionId: u256): u8 {
        return Blockchain.getStorageAt(this.getSlotPointer(optionId, 6))[31];
    }
    
    exists(optionId: u256): boolean {
        return Blockchain.hasStorageAt(this.getSlotPointer(optionId, 0));
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
        this.setExpiryAndCreatedBlock(optionId, option.expiryBlock, option.createdBlock);
        Blockchain.setStorageAt(this.getSlotPointer(optionId, 6), this.packTypeAndStatus(option.optionType, option.status));
    }
}

// =============================================================================
// CONTRACT IMPLEMENTATION
// =============================================================================

@final
export class OptionsPool extends OP_NET {
    // -------------------------------------------------------------------------
    // CRITICAL STORAGE FIELDS (Initialized in Constructor)
    // -------------------------------------------------------------------------

    /** Underlying token address - set at deployment */
    private _underlying: StoredAddress;

    /** Premium token address - set at deployment */
    private _premiumToken: StoredAddress;

    /** Next option ID counter - auto-incremented */
    private _nextId: StoredU256;

    // -------------------------------------------------------------------------
    // LAZY-LOADED STORAGE FIELDS
    // -------------------------------------------------------------------------

    /** Reentrancy guard - initialized on first access */
    private _locked: StoredBoolean | null = null;

    /** Accumulated protocol fees - initialized on first access */
    private _accumulatedFees: StoredU256 | null = null;

    /** Option storage - initialized on first access */
    private _options: OptionStorage | null = null;

    /**
     * Constructor - Runs on EVERY contract interaction
     *
     * Initializes only 3 critical fields to avoid WASM start function gas limit.
     * Other fields are lazy-loaded on first access.
     */
    public constructor() {
        super();
        // Critical fields (3 fields = safe under gas limit)
        this._underlying = new StoredAddress(UNDERLYING_POINTER);
        this._premiumToken = new StoredAddress(PREMIUM_TOKEN_POINTER);
        // nextId starts at 0 by default
        this._nextId = new StoredU256(NEXT_ID_POINTER, EMPTY_BUFFER);
        // NOTE: locked, accumulatedFees, options are lazy-loaded
    }

    // -------------------------------------------------------------------------
    // LAZY GETTERS
    // -------------------------------------------------------------------------

    /**
     * Lazy getter for locked (reentrancy guard)
     * @returns StoredBoolean for reentrancy protection
     */
    private get locked(): StoredBoolean {
        if (!this._locked) {
            this._locked = new StoredBoolean(LOCKED_POINTER, false);
        }
        return this._locked!;
    }

    /**
     * Lazy getter for accumulatedFees
     * @returns StoredU256 for fee tracking
     */
    private get accumulatedFees(): StoredU256 {
        if (!this._accumulatedFees) {
            this._accumulatedFees = new StoredU256(ACCUMULATED_FEES_POINTER, EMPTY_BUFFER);
        }
        return this._accumulatedFees!;
    }

    /**
     * Lazy getter for options storage
     * @returns OptionStorage for option data
     */
    private get options(): OptionStorage {
        if (!this._options) {
            this._options = new OptionStorage(OPTIONS_BASE_POINTER);
        }
        return this._options!;
    }

    // -------------------------------------------------------------------------
    // LIFECYCLE HOOKS
    // -------------------------------------------------------------------------
    
    /**
     * onDeployment - Runs exactly ONCE when contract is deployed
     * 
     * @param calldata - Contains underlying and premiumToken addresses
     */
    public override onDeployment(calldata: Calldata): void {
        super.onDeployment(calldata);
        
        const underlying = calldata.readAddress();
        const premiumToken = calldata.readAddress();
        
        this._underlying.value = underlying;
        this._premiumToken.value = premiumToken;
    }
    
    // -------------------------------------------------------------------------
    // METHOD ROUTING
    // -------------------------------------------------------------------------
    
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
                return this.accumulatedFeesMethod(calldata);
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
    
    // -------------------------------------------------------------------------
    // VIEW METHODS
    // -------------------------------------------------------------------------
    
    public getUnderlying(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeAddress(this._underlying.value);
        return writer;
    }
    
    public getPremiumToken(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeAddress(this._premiumToken.value);
        return writer;
    }
    
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
    
    public optionCount(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this._nextId.value);
        return writer;
    }
    
    public accumulatedFeesMethod(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this.accumulatedFees.value);
        return writer;
    }
    
    public gracePeriodBlocks(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(8);
        writer.writeU64(GRACE_PERIOD_BLOCKS);
        return writer;
    }
    
    public maxExpiryBlocks(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(8);
        writer.writeU64(MAX_EXPIRY_BLOCKS);
        return writer;
    }
    
    public cancelFeeBps(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(8);
        writer.writeU64(CANCEL_FEE_BPS);
        return writer;
    }
    
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
    
    // -------------------------------------------------------------------------
    // STATE-CHANGING METHODS
    // -------------------------------------------------------------------------

    public writeOption(calldata: Calldata): BytesWriter {
        // Reentrancy guard
        if (this.locked.value) {
            throw new Revert('ReentrancyGuard: LOCKED');
        }
        this.locked.value = true;

        const optionType = calldata.readU8();
        const strikePrice = calldata.readU256();
        const expiryBlock = calldata.readU64();
        const underlyingAmount = calldata.readU256();
        const premium = calldata.readU256();
        const writer = Blockchain.tx.sender;

        // Validation
        if (optionType > 1) {
            this.locked.value = false;
            throw new Revert('Invalid option type');
        }
        if (strikePrice == u256.Zero || underlyingAmount == u256.Zero || premium == u256.Zero) {
            this.locked.value = false;
            throw new Revert('Values must be > 0');
        }

        const currentBlock = Blockchain.block.number;
        if (expiryBlock <= currentBlock) {
            this.locked.value = false;
            throw new Revert('Expiry in past');
        }
        if (expiryBlock > currentBlock + MAX_EXPIRY_BLOCKS) {
            this.locked.value = false;
            throw new Revert('Expiry too far');
        }

        // Calculate and lock collateral
        let collateralToken: Address;
        let collateralAmount: u256;

        if (optionType == CALL) {
            collateralToken = this._underlying.value;
            collateralAmount = underlyingAmount;
        } else {
            collateralToken = this._premiumToken.value;
            collateralAmount = SafeMath.mul(strikePrice, underlyingAmount);
        }

        // Generate option ID
        const optionId = this._nextId.value;
        this._nextId.value = SafeMath.add(optionId, u256.One);

        // Create option
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

        // Lock collateral
        this._transferFrom(collateralToken, writer, Blockchain.contractAddress, collateralAmount);

        // Emit event
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

        this.locked.value = false;
        return result;
    }

    public cancelOption(calldata: Calldata): BytesWriter {
        // Reentrancy guard
        if (this.locked.value) {
            throw new Revert('ReentrancyGuard: LOCKED');
        }
        this.locked.value = true;

        const optionId = calldata.readU256();

        if (!this.options.exists(optionId)) {
            this.locked.value = false;
            throw new Revert('Option not found');
        }

        const option = this.options.get(optionId);
        const caller = Blockchain.tx.sender;

        if (!caller.equals(option.writer)) {
            this.locked.value = false;
            throw new Revert('Not writer');
        }
        if (option.status != OPEN) {
            this.locked.value = false;
            throw new Revert('Not open');
        }

        // Calculate collateral and fee
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

        // Update state
        option.status = CANCELLED;
        this.options.setStatus(optionId, CANCELLED);

        // Return collateral minus fee
        this._transfer(collateralToken, option.writer, returnAmount);

        // Accumulate fee
        const currentFees = this.accumulatedFees.value;
        this.accumulatedFees.value = SafeMath.add(currentFees, fee);

        // Emit event
        const event = new BytesWriter(100);
        event.writeU256(optionId);
        event.writeAddress(option.writer);
        event.writeU256(returnAmount);
        event.writeU256(fee);
        Blockchain.emit(new OptionCancelledEvent(event));

        const result = new BytesWriter(1);
        result.writeBoolean(true);

        this.locked.value = false;
        return result;
    }

    public buyOption(calldata: Calldata): BytesWriter {
        // Reentrancy guard
        if (this.locked.value) {
            throw new Revert('ReentrancyGuard: LOCKED');
        }
        this.locked.value = true;

        const optionId = calldata.readU256();

        if (!this.options.exists(optionId)) {
            this.locked.value = false;
            throw new Revert('Option not found');
        }

        const option = this.options.get(optionId);
        const buyer = Blockchain.tx.sender;

        if (option.status != OPEN) {
            this.locked.value = false;
            throw new Revert('Not open');
        }

        const currentBlock = Blockchain.block.number;
        if (currentBlock >= option.expiryBlock) {
            this.locked.value = false;
            throw new Revert('Already expired');
        }

        if (buyer.equals(option.writer)) {
            this.locked.value = false;
            throw new Revert('Writer cannot buy own option');
        }

        // Update option
        this.options.setBuyer(optionId, buyer);
        this.options.setStatus(optionId, PURCHASED);

        // Transfer premium
        this._transferFrom(this._premiumToken.value, buyer, option.writer, option.premium);

        // Emit event
        const event = new BytesWriter(100);
        event.writeU256(optionId);
        event.writeAddress(buyer);
        event.writeAddress(option.writer);
        event.writeU256(option.premium);
        event.writeU64(currentBlock);
        Blockchain.emit(new OptionPurchasedEvent(event));

        const result = new BytesWriter(1);
        result.writeBoolean(true);

        this.locked.value = false;
        return result;
    }

    public exercise(calldata: Calldata): BytesWriter {
        // Reentrancy guard
        if (this.locked.value) {
            throw new Revert('ReentrancyGuard: LOCKED');
        }
        this.locked.value = true;

        const optionId = calldata.readU256();

        if (!this.options.exists(optionId)) {
            this.locked.value = false;
            throw new Revert('Option not found');
        }

        const option = this.options.get(optionId);
        const caller = Blockchain.tx.sender;

        if (option.status != PURCHASED) {
            this.locked.value = false;
            throw new Revert('Not purchased');
        }

        if (!caller.equals(option.buyer)) {
            this.locked.value = false;
            throw new Revert('Not buyer');
        }

        const currentBlock = Blockchain.block.number;
        if (currentBlock < option.expiryBlock) {
            this.locked.value = false;
            throw new Revert('Not yet expired');
        }

        const graceEnd = option.expiryBlock + GRACE_PERIOD_BLOCKS;
        if (currentBlock >= graceEnd) {
            this.locked.value = false;
            throw new Revert('Grace period ended');
        }

        const strikeValue = SafeMath.mul(option.strikePrice, option.underlyingAmount);

        this.options.setStatus(optionId, EXERCISED);

        if (option.optionType == CALL) {
            this._transferFrom(this._premiumToken.value, caller, option.writer, strikeValue);
            this._transfer(this._underlying.value, caller, option.underlyingAmount);
        } else {
            this._transferFrom(this._underlying.value, caller, option.writer, option.underlyingAmount);
            this._transfer(this._premiumToken.value, caller, strikeValue);
        }

        // Emit event
        const event = new BytesWriter(100);
        event.writeU256(optionId);
        event.writeAddress(option.buyer);
        event.writeAddress(option.writer);
        event.writeU8(option.optionType);
        event.writeU256(option.underlyingAmount);
        event.writeU256(strikeValue);
        Blockchain.emit(new OptionExercisedEvent(event));

        const result = new BytesWriter(1);
        result.writeBoolean(true);

        this.locked.value = false;
        return result;
    }

    public settle(calldata: Calldata): BytesWriter {
        // Reentrancy guard
        if (this.locked.value) {
            throw new Revert('ReentrancyGuard: LOCKED');
        }
        this.locked.value = true;

        const optionId = calldata.readU256();

        if (!this.options.exists(optionId)) {
            this.locked.value = false;
            throw new Revert('Option not found');
        }

        const option = this.options.get(optionId);

        if (option.status != PURCHASED) {
            this.locked.value = false;
            throw new Revert('Not purchased');
        }

        const currentBlock = Blockchain.block.number;
        const graceEnd = option.expiryBlock + GRACE_PERIOD_BLOCKS;
        if (currentBlock < graceEnd) {
            this.locked.value = false;
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

        this.options.setStatus(optionId, EXPIRED);

        this._transfer(collateralToken, option.writer, collateralAmount);

        // Emit event
        const event = new BytesWriter(100);
        event.writeU256(optionId);
        event.writeAddress(option.writer);
        event.writeU256(collateralAmount);
        Blockchain.emit(new OptionExpiredEvent(event));

        const result = new BytesWriter(1);
        result.writeBoolean(true);

        this.locked.value = false;
        return result;
    }
    
    // -------------------------------------------------------------------------
    // INTERNAL HELPERS
    // -------------------------------------------------------------------------
    
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
