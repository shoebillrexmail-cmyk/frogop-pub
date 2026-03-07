import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const OptionsPoolBtcQuoteEvents = [
    {
        name: 'OptionWritten',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'OptionReserved',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'ReservationExecuted',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'ReservationCancelled',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'OptionExercised',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'OptionCancelled',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'OptionExpired',
        values: [{ name: 'data', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Event,
    },
];

export const OptionsPoolBtcQuoteAbi = [
    {
        name: 'bridge',
        constant: true,
        inputs: [],
        outputs: [{ name: 'address', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getReservation',
        constant: true,
        inputs: [{ name: 'reservationId', type: ABIDataTypes.UINT256 }],
        outputs: [],
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
        name: 'reserveOption',
        inputs: [{ name: 'optionId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'reservationId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'executeReservation',
        inputs: [{ name: 'reservationId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'cancelReservation',
        inputs: [{ name: 'reservationId', type: ABIDataTypes.UINT256 }],
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
        name: 'cancelOption',
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
    ...OptionsPoolBtcQuoteEvents,
    ...OP_NET_ABI,
];

export default OptionsPoolBtcQuoteAbi;
