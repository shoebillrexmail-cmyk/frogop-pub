import { ContractRuntime, Blockchain, BytecodeManager } from '@btc-vision/unit-test-framework';
import { Address, BinaryWriter, BinaryReader } from '@btc-vision/transaction';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WASM_PATH = path.join(__dirname, '../../build/FourFieldContract.wasm');

/**
 * Runtime for FourFieldContract - has 4 storage fields, should FAIL to deploy
 * due to "out of gas during start function" error in unit test framework
 */
class FourFieldContractRuntime extends ContractRuntime {
    private readonly getValueSelector: number;
    
    constructor(deployer: Address) {
        super({
            deployer: deployer,
            address: Blockchain.generateRandomAddress(),
            gasLimit: 500_000_000_000n, // 500B gas limit (unit test framework limit)
        });
        
        this.getValueSelector = Number(`0x${this.abiCoder.encodeSelector('getValue()')}`);
    }
    
    defineRequiredBytecodes(): void {
        BytecodeManager.loadBytecode(WASM_PATH, this.address);
    }
    
    async getValue(): Promise<Address> {
        const writer = new BinaryWriter();
        writer.writeSelector(this.getValueSelector);
        
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            saveStates: false,
        });
        
        const reader = new BinaryReader(result.response);
        return reader.readAddress();
    }
}

export { FourFieldContractRuntime, WASM_PATH };
