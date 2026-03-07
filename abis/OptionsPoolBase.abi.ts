import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const OptionsPoolBaseEvents = [
    {
        name: 'FeeRecipientUpdated',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
];

export const OptionsPoolBaseAbi = [
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
        name: 'registerBtcPubkey',
        inputs: [{ name: 'pubkey', type: ABIDataTypes.BYTES32 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getRegisteredPubkey',
        constant: true,
        inputs: [{ name: 'addr', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'pubkey', type: ABIDataTypes.BYTES32 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'updateFeeRecipient',
        inputs: [{ name: 'newRecipient', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    ...OptionsPoolBaseEvents,
    ...OP_NET_ABI,
];

export default OptionsPoolBaseAbi;
