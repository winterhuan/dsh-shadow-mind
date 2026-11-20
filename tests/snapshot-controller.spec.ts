import { SessionId } from '@deepseek-ai/dsh-session'
import { expect, it, vi } from 'vitest'
import { ShadowSnapshotController, type ShadowSnapshotRemote } from '../src/client/snapshot-controller.ts'
import type { ShadowMindSnapshot } from '../src/types.ts'

function snapshot(eventCount: number): ShadowMindSnapshot {
  return {
    present: true, paused: false, autoEnabled: true, epoch: eventCount, activeCount: 0, running: [], eventCount,
    recentEvents: [], shadows: [], diagnostics: [], heartbeatProbability: 0.2, maxParallelShadows: 2,
    defaultShadowTimeoutSeconds: 120, defaultShadowModel: null,
  }
}

it('keeps snapshot stores and polling independent for each Session', async () => {
  const remote: ShadowSnapshotRemote = {
    snapshot: vi.fn(async (sessionId: ReturnType<typeof SessionId>, _signal: AbortSignal) => ({
      ok: true as const, value: snapshot(sessionId === SessionId('first') ? 1 : 2),
    })),
  }
  const controller = new ShadowSnapshotController(remote, 60000)
  const first = SessionId('first')
  const second = SessionId('second')
  const stopFirst = controller.watch(first)
  const stopSecond = controller.watch(second)
  await vi.waitFor(() => {
    expect(controller.storeFor(first).getSnapshot().status).toBe('ready')
    expect(controller.storeFor(second).getSnapshot().status).toBe('ready')
  })
  expect(controller.storeFor(first)).not.toBe(controller.storeFor(second))
  expect(controller.storeFor(first).getSnapshot().snapshot?.eventCount).toBe(1)
  expect(controller.storeFor(second).getSnapshot().snapshot?.eventCount).toBe(2)
  expect(remote.snapshot).toHaveBeenCalledTimes(2)
  stopFirst()
  stopSecond()
  controller.dispose()
})

it('aborts an in-flight Remote request when its last Session watcher leaves', async () => {
  let signal: AbortSignal | undefined
  const remote: ShadowSnapshotRemote = {
    snapshot: vi.fn((_sessionId: ReturnType<typeof SessionId>, requestSignal: AbortSignal) => {
      signal = requestSignal
      return new Promise<{ ok: false; error: Error }>(resolve => requestSignal.addEventListener('abort', () => resolve({ ok: false, error: new Error('aborted') }), { once: true }))
    }),
  }
  const controller = new ShadowSnapshotController(remote)
  const stop = controller.watch(SessionId('cancelled'))
  await vi.waitFor(() => expect(remote.snapshot).toHaveBeenCalledOnce())
  stop()
  expect(signal?.aborted).toBe(true)
  controller.dispose()
})
