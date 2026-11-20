/** Plugin-wide concurrency with cancellation-aware FIFO admission. */
/** Capacity is released only after a review activation reaches quiescence. */
export declare class Slots {
    private limit;
    private occupied;
    private readonly queue;
    constructor(limit: number);
    /** Apply a live settings update to future admissions. */
    setLimit(limit: number): void;
    /**
     * Reserve one slot or wait in FIFO order.
     * @param signal - Cancels queued admission.
     * @param wait - False skips immediately when capacity is full.
     * @returns Release function, or undefined for a skipped non-waiting admission.
     */
    acquire(signal: AbortSignal, wait: boolean): Promise<(() => void) | undefined>;
    private releaseHandle;
    private pump;
}
//# sourceMappingURL=slots.d.ts.map