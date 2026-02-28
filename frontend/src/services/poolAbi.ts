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
