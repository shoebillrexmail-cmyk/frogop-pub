import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

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
 * @description Represents the result of the poolCount function call.
 */
export type PoolCount = CallResult<
    {
        count: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IOptionsFactory
// ------------------------------------------------------------------
export interface IOptionsFactory extends IOP_NETContract {
    getOwner(): Promise<GetOwner>;
    getPoolTemplate(): Promise<GetPoolTemplate>;
    poolCount(): Promise<PoolCount>;
}
