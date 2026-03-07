import { opnet, OPNetUnit, Assert, Blockchain } from '@btc-vision/unit-test-framework';
import { OptionsFactoryTestRuntime } from './runtime/OptionsFactoryRuntime.js';
import { Address } from '@btc-vision/transaction';

/**
 * OptionsFactory Unit Tests
 *
 * Tests that require state reads (getOwner, poolCount, getPoolTemplate) or
 * createPool (uses deployContractFromExisting, not supported by OPNet runtime)
 * are covered in integration tests (05-pool-creation.ts) instead.
 *
 * These tests cover deployment + revert-path validations that work in the
 * WASM unit test environment.
 */
await opnet('OptionsFactory Tests', async (vm: OPNetUnit) => {
    let factory: OptionsFactoryTestRuntime;
    let deployer: Address;

    vm.beforeEach(async () => {
        Blockchain.dispose();
        Blockchain.clearContracts();
        await Blockchain.init();

        deployer = Blockchain.generateRandomAddress();

        factory = new OptionsFactoryTestRuntime(deployer);

        Blockchain.register(factory);
        await factory.init();
    });

    vm.afterEach(() => {
        factory.dispose();
        Blockchain.dispose();
    });

    await vm.it('should deploy successfully', async () => {
        Assert.expect(factory.address).toBeDefined();
    });

    await vm.it('should reject non-owner setting template', async () => {
        const template = Blockchain.generateRandomAddress();
        const nonOwner = Blockchain.generateRandomAddress();

        Blockchain.msgSender = nonOwner;
        Blockchain.txOrigin = nonOwner;

        const error = await factory.setPoolTemplateExpectRevert(template);
        Assert.expect(error).toBeDefined();
        Assert.expect(error).toNotEqual(null);
    });

    await vm.it('should return dead address for non-existent pool', async () => {
        const underlying = Blockchain.generateRandomAddress();
        const premiumToken = Blockchain.generateRandomAddress();

        const poolAddress = await factory.getPool(underlying, premiumToken);
        Assert.expect(poolAddress).toEqualAddress(Address.dead());
    });

    await vm.it('should reject pool creation without template', async () => {
        const underlying = Blockchain.generateRandomAddress();
        const premiumToken = Blockchain.generateRandomAddress();

        Blockchain.msgSender = deployer;
        Blockchain.txOrigin = deployer;

        const error = await factory.createPoolExpectRevert(underlying, premiumToken);
        Assert.expect(error).toBeDefined();
        Assert.expect(error).toNotEqual(null);
    });

    await vm.it('should reject pool with same tokens', async () => {
        const template = Blockchain.generateRandomAddress();
        const token = Blockchain.generateRandomAddress();

        Blockchain.msgSender = deployer;
        Blockchain.txOrigin = deployer;
        await factory.setPoolTemplate(template);

        const error = await factory.createPoolExpectRevert(token, token);
        Assert.expect(error).toBeDefined();
        Assert.expect(error).toNotEqual(null);
    });

    await vm.it('should reject pool with dead underlying', async () => {
        const template = Blockchain.generateRandomAddress();
        const premiumToken = Blockchain.generateRandomAddress();

        Blockchain.msgSender = deployer;
        Blockchain.txOrigin = deployer;
        await factory.setPoolTemplate(template);

        const error = await factory.createPoolExpectRevert(Address.dead(), premiumToken);
        Assert.expect(error).toBeDefined();
        Assert.expect(error).toNotEqual(null);
    });
});
