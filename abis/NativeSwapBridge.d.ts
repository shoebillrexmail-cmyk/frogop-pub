import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the getBtcPrice function call.
 */
export type GetBtcPrice = CallResult<
    {
        price: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the generateCsvScriptHash function call.
 */
export type GenerateCsvScriptHash = CallResult<
    {
        scriptHash: Uint8Array;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the generateEscrowScriptHash function call.
 */
export type GenerateEscrowScriptHash = CallResult<
    {
        scriptHash: Uint8Array;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the verifyBtcOutput function call.
 */
export type VerifyBtcOutput = CallResult<
    {
        verified: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the nativeSwap function call.
 */
export type NativeSwap = CallResult<
    {
        address: Address;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// INativeSwapBridge
// ------------------------------------------------------------------
export interface INativeSwapBridge extends IOP_NETContract {
    getBtcPrice(token: Address): Promise<GetBtcPrice>;
    generateCsvScriptHash(pubkey: Uint8Array, csvBlocks: bigint): Promise<GenerateCsvScriptHash>;
    generateEscrowScriptHash(
        buyerPubkey: Uint8Array,
        writerPubkey: Uint8Array,
        cltvBlock: bigint,
    ): Promise<GenerateEscrowScriptHash>;
    verifyBtcOutput(expectedHash: Uint8Array, expectedAmount: bigint): Promise<VerifyBtcOutput>;
    nativeSwap(): Promise<NativeSwap>;
}
