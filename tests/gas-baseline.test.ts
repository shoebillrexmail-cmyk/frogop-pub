import { opnet, OPNetUnit, Assert, Blockchain } from '@btc-vision/unit-test-framework';
import { OptionsPoolTestRuntime } from './runtime/OptionsPoolRuntime.js';
import { Address } from '@btc-vision/transaction';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface GasMeasurement {
    operation: string;
    gasUsed: bigint;
}

const gasMeasurements: GasMeasurement[] = [];

function formatGas(gas: bigint): string {
    return gas.toLocaleString();
}

/**
 * Gas Baseline — OptionsPool read-only view methods.
 *
 * Write operations (writeOption, buyOption, cancelOption, exercise, settle)
 * require OP20 token contracts and are measured in integration tests instead.
 * Factory poolCount crashes in WASM unit tests (lazy storage pointer limitation).
 */
await opnet('Gas Baseline Measurement', async (vm: OPNetUnit) => {
    let pool: OptionsPoolTestRuntime;
    let deployer: Address;
    let underlying: Address;
    let premiumToken: Address;

    vm.beforeEach(async () => {
        Blockchain.dispose();
        Blockchain.clearContracts();
        await Blockchain.init();

        deployer = Blockchain.generateRandomAddress();
        underlying = Blockchain.generateRandomAddress();
        premiumToken = Blockchain.generateRandomAddress();

        pool = new OptionsPoolTestRuntime(deployer, underlying, premiumToken);

        Blockchain.register(pool);
        await pool.init();
    });

    vm.afterEach(() => {
        pool.dispose();
        Blockchain.dispose();
    });

    await vm.it('should measure gas: underlying()', async () => {
        const result = await pool.getUnderlying();
        Assert.expect(result).toBeDefined();
        gasMeasurements.push({ operation: 'underlying()', gasUsed: pool.gasUsed });
        console.log(`  underlying(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: premiumToken()', async () => {
        const result = await pool.getPremiumToken();
        Assert.expect(result).toBeDefined();
        gasMeasurements.push({ operation: 'premiumToken()', gasUsed: pool.gasUsed });
        console.log(`  premiumToken(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: optionCount()', async () => {
        const count = await pool.optionCount();
        Assert.equal(count, 0n);
        gasMeasurements.push({ operation: 'optionCount()', gasUsed: pool.gasUsed });
        console.log(`  optionCount(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: gracePeriodBlocks()', async () => {
        const grace = await pool.gracePeriodBlocks();
        Assert.equal(grace, 144n);
        gasMeasurements.push({ operation: 'gracePeriodBlocks()', gasUsed: pool.gasUsed });
        console.log(`  gracePeriodBlocks(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: maxExpiryBlocks()', async () => {
        const max = await pool.maxExpiryBlocks();
        Assert.equal(max, 52560n);
        gasMeasurements.push({ operation: 'maxExpiryBlocks()', gasUsed: pool.gasUsed });
        console.log(`  maxExpiryBlocks(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: cancelFeeBps()', async () => {
        const fee = await pool.cancelFeeBps();
        Assert.equal(fee, 100n);
        gasMeasurements.push({ operation: 'cancelFeeBps()', gasUsed: pool.gasUsed });
        console.log(`  cancelFeeBps(): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: calculateCollateral() - CALL', async () => {
        const collateral = await pool.calculateCollateral(0, 1000n, 10n);
        Assert.equal(collateral, 10n);
        gasMeasurements.push({ operation: 'calculateCollateral(CALL)', gasUsed: pool.gasUsed });
        console.log(`  calculateCollateral(CALL): ${formatGas(pool.gasUsed)} gas`);
    });

    await vm.it('should measure gas: calculateCollateral() - PUT', async () => {
        const collateral = await pool.calculateCollateral(1, 1000n, 10n);
        Assert.equal(collateral, 10000n);
        gasMeasurements.push({ operation: 'calculateCollateral(PUT)', gasUsed: pool.gasUsed });
        console.log(`  calculateCollateral(PUT): ${formatGas(pool.gasUsed)} gas`);
    });
});

process.on('beforeExit', () => {
    console.log('\n========================================');
    console.log('GAS BASELINE SUMMARY');
    console.log('========================================\n');

    console.log('OptionsPool Read-Only Methods:');
    console.log('-----------------------------');
    for (const m of gasMeasurements) {
        console.log(`  ${m.operation}: ${formatGas(m.gasUsed)} gas`);
    }

    const total = gasMeasurements.reduce((sum, m) => sum + m.gasUsed, 0n);
    console.log(`\n  Total: ${formatGas(total)} gas`);

    const baseline = {
        timestamp: new Date().toISOString(),
        contracts: {
            OptionsPool: gasMeasurements.reduce((acc, m) => {
                acc[m.operation] = m.gasUsed.toString();
                return acc;
            }, {} as Record<string, string>),
        }
    };

    const baselinePath = path.join(__dirname, '../internal/research/gas-baseline.json');
    fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
    console.log(`\nBaseline saved to: ${baselinePath}`);
});
