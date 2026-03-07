import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const SpreadRouterEvents = [];

export const SpreadRouterAbi = [
    {
        name: 'executeSpread',
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
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'executeDualWrite',
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
        type: BitcoinAbiTypes.Function,
    },
    ...SpreadRouterEvents,
    ...OP_NET_ABI,
];

export default SpreadRouterAbi;
