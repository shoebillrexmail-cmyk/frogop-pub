import 'dotenv/config';
import { getLogger } from './config.js';

const log = getLogger('run-integration-tests');

async function main() {
    log.info('=== FroGop Integration Test Runner ===\n');

    const { execSync } = await import('child_process');

    const steps = [
        { name: 'Build contracts', cmd: 'npm run build' },
        { name: 'Deploy tokens', cmd: 'npx tsx tests/integration/01-deploy-tokens.ts' },
        { name: 'Deploy factory', cmd: 'npx tsx tests/integration/02-deploy-factory.ts' },
        { name: 'Verification tests', cmd: 'npx tsx tests/integration/03-option-lifecycle.ts' },
        { name: 'Factory state tests', cmd: 'npx tsx tests/integration/04-option-operations.ts' },
        { name: 'Pool creation & view tests', cmd: 'npx tsx tests/integration/05-pool-creation.ts' },
        { name: 'Pool state + fee config', cmd: 'npx tsx tests/integration/06a-pool-state.ts' },
        { name: 'Write & cancel CALL', cmd: 'npx tsx tests/integration/06b-write-cancel-call.ts' },
        { name: 'Buy & exercise CALL', cmd: 'npx tsx tests/integration/06c-buy-exercise-call.ts' },
        { name: 'Settle prep', cmd: 'npx tsx tests/integration/06d-settle-prep.ts' },
        { name: 'Expired cancel (Story 8.3)', cmd: 'npx tsx tests/integration/06e-expired-cancel.ts' },
        { name: 'PUT write & cancel', cmd: 'npx tsx tests/integration/06f-put-write-cancel.ts' },
        { name: 'Query method tests', cmd: 'npx tsx tests/integration/07-query-methods.ts' },
        { name: 'Option transfer tests', cmd: 'npx tsx tests/integration/08-option-transfer.ts' },
        { name: 'Batch operation tests', cmd: 'npx tsx tests/integration/09-batch-operations.ts' },
        { name: 'Roll option tests', cmd: 'npx tsx tests/integration/10-roll-option.ts' },
    ];

    const results: { name: string; passed: boolean }[] = [];

    for (const step of steps) {
        log.info(`\n=== Step: ${step.name} ===`);
        try {
            execSync(step.cmd, { stdio: 'inherit', cwd: process.cwd() });
            log.success(`${step.name} completed`);
            results.push({ name: step.name, passed: true });
        } catch {
            log.error(`${step.name} failed`);
            results.push({ name: step.name, passed: false });
            // Continue with remaining tests instead of exiting
        }
    }

    log.info('\n=== Final Summary ===');
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    log.info(`Steps: ${results.length} total, ${passed} passed, ${failed} failed`);

    results.forEach((r) => {
        if (r.passed) {
            log.success(`  ${r.name}`);
        } else {
            log.error(`  ${r.name}`);
        }
    });

    if (failed > 0) {
        log.error(`\n${failed} step(s) failed.`);
        process.exit(1);
    }

    log.success('\n=== All integration tests passed! ===');
}

main().catch((error) => {
    log.error('Integration test runner failed:', error);
    process.exit(1);
});
