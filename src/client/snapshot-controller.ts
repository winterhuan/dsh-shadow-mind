/** Session-keyed Remote polling shared by both conversation status slots. */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ShadowMindSnapshot } from '../types.ts'

export interface ShadowSnapshotState {
  readonly status: 'loading' | 'ready' | 'error'
  readonly snapshot?: ShadowMindSnapshot
}

interface SessionEntry {
  readonly store: SnapshotStore<ShadowSnapshotState>
  references: number
  request?: AbortController | undefined
  timer?: ReturnType<typeof setTimeout>
}

export interface ShadowSnapshotRemote {
  snapshot(sessionId: SessionId, signal: AbortSignal): Promise<{ ok: true; value: ShadowMindSnapshot } | { ok: false; error: Error }>
}

/** Owns one poll loop per mounted root Session and cancels it when unused. */
export class ShadowSnapshotController {
  private readonly entries = new Map<SessionId, SessionEntry>()

  constructor(private readonly remote: ShadowSnapshotRemote, private readonly intervalMs = 2000) {}

  storeFor(sessionId: SessionId): SnapshotStore<ShadowSnapshotState> { return this.entry(sessionId).store }

  watch(sessionId: SessionId): () => void {
    const entry = this.entry(sessionId)
    entry.references += 1
    if (entry.references === 1) void this.poll(sessionId, entry)
    return () => {
      if (this.entries.get(sessionId) !== entry) return
      entry.references = Math.max(0, entry.references - 1)
      if (entry.references > 0) return
      if (entry.timer !== undefined) clearTimeout(entry.timer)
      entry.request?.abort(new Error('Shadow status slot unmounted'))
      this.entries.delete(sessionId)
    }
  }

  dispose(): void {
    for (const [sessionId, entry] of this.entries) {
      if (entry.timer !== undefined) clearTimeout(entry.timer)
      entry.request?.abort(new Error('Shadow client disposed'))
      this.entries.delete(sessionId)
    }
  }

  private entry(sessionId: SessionId): SessionEntry {
    let entry = this.entries.get(sessionId)
    if (entry === undefined) {
      entry = { store: createSnapshotStore<ShadowSnapshotState>({ status: 'loading' }), references: 0 }
      this.entries.set(sessionId, entry)
    }
    return entry
  }

  private async poll(sessionId: SessionId, entry: SessionEntry): Promise<void> {
    if (entry.references === 0 || this.entries.get(sessionId) !== entry) return
    const request = new AbortController()
    entry.request?.abort(new Error('Shadow status refresh superseded'))
    entry.request = request
    try {
      const result = await this.remote.snapshot(sessionId, request.signal)
      if (request.signal.aborted || this.entries.get(sessionId) !== entry) return
      if (result.ok) entry.store.set({ status: 'ready', snapshot: result.value })
      else entry.store.set({ status: 'error', ...(entry.store.getSnapshot().snapshot === undefined ? {} : { snapshot: entry.store.getSnapshot().snapshot }) })
    } catch (_error) {
      if (!request.signal.aborted && this.entries.get(sessionId) === entry) {
        const current = entry.store.getSnapshot()
        entry.store.set({ status: 'error', ...(current.snapshot === undefined ? {} : { snapshot: current.snapshot }) })
      }
    } finally {
      if (entry.request === request) entry.request = undefined
      if (entry.references > 0 && this.entries.get(sessionId) === entry) entry.timer = setTimeout(() => { void this.poll(sessionId, entry) }, this.intervalMs)
    }
  }
}
