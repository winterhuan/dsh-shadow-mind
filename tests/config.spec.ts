import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  SHADOW_CONFIG_SCHEMA,
  legacyConfigPatch,
  parseConfig,
  serializeConfig,
} from "../src/config.js";

/** Resolve the section schema exactly as the settings provider does. */
function resolveSchema(section: Record<string, unknown>): Record<string, unknown> {
  return (SHADOW_CONFIG_SCHEMA as unknown as (input: Record<string, unknown>) => Record<string, unknown>)(section);
}

describe("parseConfig (legacy config.json body)", () => {
  it("applies defaults for omitted fields", () => {
    const config = parseConfig({});
    expect(config.heartbeatProbability).toBe(DEFAULT_CONFIG.heartbeatProbability);
    expect(config.maxParallelShadows).toBe(DEFAULT_CONFIG.maxParallelShadows);
    expect(config.defaultShadowTimeoutSeconds).toBe(DEFAULT_CONFIG.defaultShadowTimeoutSeconds);
    expect(config.headlessDrainTimeoutSeconds).toBe(DEFAULT_CONFIG.headlessDrainTimeoutSeconds);
    expect(config.resultBatchWindowMs).toBe(DEFAULT_CONFIG.resultBatchWindowMs);
    expect(config.defaultThinkingLevel).toBe("low");
    expect(config.defaultShadowModel).toBeUndefined();
    expect(config.randomSeed).toBeUndefined();
  });

  it("parses valid values and keeps unknown keys out", () => {
    const config = parseConfig({
      heartbeat_probability: 0.5,
      max_parallel_shadows: 4,
      default_shadow_model: "openai/gpt-5-mini",
      random_seed: 123,
      some_unknown_key: true,
    });
    expect(config.heartbeatProbability).toBe(0.5);
    expect(config.maxParallelShadows).toBe(4);
    expect(config.defaultShadowModel).toBe("openai/gpt-5-mini");
    expect(config.randomSeed).toBe(123);
    expect("some_unknown_key" in config).toBe(false);
  });

  it("rejects out-of-range heartbeat probability", () => {
    expect(() => parseConfig({ heartbeat_probability: 1.5 })).toThrow(/between 0 and 1/);
  });

  it("rejects a non-integer max_parallel_shadows", () => {
    expect(() => parseConfig({ max_parallel_shadows: 2.5 })).toThrow(/integer/);
  });

  it("rejects a negative result_batch_window_ms and a negative drain timeout", () => {
    expect(() => parseConfig({ result_batch_window_ms: -1 })).toThrow(/non-negative integer/);
    expect(() => parseConfig({ headless_drain_timeout_seconds: -5 })).toThrow(/non-negative number/);
  });

  it("rejects an unknown thinking level", () => {
    expect(() => parseConfig({ default_thinking_level: "ultra" })).toThrow(/minimal, low, medium, high/);
  });

  it("rejects a non-object body", () => {
    expect(() => parseConfig("[1,2]")).toThrow(/JSON object/);
    expect(() => legacyConfigPatch(null)).toThrow(/JSON object/);
  });
});

describe("legacyConfigPatch", () => {
  it("maps present snake_case keys to camelCase settings fields", () => {
    const patch = legacyConfigPatch({
      heartbeat_probability: 0.25,
      max_parallel_shadows: 3,
      default_shadow_model: "openai/gpt-5-mini",
      default_thinking_level: "high",
      random_seed: 7,
    });
    expect(patch).toEqual({
      heartbeatProbability: 0.25,
      maxParallelShadows: 3,
      defaultShadowModel: "openai/gpt-5-mini",
      defaultThinkingLevel: "high",
      randomSeed: 7,
    });
  });

  it("omits absent keys so unset optional fields stay unset", () => {
    const patch = legacyConfigPatch({ heartbeat_probability: 0.6 });
    expect(patch).toEqual({ heartbeatProbability: 0.6 });
  });

  it("emits nothing for an empty body", () => {
    expect(legacyConfigPatch({})).toEqual({});
  });

  it("rejects an out-of-bounds legacy value with its key in the message", () => {
    expect(() => legacyConfigPatch({ heartbeat_probability: 7 })).toThrow(/heartbeat_probability/);
  });
});

describe("SHADOW_CONFIG_SCHEMA (settings section)", () => {
  it("resolves schema defaults for a stored empty section", () => {
    const resolved = resolveSchema({});
    expect(resolved.heartbeatProbability).toBeCloseTo(1 / 3);
    expect(resolved.maxParallelShadows).toBe(2);
    expect(resolved.defaultShadowTimeoutSeconds).toBe(300);
    expect(resolved.headlessDrainTimeoutSeconds).toBe(120);
    expect(resolved.resultBatchWindowMs).toBe(400);
    expect(resolved.defaultThinkingLevel).toBe("low");
    expect(resolved.defaultShadowModel).toBeUndefined();
    expect(resolved.randomSeed).toBeUndefined();
  });

  it("keeps user values and rejects boundary violations", () => {
    const resolved = resolveSchema({ heartbeatProbability: 0.8 });
    expect(resolved.heartbeatProbability).toBe(0.8);
    expect(() => resolveSchema({ heartbeatProbability: 3 })).toThrow();
    expect(() => resolveSchema({ maxParallelShadows: 9 })).toThrow();
    expect(() => resolveSchema({ defaultThinkingLevel: "ultra" })).toThrow();
  });

  it("round-trips serializeConfig output through the schema shape", () => {
    const resolved = resolveSchema({
      heartbeatProbability: 0.25,
      maxParallelShadows: 3,
      defaultShadowModel: "",
      defaultThinkingLevel: "medium",
      randomSeed: 7,
    });
    const text = serializeConfig(resolved as never);
    expect(JSON.parse(text)).toMatchObject({
      heartbeatProbability: 0.25,
      maxParallelShadows: 3,
      defaultThinkingLevel: "medium",
      randomSeed: 7,
    });
    expect(JSON.parse(text)).not.toHaveProperty("defaultShadowModel");
  });
});
