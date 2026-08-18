/**
 * Client bundle tests: materialize dist/client.js exactly like the web
 * shell's ModuleLoader, then drive apply() against a mock client context to
 * verify the Remote mount and the two slot registrations.
 *
 * The bundle is produced by `npm run build:client`; the suite skips when the
 * built artifact is absent (e.g. a fresh clone before the first build).
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { stopSnapshotPolling } from "../src/client/snapshot-store.js";

const bundlePath = new URL("../dist/client.js", import.meta.url);
const built = existsSync(bundlePath);

const requireShim = (specifier: string): unknown => {
  const local = createRequire(import.meta.url);
  if (specifier === "react" || specifier === "react/jsx-runtime") {
    return local(specifier);
  }
  throw new Error(`client bundle requires unexpected external: ${specifier}`);
};

describe.skipIf(!built)("client bundle", () => {
  it("materializes under the ModuleLoader contract and exports apply/inject", () => {
    const source = readFileSync(bundlePath, "utf8");
    expect(source.startsWith("window.__ModuleLoader__.load(")).toBe(true);

    let entry: { factory: (require: (s: string) => unknown) => unknown } | undefined;
    const window = {
      __ModuleLoader__: {
        load: (value: typeof entry) => {
          entry = value;
        },
      },
    };
    new Function("window", source)(window);
    expect(entry).toBeDefined();
    const exported = entry!.factory(requireShim) as {
      apply: (ctx: unknown) => Promise<void>;
      inject: string[];
    };
    expect(typeof exported.apply).toBe("function");
    expect(exported.inject).toEqual(
      expect.arrayContaining(["slots", "remote"]),
    );
  });

  it("mounts the shadowMind namespace and registers both status slots", async () => {
    const source = readFileSync(bundlePath, "utf8");
    let entry: { factory: (require: (s: string) => unknown) => unknown } | undefined;
    const window = {
      __ModuleLoader__: {
        load: (value: typeof entry) => {
          entry = value;
        },
      },
    };
    new Function("window", source)(window);
    const exported = entry!.factory(requireShim) as {
      apply: (ctx: unknown) => Promise<void>;
    };

    let mounted: unknown;
    const registered: Array<{ opts: Record<string, unknown>; comp: unknown }> = [];
    const fakeSnapshot = {
      present: true,
      paused: false,
      autoEnabled: true,
      epoch: 1,
      activeCount: 2,
      running: [{ childId: "c1", shadowId: "grounded-reviewer", startedAt: Date.now(), timeoutMs: 120000 }],
      eventCount: 3,
      recentEvents: [{ at: new Date().toISOString(), kind: "started" }],
      shadows: [],
      diagnostics: [],
      configError: null,
      heartbeatProbability: 0.33,
      maxParallelShadows: 2,
      defaultShadowTimeoutSeconds: 120,
      defaultShadowModel: null,
    };
    const ctx = {
      remote: {
        $mount: async (contribution: unknown) => {
          mounted = contribution;
          return async () => {};
        },
        shadowMind: {
          snapshot: async () => ({ ok: true as const, value: fakeSnapshot }),
        },
      },
      slots: {
        inject: (_key: string, callback: () => unknown) => {
          const disposer = callback();
          return typeof disposer === "function" ? disposer : () => {};
        },
        register: (opts: Record<string, unknown>, comp: unknown) => {
          registered.push({ opts, comp });
          return () => {};
        },
      },
      effect: () => {},
    };

    await exported.apply(ctx as never);

    const contribution = mounted as { package: string; descriptors: Array<{ namespace: string; method: string }> };
    expect(contribution.package).toBe("@winterchenhuan/dsh-shadow-mind");
    expect(contribution.descriptors).toContainEqual(
      expect.objectContaining({ namespace: "shadowMind", method: "snapshot" }),
    );

    const names = registered.map((entry2) => entry2.opts.name);
    expect(names).toEqual(
      expect.arrayContaining(["conversation.input.left", "conversation.composer.dock"]),
    );
    for (const entry2 of registered) {
      expect(entry2.opts.id).toBe("shadow-mind");
      expect(typeof entry2.comp).toBe("function");
    }

    stopSnapshotPolling();
  });
});
