import { Context, Service } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { Config } from './config.ts';
export { Config } from './config.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        shadowMind: ShadowMind;
    }
}
/** Session-attributed scheduler; all started work is awaited before plugin disposal. */
export declare class ShadowMind extends Service {
    readonly config: Config;
    static inject: string[];
    static Config: import("@deepseek-ai/schemastery").default<Pick<Config, "definitionsDirectory"> & Partial<Config>, Config>;
    private readonly owners;
    private readonly slots;
    private stopped;
    constructor(ctx: Context, config: Config);
    private root;
    private owner;
    private current;
    private track;
    private drain;
    /**
     * Reload definitions and inspect this session's diagnostics and recent outcomes.
     * @param agent - Live root Agent selected by the human command.
     * @returns Human-readable status with definition errors and child Session addresses.
     */
    status(agent: Agent): Promise<string>;
    /**
     * Pause cancels and joins all reviews; resume admits only future triggers.
     * @param agent - Live root Agent whose controls change.
     * @param paused - Requested state, persisted in this Session.
     */
    pause(agent: Agent, paused: boolean): Promise<void>;
    /**
     * Run a manual batch and await cancellation-safe report delivery.
     * @param agent - Live root with an admitted human task.
     * @param signal - Human command cancellation.
     * @param id - Optional definition id; omission checks every enabled definition.
     */
    review(agent: Agent, signal: AbortSignal, id?: string): Promise<void>;
    private batch;
    private run;
}
export default ShadowMind;
