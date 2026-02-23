import { ContractRuntime, Blockchain, BytecodeManager } from '@btc-vision/unit-test-framework';
import { BinaryWriter, BinaryReader } from '@btc-vision/transaction';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const POOL_WASM_PATH = path.join(__dirname, '../../build/OptionsPool.wasm');
class OptionsPoolTestRuntime extends ContractRuntime {
    underlyingSelector;
    premiumTokenSelector;
    writeOptionSelector;
    cancelOptionSelector;
    buyOptionSelector;
    exerciseSelector;
    settleSelector;
    getOptionSelector;
    optionCountSelector;
    accumulatedFeesSelector;
    gracePeriodBlocksSelector;
    maxExpiryBlocksSelector;
    cancelFeeBpsSelector;
    calculateCollateralSelector;
    _underlying;
    _premiumToken;
    constructor(deployer, underlying, premiumToken) {
        const deploymentCalldata = new BinaryWriter();
        deploymentCalldata.writeAddress(underlying);
        deploymentCalldata.writeAddress(premiumToken);
        super({
            deployer: deployer,
            address: Blockchain.generateRandomAddress(),
            gasLimit: 50000000000000n,
            deploymentCalldata: Buffer.from(deploymentCalldata.getBuffer()),
        });
        this._underlying = underlying;
        this._premiumToken = premiumToken;
        this.underlyingSelector = Number(`0x${this.abiCoder.encodeSelector('underlying()')}`);
        this.premiumTokenSelector = Number(`0x${this.abiCoder.encodeSelector('premiumToken()')}`);
        this.writeOptionSelector = Number(`0x${this.abiCoder.encodeSelector('writeOption(uint8,uint256,uint64,uint256,uint256)')}`);
        this.cancelOptionSelector = Number(`0x${this.abiCoder.encodeSelector('cancelOption(uint256)')}`);
        this.buyOptionSelector = Number(`0x${this.abiCoder.encodeSelector('buyOption(uint256)')}`);
        this.exerciseSelector = Number(`0x${this.abiCoder.encodeSelector('exercise(uint256)')}`);
        this.settleSelector = Number(`0x${this.abiCoder.encodeSelector('settle(uint256)')}`);
        this.getOptionSelector = Number(`0x${this.abiCoder.encodeSelector('getOption(uint256)')}`);
        this.optionCountSelector = Number(`0x${this.abiCoder.encodeSelector('optionCount()')}`);
        this.accumulatedFeesSelector = Number(`0x${this.abiCoder.encodeSelector('accumulatedFees()')}`);
        this.gracePeriodBlocksSelector = Number(`0x${this.abiCoder.encodeSelector('gracePeriodBlocks()')}`);
        this.maxExpiryBlocksSelector = Number(`0x${this.abiCoder.encodeSelector('maxExpiryBlocks()')}`);
        this.cancelFeeBpsSelector = Number(`0x${this.abiCoder.encodeSelector('cancelFeeBps()')}`);
        this.calculateCollateralSelector = Number(`0x${this.abiCoder.encodeSelector('calculateCollateral(uint8,uint256,uint256)')}`);
    }
    defineRequiredBytecodes() {
        BytecodeManager.loadBytecode(POOL_WASM_PATH, this.address);
    }
    async getUnderlying() {
        const writer = new BinaryWriter();
        writer.writeSelector(this.underlyingSelector);
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            saveStates: false,
        });
        const reader = new BinaryReader(result.response);
        return reader.readAddress();
    }
    async getPremiumToken() {
        const writer = new BinaryWriter();
        writer.writeSelector(this.premiumTokenSelector);
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            saveStates: false,
        });
        const reader = new BinaryReader(result.response);
        return reader.readAddress();
    }
    async optionCount() {
        const writer = new BinaryWriter();
        writer.writeSelector(this.optionCountSelector);
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            saveStates: false,
        });
        const reader = new BinaryReader(result.response);
        return reader.readU256();
    }
    async accumulatedFees() {
        const writer = new BinaryWriter();
        writer.writeSelector(this.accumulatedFeesSelector);
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            saveStates: false,
        });
        const reader = new BinaryReader(result.response);
        return reader.readU256();
    }
    async gracePeriodBlocks() {
        const writer = new BinaryWriter();
        writer.writeSelector(this.gracePeriodBlocksSelector);
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            saveStates: false,
        });
        const reader = new BinaryReader(result.response);
        return reader.readU64();
    }
    async maxExpiryBlocks() {
        const writer = new BinaryWriter();
        writer.writeSelector(this.maxExpiryBlocksSelector);
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            saveStates: false,
        });
        const reader = new BinaryReader(result.response);
        return reader.readU64();
    }
    async cancelFeeBps() {
        const writer = new BinaryWriter();
        writer.writeSelector(this.cancelFeeBpsSelector);
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            saveStates: false,
        });
        const reader = new BinaryReader(result.response);
        return reader.readU64();
    }
    async calculateCollateral(optionType, strikePrice, underlyingAmount) {
        const writer = new BinaryWriter();
        writer.writeSelector(this.calculateCollateralSelector);
        writer.writeU8(optionType);
        writer.writeU256(strikePrice);
        writer.writeU256(underlyingAmount);
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            saveStates: false,
        });
        const reader = new BinaryReader(result.response);
        return reader.readU256();
    }
    async writeOption(optionType, strikePrice, expiryBlock, underlyingAmount, premium) {
        const writer = new BinaryWriter();
        writer.writeSelector(this.writeOptionSelector);
        writer.writeU8(optionType);
        writer.writeU256(strikePrice);
        writer.writeU64(expiryBlock);
        writer.writeU256(underlyingAmount);
        writer.writeU256(premium);
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            sender: Blockchain.msgSender,
            txOrigin: Blockchain.txOrigin,
        });
        const reader = new BinaryReader(result.response);
        return reader.readU256();
    }
    async cancelOption(optionId) {
        const writer = new BinaryWriter();
        writer.writeSelector(this.cancelOptionSelector);
        writer.writeU256(optionId);
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            sender: Blockchain.msgSender,
            txOrigin: Blockchain.txOrigin,
        });
        const reader = new BinaryReader(result.response);
        return reader.readBoolean();
    }
    async buyOption(optionId) {
        const writer = new BinaryWriter();
        writer.writeSelector(this.buyOptionSelector);
        writer.writeU256(optionId);
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            sender: Blockchain.msgSender,
            txOrigin: Blockchain.txOrigin,
        });
        const reader = new BinaryReader(result.response);
        return reader.readBoolean();
    }
    async exercise(optionId) {
        const writer = new BinaryWriter();
        writer.writeSelector(this.exerciseSelector);
        writer.writeU256(optionId);
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            sender: Blockchain.msgSender,
            txOrigin: Blockchain.txOrigin,
        });
        const reader = new BinaryReader(result.response);
        return reader.readBoolean();
    }
    async settle(optionId) {
        const writer = new BinaryWriter();
        writer.writeSelector(this.settleSelector);
        writer.writeU256(optionId);
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            sender: Blockchain.msgSender,
            txOrigin: Blockchain.txOrigin,
        });
        const reader = new BinaryReader(result.response);
        return reader.readBoolean();
    }
    async getOption(optionId) {
        const writer = new BinaryWriter();
        writer.writeSelector(this.getOptionSelector);
        writer.writeU256(optionId);
        const result = await this.executeThrowOnError({
            calldata: writer.getBuffer(),
            saveStates: false,
        });
        const reader = new BinaryReader(result.response);
        return {
            id: reader.readU256(),
            writer: reader.readAddress(),
            buyer: reader.readAddress(),
            optionType: reader.readU8(),
            strikePrice: reader.readU256(),
            underlyingAmount: reader.readU256(),
            premium: reader.readU256(),
            expiryBlock: reader.readU64(),
            status: reader.readU8(),
        };
    }
    // Getter methods for stored addresses
    getPoolUnderlying() {
        return this._underlying;
    }
    getPoolPremiumToken() {
        return this._premiumToken;
    }
    // Helper methods for testing reverts
    async writeOptionExpectRevert(optionType, strikePrice, expiryBlock, underlyingAmount, premium) {
        const writer = new BinaryWriter();
        writer.writeSelector(this.writeOptionSelector);
        writer.writeU8(optionType);
        writer.writeU256(strikePrice);
        writer.writeU64(expiryBlock);
        writer.writeU256(underlyingAmount);
        writer.writeU256(premium);
        const result = await this.execute({
            calldata: writer.getBuffer(),
            sender: Blockchain.msgSender,
            txOrigin: Blockchain.txOrigin,
        });
        if (!result.error) {
            throw new Error('Expected revert but transaction succeeded');
        }
        return result.error;
    }
    async buyOptionExpectRevert(optionId) {
        const writer = new BinaryWriter();
        writer.writeSelector(this.buyOptionSelector);
        writer.writeU256(optionId);
        const result = await this.execute({
            calldata: writer.getBuffer(),
            sender: Blockchain.msgSender,
            txOrigin: Blockchain.txOrigin,
        });
        if (!result.error) {
            throw new Error('Expected revert but transaction succeeded');
        }
        return result.error;
    }
    async cancelOptionExpectRevert(optionId) {
        const writer = new BinaryWriter();
        writer.writeSelector(this.cancelOptionSelector);
        writer.writeU256(optionId);
        const result = await this.execute({
            calldata: writer.getBuffer(),
            sender: Blockchain.msgSender,
            txOrigin: Blockchain.txOrigin,
        });
        if (!result.error) {
            throw new Error('Expected revert but transaction succeeded');
        }
        return result.error;
    }
    async getOptionExpectRevert(optionId) {
        const writer = new BinaryWriter();
        writer.writeSelector(this.getOptionSelector);
        writer.writeU256(optionId);
        const result = await this.execute({
            calldata: writer.getBuffer(),
            saveStates: false,
        });
        if (!result.error) {
            throw new Error('Expected revert but transaction succeeded');
        }
        return result.error;
    }
}
export { OptionsPoolTestRuntime, POOL_WASM_PATH };
//# sourceMappingURL=OptionsPoolRuntime.js.map