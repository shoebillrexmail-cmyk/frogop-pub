import { opnet, Assert, Blockchain } from '@btc-vision/unit-test-framework';
import { OptionsPoolTestRuntime } from './runtime/OptionsPoolRuntime.js';
await opnet('OptionsPool Direct Deployment Tests', async (vm) => {
    let pool;
    let deployer;
    let underlying;
    let premiumToken;
    vm.beforeEach(async () => {
        Blockchain.dispose();
        Blockchain.clearContracts();
        await Blockchain.init();
        deployer = Blockchain.generateRandomAddress();
        underlying = Blockchain.generateRandomAddress();
        premiumToken = Blockchain.generateRandomAddress();
        // Deploy pool directly (not through factory)
        pool = new OptionsPoolTestRuntime(deployer, underlying, premiumToken);
        Blockchain.register(pool);
        await pool.init();
    });
    vm.afterEach(() => {
        pool.dispose();
        Blockchain.dispose();
    });
    // Test 1: Deployment
    await vm.it('should deploy pool successfully', async () => {
        Assert.expect(pool.address).toBeDefined();
    });
    // Test 2: Get underlying
    await vm.it('should return correct underlying token', async () => {
        const result = await pool.getUnderlying();
        Assert.expect(result).toEqualAddress(underlying);
    });
    // Test 3: Get premium token
    await vm.it('should return correct premium token', async () => {
        const result = await pool.getPremiumToken();
        Assert.expect(result).toEqualAddress(premiumToken);
    });
    // Test 4: Initial option count is 0
    await vm.it('should have zero options initially', async () => {
        const count = await pool.optionCount();
        Assert.equal(count, 0n);
    });
    // Test 5: Get constants
    await vm.it('should return correct grace period', async () => {
        const grace = await pool.gracePeriodBlocks();
        Assert.equal(grace, 144n);
    });
    await vm.it('should return correct max expiry', async () => {
        const maxExpiry = await pool.maxExpiryBlocks();
        Assert.equal(maxExpiry, 52560n);
    });
    await vm.it('should return correct cancel fee', async () => {
        const fee = await pool.cancelFeeBps();
        Assert.equal(fee, 100n);
    });
    // Test 6: Calculate collateral
    await vm.it('should calculate CALL collateral correctly', async () => {
        const collateral = await pool.calculateCollateral(0, 1000n, 10n);
        Assert.equal(collateral, 10n);
    });
    await vm.it('should calculate PUT collateral correctly', async () => {
        const collateral = await pool.calculateCollateral(1, 1000n, 10n);
        Assert.equal(collateral, 10000n);
    });
});
//# sourceMappingURL=OptionsPoolDirect.test.js.map