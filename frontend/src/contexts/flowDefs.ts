/**
 * Active Flow types — global lock for two-step (approve → action) transaction flows.
 *
 * At most ONE two-step flow can be active per wallet at a time.
 * Single-step operations (cancel, settle, transfer, roll, batch) are never blocked.
 */

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
    readonly actionType: FlowActionType;
    readonly poolAddress: string;
    readonly optionId: string | null;
    readonly formState: Record<string, string> | null;
}
