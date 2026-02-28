import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { Address, BinaryWriter } from '@btc-vision/transaction';
import {
    getConfig,
    loadDeployedContracts,
    computeSelector,
    TOKEN_SELECTORS,
} from './config.js';

async function main() {
    const config = getConfig();
    const deployed = loadDeployedContracts();
    if (!deployed) { console.error('No deployed contracts found'); process.exit(1); }
    const provider = new JSONRpcProvider({ url: config.rpcUrl, network: config.network });
    const poolPk = await provider.getPublicKeyInfo(deployed.pool!, true);
    const poolHex = poolPk.toString();
    const walletHex = config.wallet.address.toString();

    console.log('Pool:', poolHex);
    console.log('Wallet:', walletHex);
    console.log('MOTO:', deployed.tokens.frogU);
    console.log('Block:', (await provider.getBlockNumber()).toString());

    // Pool MOTO balance
    const bw = new BinaryWriter();
    bw.writeAddress(Address.fromString(poolHex));
    const cd = Buffer.from(bw.getBuffer()).toString('hex');
    const r = await provider.call(deployed.tokens.frogU, TOKEN_SELECTORS.balanceOf + cd);
    if (!('error' in r) && !r.revert) console.log('Pool MOTO balance:', r.result.readU256().toString());
    else console.log('Pool MOTO balance: ERROR');

    // View methods (should all work)
    console.log('\n--- View methods ---');
    const ocSel = computeSelector('optionCount()');
    const ocr = await provider.call(poolHex, ocSel);
    if (!('error' in ocr) && !ocr.revert) console.log('optionCount:', ocr.result.readU256().toString());

    const fSel = computeSelector('accumulatedFees()');
    const fr = await provider.call(poolHex, fSel);
    if (!('error' in fr) && !fr.revert) console.log('accumulatedFees:', fr.result.readU256().toString());

    // Simulate writeOption (another write method) to see if ALL writes fail
    console.log('\n--- Write method simulations ---');
    const writeSel = computeSelector('writeOption(uint8,uint256,uint64,uint256,uint256)');
    const ww = new BinaryWriter();
    ww.writeU8(0); // CALL
    ww.writeU256(50n * 10n ** 18n); // strike
    ww.writeU64(99999n); // expiry
    ww.writeU256(1n * 10n ** 18n); // amount
    ww.writeU256(5n * 10n ** 18n); // premium
    const wcd = Buffer.from(ww.getBuffer()).toString('hex');
    console.log('Simulating writeOption...');
    const wr = await provider.call(poolHex, writeSel + wcd, config.wallet.address);
    if ('error' in wr) console.log('writeOption Error:', wr.error);
    else if (wr.revert) {
        const raw = Buffer.from(wr.revert, 'base64');
        console.log('writeOption Revert:', Array.from(raw).map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : '.').join(''));
    } else console.log('writeOption OK!');

    // Simulate cancelOption(1) with from
    console.log('\nSimulating cancelOption(1) with from...');
    const cancelSel = computeSelector('cancelOption(uint256)');
    const cw = new BinaryWriter();
    cw.writeU256(1n);
    const ccd = Buffer.from(cw.getBuffer()).toString('hex');
    const cr = await provider.call(poolHex, cancelSel + ccd, config.wallet.address);
    if ('error' in cr) console.log('cancelOption Error:', cr.error);
    else if (cr.revert) {
        const raw = Buffer.from(cr.revert, 'base64');
        console.log('cancelOption Revert:', Array.from(raw).map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : '.').join(''));
    } else console.log('cancelOption OK!');

    // Simulate buyOption(1) (should fail "Writer cannot buy own option")
    console.log('\nSimulating buyOption(1) with from...');
    const buySel = computeSelector('buyOption(uint256)');
    const bw2 = new BinaryWriter();
    bw2.writeU256(1n);
    const bcd = Buffer.from(bw2.getBuffer()).toString('hex');
    const br = await provider.call(poolHex, buySel + bcd, config.wallet.address);
    if ('error' in br) console.log('buyOption Error:', br.error);
    else if (br.revert) {
        const raw = Buffer.from(br.revert, 'base64');
        console.log('buyOption Revert:', Array.from(raw).map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : '.').join(''));
    } else console.log('buyOption OK!');
}

main().catch(e => { console.error(e); process.exit(1); });
