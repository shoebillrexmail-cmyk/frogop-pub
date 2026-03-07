/**
 * IntentGrid — grid of intent cards for Trade wizard Step 1.
 *
 * Each card represents a user goal. Clicking fires onSelect with the intent ID.
 */
import { getAllIntents } from '../utils/intentDefs.ts';
import type { IntentId } from '../utils/intentDefs.ts';
import { OutcomeCard } from './OutcomeCard.tsx';

interface IntentGridProps {
    onSelect: (intentId: IntentId) => void;
}

export function IntentGrid({ onSelect }: IntentGridProps) {
    const intents = getAllIntents();

    return (
        <div data-testid="intent-grid">
            <h2 className="text-lg font-bold text-terminal-text-primary font-mono mb-2">
                What do you want to achieve?
            </h2>
            <p className="text-xs text-terminal-text-muted font-mono mb-4">
                Pick your goal and we'll guide you to the right strategy.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {intents.map((intent) => (
                    <OutcomeCard
                        key={intent.id}
                        goalTitle={intent.label}
                        tagline={intent.tagline}
                        riskLevel={intent.riskLevel}
                        testId={`intent-${intent.id}`}
                        onClick={() => onSelect(intent.id)}
                    />
                ))}
            </div>
        </div>
    );
}
