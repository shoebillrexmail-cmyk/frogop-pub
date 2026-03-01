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
// Active Flow (persisted in localStorage per wallet)
// ---------------------------------------------------------------------------

export interface ActiveFlow {
    readonly flowId: string;
    readonly actionType: FlowActionType;
    readonly poolAddress: string;
    readonly optionId: string | null;
    readonly status: FlowStatus;
    readonly approvalTxId: string | null;
    readonly actionTxId: string | null;
    readonly claimedAt: string; // ISO timestamp
    readonly label: string;
    readonly formState: Record<string, string> | null;
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
}
