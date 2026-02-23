import { Blockchain } from '@btc-vision/unit-test-framework';
import { BinaryReader, BinaryWriter, ABICoder } from '@btc-vision/transaction';
const abiCoder = new ABICoder();
const SELECTOR_TRANSFER_FROM = abiCoder.encodeSelector('transferFrom(address,address,uint256)');
const SELECTOR_TRANSFER = abiCoder.encodeSelector('transfer(address,uint256)');
const SELECTOR_BALANCE_OF = abiCoder.encodeSelector('balanceOf(address)');
const SELECTOR_APPROVE = abiCoder.encodeSelector('approve(address,uint256)');
export class MockOP20 {
    address;
    balances = new Map();
    allowances = new Map();
    constructor(address) {
        this.address = address;
    }
    mint(to, amount) {
        const key = to.toString();
        const current = this.balances.get(key) || 0n;
        this.balances.set(key, current + amount);
    }
    balanceOf(owner) {
        return this.balances.get(owner.toString()) || 0n;
    }
    approve(owner, spender, amount) {
        const ownerKey = owner.toString();
        const spenderKey = spender.toString();
        if (!this.allowances.has(ownerKey)) {
            this.allowances.set(ownerKey, new Map());
        }
        this.allowances.get(ownerKey).set(spenderKey, amount);
    }
    handleCall(caller, calldata) {
        const reader = new BinaryReader(calldata);
        const selector = reader.readSelector();
        const writer = new BinaryWriter(32);
        let success = true;
        const selectorHex = Buffer.from(selector).toString('hex');
        if (selectorHex === SELECTOR_TRANSFER_FROM) {
            const from = reader.readAddress();
            const to = reader.readAddress();
            const amount = reader.readU256();
            success = this._transferFrom(caller, from, to, amount);
            writer.writeBoolean(success);
        }
        else if (selectorHex === SELECTOR_TRANSFER) {
            const to = reader.readAddress();
            const amount = reader.readU256();
            success = this._transfer(caller, to, amount);
            writer.writeBoolean(success);
        }
        else if (selectorHex === SELECTOR_BALANCE_OF) {
            const owner = reader.readAddress();
            const balance = this.balanceOf(owner);
            writer.writeU256(balance);
        }
        else if (selectorHex === SELECTOR_APPROVE) {
            const spender = reader.readAddress();
            const amount = reader.readU256();
            this.approve(caller, spender, amount);
            writer.writeBoolean(true);
        }
        else {
            success = false;
        }
        return { success, data: writer.getBuffer() };
    }
    _transfer(from, to, amount) {
        const fromKey = from.toString();
        const toKey = to.toString();
        const fromBalance = this.balances.get(fromKey) || 0n;
        if (fromBalance < amount) {
            return false;
        }
        this.balances.set(fromKey, fromBalance - amount);
        const toBalance = this.balances.get(toKey) || 0n;
        this.balances.set(toKey, toBalance + amount);
        return true;
    }
    _transferFrom(caller, from, to, amount) {
        const fromKey = from.toString();
        const callerKey = caller.toString();
        const allowed = this.allowances.get(fromKey)?.get(callerKey) || 0n;
        if (allowed < amount) {
            return false;
        }
        if (!this._transfer(from, to, amount)) {
            return false;
        }
        this.allowances.get(fromKey).set(callerKey, allowed - amount);
        return true;
    }
}
export class MockTokenManager {
    tokens = new Map();
    originalCall;
    constructor() {
        this.originalCall = Blockchain.call.bind(Blockchain);
    }
    registerToken(token) {
        this.tokens.set(token.address.toString(), token);
    }
    install() {
        const manager = this;
        Blockchain.call = function (address, calldata, revertOnError) {
            const token = manager.tokens.get(address.toString());
            if (token) {
                const result = token.handleCall(Blockchain.msgSender, calldata);
                if (!result.success && revertOnError) {
                    throw new Error('Token call failed');
                }
                return { success: result.success, response: result.data };
            }
            return manager.originalCall(address, calldata, revertOnError);
        };
    }
    restore() {
        Blockchain.call = this.originalCall;
    }
}
export function createMockTokens(writer, buyer, poolAddress, initialBalance = 1000000n) {
    const underlying = new MockOP20(Blockchain.generateRandomAddress());
    const premium = new MockOP20(Blockchain.generateRandomAddress());
    underlying.mint(writer, initialBalance);
    underlying.mint(buyer, initialBalance);
    premium.mint(writer, initialBalance);
    premium.mint(buyer, initialBalance);
    underlying.approve(writer, poolAddress, initialBalance);
    underlying.approve(buyer, poolAddress, initialBalance);
    premium.approve(writer, poolAddress, initialBalance);
    premium.approve(buyer, poolAddress, initialBalance);
    return { underlying, premium };
}
//# sourceMappingURL=MockOP20.js.map