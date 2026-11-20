/** Bounded per-parent report aggregation and recent delivered-report history. */
import type { Report } from './report.ts'

export interface DeliveredReport extends Report { readonly deliveredAt: string }

export class ReportBatcher {
  private pending: Report[] = []
  private timer: ReturnType<typeof setTimeout> | undefined
  private pendingSince: number | undefined
  private readonly history: DeliveredReport[] = []

  constructor(private windowMs: number, private readonly deliver: (reports: readonly Report[]) => void | Promise<void>, private readonly onError: (error: unknown) => void = () => {}) {}

  setWindow(value: number): void {
    if (this.windowMs === value) return
    this.windowMs = value
    if (this.timer !== undefined && this.pending.length > 0) {
      clearTimeout(this.timer)
      this.schedule()
    }
  }
  get hasPending(): boolean { return this.pending.length > 0 || this.timer !== undefined }
  get recent(): readonly DeliveredReport[] { return this.history.slice().reverse() }

  add(report: Report): void {
    if (this.pending.length === 0) this.pendingSince = Date.now()
    this.pending.push(report)
    if (this.timer === undefined) this.schedule()
  }

  private schedule(): void {
    const dueAt = (this.pendingSince ?? Date.now()) + this.windowMs
    this.timer = setTimeout(() => { void this.flush().catch(this.onError) }, Math.max(0, dueAt - Date.now()))
  }

  async flush(): Promise<readonly Report[]> {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    if (this.pending.length === 0) return []
    const batch = this.pending
    this.pending = []
    this.pendingSince = undefined
    const unique = batch.filter((item, index) => batch.findIndex(other => other.content === item.content) === index)
    await this.deliver(unique)
    const now = new Date().toISOString()
    for (const report of unique) this.history.push({ ...report, deliveredAt: now })
    if (this.history.length > 5) this.history.splice(0, this.history.length - 5)
    return unique
  }

  clear(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.pending = []
    this.pendingSince = undefined
  }

  dispose(): void { this.clear(); this.history.length = 0 }
}

export interface WorkerReport { readonly content: string; readonly refs: readonly number[] }
export function formatReports(reports: readonly DeliveredReport[]): string {
  if (reports.length === 0) return 'No Shadow reports have been delivered in this session.'
  return reports.map(report => `${report.shadowName} · ${report.mode} · ${report.deliveredAt}\n${report.content}\nEvidence: ${report.refs.join(', ') || 'none'}`).join('\n\n')
}
