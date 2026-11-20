/** Session-resident scheduler state that never enters model context. */
import { type Session } from '@deepseek-ai/dsh-session';
import type { MessageId } from '@deepseek-ai/dsh-llm';
import type { Trigger } from './definitions.ts';
export type RunStatus = 'running' | 'report' | 'silent' | 'not_relevant' | 'timeout' | 'cancelled' | 'failed' | 'skipped';
export type RecordData = {
    readonly kind: 'pause';
    readonly paused: boolean;
} | {
    readonly kind: 'claim';
    readonly taskId: string;
    readonly trigger: Trigger | 'manual';
    readonly ids: readonly string[];
    readonly finalCheck?: boolean;
} | {
    readonly kind: 'final-round';
    readonly taskId: string;
    readonly ids: readonly string[];
} | {
    readonly kind: 'scheduler';
    readonly taskId: string;
    readonly trigger: Trigger | 'manual';
    readonly candidates: readonly unknown[];
    readonly modelFiltered: readonly string[];
    readonly runningExcluded: readonly string[];
    readonly toolFiltered?: readonly string[];
    readonly roundFiltered?: readonly string[];
    readonly heartbeatRoll?: number;
} | {
    readonly kind: 'run';
    readonly taskId: string;
    readonly runId: string;
    readonly shadowId: string;
    readonly trigger: Trigger | 'manual';
    readonly mode: 'review' | 'worker';
    readonly status: RunStatus;
    readonly childSessionId?: string;
    readonly detail?: string;
};
declare module '@deepseek-ai/dsh-session' {
    interface PluginRecordMap {
        'plugin:shadow-mind/state': RecordData;
    }
}
export declare function record(session: Session, data: RecordData): void;
export interface SavedState {
    taskId: MessageId | undefined;
    paused: boolean;
    heartbeatRuns: number;
    completionClaimed: boolean;
    readonly finalRounds: Map<string, number>;
}
export declare function savedState(session: Session): SavedState;
export declare function recentRuns(session: Session): string[];
/** Count all plugin state records while keeping the payload sent to Client bounded. */
export declare function eventCount(session: Session): number;
export interface EventHistory {
    readonly count: number;
    readonly recent: Array<{
        readonly seq: number;
        readonly at: string;
        readonly kind: string;
        readonly data?: string;
    }>;
}
/** Count all state records while retaining only a bounded recent window. */
export declare function eventHistory(session: Session, limit?: number): EventHistory;
//# sourceMappingURL=records.d.ts.map