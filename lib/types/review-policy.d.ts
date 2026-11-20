/** Apply one activation's capability mask and approval-aware write policy. */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { WorkerReport } from './reports.ts';
export declare const name = "shadow-mind-review-policy";
export declare const inject: string[];
/** Install the preset-wide read-only executor and conservative context guard. */
export declare function apply(ctx: Context): void;
export interface AgentPolicy {
    readonly runId: string;
    readonly shadowId: string;
    readonly shadowName: string;
    readonly mode: 'review' | 'worker';
    readonly allowedTools: readonly string[];
    readonly writeTools: readonly string[];
    readonly reportableRefs: readonly number[];
    readonly capturedThroughSeq: number;
    readonly taskId: string;
    readonly maxReportChars: number;
}
/** Install run-specific policy before DSH announces the child Agent. */
export declare function applyShadowPolicy(agent: Agent, policy: AgentPolicy, acceptReport: (report: WorkerReport) => void): () => void;
//# sourceMappingURL=review-policy.d.ts.map