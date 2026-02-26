import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type PoolCreatedEvent = {
    readonly data: string;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the getOwner function call.
 */
export type GetOwner = CallResult<
    {
        owner: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getPoolTemplate function call.
 */
export type GetPoolTemplate = CallResult<
    {
        template: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setPoolTemplate function call.
 */
export type SetPoolTemplate = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getTreasury function call.
 */
export type GetTreasury = CallResult<
    {
        treasury: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setTreasury function call.
 */
export type SetTreasury = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getPoolCount function call.
 */
export type GetPoolCount = CallResult<
    {
        count: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the createPool function call.
 */
export type CreatePool = CallResult<
    {
        poolAddress: Address;
    },
    OPNetEvent<PoolCreatedEvent>[]
>;

/**
 * @description Represents the result of the getPool function call.
 */
export type GetPool = CallResult<
    {
        poolAddress: Address;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IOptionsFactory
// ------------------------------------------------------------------
export interface IOptionsFactory extends IOP_NETContract {
    getOwner(): Promise<GetOwner>;
    getPoolTemplate(): Promise<GetPoolTemplate>;
    setPoolTemplate(template: Address): Promise<SetPoolTemplate>;
    getTreasury(): Promise<GetTreasury>;
    setTreasury(treasury: Address): Promise<SetTreasury>;
    getPoolCount(): Promise<GetPoolCount>;
    createPool(
        underlying: Address,
        premiumToken: Address,
        underlyingDecimals: number,
        premiumDecimals: number,
    ): Promise<CreatePool>;
    getPool(underlying: Address, premiumToken: Address): Promise<GetPool>;
}
