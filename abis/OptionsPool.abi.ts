import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const OptionsPoolEvents = [
    {
        name: 'FeeRecipientUpdated',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
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
    {
        name: 'OptionTransferred',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'OptionRolled',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
];

export const OptionsPoolAbi = [
    {
        name: 'underlying',
        constant: true,
        inputs: [],
        outputs: [{ name: 'underlying', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'premiumToken',
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
        name: 'getOptionsBatch',
        constant: true,
        inputs: [
            { name: 'startId', type: ABIDataTypes.UINT256 },
            { name: 'count', type: ABIDataTypes.UINT256 },
        ],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'feeRecipient',
        constant: true,
        inputs: [],
        outputs: [{ name: 'recipient', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'buyFeeBps',
        constant: true,
        inputs: [],
        outputs: [{ name: 'bps', type: ABIDataTypes.UINT64 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'exerciseFeeBps',
        constant: true,
        inputs: [],
        outputs: [{ name: 'bps', type: ABIDataTypes.UINT64 }],
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
        name: 'updateFeeRecipient',
        inputs: [{ name: 'newRecipient', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
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
    {
        name: 'transferOption',
        inputs: [
            { name: 'optionId', type: ABIDataTypes.UINT256 },
            { name: 'to', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'rollOption',
        inputs: [
            { name: 'optionId', type: ABIDataTypes.UINT256 },
            { name: 'newStrikePrice', type: ABIDataTypes.UINT256 },
            { name: 'newExpiryBlock', type: ABIDataTypes.UINT64 },
            { name: 'newPremium', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'newOptionId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'batchCancel',
        inputs: [
            { name: 'count', type: ABIDataTypes.UINT256 },
            { name: 'id0', type: ABIDataTypes.UINT256 },
            { name: 'id1', type: ABIDataTypes.UINT256 },
            { name: 'id2', type: ABIDataTypes.UINT256 },
            { name: 'id3', type: ABIDataTypes.UINT256 },
            { name: 'id4', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'batchSettle',
        inputs: [
            { name: 'count', type: ABIDataTypes.UINT256 },
            { name: 'id0', type: ABIDataTypes.UINT256 },
            { name: 'id1', type: ABIDataTypes.UINT256 },
            { name: 'id2', type: ABIDataTypes.UINT256 },
            { name: 'id3', type: ABIDataTypes.UINT256 },
            { name: 'id4', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'settledCount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...OptionsPoolEvents,
    ...OP_NET_ABI,
];

export default OptionsPoolAbi;
