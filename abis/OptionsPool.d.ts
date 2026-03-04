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
