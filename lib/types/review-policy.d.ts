/** Apply one activation's capability mask and approval-aware write policy. */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { WorkerReport } from './reports.ts';
export declare const name = "shadow-mind-review-policy";
export declare const inject: string[];
/** Install the preset-wide read-only executor and conservative context guard. */
export declare function apply(ctx: Context): void;
/** Capability and evidence limits applied to one Shadow child session. */
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
/** Install run-specific policy before DSH announces the child Agent.
 * @param agent - Child Agent receiving the capability mask.
 * @param policy - Run-specific capabilities and evidence bounds.
 * @param acceptReport - Callback for an accepted worker report.
 * @returns Cleanup function that removes the child policy and report tool.
 */
export declare function applyShadowPolicy(agent: Agent, policy: AgentPolicy, acceptReport: (report: WorkerReport) => void): () => void;
//# sourceMappingURL=review-policy.d.ts.map