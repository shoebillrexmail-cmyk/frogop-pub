import { Address } from '@btc-vision/transaction';
export declare class MockOP20 {
    readonly address: Address;
    private balances;
    private allowances;
    constructor(address: Address);
    mint(to: Address, amount: bigint): void;
    balanceOf(owner: Address): bigint;
    approve(owner: Address, spender: Address, amount: bigint): void;
    handleCall(caller: Address, calldata: Buffer): {
        success: boolean;
        data: Uint8Array;
    };
    private _transfer;
    private _transferFrom;
}
export declare class MockTokenManager {
    private tokens;
    private originalCall;
    constructor();
    registerToken(token: MockOP20): void;
    install(): void;
    restore(): void;
}
export declare function createMockTokens(writer: Address, buyer: Address, poolAddress: Address, initialBalance?: bigint): {
    underlying: MockOP20;
    premium: MockOP20;
};
//# sourceMappingURL=MockOP20.d.ts.map