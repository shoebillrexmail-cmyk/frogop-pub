/**
 * OptionsFactory - A factory contract for creating OptionsPool instances
 * 
 * This contract implements the OptionsFactory pattern for OPNet, allowing users to
 * create options pools for any underlying/premium token pair.
 * 
 * ## Storage Pattern
 * 
 * OPNet's WASM runtime has a gas limit for the start function (constructor). Each
 * `new StoredXXX()` call in the constructor consumes gas. With 4+ fields, we hit
 * the "out of gas during start function" error.
 * 
 * ### Solution: Use Only 3 Critical Fields
 * 
 * We limit constructor initialization to 3 fields:
 * - owner: Contract owner address
 * - poolTemplate: Template for deploying pools  
 * - pools: Mapping of (underlying, premiumToken) => poolAddress
 * 
 * The poolCount is derived from the pools mapping or tracked off-chain.
 * 
 * ### Pointer Layout
 *
 * | Pointer | Purpose | Type | Initialization |
 * |---------|---------|------|----------------|
 * | 10 | owner | StoredAddress | Constructor |
 * | 11 | poolTemplate | StoredAddress | Constructor |
 * | 12 | pools | MapOfMap<u256> | Constructor |
 * | 13 | treasury | StoredAddress | Lazy (set via setTreasury) |
 * | 14 | poolCount | StoredU256 | Lazy (incremented by createPool/registerPool) |
 * | 15 | poolList | SHA256-keyed raw storage | Lazy prefix for pool enumeration |
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
    EMPTY_BUFFER,
    MapOfMap,
    Revert,
    SafeMath,
    StoredAddress,
    StoredU256,
    OP_NET,
    encodeSelector,
    Selector,
    NetEvent,
} from '@btc-vision/btc-runtime/runtime';
import { sha256 } from '@btc-vision/btc-runtime/runtime/env/global';

const OWNER_POINTER: u16 = 10;
const POOL_TEMPLATE_POINTER: u16 = 11;
const POOLS_POINTER: u16 = 12;
const TREASURY_POINTER: u16 = 13;
const POOL_COUNT_POINTER: u16 = 14;
const POOL_LIST_POINTER: u16 = 15;

class PoolCreatedEvent extends NetEvent {
    constructor(data: BytesWriter) {
        super('PoolCreated', data);
    }
}

@final
export class OptionsFactory extends OP_NET {
    private _owner: StoredAddress;
    private _poolTemplate: StoredAddress;
    private _pools: MapOfMap<u256>;
    private _treasury: StoredAddress | null = null;
    private _poolCount: StoredU256 | null = null;

    public constructor() {
        super();
        this._owner = new StoredAddress(OWNER_POINTER);
        this._poolTemplate = new StoredAddress(POOL_TEMPLATE_POINTER);
        this._pools = new MapOfMap<u256>(POOLS_POINTER);
    }

    public override onDeployment(calldata: Calldata): void {
        super.onDeployment(calldata);
        this._owner.value = Blockchain.tx.origin;
    }

    private get treasury(): StoredAddress {
        if (!this._treasury) {
            this._treasury = new StoredAddress(TREASURY_POINTER);
        }
        return this._treasury!;
    }

    private get poolCount(): StoredU256 {
        if (!this._poolCount) {
            this._poolCount = new StoredU256(POOL_COUNT_POINTER, EMPTY_BUFFER);
        }
        return this._poolCount!;
    }

    /**
     * Build a SHA256 storage key for the pool enumeration list.
     * Slot 0 = poolAddress, slot 1 = underlying, slot 2 = premiumToken
     */
    private _getPoolListKey(index: u256, slot: u8): Uint8Array {
        const writer = new BytesWriter(35); // 2 + 32 + 1
        writer.writeU16(POOL_LIST_POINTER);
        writer.writeU256(index);
        writer.writeU8(slot);
        return sha256(writer.getBuffer());
    }

    /**
     * Write a pool entry into the enumerable list and increment pool count.
     */
    private _registerInList(pool: Address, underlying: Address, premiumToken: Address): void {
        const idx = this.poolCount.value;
        Blockchain.setStorageAt(this._getPoolListKey(idx, 0), pool);
        Blockchain.setStorageAt(this._getPoolListKey(idx, 1), underlying);
        Blockchain.setStorageAt(this._getPoolListKey(idx, 2), premiumToken);
        this.poolCount.value = SafeMath.add(idx, u256.One);
    }

    private onlyOwner(): void {
        const owner = this._owner.value;
        if (!Blockchain.tx.sender.equals(owner)) {
            throw new Revert('Only owner can call this function');
        }
    }

    @view
    @method()
    @returns({ name: 'owner', type: ABIDataTypes.ADDRESS })
    public getOwner(_calldata: Calldata): BytesWriter {
        const owner = this._owner.value;
        const writer = new BytesWriter(32);
        writer.writeAddress(owner);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'template', type: ABIDataTypes.ADDRESS })
    public getPoolTemplate(_calldata: Calldata): BytesWriter {
        const template = this._poolTemplate.value;
        const writer = new BytesWriter(32);
        writer.writeAddress(template);
        return writer;
    }

    @method({ name: 'template', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setPoolTemplate(calldata: Calldata): BytesWriter {
        this.onlyOwner();
        const template = calldata.readAddress();
        this._poolTemplate.value = template;
        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'treasury', type: ABIDataTypes.ADDRESS })
    public getTreasury(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeAddress(this.treasury.value);
        return writer;
    }

    @method({ name: 'treasury', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setTreasury(calldata: Calldata): BytesWriter {
        this.onlyOwner();
        const addr = calldata.readAddress();
        if (addr.equals(Address.zero())) {
            throw new Revert('Treasury cannot be zero address');
        }
        this.treasury.value = addr;
        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    public getPoolCount(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this.poolCount.value);
        return writer;
    }

    @view
    @method({ name: 'index', type: ABIDataTypes.UINT256 })
    @returns({ name: 'poolAddress', type: ABIDataTypes.ADDRESS })
    public getPoolByIndex(calldata: Calldata): BytesWriter {
        const index = calldata.readU256();
        const count = this.poolCount.value;

        if (!u256.lt(index, count)) {
            throw new Revert('Index out of bounds');
        }

        const pool = Address.fromUint8Array(Blockchain.getStorageAt(this._getPoolListKey(index, 0)));
        const underlying = Address.fromUint8Array(Blockchain.getStorageAt(this._getPoolListKey(index, 1)));
        const premiumToken = Address.fromUint8Array(Blockchain.getStorageAt(this._getPoolListKey(index, 2)));

        // Returns poolAddress (32) + underlying (32) + premiumToken (32) = 96 bytes
        const writer = new BytesWriter(96);
        writer.writeAddress(pool);
        writer.writeAddress(underlying);
        writer.writeAddress(premiumToken);
        return writer;
    }

    @method(
        { name: 'pool', type: ABIDataTypes.ADDRESS },
        { name: 'underlying', type: ABIDataTypes.ADDRESS },
        { name: 'premiumToken', type: ABIDataTypes.ADDRESS }
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public registerPool(calldata: Calldata): BytesWriter {
        this.onlyOwner();
        const pool = calldata.readAddress();
        const underlying = calldata.readAddress();
        const premiumToken = calldata.readAddress();

        if (pool.equals(Address.zero())) {
            throw new Revert('Invalid pool address');
        }
        if (underlying.equals(Address.zero())) {
            throw new Revert('Invalid underlying');
        }
        if (premiumToken.equals(Address.zero())) {
            throw new Revert('Invalid premiumToken');
        }
        if (this._pools.has(underlying) && this._pools.get(underlying).has(premiumToken)) {
            throw new Revert('Pool already registered');
        }

        const poolU256 = u256.fromBytes<Address>(pool, true);
        this._pools.get(underlying).set(premiumToken, poolU256);
        this._registerInList(pool, underlying, premiumToken);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @method(
        { name: 'underlying', type: ABIDataTypes.ADDRESS },
        { name: 'premiumToken', type: ABIDataTypes.ADDRESS },
        { name: 'underlyingDecimals', type: ABIDataTypes.UINT8 },
        { name: 'premiumDecimals', type: ABIDataTypes.UINT8 }
    )
    @returns({ name: 'poolAddress', type: ABIDataTypes.ADDRESS })
    @emit('PoolCreated')
    public createPool(calldata: Calldata): BytesWriter {
        const underlying = calldata.readAddress();
        const premiumToken = calldata.readAddress();
        const underlyingDecimals = calldata.readU8();
        const premiumDecimals = calldata.readU8();

        if (underlying.equals(Address.zero())) {
            throw new Revert('Invalid underlying token: zero address');
        }

        if (premiumToken.equals(Address.zero())) {
            throw new Revert('Invalid premium token: zero address');
        }

        if (underlying.equals(premiumToken)) {
            throw new Revert('Tokens must be different');
        }

        if (this._pools.has(underlying) && this._pools.get(underlying).has(premiumToken)) {
            throw new Revert('Pool already exists');
        }

        const template = this._poolTemplate.value;
        if (template.equals(Address.zero())) {
            throw new Revert('Pool template not set');
        }

        const treasuryAddr = this.treasury.value;
        if (treasuryAddr.equals(Address.zero())) {
            throw new Revert('Treasury not set');
        }

        const salt = this._generateSalt(underlying, premiumToken);

        const initCalldata = new BytesWriter(98);
        initCalldata.writeAddress(underlying);
        initCalldata.writeAddress(premiumToken);
        initCalldata.writeAddress(treasuryAddr);
        initCalldata.writeU8(underlyingDecimals);
        initCalldata.writeU8(premiumDecimals);

        const poolAddress = Blockchain.deployContractFromExisting(
            template,
            salt,
            initCalldata
        );

        const poolU256 = u256.fromBytes<Address>(poolAddress, true);
        this._pools.get(underlying).set(premiumToken, poolU256);
        this._registerInList(poolAddress, underlying, premiumToken);

        const eventData = new BytesWriter(96);
        eventData.writeAddress(poolAddress);
        eventData.writeAddress(underlying);
        eventData.writeAddress(premiumToken);
        Blockchain.emit(new PoolCreatedEvent(eventData));

        const writer = new BytesWriter(32);
        writer.writeAddress(poolAddress);
        return writer;
    }

    @view
    @method(
        { name: 'underlying', type: ABIDataTypes.ADDRESS },
        { name: 'premiumToken', type: ABIDataTypes.ADDRESS }
    )
    @returns({ name: 'poolAddress', type: ABIDataTypes.ADDRESS })
    public getPool(calldata: Calldata): BytesWriter {
        const underlying = calldata.readAddress();
        const premiumToken = calldata.readAddress();

        const poolAddress = this._getPoolAddress(underlying, premiumToken);

        const writer = new BytesWriter(32);
        writer.writeAddress(poolAddress);
        return writer;
    }

    private _getPoolAddress(underlying: Address, premiumToken: Address): Address {
        if (!this._pools.has(underlying)) {
            return Address.zero();
        }

        const nested = this._pools.get(underlying);
        if (!nested.has(premiumToken)) {
            return Address.zero();
        }

        const poolU256 = nested.get(premiumToken);
        return Address.fromUint8Array(poolU256.toUint8Array(true));
    }

    private _generateSalt(underlying: Address, premiumToken: Address): u256 {
        const writer = new BytesWriter(64);
        writer.writeAddress(underlying);
        writer.writeAddress(premiumToken);
        return u256.fromBytes<Uint8Array>(sha256(writer.getBuffer()), true);
    }
}
