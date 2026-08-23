/**
 * Client bundle tests: materialize dist/client.js exactly like the web
 * shell's ModuleLoader, then drive apply() against a mock client context to
 * verify the Remote mount, the status slots, and the settings-page card.
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

/** Runtime-client face materialized like the shell module table would. */
function runtimeClientFace(): Record<string, unknown> {
  const local = createRequire(import.meta.url);
  const source = readFileSync(
    local.resolve("@deepseek-ai/dsh-client-runtime/package.json").replace(/package\.json$/, "lib/client.js"),
    "utf8",
  );
  let exports: Record<string, unknown> = {};
  const treeExternal = (specifier: string): unknown => {
    if (specifier === "@deepseek-ai/cordis" || specifier === "@deepseek-ai/dsh-client-ui-slots") {
      return local(specifier);
    }
    if (specifier === "react" || specifier === "react/jsx-runtime") return local(specifier);
    throw new Error(`runtime external not shimmed: ${specifier}`);
  };
  new Function("window", source)({
    __ModuleLoader__: { load: (value: { factory: (r: (s: string) => unknown) => Record<string, unknown> }) => {
      Object.assign(exports, value.factory(treeExternal));
    } },
  });
  return exports;
}

const requireShim = (specifier: string): unknown => {
  const local = createRequire(import.meta.url);
  if (specifier === "react" || specifier === "react/jsx-runtime") {
    return local(specifier);
  }
  if (specifier === "@deepseek-ai/dsh-client-runtime/client") {
    return runtimeClientFace();
  }
  throw new Error(`client bundle requires unexpected external: ${specifier}`);
};

/** Materialize the bundle and return its exports. */
function loadBundle(): { apply: (ctx: unknown) => Promise<void>; inject: string[] } {
  const source = readFileSync(bundlePath, "utf8");
  expect(source.startsWith("window.__ModuleLoader__.load(")).toBe(true);
  let entry: { factory: (require: (s: string) => unknown) => { apply: (ctx: unknown) => Promise<void>; inject: string[] } } | undefined;
  const window = {
    __ModuleLoader__: {
      load: (value: typeof entry) => {
        entry = value;
      },
    },
  };
  new Function("window", source)(window);
  expect(entry).toBeDefined();
  return entry!.factory(requireShim);
}

describe.skipIf(!built)("client bundle", () => {
  it("materializes under the ModuleLoader contract and exports apply/inject", () => {
    const exported = loadBundle();
    expect(typeof exported.apply).toBe("function");
    expect(exported.inject).toEqual(
      expect.arrayContaining(["slots", "remote", "settingsScope"]),
    );
  });

  it("mounts the shadowMind namespace and registers both status slots", async () => {
    const exported = loadBundle();

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
      settingsScope: {
        bind: () => ({
          getSnapshot: () => ({ status: "unavailable" as const, value: undefined, base: undefined, user: undefined, revision: undefined, writable: false, mode: "memory" as const }),
          subscribe: () => () => {},
          set: async () => {},
          unset: async () => {},
        }),
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
      if (entry2.opts.name === "settings.plugin.item") {
        expect(entry2.opts.key).toBe("shadow-mind");
      } else {
        expect(entry2.opts.id).toBe("shadow-mind");
      }
      expect(typeof entry2.comp).toBe("function");
    }

    stopSnapshotPolling();
  });

  it("registers the settings card keyed by the shadow-mind namespace", async () => {
    const exported = loadBundle();
    const registered: Array<{ opts: Record<string, unknown>; comp: unknown }> = [];
    const ctx = {
      remote: { $mount: async () => async () => {} },
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
      settingsScope: {
        bind: () => ({
          getSnapshot: () => ({ status: "ready" as const, value: {}, base: {}, user: {}, revision: 1, writable: true, mode: "host" as const }),
          subscribe: () => () => {},
          set: async () => {},
          unset: async () => {},
        }),
      },
      effect: () => {},
    };
    await exported.apply(ctx as never);
    const cardEntry = registered.find((entry2) => entry2.opts.name === "settings.plugin.item");
    expect(cardEntry).toBeDefined();
    expect(cardEntry!.opts.key).toBe("shadow-mind");
    expect(typeof cardEntry!.comp).toBe("function");
    // The injected face carries the snapshot hook plus the four form actions.
    const face = (cardEntry!.opts.inject as () => Record<string, unknown>)();
    expect(Object.keys(face.hooks as Record<string, unknown>)).toContain("shadowSettingsCard");
    for (const action of ["edit", "resetField", "save", "discard"]) {
      expect(typeof face[action]).toBe("function");
    }
  });
});
