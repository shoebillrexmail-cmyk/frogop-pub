import { opnet, OPNetUnit, Assert, Blockchain } from '@btc-vision/unit-test-framework';
import { OptionsPoolTestRuntime } from './runtime/OptionsPoolRuntime.js';
import { OptionsFactoryTestRuntime } from './runtime/OptionsFactoryRuntime.js';
import { Address } from '@btc-vision/transaction';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface GasMeasurement {
    operation: string;
    gasUsed: bigint;
    contract: 'OptionsPool' | 'OptionsFactory';
}

const gasMeasurements: GasMeasurement[] = [];

function formatGas(gas: bigint): string {
    return gas.toLocaleString();
}

await opnet('Gas Baseline Measurement', async (vm: OPNetUnit) => {
    let pool: OptionsPoolTestRuntime;
    let factory: OptionsFactoryTestRuntime;
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
        factory = new OptionsFactoryTestRuntime(deployer);

        Blockchain.register(pool);
        Blockchain.register(factory);
        await pool.init();
        await factory.init();
    });

    vm.afterEach(() => {
        pool.dispose();
        factory.dispose();
        Blockchain.dispose();
    });

    await vm.it('should measure gas: underlying()', async () => {
        const result = await pool.getUnderlying();
        Assert.expect(result).toBeDefined();
        gasMeasurements.push({
            operation: 'underlying()',
            gasUsed: pool.gasUsed,
            contract: 'OptionsPool'
        });
        console.log(`  underlying(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: premiumToken()', async () => {
        const result = await pool.getPremiumToken();
        Assert.expect(result).toBeDefined();
        gasMeasurements.push({
            operation: 'premiumToken()',
            gasUsed: pool.gasUsed,
            contract: 'OptionsPool'
        });
        console.log(`  premiumToken(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: optionCount()', async () => {
        const count = await pool.optionCount();
        Assert.equal(count, 0n);
        gasMeasurements.push({
            operation: 'optionCount()',
            gasUsed: pool.gasUsed,
            contract: 'OptionsPool'
        });
        console.log(`  optionCount(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: gracePeriodBlocks()', async () => {
        const grace = await pool.gracePeriodBlocks();
        Assert.equal(grace, 144n);
        gasMeasurements.push({
            operation: 'gracePeriodBlocks()',
            gasUsed: pool.gasUsed,
            contract: 'OptionsPool'
        });
        console.log(`  gracePeriodBlocks(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: maxExpiryBlocks()', async () => {
        const max = await pool.maxExpiryBlocks();
        Assert.equal(max, 52560n);
        gasMeasurements.push({
            operation: 'maxExpiryBlocks()',
            gasUsed: pool.gasUsed,
            contract: 'OptionsPool'
        });
        console.log(`  maxExpiryBlocks(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: cancelFeeBps()', async () => {
        const fee = await pool.cancelFeeBps();
        Assert.equal(fee, 100n);
        gasMeasurements.push({
            operation: 'cancelFeeBps()',
            gasUsed: pool.gasUsed,
            contract: 'OptionsPool'
        });
        console.log(`  cancelFeeBps(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: calculateCollateral() - CALL', async () => {
        const collateral = await pool.calculateCollateral(0, 1000n, 10n);
        Assert.equal(collateral, 10n);
        gasMeasurements.push({
            operation: 'calculateCollateral(CALL)',
            gasUsed: pool.gasUsed,
            contract: 'OptionsPool'
        });
        console.log(`  calculateCollateral(CALL): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: calculateCollateral() - PUT', async () => {
        const collateral = await pool.calculateCollateral(1, 1000n, 10n);
        Assert.equal(collateral, 10000n);
        gasMeasurements.push({
            operation: 'calculateCollateral(PUT)',
            gasUsed: pool.gasUsed,
            contract: 'OptionsPool'
        });
        console.log(`  calculateCollateral(PUT): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: writeOption() - first option', async () => {
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;

        const optionId = await pool.writeOption(0, 1000n, 1000n, 10n, 50n);
        Assert.equal(optionId, 0n);
        gasMeasurements.push({
            operation: 'writeOption() - first',
            gasUsed: pool.gasUsed,
            contract: 'OptionsPool'
        });
        console.log(`  writeOption() (first): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: writeOption() - subsequent options', async () => {
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;

        await pool.writeOption(0, 1000n, 1000n, 10n, 50n);

        await pool.writeOption(0, 2000n, 2000n, 20n, 100n);
        const secondGas = pool.gasUsed;

        gasMeasurements.push({
            operation: 'writeOption() - subsequent',
            gasUsed: secondGas,
            contract: 'OptionsPool'
        });
        console.log(`  writeOption() (subsequent): ${formatGas(secondGas)} gas`);
    });

    await vm.it('should measure gas: getOption()', async () => {
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;

        await pool.writeOption(0, 1000n, 1000n, 10n, 50n);

        const option = await pool.getOption(0n);
        Assert.equal(option.id, 0n);
        gasMeasurements.push({
            operation: 'getOption()',
            gasUsed: pool.gasUsed,
            contract: 'OptionsPool'
        });
        console.log(`  getOption(): ${formatGas(pool.gasUsed)} gas (9 SHA256 ops)`);
    });

    await vm.it('should measure gas: buyOption()', async () => {
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        await pool.writeOption(0, 1000n, 1000n, 10n, 50n);

        Blockchain.msgSender = buyer;
        Blockchain.txOrigin = buyer;

        const success = await pool.buyOption(0n);
        Assert.equal(success, true);
        gasMeasurements.push({
            operation: 'buyOption()',
            gasUsed: pool.gasUsed,
            contract: 'OptionsPool'
        });
        console.log(`  buyOption(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: cancelOption()', async () => {
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;

        await pool.writeOption(0, 1000n, 1000n, 10n, 50n);

        const success = await pool.cancelOption(0n);
        Assert.equal(success, true);
        gasMeasurements.push({
            operation: 'cancelOption()',
            gasUsed: pool.gasUsed,
            contract: 'OptionsPool'
        });
        console.log(`  cancelOption(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: exercise()', async () => {
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        await pool.writeOption(0, 1000n, 1000n, 10n, 50n);

        Blockchain.msgSender = buyer;
        Blockchain.txOrigin = buyer;
        await pool.buyOption(0n);

        Blockchain.blockNumber = 1001n;

        const success = await pool.exercise(0n);
        Assert.equal(success, true);
        gasMeasurements.push({
            operation: 'exercise()',
            gasUsed: pool.gasUsed,
            contract: 'OptionsPool'
        });
        console.log(`  exercise(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: settle()', async () => {
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        await pool.writeOption(0, 1000n, 1000n, 10n, 50n);

        Blockchain.msgSender = buyer;
        Blockchain.txOrigin = buyer;
        await pool.buyOption(0n);

        Blockchain.blockNumber = 1145n;

        const success = await pool.settle(0n);
        Assert.equal(success, true);
        gasMeasurements.push({
            operation: 'settle()',
            gasUsed: pool.gasUsed,
            contract: 'OptionsPool'
        });
        console.log(`  settle(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: accumulatedFees()', async () => {
        Blockchain.msgSender = writer;
        Blockchain.txOrigin = writer;
        await pool.writeOption(0, 1000n, 1000n, 10n, 50n);
        await pool.cancelOption(0n);

        const fees = await pool.accumulatedFees();
        Assert.expect(fees).toBeGreaterThan(0n);
        gasMeasurements.push({
            operation: 'accumulatedFees()',
            gasUsed: pool.gasUsed,
            contract: 'OptionsPool'
        });
        console.log(`  accumulatedFees(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: Factory - poolCount()', async () => {
        const count = await factory.poolCount();
        Assert.equal(count, 0n);
        gasMeasurements.push({
            operation: 'getPoolCount()',
            gasUsed: factory.gasUsed,
            contract: 'OptionsFactory'
        });
        console.log(`  getPoolCount(): ${formatGas(factory.gasUsed)} gas`);
    });
});

process.on('beforeExit', () => {
    console.log('\n========================================');
    console.log('GAS BASELINE SUMMARY');
    console.log('========================================\n');

    console.log('OptionsPool Methods:');
    console.log('-------------------');
    const poolMeasurements = gasMeasurements.filter(m => m.contract === 'OptionsPool');
    for (const m of poolMeasurements) {
        console.log(`  ${m.operation}: ${formatGas(m.gasUsed)} gas`);
    }

    const poolTotal = poolMeasurements.reduce((sum, m) => sum + m.gasUsed, 0n);
    console.log(`\n  Pool Total: ${formatGas(poolTotal)} gas`);

    console.log('\nOptionsFactory Methods:');
    console.log('----------------------');
    const factoryMeasurements = gasMeasurements.filter(m => m.contract === 'OptionsFactory');
    for (const m of factoryMeasurements) {
        console.log(`  ${m.operation}: ${formatGas(m.gasUsed)} gas`);
    }

    const factoryTotal = factoryMeasurements.reduce((sum, m) => sum + m.gasUsed, 0n);
    console.log(`\n  Factory Total: ${formatGas(factoryTotal)} gas`);

    const baseline = {
        timestamp: new Date().toISOString(),
        contracts: {
            OptionsPool: poolMeasurements.reduce((acc, m) => {
                acc[m.operation] = m.gasUsed.toString();
                return acc;
            }, {} as Record<string, string>),
            OptionsFactory: factoryMeasurements.reduce((acc, m) => {
                acc[m.operation] = m.gasUsed.toString();
                return acc;
            }, {} as Record<string, string>)
        }
    };

    const baselinePath = path.join(__dirname, '../docs/gas-baseline.json');
    fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
    console.log(`\nBaseline saved to: ${baselinePath}`);
});
