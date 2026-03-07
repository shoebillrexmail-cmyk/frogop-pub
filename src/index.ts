import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { OptionsFactory } from './contracts/OptionsFactory';
import { OptionsPool } from './contracts/OptionsPool';

Blockchain.contract = () => {
    return new OptionsFactory();
};

export { OptionsFactory, OptionsPool };
