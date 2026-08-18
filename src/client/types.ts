/**
 * Browser-half wire types for the Shadow Mind snapshot.
 *
 * These mirror the host-side `ShadowMindSnapshot` shape (src/types.ts). The
 * client bundle is self-contained (it cannot import host modules), so the
 * wire contract is duplicated here deliberately — exactly like generated
 * Typert artifacts duplicate Host types for consumers.
 */

/** One recorded runtime event; `kind` is the event name, `data` its payload. */
export interface ShadowRuntimeEvent {
  at: string;
  kind: string;
  data?: Record<string, unknown>;
}

/** A registry definition load problem surfaced by the host. */
export interface ShadowRegistryDiagnostic {
  filePath: string;
  message: string;
}

/** Wire-serializable runtime snapshot served by `shadowMind/snapshot`. */
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
  recentEvents: ShadowRuntimeEvent[];
  shadows: Array<{
    id: string;
    name: string;
    enabled: boolean;
    activationProbability: number;
    tools: string[];
  }>;
  diagnostics: ShadowRegistryDiagnostic[];
  configError: string | null;
  heartbeatProbability: number;
  maxParallelShadows: number;
  defaultShadowTimeoutSeconds: number;
  defaultShadowModel: string | null;
}
