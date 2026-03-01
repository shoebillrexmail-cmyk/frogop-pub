import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type FeeRecipientUpdatedEvent = {
    readonly data: string;
};
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
export type OptionTransferredEvent = {
    readonly data: string;
};
export type OptionRolledEvent = {
    readonly data: string;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the underlying function call.
 */
export type Underlying = CallResult<
    {
        underlying: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the premiumToken function call.
 */
export type PremiumToken = CallResult<
    {
        premiumToken: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getOption function call.
 */
export type GetOption = CallResult<{}, OPNetEvent<never>[]>;

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
 * @description Represents the result of the getOptionsBatch function call.
 */
export type GetOptionsBatch = CallResult<{}, OPNetEvent<never>[]>;

/**
 * @description Represents the result of the feeRecipient function call.
 */
export type FeeRecipient = CallResult<
    {
        recipient: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the buyFeeBps function call.
 */
export type BuyFeeBps = CallResult<
    {
        bps: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the exerciseFeeBps function call.
 */
export type ExerciseFeeBps = CallResult<
    {
        bps: bigint;
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
        collateral: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the updateFeeRecipient function call.
 */
export type UpdateFeeRecipient = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<FeeRecipientUpdatedEvent>[]
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

/**
 * @description Represents the result of the transferOption function call.
 */
export type TransferOption = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<OptionTransferredEvent>[]
>;

/**
 * @description Represents the result of the rollOption function call.
 */
export type RollOption = CallResult<
    {
        newOptionId: bigint;
    },
    OPNetEvent<OptionRolledEvent>[]
>;

/**
 * @description Represents the result of the batchCancel function call.
 */
export type BatchCancel = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<OptionCancelledEvent>[]
>;

/**
 * @description Represents the result of the batchSettle function call.
 */
export type BatchSettle = CallResult<
    {
        settledCount: bigint;
    },
    OPNetEvent<OptionExpiredEvent>[]
>;

// ------------------------------------------------------------------
// IOptionsPool
// ------------------------------------------------------------------
export interface IOptionsPool extends IOP_NETContract {
    underlying(): Promise<Underlying>;
    premiumToken(): Promise<PremiumToken>;
    getOption(optionId: bigint): Promise<GetOption>;
    optionCount(): Promise<OptionCount>;
    getOptionsBatch(startId: bigint, count: bigint): Promise<GetOptionsBatch>;
    feeRecipient(): Promise<FeeRecipient>;
    buyFeeBps(): Promise<BuyFeeBps>;
    exerciseFeeBps(): Promise<ExerciseFeeBps>;
    gracePeriodBlocks(): Promise<GracePeriodBlocks>;
    maxExpiryBlocks(): Promise<MaxExpiryBlocks>;
    cancelFeeBps(): Promise<CancelFeeBps>;
    calculateCollateral(
        optionType: number,
        strikePrice: bigint,
        underlyingAmount: bigint,
    ): Promise<CalculateCollateral>;
    updateFeeRecipient(newRecipient: Address): Promise<UpdateFeeRecipient>;
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
    transferOption(optionId: bigint, to: Address): Promise<TransferOption>;
    rollOption(
        optionId: bigint,
        newStrikePrice: bigint,
        newExpiryBlock: bigint,
        newPremium: bigint,
    ): Promise<RollOption>;
    batchCancel(count: bigint, id0: bigint, id1: bigint, id2: bigint, id3: bigint, id4: bigint): Promise<BatchCancel>;
    batchSettle(count: bigint, id0: bigint, id1: bigint, id2: bigint, id3: bigint, id4: bigint): Promise<BatchSettle>;
}
