/** Restart-readable review diagnostics; model input is carried by ordinary Session messages. */
import { appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session';
/**
 * Append metadata without adding model context.
 * @param session - Owner Session outside a session/event publication callback.
 * @param data - JSON review state.
 */
export function record(session, data) {
    appendPluginRecord(session, 'plugin:shadow-mind/state', data);
}
/**
 * Recover bounded scheduling counters; unknown metadata never changes model history.
 * @param session - Resumed or current Session.
 * @returns Pause state and counters attributed to the latest human input.
 */
export function savedState(session) {
    const state = { taskId: undefined, paused: false, completionClaimed: false, heartbeatRuns: 0 };
    for (const event of session.snapshotEvents()) {
        if (event.type === 'user/message' && event.data.source.kind === 'user') {
            state.taskId = event.data.id;
            state.completionClaimed = false;
            state.heartbeatRuns = 0;
        }
        const item = pluginRecordOf(event);
        if (item?.type !== 'plugin:shadow-mind/state' || item.data === null || typeof item.data !== 'object')
            continue;
        const data = item.data;
        if (data.kind === 'pause' && typeof data.paused === 'boolean')
            state.paused = data.paused;
        if (data.kind !== 'claim' || data.taskId !== state.taskId)
            continue;
        if (data.trigger === 'final_response' || data.trigger === 'manual')
            state.completionClaimed = true;
        if (data.trigger === 'heartbeat' && typeof data.count === 'number' && Number.isSafeInteger(data.count) && data.count >= 0)
            state.heartbeatRuns += data.count;
    }
    return state;
}
/**
 * Read recent activation outcomes for a human status command.
 * @param session - Session owning the review records.
 * @returns At most twenty recent metadata summaries; unfinished old runs are interrupted.
 */
export function recentRuns(session) {
    const runs = new Map();
    for (const event of session.snapshotEvents()) {
        const item = pluginRecordOf(event);
        if (item?.type !== 'plugin:shadow-mind/state' || item.data === null || typeof item.data !== 'object')
            continue;
        const data = item.data;
        if (data.kind !== 'run' || typeof data.runId !== 'string' || typeof data.shadowId !== 'string' || typeof data.status !== 'string')
            continue;
        runs.set(data.runId, `${data.shadowId}: ${data.status === 'running' ? 'running or interrupted' : data.status}${typeof data.childSessionId === 'string' ? ` · session ${data.childSessionId}` : ''}${typeof data.detail === 'string' ? ` · ${data.detail}` : ''}`);
    }
    return [...runs.values()].slice(-20);
}
