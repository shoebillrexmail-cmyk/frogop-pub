import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const OptionsFactoryEvents = [
    {
        name: 'PoolCreated',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
];

export const OptionsFactoryAbi = [
    {
        name: 'getOwner',
        constant: true,
        inputs: [],
        outputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPoolTemplate',
        constant: true,
        inputs: [],
        outputs: [{ name: 'template', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setPoolTemplate',
        inputs: [{ name: 'template', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getTreasury',
        constant: true,
        inputs: [],
        outputs: [{ name: 'treasury', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setTreasury',
        inputs: [{ name: 'treasury', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPoolCount',
        constant: true,
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPoolByIndex',
        constant: true,
        inputs: [{ name: 'index', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'poolAddress', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'registerPool',
        inputs: [
            { name: 'pool', type: ABIDataTypes.ADDRESS },
            { name: 'underlying', type: ABIDataTypes.ADDRESS },
            { name: 'premiumToken', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'createPool',
        inputs: [
            { name: 'underlying', type: ABIDataTypes.ADDRESS },
            { name: 'premiumToken', type: ABIDataTypes.ADDRESS },
            { name: 'underlyingDecimals', type: ABIDataTypes.UINT8 },
            { name: 'premiumDecimals', type: ABIDataTypes.UINT8 },
        ],
        outputs: [{ name: 'poolAddress', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPool',
        constant: true,
        inputs: [
            { name: 'underlying', type: ABIDataTypes.ADDRESS },
            { name: 'premiumToken', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [{ name: 'poolAddress', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    ...OptionsFactoryEvents,
    ...OP_NET_ABI,
];

export default OptionsFactoryAbi;
