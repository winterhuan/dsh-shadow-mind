import z from "@deepseek-ai/schemastery";
import type { ShadowConfig } from "./types.js";
import { inRange, isFiniteNumber, isNonEmptyString } from "./validation.js";

const THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const;

export const DEFAULT_CONFIG: ShadowConfig = {
  heartbeatProbability: 1 / 3,
  maxParallelShadows: 2,
  defaultShadowTimeoutSeconds: 300,
  headlessDrainTimeoutSeconds: 120,
  resultBatchWindowMs: 400,
  defaultThinkingLevel: "low",
};

/**
 * Settings-section schema for the `shadow-mind` namespace. Field keys are the
 * section's user-layer keys in `settings.yaml`; a defaulted field always
 * resolves, while `defaultShadowModel` / `randomSeed` stay default-less
 * because an absent key means "unset" (no model override, unseeded RNG) —
 * something a defaulted field could not express.
 */
export const SHADOW_CONFIG_SCHEMA = z.object({
  heartbeatProbability: z.number().min(0).max(1).default(DEFAULT_CONFIG.heartbeatProbability),
  maxParallelShadows: z.number().step(1).min(1).max(8).default(DEFAULT_CONFIG.maxParallelShadows),
  defaultShadowTimeoutSeconds: z.number().min(1).default(DEFAULT_CONFIG.defaultShadowTimeoutSeconds),
  headlessDrainTimeoutSeconds: z.number().min(0).default(DEFAULT_CONFIG.headlessDrainTimeoutSeconds),
  resultBatchWindowMs: z.number().step(1).min(0).default(DEFAULT_CONFIG.resultBatchWindowMs),
  defaultShadowModel: z.string(),
  defaultThinkingLevel: z.union([...THINKING_LEVELS]).default("low"),
  randomSeed: z.number().step(1).min(0).max(0xffff_ffff),
});

export type ShadowConfigSchema = typeof SHADOW_CONFIG_SCHEMA;

/** Legacy `config.json` snake_case key -> settings camelCase field. */
export const LEGACY_CONFIG_KEYS: Readonly<Record<string, keyof ShadowConfig & string>> = {
  heartbeat_probability: "heartbeatProbability",
  max_parallel_shadows: "maxParallelShadows",
  default_shadow_timeout_seconds: "defaultShadowTimeoutSeconds",
  headless_drain_timeout_seconds: "headlessDrainTimeoutSeconds",
  result_batch_window_ms: "resultBatchWindowMs",
  default_shadow_model: "defaultShadowModel",
  default_thinking_level: "defaultThinkingLevel",
  random_seed: "randomSeed",
};

/**
 * Map one legacy `config.json` body onto a camelCase settings patch. Only
 * fields present in the raw object are emitted; values are validated by
 * {@link parseConfig}, so an out-of-bounds legacy value rejects with its key.
 * @param raw - parsed legacy JSON body.
 * @returns a partial patch over the settings section's camelCase fields.
 */
export function legacyConfigPatch(raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("config must be a JSON object");
  }
  const value = raw as Record<string, unknown>;
  const resolved = parseConfig(value);
  const patch: Record<string, unknown> = {};
  for (const [legacyKey, field] of Object.entries(LEGACY_CONFIG_KEYS)) {
    if (value[legacyKey] === undefined) continue;
    patch[field] = resolved[field];
  }
  return patch;
}

/**
 * Validate one legacy `config.json` body and resolve it to a full config.
 * Kept for the one-time migration import; the live configuration resolves
 * through the settings schema instead.
 */
export function parseConfig(input: unknown): ShadowConfig {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("config must be a JSON object");
  }
  const value = input as Record<string, unknown>;
  const probability = numberInRange(value.heartbeat_probability, 0, 1, DEFAULT_CONFIG.heartbeatProbability, "heartbeat_probability");
  const parallel = positiveInteger(value.max_parallel_shadows, DEFAULT_CONFIG.maxParallelShadows, "max_parallel_shadows");
  const timeout = positiveNumber(value.default_shadow_timeout_seconds, DEFAULT_CONFIG.defaultShadowTimeoutSeconds, "default_shadow_timeout_seconds");
  const drainTimeout = nonNegativeNumber(value.headless_drain_timeout_seconds, DEFAULT_CONFIG.headlessDrainTimeoutSeconds, "headless_drain_timeout_seconds");
  const windowMs = nonNegativeInteger(value.result_batch_window_ms, DEFAULT_CONFIG.resultBatchWindowMs, "result_batch_window_ms");
  const model = optionalNonEmptyString(value.default_shadow_model, "default_shadow_model");
  const randomSeed = optionalSeed(value.random_seed);
  const thinking = value.default_thinking_level ?? DEFAULT_CONFIG.defaultThinkingLevel;
  if (typeof thinking !== "string" || !THINKING_LEVELS.includes(thinking as (typeof THINKING_LEVELS)[number])) {
    throw new Error("default_thinking_level must be one of minimal, low, medium, high");
  }
  return {
    heartbeatProbability: probability,
    maxParallelShadows: parallel,
    defaultShadowTimeoutSeconds: timeout,
    headlessDrainTimeoutSeconds: drainTimeout,
    resultBatchWindowMs: windowMs,
    defaultShadowModel: model,
    defaultThinkingLevel: thinking as ShadowConfig["defaultThinkingLevel"],
    randomSeed,
  };
}

/** Render the effective config as the `read_shadow_config` tool's text body. */
export function serializeConfig(config: ShadowConfig): string {
  return `${JSON.stringify({
    heartbeatProbability: config.heartbeatProbability,
    maxParallelShadows: config.maxParallelShadows,
    defaultShadowTimeoutSeconds: config.defaultShadowTimeoutSeconds,
    headlessDrainTimeoutSeconds: config.headlessDrainTimeoutSeconds,
    resultBatchWindowMs: config.resultBatchWindowMs,
    ...(config.defaultShadowModel ? { defaultShadowModel: config.defaultShadowModel } : {}),
    defaultThinkingLevel: config.defaultThinkingLevel,
    ...(config.randomSeed !== undefined ? { randomSeed: config.randomSeed } : {}),
  }, null, 2)}\n`;
}

function numberInRange(value: unknown, min: number, max: number, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!isFiniteNumber(value) || !inRange(value, min, max)) throw new Error(`${name} must be between ${min} and ${max}`);
  return value;
}

function positiveNumber(value: unknown, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!isFiniteNumber(value) || value <= 0) throw new Error(`${name} must be positive`);
  return value;
}

function nonNegativeNumber(value: unknown, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!isFiniteNumber(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  return value;
}

function positiveInteger(value: unknown, fallback: number, name: string): number {
  const parsed = positiveNumber(value, fallback, name);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

function nonNegativeInteger(value: unknown, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!isFiniteNumber(value) || !Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function optionalNonEmptyString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isNonEmptyString(value)) throw new Error(`${name} must be a non-empty string`);
  return value.trim();
}

function optionalSeed(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!isFiniteNumber(value) || !Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error("random_seed must be an integer between 0 and 4294967295");
  }
  return value;
}
