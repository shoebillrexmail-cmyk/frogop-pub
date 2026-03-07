import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';
import { OptionsPoolBtcUnderlying } from './btc-underlying';

Blockchain.contract = () => {
    return new OptionsPoolBtcUnderlying();
};

export * from '@btc-vision/btc-runtime/runtime/exports';

export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}

export { OptionsPoolBtcUnderlying };
