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
    /** Read live configuration, definitions and current-session run state. */
    status(agent: Agent): Promise<string>;
    /** Return only the live state owned by the requested root Session. */
    snapshot(sessionId: SessionId, signal: AbortSignal): Promise<ShadowMindSnapshot>;
    pause(agent: Agent, paused: boolean): Promise<void>;
    review(agent: Agent, signal: AbortSignal, id?: string, extraTools?: readonly string[]): Promise<void>;
    probe(agent: Agent, signal: AbortSignal, id?: string, extraTools?: readonly string[]): Promise<string>;
    setAuto(enabled: boolean): string;
    clean(agent: Agent): Promise<string>;
    manage(agent: Agent, operation: 'list' | 'create' | 'update' | 'enable' | 'disable' | 'delete' | 'read-config' | 'update-config', args?: Record<string, unknown>, signal?: AbortSignal): Promise<string>;
    private updateSettings;
    manageForCurrentAgent(operation: Parameters<ShadowMind['manage']>[1], args?: Record<string, unknown>): Promise<string>;
    private confirm;
    acceptRunReport(childId: SessionId, runId: string, report: WorkerReport): void;
    private selectThinkingLevel;
    private batch;
    private start;
    private resolveWorkerTools;
    private ensureWorkerPreset;
    private deliver;
    reports(agent: Agent): Promise<string>;
}
export default ShadowMind;
//# sourceMappingURL=index.d.ts.map