/**
 * MarketStrategyCards — buy-side outcome cards at the top of the Market tab.
 *
 * Cards for Protective Put and Collar. Clicking a card activates a filter
 * on the options chain below, highlighting relevant options.
 */
import { useState, useMemo, useCallback } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { OutcomeCard } from './OutcomeCard.tsx';
import type { P2PBadge } from './OutcomeCard.tsx';
import { StrategyConfigurator } from './StrategyConfigurator.tsx';
import type { StrategyType, StrategyFilter } from '../utils/strategyMath.ts';
import { calcLiveOutcome, countOpenOptionsForStrategy } from '../utils/strategyMath.ts';
import { OptionType } from '../services/types.ts';
import type { OptionData } from '../services/types.ts';
import { premiumDisplayUnit } from '../config/index.ts';
import { findBestProtectivePut } from '../utils/strategyMath.ts';

interface MarketStrategyCardsProps {
    options: OptionData[];
    spotPrice: number | null;
    underlyingSymbol: string;
    premiumSymbol: string;
    onBuyOption: (option: OptionData, strategyLabel?: string) => void;
    onStrategyFilter: (filter: StrategyFilter | null) => void;
    activeFilter: StrategyFilter | null;
    onScrollToWrite?: () => void;
}

const PROTECTIVE_PUT_BADGE: P2PBadge = {
    type: 'instant',
    tooltip: 'Buys an existing PUT option from another user. Executes immediately.',
};

export function MarketStrategyCards({
    options,
    spotPrice,
    underlyingSymbol,
    premiumSymbol,
    onBuyOption,
    onStrategyFilter,
    activeFilter,
    onScrollToWrite,
}: MarketStrategyCardsProps) {
    const { address } = useWalletConnect();
    const walletHex = address ? address.toString() : null;
    const pUnit = premiumDisplayUnit(premiumSymbol);
    const noPrice = spotPrice === null || spotPrice <= 0;
    const [activeCard, setActiveCard] = useState<StrategyType | null>(null);

    const bestPut = useMemo(
        () => (!noPrice ? findBestProtectivePut(options, spotPrice, walletHex) : null),
        [options, spotPrice, noPrice, walletHex],
    );

    const putLiquidity = useMemo(
        () => (!noPrice ? countOpenOptionsForStrategy(options, 'protective-put', spotPrice, walletHex) : 0),
        [options, spotPrice, noPrice, walletHex],
    );
    const noLiquidity = putLiquidity === 0;

    const protectivePutSummary = useMemo(() => {
        if (noPrice) return undefined;
        const outcome = calcLiveOutcome('protective-put', spotPrice, 0.875, 30, 1, pUnit, underlyingSymbol);
        return outcome?.metrics.find(m => m.label === 'Cost')?.value;
    }, [noPrice, spotPrice, pUnit, underlyingSymbol]);

    const handleCardClick = useCallback((type: StrategyType) => {
        if (activeCard === type) {
            setActiveCard(null);
            onStrategyFilter(null);
            return;
        }
        setActiveCard(type);

        // Set filter for the chain
        if (type === 'protective-put' && spotPrice) {
            onStrategyFilter({
                type: 'protective-put',
                optionType: OptionType.PUT,
                strikeMin: 0,
                strikeMax: spotPrice,
            });
        } else {
            onStrategyFilter(null);
        }
    }, [activeCard, spotPrice, onStrategyFilter]);

    const handleConfigExecute = useCallback(() => {
        // For protective put: find and buy the best matching option
        if (bestPut) {
            onBuyOption(bestPut, 'Protective Put');
        }
        setActiveCard(null);
        onStrategyFilter(null);
    }, [bestPut, onBuyOption, onStrategyFilter]);

    return (
        <div className="space-y-3" data-testid="market-strategy-cards">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <OutcomeCard
                    goalTitle="Protect Against Drops"
                    tagline={`Buy downside protection for your ${underlyingSymbol}`}
                    riskLevel="low"
                    summaryMetric={noLiquidity ? undefined : protectivePutSummary}
                    p2pBadge={noLiquidity ? undefined : PROTECTIVE_PUT_BADGE}
                    disabledMessage={noLiquidity ? 'No options available yet' : undefined}
                    ctaLink={noLiquidity ? {
                        label: 'Want to earn by providing this? Write a Put →',
                        onClick: () => {
                            const el = document.getElementById('create-earn');
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                            onScrollToWrite?.();
                        },
                    } : undefined}
                    active={activeCard === 'protective-put'}
                    disabled={noPrice || noLiquidity}
                    testId="market-protective-put"
                    onClick={() => handleCardClick('protective-put')}
                />
            </div>

            {/* Configurator for Protective Put */}
            {activeCard === 'protective-put' && spotPrice != null && spotPrice > 0 && (
                <StrategyConfigurator
                    strategyType="protective-put"
                    spotPrice={spotPrice}
                    underlyingSymbol={underlyingSymbol}
                    premiumSymbol={premiumSymbol}
                    onExecute={handleConfigExecute}
                    onClose={() => { setActiveCard(null); onStrategyFilter(null); }}
                />
            )}

            {/* Active filter indicator */}
            {activeFilter && (
                <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-cyan-400">Showing options matching strategy</span>
                    <button
                        type="button"
                        onClick={() => { setActiveCard(null); onStrategyFilter(null); }}
                        className="text-terminal-text-muted hover:text-terminal-text-primary underline"
                        data-testid="clear-strategy-filter"
                    >
                        Show all options
                    </button>
                </div>
            )}
        </div>
    );
}
