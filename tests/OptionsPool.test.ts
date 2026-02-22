import { opnet, OPNetUnit, Assert, Blockchain } from '@btc-vision/unit-test-framework';
import { OptionsPoolTestRuntime } from './runtime/OptionsPoolRuntime.js';
import { Address } from '@btc-vision/transaction';

await opnet('OptionsPool Tests', async (vm: OPNetUnit) => {
    let pool: OptionsPoolTestRuntime;
    let deployer: Address;
    let underlying: Address;
    let premiumToken: Address;
    let writer: Address;
    let buyer: Address;
    
    vm.beforeEach(async () => {
        Blockchain.dispose();
        Blockchain.clearContracts();
        await Blockchain.init();
        
        deployer = Blockchain.generateRandomAddress();
        underlying = Blockchain.generateRandomAddress();
        premiumToken = Blockchain.generateRandomAddress();
        writer = Blockchain.generateRandomAddress();
        buyer = Blockchain.generateRandomAddress();
        
        pool = new OptionsPoolTestRuntime(deployer, underlying, premiumToken);
        
        Blockchain.register(pool);
        await pool.init();
    });
    
    vm.afterEach(() => {
        pool.dispose();
        Blockchain.dispose();
    });
    
    // Test 1: Deployment
    await vm.it('should deploy successfully', async () => {
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
    
    // Test 5: Initial accumulated fees is 0
    await vm.it('should have zero accumulated fees initially', async () => {
        const fees = await pool.accumulatedFees();
        Assert.equal(fees, 0n);
    });
    
    // Test 6: Get constants
    await vm.it('should return correct grace period', async () => {
        const grace = await pool.gracePeriodBlocks();
        Assert.equal(grace, 144n); // ~1 day
    });
    
    await vm.it('should return correct max expiry', async () => {
        const maxExpiry = await pool.maxExpiryBlocks();
        Assert.equal(maxExpiry, 52560n); // ~1 year
    });
    
    await vm.it('should return correct cancel fee', async () => {
        const fee = await pool.cancelFeeBps();
        Assert.equal(fee, 100n); // 1%
    });
    
    // Test 7: Calculate collateral for CALL
    await vm.it('should calculate collateral correctly for CALL', async () => {
        const strikePrice = 1000n;
        const underlyingAmount = 10n;
        
        const collateral = await pool.calculateCollateral(0, strikePrice, underlyingAmount);
        // CALL: collateral = underlyingAmount
        Assert.equal(collateral, underlyingAmount);
    });
    
    // Test 8: Calculate collateral for PUT
    await vm.it('should calculate collateral correctly for PUT', async () => {
        const strikePrice = 1000n;
        const underlyingAmount = 10n;
        
        const collateral = await pool.calculateCollateral(1, strikePrice, underlyingAmount);
        // PUT: collateral = strikePrice * underlyingAmount
        Assert.equal(collateral, strikePrice * underlyingAmount);
    });
    
    // Test 9: Write option
    await vm.it('should write a new option', async () => {
        const strikePrice = 1000n;
        const underlyingAmount = 10n;
        const premium = 50n;
        const expiryBlock = 1000n;
        
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        
        const optionId = await pool.writeOption(0, strikePrice, expiryBlock, underlyingAmount, premium);
        
        // Option ID should be 0 (first option)
        Assert.equal(optionId, 0n);
        
        // Option count should be 1
        const count = await pool.optionCount();
        Assert.equal(count, 1n);
    });
    
    // Test 10: Get option details
    await vm.it('should retrieve option details', async () => {
        const strikePrice = 1000n;
        const underlyingAmount = 10n;
        const premium = 50n;
        const expiryBlock = 1000n;
        
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        
        await pool.writeOption(0, strikePrice, expiryBlock, underlyingAmount, premium);
        
        const option = await pool.getOption(0n);
        
        Assert.equal(option.id, 0n);
        Assert.expect(option.writer).toEqualAddress(writer);
        Assert.equal(option.optionType, 0); // CALL
        Assert.equal(option.strikePrice, strikePrice);
        Assert.equal(option.underlyingAmount, underlyingAmount);
        Assert.equal(option.premium, premium);
        Assert.equal(option.status, 0); // OPEN
    });
    
    // Test 11: Cannot write option with invalid type
    await vm.it('should reject option with invalid type', async () => {
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        
        const error = await pool.writeOptionExpectRevert(2, 1000n, 1000n, 10n, 50n);
        Assert.expect(error).toBeDefined();
    });
    
    // Test 12: Cannot write option with zero strike
    await vm.it('should reject option with zero strike price', async () => {
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        
        const error = await pool.writeOptionExpectRevert(0, 0n, 1000n, 10n, 50n);
        Assert.expect(error).toBeDefined();
    });
    
    // Test 13: Cannot write option with zero amount
    await vm.it('should reject option with zero underlying amount', async () => {
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        
        const error = await pool.writeOptionExpectRevert(0, 1000n, 1000n, 0n, 50n);
        Assert.expect(error).toBeDefined();
    });
    
    // Test 14: Cannot write option with zero premium
    await vm.it('should reject option with zero premium', async () => {
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        
        const error = await pool.writeOptionExpectRevert(0, 1000n, 1000n, 10n, 0n);
        Assert.expect(error).toBeDefined();
    });
    
    // Test 15: Cannot write option with expiry in past
    await vm.it('should reject option with expiry in past', async () => {
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        
        // Current block is 0, so expiry must be > 0
        const error = await pool.writeOptionExpectRevert(0, 1000n, 0n, 10n, 50n);
        Assert.expect(error).toBeDefined();
    });
    
    // Test 16: Buy option
    await vm.it('should allow buying an option', async () => {
        const strikePrice = 1000n;
        const underlyingAmount = 10n;
        const premium = 50n;
        const expiryBlock = 1000n;
        
        // Write option as writer
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        await pool.writeOption(0, strikePrice, expiryBlock, underlyingAmount, premium);
        
        // Buy option as buyer
        Blockchain.msgSender = buyer;
        Blockchain.txOrigin = buyer;
        
        const success = await pool.buyOption(0n);
        Assert.equal(success, true);
        
        // Verify option status is PURCHASED
        const option = await pool.getOption(0n);
        Assert.expect(option.buyer).toEqualAddress(buyer);
        Assert.equal(option.status, 1); // PURCHASED
    });
    
    // Test 17: Cannot buy own option
    await vm.it('should reject buying own option', async () => {
        const strikePrice = 1000n;
        const underlyingAmount = 10n;
        const premium = 50n;
        const expiryBlock = 1000n;
        
        // Write option
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        await pool.writeOption(0, strikePrice, expiryBlock, underlyingAmount, premium);
        
        // Try to buy own option
        const error = await pool.buyOptionExpectRevert(0n);
        Assert.expect(error).toBeDefined();
    });
    
    // Test 18: Cannot buy already purchased option
    await vm.it('should reject buying already purchased option', async () => {
        const strikePrice = 1000n;
        const underlyingAmount = 10n;
        const premium = 50n;
        const expiryBlock = 1000n;
        
        // Write and buy option
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        await pool.writeOption(0, strikePrice, expiryBlock, underlyingAmount, premium);
        
        Blockchain.msgSender = buyer;
        Blockchain.txOrigin = buyer;
        await pool.buyOption(0n);
        
        // Try to buy again
        const error = await pool.buyOptionExpectRevert(0n);
        Assert.expect(error).toBeDefined();
    });
    
    // Test 19: Cancel option (before purchase)
    await vm.it('should allow writer to cancel option', async () => {
        const strikePrice = 1000n;
        const underlyingAmount = 10n;
        const premium = 50n;
        const expiryBlock = 1000n;
        
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        await pool.writeOption(0, strikePrice, expiryBlock, underlyingAmount, premium);
        
        const success = await pool.cancelOption(0n);
        Assert.equal(success, true);
        
        // Verify option status is CANCELLED
        const option = await pool.getOption(0n);
        Assert.equal(option.status, 4); // CANCELLED
    });
    
    // Test 20: Cannot cancel if not writer
    await vm.it('should reject cancel if not writer', async () => {
        const strikePrice = 1000n;
        const underlyingAmount = 10n;
        const premium = 50n;
        const expiryBlock = 1000n;
        
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        await pool.writeOption(0, strikePrice, expiryBlock, underlyingAmount, premium);
        
        // Try to cancel as buyer
        Blockchain.msgSender = buyer;
        Blockchain.txOrigin = buyer;
        
        const error = await pool.cancelOptionExpectRevert(0n);
        Assert.expect(error).toBeDefined();
    });
    
    // Test 21: Cannot cancel after purchase
    await vm.it('should reject cancel after purchase', async () => {
        const strikePrice = 1000n;
        const underlyingAmount = 10n;
        const premium = 50n;
        const expiryBlock = 1000n;
        
        // Write and buy option
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        await pool.writeOption(0, strikePrice, expiryBlock, underlyingAmount, premium);
        
        Blockchain.msgSender = buyer;
        Blockchain.txOrigin = buyer;
        await pool.buyOption(0n);
        
        // Try to cancel as writer
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        
        const error = await pool.cancelOptionExpectRevert(0n);
        Assert.expect(error).toBeDefined();
    });
    
    // Test 22: Get non-existent option fails
    await vm.it('should fail to get non-existent option', async () => {
        const error = await pool.getOptionExpectRevert(999n);
        Assert.expect(error).toBeDefined();
    });
});


