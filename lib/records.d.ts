/** Restart-readable review diagnostics; model input is carried by ordinary Session messages. */
import { type Session } from '@deepseek-ai/dsh-session';
import type { MessageId } from '@deepseek-ai/dsh-llm';
/** One activation's observable status, including unsuccessful and unstarted attempts. */
export type RunStatus = 'running' | 'report' | 'silent' | 'not_relevant' | 'timeout' | 'cancelled' | 'failed' | 'skipped';
/** Metadata-only records can be skipped by readers without this plugin. */
export type RecordData = {
    kind: 'pause';
    paused: boolean;
} | {
    kind: 'claim';
    taskId: string;
    trigger: 'heartbeat' | 'final_response' | 'manual';
    count: number;
} | {
    kind: 'run';
    taskId: string;
    runId: string;
    shadowId: string;
    status: RunStatus;
    childSessionId?: string;
    detail?: string;
};
declare module '@deepseek-ai/dsh-session' {
    interface PluginRecordMap {
        'plugin:shadow-mind/state': RecordData;
    }
}
/**
 * Append metadata without adding model context.
 * @param session - Owner Session outside a session/event publication callback.
 * @param data - JSON review state.
 */
export declare function record(session: Session, data: RecordData): void;
/** Minimal state recovered for the latest admitted human task. */
export interface SavedState {
    taskId: MessageId | undefined;
    paused: boolean;
    completionClaimed: boolean;
    heartbeatRuns: number;
}
/**
 * Recover bounded scheduling counters; unknown metadata never changes model history.
 * @param session - Resumed or current Session.
 * @returns Pause state and counters attributed to the latest human input.
 */
export declare function savedState(session: Session): SavedState;
/**
 * Read recent activation outcomes for a human status command.
 * @param session - Session owning the review records.
 * @returns At most twenty recent metadata summaries; unfinished old runs are interrupted.
 */
export declare function recentRuns(session: Session): string[];
