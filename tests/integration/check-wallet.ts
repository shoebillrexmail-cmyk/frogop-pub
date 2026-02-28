import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { getConfig } from './config.js';

async function main() {
    const config = getConfig();
    console.log('Network:', process.env.OPNET_NETWORK);
    console.log('RPC URL:', config.rpcUrl);
    console.log('Wallet P2TR:', config.wallet.p2tr);
    console.log('Wallet address hex:', config.wallet.address.toString());

    const provider = new JSONRpcProvider({ url: config.rpcUrl, network: config.network });

    const blockNumber = await provider.getBlockNumber();
    console.log('Current block:', blockNumber.toString());

    const balance = await provider.getBalance(config.wallet.p2tr);
    console.log('Wallet BTC balance (sats):', balance.toString());

    const utxos = await provider.utxoManager.getUTXOs({ address: config.wallet.p2tr });
    console.log('UTXO count:', Array.isArray(utxos) ? utxos.length : 'error');
    if (Array.isArray(utxos) && utxos.length > 0) {
        let total = 0n;
        for (const u of utxos) {
            console.log(`  UTXO: ${u.value} sats (tx: ${u.transactionId?.slice(0, 16)}...)`);
            total += BigInt(u.value);
        }
        console.log('Total UTXO value:', total.toString(), 'sats');
    }
}

main().catch(e => { console.error(e); process.exit(1); });
