/** JSON-safe state exposed to the Shadow Mind client through a Session Remote. */
export interface ShadowMindSnapshot {
    present: boolean;
    paused: boolean;
    autoEnabled: boolean;
    epoch: number;
    activeCount: number;
    running: Array<{
        childId: string;
        shadowId: string;
        startedAt: number;
        timeoutMs: number;
    }>;
    eventCount: number;
    recentEvents: Array<{
        seq: number;
        at: string;
        kind: string;
        data?: string;
    }>;
    shadows: Array<{
        id: string;
        name: string;
        enabled: boolean;
        activationProbability: number;
        tools: string[];
    }>;
    diagnostics: Array<{
        filePath: string;
        message: string;
    }>;
    heartbeatProbability: number;
    maxParallelShadows: number;
    defaultShadowTimeoutSeconds: number;
    defaultShadowModel: string | null;
}
//# sourceMappingURL=types.d.ts.map