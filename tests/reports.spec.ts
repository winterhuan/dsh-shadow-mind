import { expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ReportBatcher } from '../src/reports.ts'
import type { Report } from '../src/report.ts'

const report: Report = {
  status: 'report', content: 'Finding', refs: [1], mode: 'review', runId: 'run', shadowId: 'shadow',
  shadowName: 'Shadow', childSessionId: SessionId('child'), capturedThroughSeq: 1,
}

it('reschedules pending delivery when the live batch window changes', async () => {
  vi.useFakeTimers()
  try {
    const delivered: (readonly Report[])[] = []
    const batcher = new ReportBatcher(1000, reports => { delivered.push(reports) })
    batcher.add(report)
    await vi.advanceTimersByTimeAsync(30)
    batcher.setWindow(40)
    await vi.advanceTimersByTimeAsync(9)
    expect(delivered).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(delivered).toHaveLength(1)
    batcher.dispose()
  } finally {
    vi.useRealTimers()
  }
})
