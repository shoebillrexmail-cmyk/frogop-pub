import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const OptionsPoolEvents = [
    {
        name: 'OptionWritten',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'OptionCancelled',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'OptionPurchased',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'OptionExercised',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'OptionExpired',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
];

export const OptionsPoolAbi = [
    {
        name: 'getUnderlying',
        inputs: [],
        outputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPremiumToken',
        inputs: [],
        outputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getOption',
        inputs: [{ name: 'optionId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'option', type: ABIDataTypes.TUPLE }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'optionCount',
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'accumulatedFees',
        inputs: [],
        outputs: [{ name: 'fees', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'gracePeriodBlocks',
        inputs: [],
        outputs: [{ name: 'blocks', type: ABIDataTypes.UINT64 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'maxExpiryBlocks',
        inputs: [],
        outputs: [{ name: 'blocks', type: ABIDataTypes.UINT64 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'cancelFeeBps',
        inputs: [],
        outputs: [{ name: 'bps', type: ABIDataTypes.UINT64 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'calculateCollateral',
        inputs: [
            { name: 'optionType', type: ABIDataTypes.UINT8 },
            { name: 'strikePrice', type: ABIDataTypes.UINT256 },
            { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'writeOption',
        inputs: [
            { name: 'optionType', type: ABIDataTypes.UINT8 },
            { name: 'strikePrice', type: ABIDataTypes.UINT256 },
            { name: 'expiryBlock', type: ABIDataTypes.UINT64 },
            { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
            { name: 'premium', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'optionId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'cancelOption',
        inputs: [{ name: 'optionId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'buyOption',
        inputs: [{ name: 'optionId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'exercise',
        inputs: [{ name: 'optionId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'settle',
        inputs: [{ name: 'optionId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    ...OptionsPoolEvents,
    ...OP_NET_ABI,
];

export default OptionsPoolAbi;
