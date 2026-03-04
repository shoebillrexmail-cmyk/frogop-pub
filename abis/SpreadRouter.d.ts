import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the executeSpread function call.
 */
export type ExecuteSpread = CallResult<
    {
        newOptionId: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the executeDualWrite function call.
 */
export type ExecuteDualWrite = CallResult<
    {
        optionId1: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// ISpreadRouter
// ------------------------------------------------------------------
export interface ISpreadRouter extends IOP_NETContract {
    executeSpread(
        pool: Address,
        writeOptionType: number,
        writeStrikePrice: bigint,
        writeExpiryBlock: bigint,
        writeUnderlyingAmount: bigint,
        writePremium: bigint,
        buyOptionId: bigint,
    ): Promise<ExecuteSpread>;
    executeDualWrite(
        pool: Address,
        type1: number,
        strike1: bigint,
        expiry1: bigint,
        amount1: bigint,
        premium1: bigint,
        type2: number,
        strike2: bigint,
        expiry2: bigint,
        amount2: bigint,
        premium2: bigint,
    ): Promise<ExecuteDualWrite>;
}
