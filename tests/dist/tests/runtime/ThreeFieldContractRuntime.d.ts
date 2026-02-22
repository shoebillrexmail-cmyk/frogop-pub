import { ContractRuntime } from '@btc-vision/unit-test-framework';
import { Address } from '@btc-vision/transaction';
declare const WASM_PATH: string;
/**
 * Runtime for ThreeFieldContract - has 3 storage fields, should deploy successfully
 */
declare class ThreeFieldContractRuntime extends ContractRuntime {
    private readonly getValueSelector;
    constructor(deployer: Address);
    defineRequiredBytecodes(): void;
    getValue(): Promise<Address>;
}
export { ThreeFieldContractRuntime, WASM_PATH };
//# sourceMappingURL=ThreeFieldContractRuntime.d.ts.map