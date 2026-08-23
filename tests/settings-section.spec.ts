import { mkdir, mkdtemp, rm, writeFile, rename, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import {
  attachSettingsSection,
  SHADOW_SETTINGS_NAMESPACE,
} from "../src/settings-section.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import type { ShadowConfig } from "../src/types.js";

const tempDirs: string[] = [];

async function tempAgentDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "shadow-settings-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Minimal in-memory scope mirroring the SettingsScope contract. */
function makeFakeScope() {
  const value: ShadowConfig = { ...DEFAULT_CONFIG };
  const watchers = new Set<() => void>();
  const scope = {
    get: () => ({ ...value }),
    watch: vi.fn((callback: () => void) => {
      watchers.add(callback);
      return () => watchers.delete(callback);
    }),
    update: vi.fn(async (patch: Record<string, unknown>) => {
      Object.assign(value, patch);
      for (const watcher of watchers) watcher();
    }),
    replace: vi.fn(async () => {}),
  };
  return scope;
}

interface InjectCall {
  deps: string[];
  callback: (settingsCtx: { settings: { register: () => unknown }; effect: (fn: () => () => void) => void }) => Promise<unknown>;
}

/**
 * Fake ctx whose inject captures the callback and runs it immediately
 * (settings service present) or never (absent), like the real fiber would.
 */
function makeCtx(options?: { withSettings?: boolean }) {
  const injectCalls: InjectCall[] = [];
  const disposers: Array<() => void> = [];
  const fakeScope = makeFakeScope();
  const ctx = {
    async inject(deps: string[], callback: InjectCall["callback"]) {
      injectCalls.push({ deps, callback });
      if (options?.withSettings === false) return undefined;
      return await callback({
        settings: { register: () => fakeScope },
        effect: (fn: () => () => void) => disposers.push(fn()),
      });
    },
  };
  return {
    ctx: ctx as unknown as Context,
    injectCalls,
    disposers,
    fakeScope,
  };
}

function makeHooks() {
  let source: (() => ShadowConfig) | undefined;
  const onChange = vi.fn();
  return {
    hooks: {
      setSource: (current: () => ShadowConfig) => { source = current; },
      onChange,
    },
    current: (): ShadowConfig | undefined => (source ? source() : undefined),
    onChange,
  };
}

describe("attachSettingsSection", () => {
  it("registers the namespace and switches the source to the scope", async () => {
    const dir = await tempAgentDir();
    const { ctx, injectCalls, fakeScope } = makeCtx();
    const { hooks, current, onChange } = makeHooks();
    const scope = await attachSettingsSection(ctx, dir, hooks);
    expect(scope).toBe(fakeScope);
    expect(injectCalls[0].deps).toEqual(["settings"]);
    expect(current()).toEqual(DEFAULT_CONFIG);
    // Registration notifies the consumer once after the source is live.
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("imports a legacy config.json into the user layer exactly once", async () => {
    const dir = await tempAgentDir();
    await mkdir(join(dir, "shadow-minds"), { recursive: true });
    const configPath = join(dir, "shadow-minds", "config.json");
    await writeFile(configPath, JSON.stringify({ heartbeat_probability: 0.6, max_parallel_shadows: 4 }), "utf8");
    const { ctx, fakeScope } = makeCtx();
    const { hooks, current } = makeHooks();
    await attachSettingsSection(ctx, dir, hooks);
    expect(fakeScope.update).toHaveBeenCalledWith({ heartbeatProbability: 0.6, maxParallelShadows: 4 });
    // File renamed aside so later boots cannot re-import stale values.
    await expect(readFile(configPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(`${configPath}.migrated`, "utf8")).toContain("heartbeat_probability");
    expect(current()?.heartbeatProbability).toBe(0.6);
  });

  it("renames an invalid legacy file aside and still attaches with defaults", async () => {
    const dir = await tempAgentDir();
    await mkdir(join(dir, "shadow-minds"), { recursive: true });
    const configPath = join(dir, "shadow-minds", "config.json");
    await writeFile(configPath, "{ not json", "utf8");
    const { ctx, fakeScope } = makeCtx();
    const { hooks, current } = makeHooks();
    const scope = await attachSettingsSection(ctx, dir, hooks);
    expect(scope).toBe(fakeScope);
    expect(fakeScope.update).not.toHaveBeenCalled();
    await expect(readFile(`${configPath}.migrated`, "utf8")).resolves.toContain("{ not json");
    expect(current()).toEqual(DEFAULT_CONFIG);
  });

  it("keeps the fallback source when no settings service exists", async () => {
    const dir = await tempAgentDir();
    const { ctx, injectCalls } = makeCtx({ withSettings: false });
    const { hooks, current, onChange } = makeHooks();
    const scope = await attachSettingsSection(ctx, dir, hooks);
    expect(scope).toBeUndefined();
    expect(injectCalls.length).toBe(1);
    expect(current()).toBeUndefined(); // source hook never fired; runtime keeps its own default
    expect(onChange).not.toHaveBeenCalled();
  });

  it("falls back to defaults when the section detaches", async () => {
    const dir = await tempAgentDir();
    const { ctx, disposers } = makeCtx();
    const { hooks, current } = makeHooks();
    await attachSettingsSection(ctx, dir, hooks);
    expect(current()).toBeDefined();
    for (const dispose of disposers) dispose();
    expect(current()).toEqual(DEFAULT_CONFIG);
  });

  it("propagates committed changes through watch to onChange", async () => {
    const dir = await tempAgentDir();
    const { ctx, fakeScope } = makeCtx();
    const { hooks, current, onChange } = makeHooks();
    await attachSettingsSection(ctx, dir, hooks);
    const callsBefore = onChange.mock.calls.length;
    await fakeScope.update({ heartbeatProbability: 0.9 });
    expect(onChange.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(current()?.heartbeatProbability).toBe(0.9);
  });

  it("uses the shadow-mind namespace name", async () => {
    expect(SHADOW_SETTINGS_NAMESPACE).toBe("shadow-mind");
  });
});
