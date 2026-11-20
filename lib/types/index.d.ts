import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { SessionId } from '@deepseek-ai/dsh-session';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { Config } from './config.ts';
import { type WorkerReport } from './reports.ts';
import type { ShadowMindSnapshot } from './types.ts';
export { Config } from './config.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        shadowMind: ShadowMind;
    }
}
/** Owns scheduling and joins every child it starts before profile teardown. */
export declare class ShadowMind extends TypertRemoteService {
    readonly config: Config;
    static inject: string[];
    static Config: import("@deepseek-ai/schemastery").default<import("./config.ts").ConfigInput, Config>;
    private readonly owners;
    private readonly active;
    private readonly slots;
    private random;
    private readonly batches;
    private readonly liveBatches;
    private readonly workerPresets;
    private readonly pendingPolicies;
    private readonly pendingThinking;
    private autoEnabled;
    private stopped;
    constructor(ctx: Context, config: Config);
    private root;
    private currentConfig;
    private owner;
    private batchesFor;
    private isCurrent;
    private track;
    private drain;
    private bindTurn;
    private cancelOwned;
    private interrupt;
    /** Read live configuration, definitions and current-session run state.
     * @param agent - Root-session Agent whose state should be described.
     * @returns Human-readable status for the current root session.
     */
    status(agent: Agent): Promise<string>;
    /** Return only the live state owned by the requested root Session.
     * @param sessionId - Root Session id whose state should be queried.
     * @param signal - Cancellation signal for the Remote request.
     * @returns Session-scoped Shadow Mind state, or an absent projection.
     */
    snapshot(sessionId: SessionId, signal: AbortSignal): Promise<ShadowMindSnapshot>;
    /** Pause or resume all Shadow work owned by a root session.
     * @param agent - Root-session Agent whose work should be controlled.
     * @param paused - Whether new and active Shadow runs should be paused.
     * @returns Completion after active child runs have drained.
     */
    pause(agent: Agent, paused: boolean): Promise<void>;
    /** Run the selected responsibilities as a completion-style review batch.
     * @param agent - Root-session Agent that owns the review.
     * @param signal - Cancellation signal for the review batch.
     * @param id - Optional responsibility id to run.
     * @param extraTools - Optional tools granted for this invocation.
     * @returns Completion after all selected runs settle.
     */
    review(agent: Agent, signal: AbortSignal, id?: string, extraTools?: readonly string[]): Promise<void>;
    /** Run one responsibility immediately and return the resulting status.
     * @param agent - Root-session Agent that owns the probe.
     * @param signal - Cancellation signal for the probe.
     * @param id - Optional responsibility id; omitted selects one eligible id.
     * @param extraTools - Optional tools granted for this invocation.
     * @returns Current human-readable status after the probe settles.
     */
    probe(agent: Agent, signal: AbortSignal, id?: string, extraTools?: readonly string[]): Promise<string>;
    /** Enable or disable automatic heartbeat scheduling.
     * @param enabled - Whether heartbeat-triggered runs should be scheduled.
     * @returns Confirmation text for the new scheduler state.
     */
    setAuto(enabled: boolean): string;
    /** Cancel active Shadow runs owned by a root session.
     * @param agent - Root-session Agent whose active runs should be cancelled.
     * @returns Confirmation text containing the number of stopped runs.
     */
    clean(agent: Agent): Promise<string>;
    /** Apply an approved definition or runtime configuration operation.
     * @param agent - Root-session Agent requesting the operation.
     * @param operation - Management operation to execute.
     * @param args - Operation-specific fields.
     * @param signal - Optional cancellation signal while requesting approval.
     * @returns Confirmation text or the requested catalog/configuration.
     */
    manage(agent: Agent, operation: 'list' | 'create' | 'update' | 'enable' | 'disable' | 'delete' | 'read-config' | 'update-config', args?: Record<string, unknown>, signal?: AbortSignal): Promise<string>;
    private updateSettings;
    /** Apply a management operation for the Agent initiating the current tool call.
     * @param operation - Management operation to execute.
     * @param args - Operation-specific fields.
     * @returns Confirmation text or the requested catalog/configuration.
     */
    manageForCurrentAgent(operation: Parameters<ShadowMind['manage']>[1], args?: Record<string, unknown>): Promise<string>;
    private confirm;
    /** Accept a report sent by an active worker child.
     * @param childId - Worker child Session id.
     * @param runId - Active Shadow run id.
     * @param report - Worker summary to relay to the root session.
     */
    acceptRunReport(childId: SessionId, runId: string, report: WorkerReport): void;
    private selectThinkingLevel;
    private batch;
    private start;
    private resolveWorkerTools;
    private ensureWorkerPreset;
    private deliver;
    /** Format reports waiting for delivery to a root session.
     * @param agent - Root-session Agent whose reports should be listed.
     * @returns Human-readable recent report text.
     */
    reports(agent: Agent): Promise<string>;
}
export default ShadowMind;
//# sourceMappingURL=index.d.ts.map