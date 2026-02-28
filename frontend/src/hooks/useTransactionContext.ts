import { useContext } from 'react';
import { TransactionContext } from '../contexts/transactionDefs.ts';
import type { TransactionContextValue } from '../contexts/transactionDefs.ts';

export function useTransactionContext(): TransactionContextValue {
    const ctx = useContext(TransactionContext);
    if (!ctx) throw new Error('useTransactionContext must be used within TransactionProvider');
    return ctx;
}
