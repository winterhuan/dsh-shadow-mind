/** Runtime limits and live profile settings for Shadow Mind. */
import type { Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Runtime profile configuration; volatile values remain live references. */
export interface Config {
    /** Directory containing Markdown responsibilities. */
    definitionsDirectory: string;
    heartbeatProbability: Volatile<number>;
    heartbeatTools: Volatile<string[]>;
    maxParallel: Volatile<number>;
    timeoutSeconds: Volatile<number>;
    headlessDrainTimeoutSeconds: Volatile<number>;
    resultBatchWindowMs: Volatile<number>;
    maxHeartbeatRunsPerTask: Volatile<number>;
    maxDefinitions: Volatile<number>;
    maxDefinitionBytes: Volatile<number>;
    maxTrajectoryChars: Volatile<number>;
    maxEntryChars: Volatile<number>;
    maxReportChars: Volatile<number>;
    maxOutputTokens: Volatile<number>;
    excludedExtensions: Volatile<string[]>;
    defaultShadowModel: Volatile<string | undefined>;
    defaultThinkingLevel: Volatile<string>;
    randomSeed: Volatile<number>;
}
/** Plain input accepted by the Loader and direct test fixtures. */
export interface ConfigInput {
    definitionsDirectory: string;
    heartbeatProbability?: number;
    heartbeatTools?: string[];
    maxParallel?: number;
    timeoutSeconds?: number;
    headlessDrainTimeoutSeconds?: number;
    resultBatchWindowMs?: number;
    maxHeartbeatRunsPerTask?: number;
    maxDefinitions?: number;
    maxDefinitionBytes?: number;
    maxTrajectoryChars?: number;
    maxEntryChars?: number;
    maxReportChars?: number;
    maxOutputTokens?: number;
    excludedExtensions?: string[];
    defaultShadowModel?: string;
    defaultThinkingLevel?: string;
    randomSeed?: number;
}
/** Plain snapshot used by filesystem and scheduling helpers. */
export interface ResolvedConfig {
    definitionsDirectory: string;
    heartbeatProbability: number;
    heartbeatTools: readonly string[];
    maxParallel: number;
    timeoutSeconds: number;
    headlessDrainTimeoutSeconds: number;
    resultBatchWindowMs: number;
    maxHeartbeatRunsPerTask: number;
    maxDefinitions: number;
    maxDefinitionBytes: number;
    maxTrajectoryChars: number;
    maxEntryChars: number;
    maxReportChars: number;
    maxOutputTokens: number;
    excludedExtensions: readonly string[];
    defaultShadowModel?: string;
    defaultThinkingLevel: string;
    randomSeed: number;
}
/** Schema consumed by the Loader and projected into the DSH settings page. */
export declare const Config: z<ConfigInput, Config>;
/** Resolve the current live values for one bounded operation. */
export declare function resolveConfig(config: Config | ConfigInput | ResolvedConfig): ResolvedConfig;
/** Serialize only resolved values for diagnostics and model-facing output. */
export declare function serializeConfig(config: Config | ConfigInput | ResolvedConfig): string;
//# sourceMappingURL=config.d.ts.map