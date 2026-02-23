import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type OptionWrittenEvent = {
    readonly data: string;
};
export type OptionCancelledEvent = {
    readonly data: string;
};
export type OptionPurchasedEvent = {
    readonly data: string;
};
export type OptionExercisedEvent = {
    readonly data: string;
};
export type OptionExpiredEvent = {
    readonly data: string;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the getUnderlying function call.
 */
export type GetUnderlying = CallResult<
    {
        token: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getPremiumToken function call.
 */
export type GetPremiumToken = CallResult<
    {
        token: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getOption function call.
 */
export type GetOption = CallResult<
    {
        option: unknown;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the optionCount function call.
 */
export type OptionCount = CallResult<
    {
        count: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the accumulatedFees function call.
 */
export type AccumulatedFees = CallResult<
    {
        fees: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the gracePeriodBlocks function call.
 */
export type GracePeriodBlocks = CallResult<
    {
        blocks: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the maxExpiryBlocks function call.
 */
export type MaxExpiryBlocks = CallResult<
    {
        blocks: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the cancelFeeBps function call.
 */
export type CancelFeeBps = CallResult<
    {
        bps: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the calculateCollateral function call.
 */
export type CalculateCollateral = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the writeOption function call.
 */
export type WriteOption = CallResult<
    {
        optionId: bigint;
    },
    OPNetEvent<OptionWrittenEvent>[]
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
 * @description Represents the result of the settle function call.
 */
export type Settle = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<OptionExpiredEvent>[]
>;

// ------------------------------------------------------------------
// IOptionsPool
// ------------------------------------------------------------------
export interface IOptionsPool extends IOP_NETContract {
    getUnderlying(): Promise<GetUnderlying>;
    getPremiumToken(): Promise<GetPremiumToken>;
    getOption(optionId: bigint): Promise<GetOption>;
    optionCount(): Promise<OptionCount>;
    accumulatedFees(): Promise<AccumulatedFees>;
    gracePeriodBlocks(): Promise<GracePeriodBlocks>;
    maxExpiryBlocks(): Promise<MaxExpiryBlocks>;
    cancelFeeBps(): Promise<CancelFeeBps>;
    calculateCollateral(
        optionType: number,
        strikePrice: bigint,
        underlyingAmount: bigint,
    ): Promise<CalculateCollateral>;
    writeOption(
        optionType: number,
        strikePrice: bigint,
        expiryBlock: bigint,
        underlyingAmount: bigint,
        premium: bigint,
    ): Promise<WriteOption>;
    cancelOption(optionId: bigint): Promise<CancelOption>;
    buyOption(optionId: bigint): Promise<BuyOption>;
    exercise(optionId: bigint): Promise<Exercise>;
    settle(optionId: bigint): Promise<Settle>;
}
