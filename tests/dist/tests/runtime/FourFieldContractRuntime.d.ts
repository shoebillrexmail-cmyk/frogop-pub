import { ContractRuntime } from '@btc-vision/unit-test-framework';
import { Address } from '@btc-vision/transaction';
declare const WASM_PATH: string;
/**
 * Runtime for FourFieldContract - has 4 storage fields, should FAIL to deploy
 * due to "out of gas during start function" error in unit test framework
 */
declare class FourFieldContractRuntime extends ContractRuntime {
    private readonly getValueSelector;
    constructor(deployer: Address);
    defineRequiredBytecodes(): void;
    getValue(): Promise<Address>;
}
export { FourFieldContractRuntime, WASM_PATH };
//# sourceMappingURL=FourFieldContractRuntime.d.ts.map