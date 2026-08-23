import type { ShadowReport } from "./types.js";

export type { ShadowReport } from "./types.js";

/**
 * Coalesce shadow reports inside a configurable window so one turn's reports
 * reach the main agent as a single wakeup instead of one per shadow.
 */
export class ReportBatcher {
  private reports: ShadowReport[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private deliveries = 0;

  constructor(private windowMs: number, private readonly deliver: (reports: ShadowReport[]) => void | Promise<void>) {}

  setWindow(windowMs: number): void {
    this.windowMs = windowMs;
  }

  add(report: ShadowReport): void {
    this.reports.push(report);
    if (this.timer) return;
    this.timer = setTimeout(() => void this.flush(), this.windowMs);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.reports.length) return;
    const batch = this.reports;
    this.reports = [];
    this.deliveries += 1;
    try {
      await this.deliver(batch);
    } finally {
      this.deliveries -= 1;
    }
  }

  /** Whether a flush is pending or in flight; teardown waits on `false`. */
  get hasPending(): boolean {
    return this.reports.length > 0 || this.timer !== undefined || this.deliveries > 0;
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.reports = [];
  }
}

/** Render one batch as the multi-report body delivered to the main agent. */
export function formatReportBatch(reports: readonly ShadowReport[]): string {
  return reports.map((report) => `[${report.shadowName} / ${report.shadowId}]\n${report.content}`).join("\n\n");
}
