/** Restart-readable review diagnostics; model input is carried by ordinary Session messages. */
import { appendPluginRecord, pluginRecordOf, type Session } from '@deepseek-ai/dsh-session'
import type { MessageId } from '@deepseek-ai/dsh-llm'

/** One activation's observable status, including unsuccessful and unstarted attempts. */
export type RunStatus = 'running' | 'report' | 'silent' | 'not_relevant' | 'timeout' | 'cancelled' | 'failed' | 'skipped'

/** Metadata-only records can be skipped by readers without this plugin. */
export type RecordData =
  | { kind: 'pause'; paused: boolean }
  | { kind: 'claim'; taskId: string; trigger: 'heartbeat' | 'final_response' | 'manual'; count: number }
  | { kind: 'run'; taskId: string; runId: string; shadowId: string; status: RunStatus; childSessionId?: string; detail?: string }

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    'plugin:shadow-mind/state': RecordData
  }
}

/**
 * Append metadata without adding model context.
 * @param session - Owner Session outside a session/event publication callback.
 * @param data - JSON review state.
 */
export function record(session: Session, data: RecordData): void {
  appendPluginRecord(session, 'plugin:shadow-mind/state', data)
}

/** Minimal state recovered for the latest admitted human task. */
export interface SavedState {
  taskId: MessageId | undefined
  paused: boolean
  completionClaimed: boolean
  heartbeatRuns: number
}

/**
 * Recover bounded scheduling counters; unknown metadata never changes model history.
 * @param session - Resumed or current Session.
 * @returns Pause state and counters attributed to the latest human input.
 */
export function savedState(session: Session): SavedState {
  const state: SavedState = { taskId: undefined, paused: false, completionClaimed: false, heartbeatRuns: 0 }
  for (const event of session.snapshotEvents()) {
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      state.taskId = event.data.id
      state.completionClaimed = false
      state.heartbeatRuns = 0
    }
    const item = pluginRecordOf(event)
    if (item?.type !== 'plugin:shadow-mind/state' || item.data === null || typeof item.data !== 'object') continue
    const data = item.data as Record<string, unknown>
    if (data.kind === 'pause' && typeof data.paused === 'boolean') state.paused = data.paused
    if (data.kind !== 'claim' || data.taskId !== state.taskId) continue
    if (data.trigger === 'final_response' || data.trigger === 'manual') state.completionClaimed = true
    if (data.trigger === 'heartbeat' && typeof data.count === 'number' && Number.isSafeInteger(data.count) && data.count >= 0) state.heartbeatRuns += data.count
  }
  return state
}

/**
 * Read recent activation outcomes for a human status command.
 * @param session - Session owning the review records.
 * @returns At most twenty recent metadata summaries; unfinished old runs are interrupted.
 */
export function recentRuns(session: Session): string[] {
  const runs = new Map<string, string>()
  for (const event of session.snapshotEvents()) {
    const item = pluginRecordOf(event)
    if (item?.type !== 'plugin:shadow-mind/state' || item.data === null || typeof item.data !== 'object') continue
    const data = item.data as Record<string, unknown>
    if (data.kind !== 'run' || typeof data.runId !== 'string' || typeof data.shadowId !== 'string' || typeof data.status !== 'string') continue
    runs.set(data.runId, `${data.shadowId}: ${data.status === 'running' ? 'running or interrupted' : data.status}${typeof data.childSessionId === 'string' ? ` · session ${data.childSessionId}` : ''}${typeof data.detail === 'string' ? ` · ${data.detail}` : ''}`)
  }
  return [...runs.values()].slice(-20)
}
