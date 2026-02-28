/**
 * ABI validation tests — ensures frontend ABI definitions match
 * the on-chain contract method signatures exactly.
 *
 * These tests prevent the class of bugs where:
 *   - Wrong type (e.g. UINT256 vs UINT64) produces a different selector hash
 *   - Wrong parameter order causes calldata to be decoded incorrectly
 *
 * The "expected" signatures come directly from the contract's execute() router
 * in src/contracts/pool/contract.ts.
 */
import { describe, it, expect } from 'vitest';
import { ABIDataTypes } from '@btc-vision/transaction';
import { POOL_WRITE_ABI, TOKEN_APPROVE_ABI } from '../poolAbi.ts';

/** Map ABIDataTypes enum values to their Solidity-style type strings */
const TYPE_MAP: Record<number, string> = {
    [ABIDataTypes.UINT8]: 'uint8',
    [ABIDataTypes.UINT16]: 'uint16',
    [ABIDataTypes.UINT32]: 'uint32',
    [ABIDataTypes.UINT64]: 'uint64',
    [ABIDataTypes.UINT128]: 'uint128',
    [ABIDataTypes.UINT256]: 'uint256',
    [ABIDataTypes.BOOL]: 'bool',
    [ABIDataTypes.ADDRESS]: 'address',
};

function buildSignature(entry: { name: string; inputs: { type: number }[] }): string {
    const types = entry.inputs.map((i) => TYPE_MAP[i.type] ?? `unknown(${i.type})`);
    return `${entry.name}(${types.join(',')})`;
}

function findAbiEntry(abi: typeof POOL_WRITE_ABI, name: string) {
    const entry = abi.find((e) => 'name' in e && e.name === name);
    if (!entry || !('inputs' in entry)) throw new Error(`ABI entry "${name}" not found`);
    return entry as { name: string; inputs: { name: string; type: number }[] };
}

describe('Pool ABI matches contract signatures', () => {
    // Contract: encodeSelector('writeOption(uint8,uint256,uint64,uint256,uint256)')
    it('writeOption signature matches contract', () => {
        const entry = findAbiEntry(POOL_WRITE_ABI, 'writeOption');
        expect(buildSignature(entry)).toBe('writeOption(uint8,uint256,uint64,uint256,uint256)');
    });

    // Contract reads: optionType(u8), strikePrice(u256), expiryBlock(u64), underlyingAmount(u256), premium(u256)
    it('writeOption parameter order matches contract', () => {
        const entry = findAbiEntry(POOL_WRITE_ABI, 'writeOption');
        const names = entry.inputs.map((i) => i.name);
        expect(names).toEqual(['optionType', 'strikePrice', 'expiryBlock', 'underlyingAmount', 'premium']);
    });

    // Contract: encodeSelector('buyOption(uint256)')
    it('buyOption signature matches contract', () => {
        const entry = findAbiEntry(POOL_WRITE_ABI, 'buyOption');
        expect(buildSignature(entry)).toBe('buyOption(uint256)');
    });

    // Contract: encodeSelector('cancelOption(uint256)')
    it('cancelOption signature matches contract', () => {
        const entry = findAbiEntry(POOL_WRITE_ABI, 'cancelOption');
        expect(buildSignature(entry)).toBe('cancelOption(uint256)');
    });

    // Contract: encodeSelector('exercise(uint256)')
    it('exercise signature matches contract', () => {
        const entry = findAbiEntry(POOL_WRITE_ABI, 'exercise');
        expect(buildSignature(entry)).toBe('exercise(uint256)');
    });

    // Contract: encodeSelector('settle(uint256)')
    it('settle signature matches contract', () => {
        const entry = findAbiEntry(POOL_WRITE_ABI, 'settle');
        expect(buildSignature(entry)).toBe('settle(uint256)');
    });
});

describe('Token ABI matches OP20 signatures', () => {
    it('increaseAllowance signature matches OP20', () => {
        const entry = findAbiEntry(TOKEN_APPROVE_ABI, 'increaseAllowance');
        expect(buildSignature(entry)).toBe('increaseAllowance(address,uint256)');
    });

    it('approve signature matches OP20', () => {
        const entry = findAbiEntry(TOKEN_APPROVE_ABI, 'approve');
        expect(buildSignature(entry)).toBe('approve(address,uint256)');
    });
});
