export class ReportBatcher {
    windowMs;
    deliver;
    onError;
    pending = [];
    timer;
    pendingSince;
    history = [];
    constructor(windowMs, deliver, onError = () => { }) {
        this.windowMs = windowMs;
        this.deliver = deliver;
        this.onError = onError;
    }
    setWindow(value) {
        if (this.windowMs === value)
            return;
        this.windowMs = value;
        if (this.timer !== undefined && this.pending.length > 0) {
            clearTimeout(this.timer);
            this.schedule();
        }
    }
    get hasPending() { return this.pending.length > 0 || this.timer !== undefined; }
    get recent() { return this.history.slice().reverse(); }
    add(report) {
        if (this.pending.length === 0)
            this.pendingSince = Date.now();
        this.pending.push(report);
        if (this.timer === undefined)
            this.schedule();
    }
    schedule() {
        const dueAt = (this.pendingSince ?? Date.now()) + this.windowMs;
        this.timer = setTimeout(() => { void this.flush().catch(this.onError); }, Math.max(0, dueAt - Date.now()));
    }
    async flush() {
        if (this.timer !== undefined)
            clearTimeout(this.timer);
        this.timer = undefined;
        if (this.pending.length === 0)
            return [];
        const batch = this.pending;
        this.pending = [];
        this.pendingSince = undefined;
        const unique = batch.filter((item, index) => batch.findIndex(other => other.content === item.content) === index);
        await this.deliver(unique);
        const now = new Date().toISOString();
        for (const report of unique)
            this.history.push({ ...report, deliveredAt: now });
        if (this.history.length > 5)
            this.history.splice(0, this.history.length - 5);
        return unique;
    }
    clear() {
        if (this.timer !== undefined)
            clearTimeout(this.timer);
        this.timer = undefined;
        this.pending = [];
        this.pendingSince = undefined;
    }
    dispose() { this.clear(); this.history.length = 0; }
}
export function formatReports(reports) {
    if (reports.length === 0)
        return 'No Shadow reports have been delivered in this session.';
    return reports.map(report => `${report.shadowName} · ${report.mode} · ${report.deliveredAt}\n${report.content}\nEvidence: ${report.refs.join(', ') || 'none'}`).join('\n\n');
}
//# sourceMappingURL=reports.js.map