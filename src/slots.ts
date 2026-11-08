/** Plugin-wide concurrency with cancellation-aware FIFO admission. */

interface Waiter {
  signal: AbortSignal
  accept: (release: () => void) => void
  reject: (reason: unknown) => void
  abort: () => void
}

/** Capacity is released only after a review activation reaches quiescence. */
export class Slots {
  private occupied = 0
  private readonly queue: Waiter[] = []

  constructor(private readonly limit: number) {}

  /**
   * Reserve one slot or wait in FIFO order.
   * @param signal - Cancels queued admission.
   * @param wait - False skips immediately when capacity is full.
   * @returns Release function, or undefined for a skipped non-waiting admission.
   */
  async acquire(signal: AbortSignal, wait: boolean): Promise<(() => void) | undefined> {
    signal.throwIfAborted()
    if (this.occupied < this.limit) {
      this.occupied += 1
      return this.releaseHandle()
    }
    if (!wait) return undefined
    return new Promise((accept, reject) => {
      const waiter: Waiter = { signal, accept, reject, abort: () => {
        const index = this.queue.indexOf(waiter)
        if (index >= 0) this.queue.splice(index, 1)
        reject(signal.reason)
      } }
      signal.addEventListener('abort', waiter.abort, { once: true })
      this.queue.push(waiter)
    })
  }

  private releaseHandle(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      const next = this.queue.shift()
      if (next === undefined) this.occupied -= 1
      else {
        next.signal.removeEventListener('abort', next.abort)
        next.accept(this.releaseHandle())
      }
    }
  }
}
