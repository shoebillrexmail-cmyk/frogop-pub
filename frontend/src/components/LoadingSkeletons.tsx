/**
 * LoadingSkeletons — structured shimmer placeholders for PoolsPage and PortfolioPage.
 * Each skeleton mirrors the real layout so the page doesn't jump on load.
 */

// ---------------------------------------------------------------------------
// Primitive
// ---------------------------------------------------------------------------

function Sk({ className }: { className: string }) {
    return <div className={`skeleton ${className}`} />;
}

// ---------------------------------------------------------------------------
// Shared sub-skeletons
// ---------------------------------------------------------------------------

function LoadingPill() {
    return (
        <div className="flex items-center gap-1.5 text-xs font-mono text-terminal-text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Fetching chain data…
        </div>
    );
}

/** Skeleton rows that mirror the 7-column options table. */
function TableRowsSkeleton({ rows, showFilter }: { rows: number; showFilter: boolean }) {
    return (
        <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <Sk className="h-5 w-20" />
                {showFilter && (
                    <div className="flex gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Sk key={i} className="h-7 w-14 rounded" />
                        ))}
                    </div>
                )}
            </div>

            <hr className="border-terminal-border-subtle mb-3" />

            {/* Column headers */}
            <div className="flex gap-4 pb-2 border-b border-terminal-border-subtle mb-1">
                <Sk className="h-3 w-5 shrink-0" />
                <Sk className="h-3 w-10 shrink-0" />
                <Sk className="h-3 w-14 shrink-0" />
                <Sk className="h-3 w-14 shrink-0" />
                <Sk className="h-3 w-14 shrink-0" />
                <Sk className="h-3 w-14 shrink-0" />
                <Sk className="h-3 w-12 shrink-0" />
            </div>

            {/* Data rows */}
            {Array.from({ length: rows }).map((_, i) => (
                <div
                    key={i}
                    className="flex items-center gap-4 py-2.5 border-b border-terminal-border-subtle last:border-0"
                    style={{ animationDelay: `${i * 80}ms` }}
                >
                    <Sk className="h-4 w-5 shrink-0" />
                    <Sk className="h-4 w-10 shrink-0" />
                    <Sk className="h-4 w-24 shrink-0" />
                    <Sk className="h-4 w-20 shrink-0" />
                    <Sk className="h-4 w-24 shrink-0" />
                    <Sk className="h-4 w-16 shrink-0" />
                    <Sk className="h-7 w-14 shrink-0 rounded" />
                </div>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Page-level skeletons
// ---------------------------------------------------------------------------

/** Skeleton for PoolsPage: PoolInfoCard + OptionsTable. */
export function PoolsSkeleton() {
    return (
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-4">
            <LoadingPill />

            {/* PoolInfoCard skeleton */}
            <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="space-y-2">
                        <Sk className="h-6 w-44" />
                        <Sk className="h-3.5 w-28" />
                    </div>
                    <Sk className="h-9 w-28 rounded-lg" />
                </div>

                <hr className="border-terminal-border-subtle mb-3" />

                <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Sk key={i} className="h-4 w-28" />
                    ))}
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-2 mt-2">
                    <Sk className="h-3 w-40" />
                    <Sk className="h-3 w-36" />
                </div>
            </div>

            {/* OptionsTable skeleton */}
            <TableRowsSkeleton rows={6} showFilter />
        </div>
    );
}

/** Skeleton for PoolListPage: grid of shimmer cards. */
export function PoolListSkeleton() {
    return (
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-4">
            <LoadingPill />
            <Sk className="h-10 w-full max-w-sm rounded" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div
                        key={i}
                        className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-5 space-y-3"
                        style={{ animationDelay: `${i * 80}ms` }}
                    >
                        <div className="flex items-center justify-between">
                            <Sk className="h-5 w-28" />
                            <Sk className="h-4 w-16 rounded" />
                        </div>
                        <Sk className="h-3.5 w-36" />
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Skeleton for PortfolioPage: BalancesCard + Written section + Purchased section. */
export function PortfolioSkeleton() {
    return (
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
            <LoadingPill />

            {/* BalancesCard skeleton */}
            <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-5">
                <Sk className="h-3.5 w-20 mb-4" />
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <Sk className="h-4 w-12" />
                        <Sk className="h-4 w-24" />
                    </div>
                    <div className="flex justify-between items-center">
                        <Sk className="h-4 w-10" />
                        <Sk className="h-4 w-24" />
                    </div>
                </div>
            </div>

            {/* My Written Options skeleton */}
            <section>
                <Sk className="h-3.5 w-40 mb-3" />
                <TableRowsSkeleton rows={3} showFilter={false} />
            </section>

            {/* My Purchased Options skeleton */}
            <section>
                <Sk className="h-3.5 w-44 mb-3" />
                <TableRowsSkeleton rows={2} showFilter={false} />
            </section>
        </div>
    );
}
