import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntentGrid } from '../IntentGrid.tsx';

describe('IntentGrid', () => {
    it('renders 6 intent cards', () => {
        render(<IntentGrid onSelect={vi.fn()} />);
        expect(screen.getByTestId('intent-earn-yield')).toBeInTheDocument();
        expect(screen.getByTestId('intent-protect')).toBeInTheDocument();
        expect(screen.getByTestId('intent-speculate-up')).toBeInTheDocument();
        expect(screen.getByTestId('intent-speculate-down')).toBeInTheDocument();
        expect(screen.getByTestId('intent-earn-both')).toBeInTheDocument();
        expect(screen.getByTestId('intent-power-user')).toBeInTheDocument();
    });

    it('fires onSelect with correct intent ID when clicked', () => {
        const onSelect = vi.fn();
        render(<IntentGrid onSelect={onSelect} />);
        fireEvent.click(screen.getByTestId('intent-earn-yield'));
        expect(onSelect).toHaveBeenCalledWith('earn-yield');
    });

    it('fires onSelect for power-user', () => {
        const onSelect = vi.fn();
        render(<IntentGrid onSelect={onSelect} />);
        fireEvent.click(screen.getByTestId('intent-power-user'));
        expect(onSelect).toHaveBeenCalledWith('power-user');
    });

    it('renders heading text', () => {
        render(<IntentGrid onSelect={vi.fn()} />);
        expect(screen.getByText('What do you want to achieve?')).toBeInTheDocument();
    });
});
