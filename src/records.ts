/** Session-resident scheduler state that never enters model context. */
import { appendPluginRecord, pluginRecordOf, type Session } from '@deepseek-ai/dsh-session'
import type { MessageId } from '@deepseek-ai/dsh-llm'
import type { Trigger } from './definitions.ts'

export type RunStatus = 'running' | 'report' | 'silent' | 'not_relevant' | 'timeout' | 'cancelled' | 'failed' | 'skipped'
export type RecordData =
  | { readonly kind: 'pause'; readonly paused: boolean }
  | { readonly kind: 'claim'; readonly taskId: string; readonly trigger: Trigger | 'manual'; readonly ids: readonly string[]; readonly finalCheck?: boolean }
  | { readonly kind: 'final-round'; readonly taskId: string; readonly ids: readonly string[] }
  | { readonly kind: 'scheduler'; readonly taskId: string; readonly trigger: Trigger | 'manual'; readonly candidates: readonly unknown[]; readonly modelFiltered: readonly string[]; readonly runningExcluded: readonly string[]; readonly toolFiltered?: readonly string[]; readonly roundFiltered?: readonly string[]; readonly heartbeatRoll?: number }
  | { readonly kind: 'run'; readonly taskId: string; readonly runId: string; readonly shadowId: string; readonly trigger: Trigger | 'manual'; readonly mode: 'review' | 'worker'; readonly status: RunStatus; readonly childSessionId?: string; readonly detail?: string }

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap { 'plugin:shadow-mind/state': RecordData }
}

export function record(session: Session, data: RecordData): void {
  appendPluginRecord(session, 'plugin:shadow-mind/state', data)
}

export interface SavedState {
  taskId: MessageId | undefined
  paused: boolean
  heartbeatRuns: number
  completionClaimed: boolean
  readonly finalRounds: Map<string, number>
}

export function savedState(session: Session): SavedState {
  const state: SavedState = { taskId: undefined, paused: false, heartbeatRuns: 0, completionClaimed: false, finalRounds: new Map() }
  for (const event of session.snapshotEvents()) {
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      state.taskId = event.data.id
      state.heartbeatRuns = 0
      state.completionClaimed = false
      state.finalRounds.clear()
    }
    const pluginRecord = pluginRecordOf(event)
    if (pluginRecord?.type !== 'plugin:shadow-mind/state' || !isRecord(pluginRecord.data)) continue
    const data = pluginRecord.data as Record<string, unknown>
    if (data.kind === 'pause' && typeof data.paused === 'boolean') state.paused = data.paused
    if (data.kind !== 'claim' && data.kind !== 'final-round') continue
    if (data.taskId !== state.taskId || !Array.isArray(data.ids) || !data.ids.every(id => typeof id === 'string')) continue
    if (data.kind === 'claim' && data.trigger === 'heartbeat') state.heartbeatRuns += data.ids.length
    if (data.kind === 'claim' && (data.trigger === 'final_response' || data.finalCheck === true)) state.completionClaimed = true
    if (data.kind === 'final-round') for (const id of data.ids as string[]) state.finalRounds.set(id, (state.finalRounds.get(id) ?? 0) + 1)
  }
  return state
}

export function recentRuns(session: Session): string[] {
  const runs = new Map<string, string>()
  for (const event of session.snapshotEvents()) {
    const item = pluginRecordOf(event)
    if (item?.type !== 'plugin:shadow-mind/state' || !isRecord(item.data)) continue
    const data = item.data as Record<string, unknown>
    if (data.kind !== 'run' || typeof data.runId !== 'string' || typeof data.shadowId !== 'string' || typeof data.status !== 'string') continue
    runs.set(data.runId, `${data.shadowId}: ${data.status === 'running' ? 'running or interrupted' : data.status} (${String(data.mode)})${typeof data.childSessionId === 'string' ? ` · session ${data.childSessionId}` : ''}${typeof data.detail === 'string' ? ` · ${data.detail}` : ''}`)
  }
  return [...runs.values()].slice(-20)
}

/** Count all plugin state records while keeping the payload sent to Client bounded. */
export function eventCount(session: Session): number {
  return session.snapshotEvents().reduce((count, event) => {
    const item = pluginRecordOf(event)
    return item?.type === 'plugin:shadow-mind/state' && isRecord(item.data) && typeof item.data.kind === 'string' ? count + 1 : count
  }, 0)
}

export interface EventHistory {
  readonly count: number
  readonly recent: Array<{ readonly seq: number; readonly at: string; readonly kind: string; readonly data?: string }>
}

/** Count all state records while retaining only a bounded recent window. */
export function eventHistory(session: Session, limit = 50): EventHistory {
  const rows: Array<{ readonly seq: number; readonly at: string; readonly kind: string; readonly data?: string }> = []
  let count = 0
  for (const event of session.snapshotEvents()) {
    const item = pluginRecordOf(event)
    if (item?.type !== 'plugin:shadow-mind/state' || !isRecord(item.data) || typeof item.data.kind !== 'string') continue
    count += 1
    rows.push({ seq: Number(item.seq), at: new Date(item.time).toISOString(), kind: item.data.kind, data: JSON.stringify(item.data) })
    if (rows.length > limit) rows.shift()
  }
  return { count, recent: rows }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
