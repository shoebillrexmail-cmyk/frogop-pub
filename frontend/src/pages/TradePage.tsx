/**
 * TradePage — intent-first Trade wizard.
 *
 * URL-driven steps:
 *   /trade              → Step 1: Choose Goal (IntentGrid)
 *   /trade?intent=X     → Step 2: Pick Market (MarketPicker)
 *   /trade?intent=X&market=Y → Step 3: Configure (TradeConfigurator)
 *   /trade?intent=power-user  → Redirect to /chain
 *
 * Route: /trade
 */
import { useSearchParams, Navigate } from 'react-router-dom';
import { WizardBreadcrumb } from '../components/WizardBreadcrumb.tsx';
import { IntentGrid } from '../components/IntentGrid.tsx';
import { MarketPicker } from '../components/MarketPicker.tsx';
import { TradeConfigurator } from '../components/TradeConfigurator.tsx';
import { getIntentById } from '../utils/intentDefs.ts';
import type { IntentId } from '../utils/intentDefs.ts';

export function TradePage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const intentParam = searchParams.get('intent');
    const marketParam = searchParams.get('market');

    // Power-user intent redirects to chain page
    if (intentParam === 'power-user') {
        return <Navigate to="/chain" replace />;
    }

    const intent = intentParam ? getIntentById(intentParam) : null;

    // Determine current step
    const currentStep: 1 | 2 | 3 =
        intent && marketParam ? 3 :
        intent ? 2 :
        1;

    function handleStepClick(step: 1 | 2 | 3) {
        if (step === 1) {
            setSearchParams({});
        } else if (step === 2 && intentParam) {
            setSearchParams({ intent: intentParam });
        }
    }

    function handleIntentSelect(intentId: IntentId) {
        if (intentId === 'power-user') {
            // Will be caught by the redirect above on next render
            setSearchParams({ intent: 'power-user' });
            return;
        }
        setSearchParams({ intent: intentId });
    }

    function handleMarketSelect(poolAddress: string) {
        if (intentParam) {
            setSearchParams({ intent: intentParam, market: poolAddress });
        }
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <WizardBreadcrumb currentStep={currentStep} onStepClick={handleStepClick} />

            {currentStep === 1 && (
                <IntentGrid onSelect={handleIntentSelect} />
            )}

            {currentStep === 2 && intent && (
                <MarketPicker
                    intentId={intent.id}
                    onSelect={handleMarketSelect}
                />
            )}

            {currentStep === 3 && intent && marketParam && (
                <TradeConfigurator
                    intentId={intent.id}
                    poolAddress={marketParam}
                />
            )}
        </div>
    );
}
