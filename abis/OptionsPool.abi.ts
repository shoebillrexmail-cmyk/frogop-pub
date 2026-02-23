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
        constant: true,
        inputs: [],
        outputs: [{ name: 'underlying', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPremiumToken',
        constant: true,
        inputs: [],
        outputs: [{ name: 'premiumToken', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getOption',
        constant: true,
        inputs: [{ name: 'optionId', type: ABIDataTypes.UINT256 }],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'optionCount',
        constant: true,
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'accumulatedFeesMethod',
        constant: true,
        inputs: [],
        outputs: [{ name: 'fees', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'gracePeriodBlocks',
        constant: true,
        inputs: [],
        outputs: [{ name: 'blocks', type: ABIDataTypes.UINT64 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'maxExpiryBlocks',
        constant: true,
        inputs: [],
        outputs: [{ name: 'blocks', type: ABIDataTypes.UINT64 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'cancelFeeBps',
        constant: true,
        inputs: [],
        outputs: [{ name: 'bps', type: ABIDataTypes.UINT64 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'calculateCollateral',
        constant: true,
        inputs: [
            { name: 'optionType', type: ABIDataTypes.UINT8 },
            { name: 'strikePrice', type: ABIDataTypes.UINT256 },
            { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'collateral', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getUnderlyingDecimals',
        constant: true,
        inputs: [],
        outputs: [{ name: 'decimals', type: ABIDataTypes.UINT8 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPremiumDecimals',
        constant: true,
        inputs: [],
        outputs: [{ name: 'decimals', type: ABIDataTypes.UINT8 }],
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
