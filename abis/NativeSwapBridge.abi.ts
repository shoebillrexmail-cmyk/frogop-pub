import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const NativeSwapBridgeEvents = [];

export const NativeSwapBridgeAbi = [
    {
        name: 'getBtcPrice',
        constant: true,
        inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'price', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'generateCsvScriptHash',
        constant: true,
        inputs: [
            { name: 'pubkey', type: ABIDataTypes.BYTES32 },
            { name: 'csvBlocks', type: ABIDataTypes.UINT64 },
        ],
        outputs: [{ name: 'scriptHash', type: ABIDataTypes.BYTES32 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'generateEscrowScriptHash',
        constant: true,
        inputs: [
            { name: 'buyerPubkey', type: ABIDataTypes.BYTES32 },
            { name: 'writerPubkey', type: ABIDataTypes.BYTES32 },
            { name: 'cltvBlock', type: ABIDataTypes.UINT64 },
        ],
        outputs: [{ name: 'scriptHash', type: ABIDataTypes.BYTES32 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'verifyBtcOutput',
        constant: true,
        inputs: [
            { name: 'expectedHash', type: ABIDataTypes.BYTES32 },
            { name: 'expectedAmount', type: ABIDataTypes.UINT64 },
        ],
        outputs: [{ name: 'verified', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'nativeSwap',
        constant: true,
        inputs: [],
        outputs: [{ name: 'address', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    ...NativeSwapBridgeEvents,
    ...OP_NET_ABI,
];

export default NativeSwapBridgeAbi;
