import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type OptionWrittenBtcEvent = {
    readonly data: string;
};
export type OptionPurchasedEvent = {
    readonly data: string;
};
export type OptionExercisedEvent = {
    readonly data: string;
};
export type OptionCancelledEvent = {
    readonly data: string;
};
export type OptionExpiredEvent = {
    readonly data: string;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the bridge function call.
 */
export type Bridge = CallResult<
    {
        address: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the writeOptionBtc function call.
 */
export type WriteOptionBtc = CallResult<
    {
        optionId: bigint;
    },
    OPNetEvent<OptionWrittenBtcEvent>[]
>;

/**
 * @description Represents the result of the buyOption function call.
 */
export type BuyOption = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<OptionPurchasedEvent>[]
>;

/**
 * @description Represents the result of the exercise function call.
 */
export type Exercise = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<OptionExercisedEvent>[]
>;

/**
 * @description Represents the result of the cancelOption function call.
 */
export type CancelOption = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<OptionCancelledEvent>[]
>;

/**
 * @description Represents the result of the settle function call.
 */
export type Settle = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<OptionExpiredEvent>[]
>;

// ------------------------------------------------------------------
// IOptionsPoolBtcUnderlying
// ------------------------------------------------------------------
export interface IOptionsPoolBtcUnderlying extends IOP_NETContract {
    bridge(): Promise<Bridge>;
    writeOptionBtc(
        optionType: number,
        strikePrice: bigint,
        expiryBlock: bigint,
        underlyingAmount: bigint,
        premium: bigint,
    ): Promise<WriteOptionBtc>;
    buyOption(optionId: bigint): Promise<BuyOption>;
    exercise(optionId: bigint): Promise<Exercise>;
    cancelOption(optionId: bigint): Promise<CancelOption>;
    settle(optionId: bigint): Promise<Settle>;
}
