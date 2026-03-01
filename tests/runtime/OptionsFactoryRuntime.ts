import { ContractRuntime, Blockchain, BytecodeManager } from '@btc-vision/unit-test-framework';
import { Address, BinaryWriter, BinaryReader } from '@btc-vision/transaction';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WASM_PATH = path.join(__dirname, '../../build/OptionsFactory.wasm');

/**
 * OptionsFactory unit test runtime.
 *
 * Only methods that work in the WASM unit test environment are exposed.
 * State-reading views (getOwner, poolCount, getPoolTemplate) crash with
 * RuntimeError:unreachable due to lazy storage pointer limitations.
 * createPool uses deployContractFromExisting which OPNet doesn't support.
 * Those paths are tested in integration tests (05-pool-creation.ts).
 */
class OptionsFactoryTestRuntime extends ContractRuntime {
    private readonly setPoolTemplateSelector: number;
    private readonly createPoolSelector: number;
    private readonly getPoolSelector: number;

    constructor(deployer: Address) {
        super({
            deployer: deployer,
            address: Blockchain.generateRandomAddress(),
            gasLimit: 5_000_000_000_000n,
        });

        this.setPoolTemplateSelector = Number(`0x${this.abiCoder.encodeSelector('setPoolTemplate(address)')}`);
        this.createPoolSelector = Number(`0x${this.abiCoder.encodeSelector('createPool(address,address)')}`);
        this.getPoolSelector = Number(`0x${this.abiCoder.encodeSelector('getPool(address,address)')}`);
    }

    defineRequiredBytecodes(): void {
        BytecodeManager.loadBytecode(WASM_PATH, this.address);
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
