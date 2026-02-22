import { ContractRuntime, Blockchain, BytecodeManager } from '@btc-vision/unit-test-framework';
import { Address, BinaryWriter, BinaryReader } from '@btc-vision/transaction';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WASM_PATH = path.join(__dirname, '../../build/OptionsFactory.wasm');
const POOL_WASM_PATH = path.join(__dirname, '../../build/OptionsPool.wasm');

class OptionsFactoryTestRuntime extends ContractRuntime {
    private readonly ownerSelector: number;
    private readonly poolTemplateSelector: number;
    private readonly setPoolTemplateSelector: number;
    private readonly poolCountSelector: number;
    private readonly createPoolSelector: number;
    private readonly getPoolSelector: number;
    
    constructor(deployer: Address) {
        super({
            deployer: deployer,
            address: Blockchain.generateRandomAddress(),
            gasLimit: 500_000_000_000n,
        });
        
        this.ownerSelector = Number(`0x${this.abiCoder.encodeSelector('owner()')}`);
        this.poolTemplateSelector = Number(`0x${this.abiCoder.encodeSelector('poolTemplate()')}`);
        this.setPoolTemplateSelector = Number(`0x${this.abiCoder.encodeSelector('setPoolTemplate(address)')}`);
        this.poolCountSelector = Number(`0x${this.abiCoder.encodeSelector('poolCount()')}`);
        this.createPoolSelector = Number(`0x${this.abiCoder.encodeSelector('createPool(address,address)')}`);
        this.getPoolSelector = Number(`0x${this.abiCoder.encodeSelector('getPool(address,address)')}`);
    }
    
    defineRequiredBytecodes(): void {
        BytecodeManager.loadBytecode(WASM_PATH, this.address);
    }
    
    /**
     * Load pool bytecode at a specific address (for template)
     * Must be called before setting pool template
     */
    loadPoolBytecodeAt(address: Address): void {
        BytecodeManager.loadBytecode(POOL_WASM_PATH, address);
    }
    
    async getOwner(): Promise<Address> {
        const writer = new BinaryWriter();
        writer.writeSelector(this.ownerSelector);
        
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            saveStates: false,
        });
        
        const reader = new BinaryReader(result.response);
        return reader.readAddress();
    }
    
    async getPoolTemplate(): Promise<Address> {
        const writer = new BinaryWriter();
        writer.writeSelector(this.poolTemplateSelector);
        
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            saveStates: false,
        });
        
        const reader = new BinaryReader(result.response);
        return reader.readAddress();
    }
    
    async setPoolTemplate(template: Address): Promise<boolean> {
        const writer = new BinaryWriter();
        writer.writeSelector(this.setPoolTemplateSelector);
        writer.writeAddress(template);
        
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            sender: Blockchain.msgSender,
            txOrigin: Blockchain.txOrigin,
        });
        
        const reader = new BinaryReader(result.response);
        return reader.readBoolean();
    }
    
    async poolCount(): Promise<bigint> {
        const writer = new BinaryWriter();
        writer.writeSelector(this.poolCountSelector);
        
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            saveStates: false,
        });
        
        const reader = new BinaryReader(result.response);
        return reader.readU256();
    }
    
    async createPool(underlying: Address, premiumToken: Address): Promise<Address> {
        const writer = new BinaryWriter();
        writer.writeSelector(this.createPoolSelector);
        writer.writeAddress(underlying);
        writer.writeAddress(premiumToken);
        
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            sender: Blockchain.msgSender,
            txOrigin: Blockchain.txOrigin,
        });
        
        const reader = new BinaryReader(result.response);
        return reader.readAddress();
    }
    
    async getPool(underlying: Address, premiumToken: Address): Promise<Address> {
        const writer = new BinaryWriter();
        writer.writeSelector(this.getPoolSelector);
        writer.writeAddress(underlying);
        writer.writeAddress(premiumToken);
        
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            saveStates: false,
        });
        
        const reader = new BinaryReader(result.response);
        return reader.readAddress();
    }
    
    async createPoolExpectRevert(underlying: Address, premiumToken: Address): Promise<Error | null> {
        const writer = new BinaryWriter();
        writer.writeSelector(this.createPoolSelector);
        writer.writeAddress(underlying);
        writer.writeAddress(premiumToken);
        
        try {
            await this.executeThrowOnError({
                calldata: writer.getBuffer(),
                sender: Blockchain.msgSender,
                txOrigin: Blockchain.txOrigin,
            });
            return null;
        } catch (e) {
            return e as Error;
        }
    }
    
    async setPoolTemplateExpectRevert(template: Address): Promise<Error | null> {
        const writer = new BinaryWriter();
        writer.writeSelector(this.setPoolTemplateSelector);
        writer.writeAddress(template);
        
        try {
            await this.executeThrowOnError({
                calldata: writer.getBuffer(),
                sender: Blockchain.msgSender,
                txOrigin: Blockchain.txOrigin,
            });
            return null;
        } catch (e) {
            return e as Error;
        }
    }
}

export { OptionsFactoryTestRuntime, WASM_PATH };
