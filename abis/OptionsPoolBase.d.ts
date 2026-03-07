import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type FeeRecipientUpdatedEvent = {
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
 * @description Represents the result of the registerBtcPubkey function call.
 */
export type RegisterBtcPubkey = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getRegisteredPubkey function call.
 */
export type GetRegisteredPubkey = CallResult<
    {
        pubkey: Uint8Array;
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

// ------------------------------------------------------------------
// IOptionsPoolBase
// ------------------------------------------------------------------
export interface IOptionsPoolBase extends IOP_NETContract {
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
    registerBtcPubkey(pubkey: Uint8Array): Promise<RegisterBtcPubkey>;
    getRegisteredPubkey(addr: Address): Promise<GetRegisteredPubkey>;
    updateFeeRecipient(newRecipient: Address): Promise<UpdateFeeRecipient>;
}
