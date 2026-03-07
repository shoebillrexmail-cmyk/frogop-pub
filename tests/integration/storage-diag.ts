import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { getConfig, loadDeployedContracts } from './config.js';

async function main() {
    const config = getConfig();
    const deployed = loadDeployedContracts();
    if (!deployed?.pool) {
        console.error('No pool deployed');
        process.exit(1);
    }

    const provider = new JSONRpcProvider({ url: config.rpcUrl, network: config.network });

    // Get pool hex address
    const poolPk = await provider.getPublicKeyInfo(deployed.pool, true);
    const poolHex = poolPk.toString();
    console.log('Pool hex address:', poolHex);
    console.log('Pool opr1 address:', deployed.pool);

    // Read storage at key pointers
    // ReentrancyGuard: pointer 0 = _locked (statusPointer), pointer 1 = _depth (depthPointer)
    // Pool: pointer 2 = UNDERLYING_POINTER, pointer 3 = PREMIUM_POINTER, etc.
    for (let i = 0; i < 10; i++) {
        try {
            const result = await provider.getStorageAt(poolHex, BigInt(i));
            console.log(`Pointer ${i}: ${result ? result.toString() : 'null/empty'}`);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.log(`Pointer ${i}: ERROR - ${msg}`);
        }
    }
}

main().catch(e => { console.error(e); process.exit(1); });
