/**
 * Active Flow types — per-identity lock for two-step (approve → action) transaction flows.
 *
 * Multiple two-step flows can be active in parallel (up to MAX_PARALLEL_FLOWS),
 * as long as each has a unique identity (actionType + poolAddress + optionId).
 * Single-step operations (cancel, settle, transfer, roll, batch) are never blocked.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum concurrent two-step flows per wallet.
 * Rationale: OPNet enforces a 25-descendant mempool chain limit. Each two-step
 * flow uses up to 2 unconfirmed TXs, so 5 flows = 10 TXs — safely under the limit.
 */
export const MAX_PARALLEL_FLOWS = 5;

// ---------------------------------------------------------------------------
// Flow action types (only two-step flows)
// ---------------------------------------------------------------------------

export type FlowActionType = 'writeOption' | 'buyOption' | 'exercise';

// ---------------------------------------------------------------------------
// Flow status lifecycle
// ---------------------------------------------------------------------------

export type FlowStatus =
    | 'approval_pending'
    | 'approval_confirmed'
    | 'action_pending'
    | 'action_confirmed'
    | 'approval_failed'
    | 'action_failed';

// ---------------------------------------------------------------------------
// Flow identity — unique key for a specific flow
// ---------------------------------------------------------------------------

/** Generates a stable identity key for a flow based on its action + target. */
export function flowIdentityKey(
    actionType: FlowActionType,
    poolAddress: string,
    optionId?: string | null,
): string {
    return `${actionType}:${poolAddress}:${optionId ?? 'none'}`;
}

// ---------------------------------------------------------------------------
// Stored Flow — persisted in localStorage (no status; status is derived)
// ---------------------------------------------------------------------------

export interface StoredFlow {
    readonly flowId: string;
    readonly actionType: FlowActionType;
    readonly poolAddress: string;
    readonly optionId: string | null;
    readonly approvalTxId: string | null;
    readonly actionTxId: string | null;
    readonly claimedAt: string; // ISO timestamp
    readonly label: string;
    readonly formState: Record<string, string> | null;
    readonly strategyLabel: string | null;
}

// ---------------------------------------------------------------------------
// Active Flow — StoredFlow + derived status (read-time only, never persisted)
// ---------------------------------------------------------------------------

export interface ActiveFlow extends StoredFlow {
    readonly status: FlowStatus;
}

// ---------------------------------------------------------------------------
// Derive flow status from tracked transactions (pure function)
// ---------------------------------------------------------------------------

/** Minimal TX shape needed for status derivation — avoids circular import. */
interface TxStatusRecord {
    readonly txId: string;
    readonly status: 'broadcast' | 'pending' | 'confirmed' | 'failed';
}

/**
 * Derive flow status from tracked transactions — pure function, no side effects.
 *
 * Priority: action TX status > approval TX status > default (approval_pending).
 */
export function deriveFlowStatus(flow: StoredFlow, transactions: readonly TxStatusRecord[]): FlowStatus {
    // Action TX takes priority over approval TX
    if (flow.actionTxId) {
        const actionTx = transactions.find((tx) => tx.txId === flow.actionTxId);
        if (!actionTx || actionTx.status === 'broadcast' || actionTx.status === 'pending') return 'action_pending';
        if (actionTx.status === 'confirmed') return 'action_confirmed';
        if (actionTx.status === 'failed') return 'action_failed';
    }
    if (flow.approvalTxId) {
        const approvalTx = transactions.find((tx) => tx.txId === flow.approvalTxId);
        if (!approvalTx || approvalTx.status === 'broadcast' || approvalTx.status === 'pending') return 'approval_pending';
        if (approvalTx.status === 'confirmed') return 'approval_confirmed';
        if (approvalTx.status === 'failed') return 'approval_failed';
    }
    return 'approval_pending';
}

// ---------------------------------------------------------------------------
// Resume request — signals a page to open the correct modal
// ---------------------------------------------------------------------------

export interface ResumeRequest {
    readonly flowId: string;
    readonly actionType: FlowActionType;
    readonly poolAddress: string;
    readonly optionId: string | null;
    readonly formState: Record<string, string> | null;
    readonly strategyLabel: string | null;
}
