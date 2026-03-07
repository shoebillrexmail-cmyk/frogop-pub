import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

console.log('1. Checking transaction and factory state...');

async function main() {
    const provider = new JSONRpcProvider({ 
        url: 'https://regtest.opnet.org', 
        network: networks.regtest 
    });
    
    // Check the transaction receipt
    const txId = '14e99e8572b570e5285a5f29f46ca7ea3c064c7074e7b1b9a18cdb597bfc18d0';
    console.log('2. Getting transaction receipt for:', txId);
    
    try {
        const receipt = await provider.getTransactionReceipt(txId);
        console.log('Receipt:', receipt);
    } catch (e: unknown) {
        console.log('Error getting receipt:', e instanceof Error ? e.message : e);
    }

    // Check the transaction
    console.log('3. Getting transaction...');
    try {
        const tx = await provider.getTransaction(txId);
        console.log('Transaction type:', (tx as unknown as Record<string, unknown>)?.transactionType);
    } catch (e: unknown) {
        console.log('Error getting transaction:', e instanceof Error ? e.message : e);
    }
    
    // Check factory state
    const factoryAddr = 'opr1sqztwfpj9e538d8yfvh8ez6u9nucu9es7py6r03u5';
    console.log('4. Getting pool template...');
    const result = await provider.call(factoryAddr, '0x8fe49911');
    
    if ('error' in result) {
        console.log('Error:', result.error);
    } else if (result.revert) {
        console.log('Revert:', result.revert);
    } else {
        const template = result.result.readAddress();
        console.log('Pool template:', template.toString());
    }
    
    // Get block number
    const block = await provider.getBlockNumber();
    console.log('Current block:', block);
}

main().catch(console.error);
