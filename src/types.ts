import type { Agent } from "@deepseek-ai/dsh-agent";

/** Thinking levels accepted for the global shadow default. */
export type ShadowThinkingLevel = "minimal" | "low" | "medium" | "high";

export interface ShadowConfig {
  heartbeatProbability: number;
  maxParallelShadows: number;
  defaultShadowTimeoutSeconds: number;
  headlessDrainTimeoutSeconds: number;
  resultBatchWindowMs: number;
  defaultShadowModel?: string;
  defaultThinkingLevel: ShadowThinkingLevel;
  randomSeed?: number;
}

export interface ShadowDefinition {
  id: string;
  name: string;
  enabled: boolean;
  activationProbability: number;
  activeForModels: string[];
  runWithModel?: string;
  thinkingLevel?: string;
  timeoutSeconds?: number;
  tools: string[];
  prompt: string;
  filePath: string;
}

export interface RegistryDiagnostic {
  filePath: string;
  message: string;
}

export interface RegistrySnapshot {
  shadows: ShadowDefinition[];
  diagnostics: RegistryDiagnostic[];
}

export type RunEndReason = "report" | "silent" | "timeout" | "aborted" | "error";

export interface ShadowReport {
  shadowId: string;
  shadowName: string;
  content: string;
  epoch: number;
  runId: string;
  /** Child agent delivering the report; the delivery authority for reportFrom. */
  childAgent: Agent;
}

export interface RuntimeEvent {
  at: string;
  kind: string;
  data?: Record<string, unknown>;
}

export interface HeartbeatDecision {
  heartbeatRoll: number;
  activated: Array<{ shadow: ShadowDefinition; roll: number }>;
  candidates: Array<{ shadowId: string; roll: number; selected: boolean }>;
  /** Shadow ids excluded because active_for_models did not match the main model. */
  modelFiltered: string[];
  /** Shadow ids excluded because the same shadow is already running. */
  runningExcluded: string[];
}

/** Wire-serializable runtime snapshot served to the Web UI. */
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
  recentEvents: RuntimeEvent[];
  shadows: Array<{
    id: string;
    name: string;
    enabled: boolean;
    activationProbability: number;
    tools: string[];
  }>;
  diagnostics: RegistryDiagnostic[];
  heartbeatProbability: number;
  maxParallelShadows: number;
  defaultShadowTimeoutSeconds: number;
  defaultShadowModel: string | null;
}
