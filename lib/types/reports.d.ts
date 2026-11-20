/** Bounded per-parent report aggregation and recent delivered-report history. */
import type { Report } from './report.ts';
export interface DeliveredReport extends Report {
    readonly deliveredAt: string;
}
export declare class ReportBatcher {
    private windowMs;
    private readonly deliver;
    private readonly onError;
    private pending;
    private timer;
    private pendingSince;
    private readonly history;
    constructor(windowMs: number, deliver: (reports: readonly Report[]) => void | Promise<void>, onError?: (error: unknown) => void);
    setWindow(value: number): void;
    get hasPending(): boolean;
    get recent(): readonly DeliveredReport[];
    add(report: Report): void;
    private schedule;
    flush(): Promise<readonly Report[]>;
    clear(): void;
    dispose(): void;
}
export interface WorkerReport {
    readonly content: string;
    readonly refs: readonly number[];
}
export declare function formatReports(reports: readonly DeliveredReport[]): string;
//# sourceMappingURL=reports.d.ts.map