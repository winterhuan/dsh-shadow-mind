/** Deployment limits for bounded, read-only reviews. */
import z from '@deepseek-ai/schemastery';
/** Runtime configuration resolved by Cordis before the plugin starts. */
export interface Config {
    definitionsDirectory: string;
    maxParallel: number;
    timeoutSeconds: number;
    maxHeartbeatRunsPerTask: number;
    maxDefinitions: number;
    maxDefinitionBytes: number;
    maxTrajectoryChars: number;
    maxEntryChars: number;
    maxReportChars: number;
    maxOutputTokens: number;
}
/** Validated deployment settings; deadlines include queueing and startup. */
export declare const Config: z<Pick<Config, 'definitionsDirectory'> & Partial<Config>, Config>;
