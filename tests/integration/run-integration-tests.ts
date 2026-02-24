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
        { name: 'Run lifecycle tests', cmd: 'npx tsx tests/integration/03-option-lifecycle.ts' },
    ];
    
    for (const step of steps) {
        log.info(`\n=== Step: ${step.name} ===`);
        try {
            execSync(step.cmd, { stdio: 'inherit', cwd: process.cwd() });
            log.success(`✓ ${step.name} completed`);
        } catch (error) {
            log.error(`✗ ${step.name} failed`);
            process.exit(1);
        }
    }
    
    log.success('\n=== All integration tests passed! ===');
}

main().catch((error) => {
    log.error('Integration test runner failed:', error);
    process.exit(1);
});
