/** Session-resident scheduler state that never enters model context. */
import { appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session';
export function record(session, data) {
    appendPluginRecord(session, 'plugin:shadow-mind/state', data);
}
export function savedState(session) {
    const state = { taskId: undefined, paused: false, heartbeatRuns: 0, completionClaimed: false, finalRounds: new Map() };
    for (const event of session.snapshotEvents()) {
        if (event.type === 'user/message' && event.data.source.kind === 'user') {
            state.taskId = event.data.id;
            state.heartbeatRuns = 0;
            state.completionClaimed = false;
            state.finalRounds.clear();
        }
        const pluginRecord = pluginRecordOf(event);
        if (pluginRecord?.type !== 'plugin:shadow-mind/state' || !isRecord(pluginRecord.data))
            continue;
        const data = pluginRecord.data;
        if (data.kind === 'pause' && typeof data.paused === 'boolean')
            state.paused = data.paused;
        if (data.kind !== 'claim' && data.kind !== 'final-round')
            continue;
        if (data.taskId !== state.taskId || !Array.isArray(data.ids) || !data.ids.every(id => typeof id === 'string'))
            continue;
        if (data.kind === 'claim' && data.trigger === 'heartbeat')
            state.heartbeatRuns += data.ids.length;
        if (data.kind === 'claim' && (data.trigger === 'final_response' || data.finalCheck === true))
            state.completionClaimed = true;
        if (data.kind === 'final-round')
            for (const id of data.ids)
                state.finalRounds.set(id, (state.finalRounds.get(id) ?? 0) + 1);
    }
    return state;
}
export function recentRuns(session) {
    const runs = new Map();
    for (const event of session.snapshotEvents()) {
        const item = pluginRecordOf(event);
        if (item?.type !== 'plugin:shadow-mind/state' || !isRecord(item.data))
            continue;
        const data = item.data;
        if (data.kind !== 'run' || typeof data.runId !== 'string' || typeof data.shadowId !== 'string' || typeof data.status !== 'string')
            continue;
        runs.set(data.runId, `${data.shadowId}: ${data.status === 'running' ? 'running or interrupted' : data.status} (${String(data.mode)})${typeof data.childSessionId === 'string' ? ` · session ${data.childSessionId}` : ''}${typeof data.detail === 'string' ? ` · ${data.detail}` : ''}`);
    }
    return [...runs.values()].slice(-20);
}
/** Count all plugin state records while keeping the payload sent to Client bounded. */
export function eventCount(session) {
    return session.snapshotEvents().reduce((count, event) => {
        const item = pluginRecordOf(event);
        return item?.type === 'plugin:shadow-mind/state' && isRecord(item.data) && typeof item.data.kind === 'string' ? count + 1 : count;
    }, 0);
}
/** Count all state records while retaining only a bounded recent window. */
export function eventHistory(session, limit = 50) {
    const rows = [];
    let count = 0;
    for (const event of session.snapshotEvents()) {
        const item = pluginRecordOf(event);
        if (item?.type !== 'plugin:shadow-mind/state' || !isRecord(item.data) || typeof item.data.kind !== 'string')
            continue;
        count += 1;
        rows.push({ seq: Number(item.seq), at: new Date(item.time).toISOString(), kind: item.data.kind, data: JSON.stringify(item.data) });
        if (rows.length > limit)
            rows.shift();
    }
    return { count, recent: rows };
}
function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
//# sourceMappingURL=records.js.map