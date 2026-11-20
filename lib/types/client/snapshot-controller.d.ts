/** Session-keyed Remote polling shared by both conversation status slots. */
import { type SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { ShadowMindSnapshot } from '../types.ts';
export interface ShadowSnapshotState {
    readonly status: 'loading' | 'ready' | 'error';
    readonly snapshot?: ShadowMindSnapshot;
}
export interface ShadowSnapshotRemote {
    snapshot(sessionId: SessionId, signal: AbortSignal): Promise<{
        ok: true;
        value: ShadowMindSnapshot;
    } | {
        ok: false;
        error: Error;
    }>;
}
/** Owns one poll loop per mounted root Session and cancels it when unused. */
export declare class ShadowSnapshotController {
    private readonly remote;
    private readonly intervalMs;
    private readonly entries;
    constructor(remote: ShadowSnapshotRemote, intervalMs?: number);
    storeFor(sessionId: SessionId): SnapshotStore<ShadowSnapshotState>;
    watch(sessionId: SessionId): () => void;
    dispose(): void;
    private entry;
    private poll;
}
//# sourceMappingURL=snapshot-controller.d.ts.map