import type { RuntimeEvent } from "./types.js";

export class ShadowEventLog {
  private readonly events: RuntimeEvent[] = [];

  constructor(private readonly maxSize: number = 50) {}

  record(kind: string, data?: Record<string, unknown>): void {
    const event: RuntimeEvent = {
      at: new Date().toISOString(),
      kind,
      epoch: Date.now(),
      data,
    };
    this.events.push(event);
    if (this.events.length > this.maxSize) this.events.shift();
  }

  get length(): number {
    return this.events.length;
  }

  recent(count = 10): readonly RuntimeEvent[] {
    return this.events.slice(-count);
  }
}
