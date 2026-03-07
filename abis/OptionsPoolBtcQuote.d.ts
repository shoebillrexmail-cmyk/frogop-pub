import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type OptionWrittenEvent = {
    readonly data: string;
};
export type OptionReservedEvent = {
    readonly data: string;
};
export type ReservationExecutedEvent = {
    readonly data: string;
};
export type ReservationCancelledEvent = {
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
 * @description Represents the result of the getReservation function call.
 */
export type GetReservation = CallResult<{}, OPNetEvent<never>[]>;

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
 * @description Represents the result of the reserveOption function call.
 */
export type ReserveOption = CallResult<
    {
        reservationId: bigint;
    },
    OPNetEvent<OptionReservedEvent>[]
>;

/**
 * @description Represents the result of the executeReservation function call.
 */
export type ExecuteReservation = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<ReservationExecutedEvent>[]
>;

/**
 * @description Represents the result of the cancelReservation function call.
 */
export type CancelReservation = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<ReservationCancelledEvent>[]
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
// IOptionsPoolBtcQuote
// ------------------------------------------------------------------
export interface IOptionsPoolBtcQuote extends IOP_NETContract {
    bridge(): Promise<Bridge>;
    getReservation(reservationId: bigint): Promise<GetReservation>;
    writeOption(
        optionType: number,
        strikePrice: bigint,
        expiryBlock: bigint,
        underlyingAmount: bigint,
        premium: bigint,
    ): Promise<WriteOption>;
    reserveOption(optionId: bigint): Promise<ReserveOption>;
    executeReservation(reservationId: bigint): Promise<ExecuteReservation>;
    cancelReservation(reservationId: bigint): Promise<CancelReservation>;
    exercise(optionId: bigint): Promise<Exercise>;
    cancelOption(optionId: bigint): Promise<CancelOption>;
    settle(optionId: bigint): Promise<Settle>;
}
