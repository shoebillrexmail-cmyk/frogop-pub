/**
 * SpreadRouter - Stateless orchestrator for atomic multi-leg option strategies
 *
 * Executes multi-leg strategies atomically via cross-contract calls:
 * - executeSpread: write one option + buy another (bull call spread, bear put spread)
 * - executeDualWrite: write two options (collar, straddle, strangle)
 *
 * Key insight: Blockchain.tx.sender is the wallet, not the router.
 * Pool's _transferFrom() uses the wallet's balance directly.
 * All legs succeed or all revert (atomic via stopOnFailure=true).
 */

import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    Revert,
    OP_NET,
    encodeSelector,
} from '@btc-vision/btc-runtime/runtime';

// =============================================================================
// CONTRACT
// =============================================================================

@final
export class SpreadRouter extends OP_NET {

    // -------------------------------------------------------------------------
    // EXECUTE SPREAD — Write + Buy atomic
    // -------------------------------------------------------------------------

    /**
     * Execute a spread strategy: write a new option + buy an existing one.
     *
     * Params:
     *   pool: target pool contract address
     *   writeOptionType: CALL(0) or PUT(1)
     *   writeStrikePrice: strike price for the written option
     *   writeExpiryBlock: expiry block for the written option
     *   writeUnderlyingAmount: underlying amount for the written option
     *   writePremium: premium for the written option
     *   buyOptionId: ID of the existing option to buy
     *
     * Returns: newOptionId (from the write leg)
     */
    @method(
        { name: 'pool', type: ABIDataTypes.ADDRESS },
        { name: 'writeOptionType', type: ABIDataTypes.UINT8 },
        { name: 'writeStrikePrice', type: ABIDataTypes.UINT256 },
        { name: 'writeExpiryBlock', type: ABIDataTypes.UINT64 },
        { name: 'writeUnderlyingAmount', type: ABIDataTypes.UINT256 },
        { name: 'writePremium', type: ABIDataTypes.UINT256 },
        { name: 'buyOptionId', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'newOptionId', type: ABIDataTypes.UINT256 })
    public executeSpread(calldata: Calldata): BytesWriter {
        const pool = calldata.readAddress();
        const writeOptionType = calldata.readU8();
        const writeStrikePrice = calldata.readU256();
        const writeExpiryBlock = calldata.readU64();
        const writeUnderlyingAmount = calldata.readU256();
        const writePremium = calldata.readU256();
        const buyOptionId = calldata.readU256();

        if (pool.equals(Address.zero())) {
            throw new Revert('Invalid pool address');
        }

        // MED-6: Validate buyOptionId is not zero
        if (buyOptionId.isZero()) {
            throw new Revert('Invalid buy option ID');
        }

        // Leg 1: Write option
        const writeCalldata = new BytesWriter(140);
        writeCalldata.writeSelector(encodeSelector('writeOption(uint8,uint256,uint64,uint256,uint256)'));
        writeCalldata.writeU8(writeOptionType);
        writeCalldata.writeU256(writeStrikePrice);
        writeCalldata.writeU64(writeExpiryBlock);
        writeCalldata.writeU256(writeUnderlyingAmount);
        writeCalldata.writeU256(writePremium);

        const writeResult = Blockchain.call(pool, writeCalldata, true);
        if (!writeResult.success) {
            throw new Revert('Write leg failed');
        }

        // Parse newOptionId from write result
        const newOptionId = writeResult.data.readU256();

        // Leg 2: Buy option
        const buyCalldata = new BytesWriter(36);
        buyCalldata.writeSelector(encodeSelector('buyOption(uint256)'));
        buyCalldata.writeU256(buyOptionId);

        const buyResult = Blockchain.call(pool, buyCalldata, true);
        if (!buyResult.success) {
            throw new Revert('Buy leg failed');
        }

        const result = new BytesWriter(32);
        result.writeU256(newOptionId);
        return result;
    }

    // -------------------------------------------------------------------------
    // EXECUTE DUAL WRITE — Two writes atomic (collar, straddle)
    // -------------------------------------------------------------------------

    /**
     * Execute a dual-write strategy: write two options atomically.
     *
     * Params:
     *   pool: target pool contract address
     *   type1, strike1, expiry1, amount1, premium1: first option params
     *   type2, strike2, expiry2, amount2, premium2: second option params
     *
     * Returns: newOptionId1 (first write)
     */
    @method(
        { name: 'pool', type: ABIDataTypes.ADDRESS },
        { name: 'type1', type: ABIDataTypes.UINT8 },
        { name: 'strike1', type: ABIDataTypes.UINT256 },
        { name: 'expiry1', type: ABIDataTypes.UINT64 },
        { name: 'amount1', type: ABIDataTypes.UINT256 },
        { name: 'premium1', type: ABIDataTypes.UINT256 },
        { name: 'type2', type: ABIDataTypes.UINT8 },
        { name: 'strike2', type: ABIDataTypes.UINT256 },
        { name: 'expiry2', type: ABIDataTypes.UINT64 },
        { name: 'amount2', type: ABIDataTypes.UINT256 },
        { name: 'premium2', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'optionId1', type: ABIDataTypes.UINT256 })
    public executeDualWrite(calldata: Calldata): BytesWriter {
        const pool = calldata.readAddress();

        // Read leg 1 params
        const type1 = calldata.readU8();
        const strike1 = calldata.readU256();
        const expiry1 = calldata.readU64();
        const amount1 = calldata.readU256();
        const premium1 = calldata.readU256();

        // Read leg 2 params
        const type2 = calldata.readU8();
        const strike2 = calldata.readU256();
        const expiry2 = calldata.readU64();
        const amount2 = calldata.readU256();
        const premium2 = calldata.readU256();

        if (pool.equals(Address.zero())) {
            throw new Revert('Invalid pool address');
        }

        // Leg 1: Write first option
        const write1Calldata = new BytesWriter(140);
        write1Calldata.writeSelector(encodeSelector('writeOption(uint8,uint256,uint64,uint256,uint256)'));
        write1Calldata.writeU8(type1);
        write1Calldata.writeU256(strike1);
        write1Calldata.writeU64(expiry1);
        write1Calldata.writeU256(amount1);
        write1Calldata.writeU256(premium1);

        const result1 = Blockchain.call(pool, write1Calldata, true);
        if (!result1.success) {
            throw new Revert('Write leg 1 failed');
        }

        const optionId1 = result1.data.readU256();

        // Leg 2: Write second option
        const write2Calldata = new BytesWriter(140);
        write2Calldata.writeSelector(encodeSelector('writeOption(uint8,uint256,uint64,uint256,uint256)'));
        write2Calldata.writeU8(type2);
        write2Calldata.writeU256(strike2);
        write2Calldata.writeU64(expiry2);
        write2Calldata.writeU256(amount2);
        write2Calldata.writeU256(premium2);

        const result2 = Blockchain.call(pool, write2Calldata, true);
        if (!result2.success) {
            throw new Revert('Write leg 2 failed');
        }

        const result = new BytesWriter(32);
        result.writeU256(optionId1);
        return result;
    }
}
