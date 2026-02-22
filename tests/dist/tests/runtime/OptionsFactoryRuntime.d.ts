import { ContractRuntime } from '@btc-vision/unit-test-framework';
import { Address } from '@btc-vision/transaction';
declare const WASM_PATH: string;
declare class OptionsFactoryTestRuntime extends ContractRuntime {
    private readonly ownerSelector;
    private readonly poolTemplateSelector;
    private readonly setPoolTemplateSelector;
    private readonly poolCountSelector;
    private readonly createPoolSelector;
    private readonly getPoolSelector;
    constructor(deployer: Address);
    defineRequiredBytecodes(): void;
    /**
     * Load pool bytecode at a specific address (for template)
     * Must be called before setting pool template
     */
    loadPoolBytecodeAt(address: Address): void;
    getOwner(): Promise<Address>;
    getPoolTemplate(): Promise<Address>;
    setPoolTemplate(template: Address): Promise<boolean>;
    poolCount(): Promise<bigint>;
    createPool(underlying: Address, premiumToken: Address): Promise<Address>;
    getPool(underlying: Address, premiumToken: Address): Promise<Address>;
    createPoolExpectRevert(underlying: Address, premiumToken: Address): Promise<Error | null>;
    setPoolTemplateExpectRevert(template: Address): Promise<Error | null>;
}
export { OptionsFactoryTestRuntime, WASM_PATH };
//# sourceMappingURL=OptionsFactoryRuntime.d.ts.map