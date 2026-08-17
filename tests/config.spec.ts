import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigStore, DEFAULT_CONFIG, parseConfig, serializeConfig } from "../src/config.js";

const tempDirs: string[] = [];

async function tempAgentDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "shadow-config-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("parseConfig", () => {
  it("applies defaults for omitted fields", () => {
    const config = parseConfig({});
    expect(config.heartbeatProbability).toBe(DEFAULT_CONFIG.heartbeatProbability);
    expect(config.maxParallelShadows).toBe(DEFAULT_CONFIG.maxParallelShadows);
    expect(config.defaultShadowTimeoutSeconds).toBe(DEFAULT_CONFIG.defaultShadowTimeoutSeconds);
    expect(config.defaultThinkingLevel).toBe(DEFAULT_CONFIG.defaultThinkingLevel);
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

  it("rejects a negative result_batch_window_ms", () => {
    expect(() => parseConfig({ result_batch_window_ms: -1 })).toThrow(/non-negative/);
  });

  it("serializeConfig round-trips through parseConfig", () => {
    const config = parseConfig({
      heartbeat_probability: 0.25,
      max_parallel_shadows: 3,
      default_shadow_timeout_seconds: 60,
      headless_drain_timeout_seconds: 10,
      result_batch_window_ms: 100,
      default_shadow_model: "openai/gpt-5-mini",
      default_thinking_level: "high",
      random_seed: 7,
    });
    expect(parseConfig(JSON.parse(serializeConfig(config)))).toEqual(config);
  });
});

describe("ConfigStore", () => {
  it("initializes with the default config when no file exists", async () => {
    const store = new ConfigStore(await tempAgentDir());
    await store.initialize();
    expect(store.current).toEqual(DEFAULT_CONFIG);
    expect(store.error).toBeUndefined();
  });

  it("keeps the last good config when the file becomes invalid", async () => {
    const dir = await tempAgentDir();
    const store = new ConfigStore(dir);
    await store.initialize();
    const { writeFile } = await import("node:fs/promises");
    await writeFile(store.configPath, "{ not json", "utf8");
    const { error } = await store.reload();
    expect(error).toBeDefined();
    expect(store.current).toEqual(DEFAULT_CONFIG);
  });

  it("writeConfig validates the merged result and persists it", async () => {
    const store = new ConfigStore(await tempAgentDir());
    await store.initialize();
    const config = await store.writeConfig({ heartbeat_probability: 0.9, max_parallel_shadows: 5 });
    expect(config.heartbeatProbability).toBe(0.9);
    expect(config.maxParallelShadows).toBe(5);
    expect(JSON.parse(await readFile(store.configPath, "utf8"))).toMatchObject({
      heartbeat_probability: 0.9,
      max_parallel_shadows: 5,
    });
  });

  it("writeConfig rejects an invalid patch without touching the file", async () => {
    const dir = await tempAgentDir();
    const store = new ConfigStore(dir);
    await store.initialize();
    const before = await readFile(store.configPath, "utf8");
    await expect(store.writeConfig({ heartbeat_probability: 7 })).rejects.toThrow(/between 0 and 1/);
    expect(await readFile(store.configPath, "utf8")).toBe(before);
    expect(store.current).toEqual(DEFAULT_CONFIG);
  });
});