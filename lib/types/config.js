import z from '@deepseek-ai/schemastery';
const defaults = {
    heartbeatProbability: 0.2,
    heartbeatTools: [],
    maxParallel: 2,
    timeoutSeconds: 120,
    headlessDrainTimeoutSeconds: 30,
    resultBatchWindowMs: 250,
    maxHeartbeatRunsPerTask: 4,
    maxDefinitions: 16,
    maxDefinitionBytes: 16384,
    maxTrajectoryChars: 48000,
    maxEntryChars: 8000,
    maxReportChars: 4000,
    maxOutputTokens: 4096,
    excludedExtensions: [],
    defaultThinkingLevel: 'high',
    randomSeed: 0,
};
/** Schema consumed by the Loader and projected into the DSH settings page. */
export const Config = z.object({
    definitionsDirectory: z.string().required(),
    heartbeatProbability: z.number().min(0).max(1).default(defaults.heartbeatProbability).volatile(),
    heartbeatTools: z.array(z.string()).default([...defaults.heartbeatTools]).volatile(),
    maxParallel: z.number().step(1).min(1).max(8).default(defaults.maxParallel).volatile(),
    timeoutSeconds: z.number().min(1).max(3600).default(defaults.timeoutSeconds).volatile(),
    headlessDrainTimeoutSeconds: z.number().min(0).max(3600).default(defaults.headlessDrainTimeoutSeconds).volatile(),
    resultBatchWindowMs: z.number().step(1).min(0).max(60000).default(defaults.resultBatchWindowMs).volatile(),
    maxHeartbeatRunsPerTask: z.number().step(1).min(0).max(100).default(defaults.maxHeartbeatRunsPerTask).volatile(),
    maxDefinitions: z.number().step(1).min(1).max(100).default(defaults.maxDefinitions).volatile(),
    maxDefinitionBytes: z.number().step(1).min(256).max(1048576).default(defaults.maxDefinitionBytes).volatile(),
    maxTrajectoryChars: z.number().step(1).min(1024).max(1048576).default(defaults.maxTrajectoryChars).volatile(),
    maxEntryChars: z.number().step(1).min(128).max(65536).default(defaults.maxEntryChars).volatile(),
    maxReportChars: z.number().step(1).min(128).max(65536).default(defaults.maxReportChars).volatile(),
    maxOutputTokens: z.number().step(1).min(256).max(32768).default(defaults.maxOutputTokens).volatile(),
    excludedExtensions: z.array(z.string()).default([...defaults.excludedExtensions]).volatile(),
    defaultShadowModel: z.string().volatile(),
    defaultThinkingLevel: z.string().default(defaults.defaultThinkingLevel).volatile(),
    randomSeed: z.number().step(1).default(defaults.randomSeed).volatile(),
});
function value(reference) {
    return typeof reference === 'object' && reference !== null && 'get' in reference && typeof reference.get === 'function'
        ? reference.get() : reference;
}
function withDefault(reference, fallback) {
    return value(reference) ?? fallback;
}
/** Resolve the current live values for one bounded operation. */
export function resolveConfig(config) {
    const defaultShadowModel = value(config.defaultShadowModel);
    return {
        definitionsDirectory: config.definitionsDirectory,
        heartbeatProbability: withDefault(config.heartbeatProbability, defaults.heartbeatProbability),
        heartbeatTools: withDefault(config.heartbeatTools, defaults.heartbeatTools),
        maxParallel: withDefault(config.maxParallel, defaults.maxParallel),
        timeoutSeconds: withDefault(config.timeoutSeconds, defaults.timeoutSeconds),
        headlessDrainTimeoutSeconds: withDefault(config.headlessDrainTimeoutSeconds, defaults.headlessDrainTimeoutSeconds),
        resultBatchWindowMs: withDefault(config.resultBatchWindowMs, defaults.resultBatchWindowMs),
        maxHeartbeatRunsPerTask: withDefault(config.maxHeartbeatRunsPerTask, defaults.maxHeartbeatRunsPerTask),
        maxDefinitions: withDefault(config.maxDefinitions, defaults.maxDefinitions),
        maxDefinitionBytes: withDefault(config.maxDefinitionBytes, defaults.maxDefinitionBytes),
        maxTrajectoryChars: withDefault(config.maxTrajectoryChars, defaults.maxTrajectoryChars),
        maxEntryChars: withDefault(config.maxEntryChars, defaults.maxEntryChars),
        maxReportChars: withDefault(config.maxReportChars, defaults.maxReportChars),
        maxOutputTokens: withDefault(config.maxOutputTokens, defaults.maxOutputTokens),
        excludedExtensions: withDefault(config.excludedExtensions, defaults.excludedExtensions),
        ...(defaultShadowModel === undefined || defaultShadowModel === '' ? {} : { defaultShadowModel }),
        defaultThinkingLevel: withDefault(config.defaultThinkingLevel, defaults.defaultThinkingLevel),
        randomSeed: withDefault(config.randomSeed, defaults.randomSeed),
    };
}
/** Serialize only resolved values for diagnostics and model-facing output. */
export function serializeConfig(config) {
    return JSON.stringify(resolveConfig(config), null, 2);
}
//# sourceMappingURL=config.js.map