/** Plugin-wide concurrency with cancellation-aware FIFO admission. */
/** Capacity is released only after a review activation reaches quiescence. */
export declare class Slots {
    private readonly limit;
    private occupied;
    private readonly queue;
    constructor(limit: number);
    /**
     * Reserve one slot or wait in FIFO order.
     * @param signal - Cancels queued admission.
     * @param wait - False skips immediately when capacity is full.
     * @returns Release function, or undefined for a skipped non-waiting admission.
     */
    acquire(signal: AbortSignal, wait: boolean): Promise<(() => void) | undefined>;
    private releaseHandle;
}
