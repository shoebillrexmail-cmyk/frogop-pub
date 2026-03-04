/**
 * ABI definitions for OptionsPool write methods and OP20 token methods.
 *
 * Used with getContract() for frontend transactions.
 * Format: BitcoinInterfaceAbi (array of FunctionBaseData | EventBaseData)
 */
import { ABIDataTypes } from '@btc-vision/transaction';
import { BitcoinAbiTypes } from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';

/** ABI for OptionsPool write methods */
export const POOL_WRITE_ABI: BitcoinInterfaceAbi = [
    {
        name: 'writeOption',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'optionType', type: ABIDataTypes.UINT8 },
            { name: 'strikePrice', type: ABIDataTypes.UINT256 },
            { name: 'expiryBlock', type: ABIDataTypes.UINT64 },
            { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
            { name: 'premium', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'optionId', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'buyOption',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'optionId', type: ABIDataTypes.UINT256 }],
        outputs: [],
    },
    {
        name: 'cancelOption',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'optionId', type: ABIDataTypes.UINT256 }],
        outputs: [],
    },
    {
        name: 'exercise',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'optionId', type: ABIDataTypes.UINT256 }],
        outputs: [],
    },
    {
        name: 'settle',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'optionId', type: ABIDataTypes.UINT256 }],
        outputs: [],
    },
    {
        name: 'transferOption',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'optionId', type: ABIDataTypes.UINT256 },
            { name: 'to', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'batchCancel',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'count', type: ABIDataTypes.UINT256 },
            { name: 'id0', type: ABIDataTypes.UINT256 },
            { name: 'id1', type: ABIDataTypes.UINT256 },
            { name: 'id2', type: ABIDataTypes.UINT256 },
            { name: 'id3', type: ABIDataTypes.UINT256 },
            { name: 'id4', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'batchSettle',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'count', type: ABIDataTypes.UINT256 },
            { name: 'id0', type: ABIDataTypes.UINT256 },
            { name: 'id1', type: ABIDataTypes.UINT256 },
            { name: 'id2', type: ABIDataTypes.UINT256 },
            { name: 'id3', type: ABIDataTypes.UINT256 },
            { name: 'id4', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'settledCount', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'rollOption',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'optionId', type: ABIDataTypes.UINT256 },
            { name: 'newStrikePrice', type: ABIDataTypes.UINT256 },
            { name: 'newExpiryBlock', type: ABIDataTypes.UINT64 },
            { name: 'newPremium', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'newOptionId', type: ABIDataTypes.UINT256 }],
    },
];

/** ABI for BTC quote pool (type 1) — two-phase commit methods */
export const BTC_QUOTE_POOL_ABI: BitcoinInterfaceAbi = [
    ...POOL_WRITE_ABI,
    {
        name: 'reserveOption',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'optionId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'reservationId', type: ABIDataTypes.UINT256 },
            { name: 'btcAmount', type: ABIDataTypes.UINT256 },
            { name: 'csvScriptHash', type: ABIDataTypes.BYTES32 },
            { name: 'expiryBlock', type: ABIDataTypes.UINT64 },
        ],
    },
    {
        name: 'executeReservation',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'reservationId', type: ABIDataTypes.UINT256 }],
        outputs: [],
    },
    {
        name: 'cancelReservation',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'reservationId', type: ABIDataTypes.UINT256 }],
        outputs: [],
    },
];

/** ABI for BTC underlying pool (type 2) — BTC collateral methods */
export const BTC_UNDERLYING_POOL_ABI: BitcoinInterfaceAbi = [
    ...POOL_WRITE_ABI,
    {
        name: 'writeOptionBtc',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'optionType', type: ABIDataTypes.UINT8 },
            { name: 'strikePrice', type: ABIDataTypes.UINT256 },
            { name: 'expiryBlock', type: ABIDataTypes.UINT64 },
            { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
            { name: 'premium', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'optionId', type: ABIDataTypes.UINT256 }],
    },
];

/** ABI for SpreadRouter — atomic multi-leg strategies */
export const ROUTER_ABI: BitcoinInterfaceAbi = [
    {
        name: 'executeSpread',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'pool', type: ABIDataTypes.ADDRESS },
            { name: 'writeOptionType', type: ABIDataTypes.UINT8 },
            { name: 'writeStrikePrice', type: ABIDataTypes.UINT256 },
            { name: 'writeExpiryBlock', type: ABIDataTypes.UINT64 },
            { name: 'writeUnderlyingAmount', type: ABIDataTypes.UINT256 },
            { name: 'writePremium', type: ABIDataTypes.UINT256 },
            { name: 'buyOptionId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'newOptionId', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'executeDualWrite',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'pool', type: ABIDataTypes.ADDRESS },
            { name: 'type1', type: ABIDataTypes.UINT8 },
            { name: 'strike1', type: ABIDataTypes.UINT256 },
            { name: 'expiry1', type: ABIDataTypes.UINT64 },
            { name: 'amount1', type: ABIDataTypes.UINT256 },
            { name: 'premium1', type: ABIDataTypes.UINT256 },
            { name: 'type2', type: ABIDataTypes.UINT8 },
            { name: 'strike2', type: ABIDataTypes.UINT256 },
            { name: 'expiry2', type: ABIDataTypes.UINT64 },
            { name: 'amount2', type: ABIDataTypes.UINT256 },
            { name: 'premium2', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'optionId1', type: ABIDataTypes.UINT256 }],
    },
];

/** ABI for OP20 token approve (increaseAllowance) */
export const TOKEN_APPROVE_ABI: BitcoinInterfaceAbi = [
    {
        name: 'increaseAllowance',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'spender', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [],
    },
    {
        name: 'approve',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'spender', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
];
