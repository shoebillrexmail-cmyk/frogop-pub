import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    MapOfMap,
    Revert,
    SafeMath,
    StoredAddress,
    StoredU256,
    Upgradeable,
    encodeSelector,
    Selector,
    EMPTY_BUFFER,
} from '@btc-vision/btc-runtime/runtime';
import { sha256 } from '@btc-vision/btc-runtime/runtime/env/global';

// Storage pointers (must be const outside class)
const poolTemplatePointer: u16 = Blockchain.nextPointer;
const poolCountPointer: u16 = Blockchain.nextPointer;
const ownerPointer: u16 = Blockchain.nextPointer;
const poolsPointer: u16 = Blockchain.nextPointer;

/**
 * OptionsFactory creates and manages option pools for token pairs.
 * 
 * Each pool is for a specific (underlying, premiumToken) pair.
 */
@final
export class OptionsFactory extends Upgradeable {
    protected readonly upgradeDelay: u64 = 144;

    // Storage instances
    private _poolTemplate!: StoredAddress;
    private _poolCount!: StoredU256;
    private _owner!: StoredAddress;
    private _pools!: MapOfMap<u256>;

    public constructor() {
        super();

        this._poolTemplate = new StoredAddress(poolTemplatePointer);
        this._poolCount = new StoredU256(poolCountPointer, EMPTY_BUFFER);
        this._owner = new StoredAddress(ownerPointer);
        this._pools = new MapOfMap<u256>(poolsPointer);
    }

    public override onDeployment(calldata: Calldata): void {
        super.onDeployment(calldata);
        this._owner.value = Blockchain.tx.origin;
    }

    public override execute(method: Selector, calldata: Calldata): BytesWriter {
        switch (method) {
            case encodeSelector('poolCount()'):
                return this.poolCount(calldata);
            case encodeSelector('setPoolTemplate(address)'):
                return this.setPoolTemplate(calldata);
            case encodeSelector('poolTemplate()'):
                return this.getPoolTemplate(calldata);
            case encodeSelector('owner()'):
                return this.getOwner(calldata);
            case encodeSelector('createPool(address,address)'):
                return this.createPool(calldata);
            case encodeSelector('getPool(address,address)'):
                return this.getPool(calldata);
            default:
                return super.execute(method, calldata);
        }
    }

    private onlyOwner(): void {
        const owner = this._owner.value;
        if (!Blockchain.tx.sender.equals(owner)) {
            throw new Revert('Only owner can call this function');
        }
    }

    /**
     * Get the contract owner.
     */
    @method()
    @returns({ name: 'owner', type: ABIDataTypes.ADDRESS })
    public getOwner(calldata: Calldata): BytesWriter {
        const owner = this._owner.value;
        const writer = new BytesWriter(32);
        writer.writeAddress(owner);
        return writer;
    }

    /**
     * Get the current pool template address.
     */
    @method()
    @returns({ name: 'template', type: ABIDataTypes.ADDRESS })
    public getPoolTemplate(calldata: Calldata): BytesWriter {
        const template = this._poolTemplate.value;
        const writer = new BytesWriter(32);
        writer.writeAddress(template);
        return writer;
    }

    /**
     * Set the pool template address (owner only).
     */
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

    /**
     * Get the total number of pools created.
     */
    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    public poolCount(calldata: Calldata): BytesWriter {
        const count = this._poolCount.value;
        const writer = new BytesWriter(32);
        writer.writeU256(count);
        return writer;
    }

    /**
     * Create a new options pool for a token pair.
     * 
     * @param underlying The token being optioned (e.g., MOTO)
     * @param premiumToken The token for premiums and strikes (e.g., PILL)
     * @return The address of the newly created pool
     */
    @method(
        { name: 'underlying', type: ABIDataTypes.ADDRESS },
        { name: 'premiumToken', type: ABIDataTypes.ADDRESS }
    )
    @returns({ name: 'pool', type: ABIDataTypes.ADDRESS })
    @emit('PoolCreated')
    public createPool(calldata: Calldata): BytesWriter {
        const underlying = calldata.readAddress();
        const premiumToken = calldata.readAddress();

        // Validate addresses
        if (underlying.equals(Address.zero())) {
            throw new Revert('Invalid underlying token: zero address');
        }

        if (premiumToken.equals(Address.zero())) {
            throw new Revert('Invalid premium token: zero address');
        }

        if (underlying.equals(premiumToken)) {
            throw new Revert('Tokens must be different');
        }

        // Check pool doesn't already exist
        if (this._pools.has(underlying) && this._pools.get(underlying).has(premiumToken)) {
            throw new Revert('Pool already exists');
        }

        // Get template
        const template = this._poolTemplate.value;
        if (template.equals(Address.zero())) {
            throw new Revert('Pool template not set');
        }

        // Generate deterministic salt from token pair
        const salt = this._generateSalt(underlying, premiumToken);

        // Prepare initialization calldata for OptionsPool
        const initCalldata = new BytesWriter(64);
        initCalldata.writeAddress(underlying);
        initCalldata.writeAddress(premiumToken);

        // Deploy pool from template
        const poolAddress = Blockchain.deployContractFromExisting(
            template,
            salt,
            initCalldata
        );

        // Store pool address in registry
        // Convert Address (Uint8Array) to u256 for storage
        const poolU256 = u256.fromBytes<Address>(poolAddress, true);
        this._pools.get(underlying).set(premiumToken, poolU256);

        // Increment pool count
        const count = this._poolCount.value;
        this._poolCount.value = SafeMath.add(count, u256.One);

        // Return pool address
        const writer = new BytesWriter(32);
        writer.writeAddress(poolAddress);
        return writer;
    }

    /**
     * Get the pool address for a token pair.
     * 
     * @param underlying The underlying token
     * @param premiumToken The premium token
     * @return The pool address, or zero if not exists
     */
    @method(
        { name: 'underlying', type: ABIDataTypes.ADDRESS },
        { name: 'premiumToken', type: ABIDataTypes.ADDRESS }
    )
    @returns({ name: 'pool', type: ABIDataTypes.ADDRESS })
    public getPool(calldata: Calldata): BytesWriter {
        const underlying = calldata.readAddress();
        const premiumToken = calldata.readAddress();

        const poolAddress = this._getPoolAddress(underlying, premiumToken);

        const writer = new BytesWriter(32);
        writer.writeAddress(poolAddress);
        return writer;
    }

    /**
     * Internal: get pool address from registry.
     */
    private _getPoolAddress(underlying: Address, premiumToken: Address): Address {
        if (!this._pools.has(underlying)) {
            return Address.zero();
        }

        const nested = this._pools.get(underlying);
        if (!nested.has(premiumToken)) {
            return Address.zero();
        }

        const poolU256 = nested.get(premiumToken);
        // Convert u256 back to Address
        return Address.fromUint8Array(poolU256.toUint8Array(true));
    }

    /**
     * Generate deterministic salt for pool deployment.
     */
    private _generateSalt(underlying: Address, premiumToken: Address): u256 {
        const writer = new BytesWriter(64);
        writer.writeAddress(underlying);
        writer.writeAddress(premiumToken);
        return u256.fromBytes<Uint8Array>(sha256(writer.getBuffer()), true);
    }
}
