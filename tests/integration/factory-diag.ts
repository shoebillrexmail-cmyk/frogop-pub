import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { BinaryWriter } from '@btc-vision/transaction';
import { getConfig, loadDeployedContracts, computeSelectorU32, FACTORY_SELECTORS } from './config.js';

async function main() {
    const config = getConfig();
    const deployed = loadDeployedContracts();
    if (!deployed) { console.error('No deployed contracts'); process.exit(1); }

    const provider = new JSONRpcProvider({ url: config.rpcUrl, network: config.network });
    const block = await provider.getBlockNumber();
    console.log('Block:', block.toString());

    // Get all addresses as hex
    const factoryHex = (await provider.getPublicKeyInfo(deployed.factory, true)).toString();
    const templateHex = (await provider.getPublicKeyInfo(deployed.poolTemplate, true)).toString();
    console.log('Factory hex:', factoryHex);
    console.log('Template hex:', templateHex);

    // Check if template contract exists
    try {
        const code = await provider.getCode(templateHex);
        if (code) {
            const bytecode = (code as any).bytecode;
            console.log('Template bytecode length:', bytecode ? bytecode.length : 'none');
        } else {
            console.log('Template: no code (not mined yet?)');
        }
    } catch(e) {
        console.log('Template getCode error:', (e as Error).message);
    }

    // Check factory pool template
    const templateResult = await provider.call(deployed.factory, FACTORY_SELECTORS.getPoolTemplate);
    if (!('error' in templateResult) && !templateResult.revert) {
        console.log('Factory pool template:', templateResult.result.readAddress().toString());
    } else {
        console.log('Factory getPoolTemplate error:', 'error' in templateResult ? templateResult.error : templateResult.revert);
    }

    // Simulate setPoolTemplate
    const setTemplateSel = computeSelectorU32('setPoolTemplate(address)');
    const { Address } = await import('@btc-vision/transaction');
    const templateAddr = Address.fromString(templateHex);
    const bw = new BinaryWriter();
    bw.writeU32(setTemplateSel);
    bw.writeAddress(templateAddr);
    const cd = Buffer.from(bw.getBuffer()).toString('hex');
    console.log('Simulating setPoolTemplate...');
    const walletHex = (await provider.getPublicKeyInfo(config.wallet.p2tr, true)).toString();
    const simResult = await provider.call(deployed.factory, cd, Address.fromString(walletHex));
    if ('error' in simResult) {
        console.log('setPoolTemplate simulation Error:', simResult.error);
    } else if (simResult.revert) {
        const raw = Buffer.from(simResult.revert, 'base64');
        console.log('setPoolTemplate simulation Revert:', raw.toString('utf8').replace(/[^\x20-\x7e]/g, '.'));
    } else {
        console.log('setPoolTemplate simulation OK!');
    }
}

main().catch(e => { console.error(e); process.exit(1); });
