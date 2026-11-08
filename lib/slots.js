/** Plugin-wide concurrency with cancellation-aware FIFO admission. */
/** Capacity is released only after a review activation reaches quiescence. */
export class Slots {
    limit;
    occupied = 0;
    queue = [];
    constructor(limit) {
        this.limit = limit;
    }
    /**
     * Reserve one slot or wait in FIFO order.
     * @param signal - Cancels queued admission.
     * @param wait - False skips immediately when capacity is full.
     * @returns Release function, or undefined for a skipped non-waiting admission.
     */
    async acquire(signal, wait) {
        signal.throwIfAborted();
        if (this.occupied < this.limit) {
            this.occupied += 1;
            return this.releaseHandle();
        }
        if (!wait)
            return undefined;
        return new Promise((accept, reject) => {
            const waiter = { signal, accept, reject, abort: () => {
                    const index = this.queue.indexOf(waiter);
                    if (index >= 0)
                        this.queue.splice(index, 1);
                    reject(signal.reason);
                } };
            signal.addEventListener('abort', waiter.abort, { once: true });
            this.queue.push(waiter);
        });
    }
    releaseHandle() {
        let released = false;
        return () => {
            if (released)
                return;
            released = true;
            const next = this.queue.shift();
            if (next === undefined)
                this.occupied -= 1;
            else {
                next.signal.removeEventListener('abort', next.abort);
                next.accept(this.releaseHandle());
            }
        };
    }
}
