import { opnet, OPNetUnit, Assert, Blockchain } from '@btc-vision/unit-test-framework';
import { OptionsFactoryTestRuntime } from './runtime/OptionsFactoryRuntime.js';
import { Address } from '@btc-vision/transaction';

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
    
    // Test 1: Deployment
    await vm.it('should deploy successfully', async () => {
        Assert.expect(factory.address).toBeDefined();
    });
    
    // Test 2: Owner
    await vm.it('should set owner to deployer', async () => {
        const owner = await factory.getOwner();
        Assert.expect(owner).toEqualAddress(deployer);
    });
    
    // Test 3: Initial pool count
    await vm.it('should have zero pools initially', async () => {
        const count = await factory.poolCount();
        Assert.equal(count, 0n);
    });
    
    // Test 4: Pool template initially dead address
    await vm.it('should have dead address as pool template initially', async () => {
        const template = await factory.getPoolTemplate();
        Assert.expect(template).toEqualAddress(Address.dead());
    });
    
    // Test 5: Set pool template
    await vm.it('should allow owner to set pool template', async () => {
        const template = Blockchain.generateRandomAddress();
        
        // Set template as owner
        Blockchain.msgSender = deployer;
        Blockchain.txOrigin = deployer;
        
        const success = await factory.setPoolTemplate(template);
        Assert.equal(success, true);
        
        // Verify template was set
        const storedTemplate = await factory.getPoolTemplate();
        Assert.expect(storedTemplate).toEqualAddress(template);
    });
    
    // Test 6: Non-owner cannot set template
    await vm.it('should reject non-owner setting template', async () => {
        const template = Blockchain.generateRandomAddress();
        const nonOwner = Blockchain.generateRandomAddress();
        
        // Try to set template as non-owner
        Blockchain.msgSender = nonOwner;
        Blockchain.txOrigin = nonOwner;
        
        const error = await factory.setPoolTemplateExpectRevert(template);
        Assert.expect(error).toBeDefined();
        Assert.expect(error).toNotEqual(null);
    });
    
    // Test 7: Create pool
    await vm.it('should create a new pool', async () => {
        const template = Blockchain.generateRandomAddress();
        const underlying = Blockchain.generateRandomAddress();
        const premiumToken = Blockchain.generateRandomAddress();
        
        // Set template first
        Blockchain.msgSender = deployer;
        Blockchain.txOrigin = deployer;
        await factory.setPoolTemplate(template);
        
        // Create pool
        const poolAddress = await factory.createPool(underlying, premiumToken);
        
        // Pool address should not be dead
        Assert.expect(poolAddress).toNotEqual(Address.dead());
        
        // Verify pool count increased
        const count = await factory.poolCount();
        Assert.equal(count, 1n);
    });
    
    // Test 8: Get pool
    await vm.it('should retrieve created pool', async () => {
        const template = Blockchain.generateRandomAddress();
        const underlying = Blockchain.generateRandomAddress();
        const premiumToken = Blockchain.generateRandomAddress();
        
        // Set template and create pool
        Blockchain.msgSender = deployer;
        Blockchain.txOrigin = deployer;
        await factory.setPoolTemplate(template);
        
        const createdPool = await factory.createPool(underlying, premiumToken);
        
        // Get pool
        const retrievedPool = await factory.getPool(underlying, premiumToken);
        
        Assert.expect(retrievedPool).toEqualAddress(createdPool);
    });
    
    // Test 9: Non-existent pool returns dead address
    await vm.it('should return dead address for non-existent pool', async () => {
        const underlying = Blockchain.generateRandomAddress();
        const premiumToken = Blockchain.generateRandomAddress();
        
        const poolAddress = await factory.getPool(underlying, premiumToken);
        Assert.expect(poolAddress).toEqualAddress(Address.dead());
    });
    
    // Test 10: Cannot create duplicate pool
    await vm.it('should reject duplicate pool', async () => {
        const template = Blockchain.generateRandomAddress();
        const underlying = Blockchain.generateRandomAddress();
        const premiumToken = Blockchain.generateRandomAddress();
        
        // Set template
        Blockchain.msgSender = deployer;
        Blockchain.txOrigin = deployer;
        await factory.setPoolTemplate(template);
        
        // Create first pool
        await factory.createPool(underlying, premiumToken);
        
        // Try to create duplicate
        const error = await factory.createPoolExpectRevert(underlying, premiumToken);
        Assert.expect(error).toBeDefined();
        Assert.expect(error).toNotEqual(null);
    });
    
    // Test 11: Cannot create pool without template
    await vm.it('should reject pool creation without template', async () => {
        const underlying = Blockchain.generateRandomAddress();
        const premiumToken = Blockchain.generateRandomAddress();
        
        Blockchain.msgSender = deployer;
        Blockchain.txOrigin = deployer;
        
        const error = await factory.createPoolExpectRevert(underlying, premiumToken);
        Assert.expect(error).toBeDefined();
        Assert.expect(error).toNotEqual(null);
    });
    
    // Test 12: Cannot create pool with same tokens
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
    
    // Test 13: Cannot create pool with dead address
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
