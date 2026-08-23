/**
 * Client half of the `shadowMind` Typert Remote.
 *
 * The host service (`ShadowMindRemote` in src/remote.ts) is claimed by the
 * Gateway through the strict host-face manifest in typert.host.js, which
 * `@deepseek-ai/dsh-typert-loader` registers on plugin mount. The client keeps
 * one hand-written descriptor (no parameters, strict result codec) plus
 * declaration merging into the protocol maps to mount the namespace and call
 * `ctx.remote.shadowMind.snapshot()`.
 *
 * The namespace service is created by this package's own `$mount` call, so it
 * must never appear in the client entry's `inject`: a Cordis fiber waits for
 * every injected service before apply runs, which would deadlock activation.
 *
 * The API Gateway's client half rejects any descriptor whose codecs are not
 * `{ mode: "strict", schema }` — a bare `src-json` result fails `$mount`, the
 * mount effect throws after `apply` returned, and the failing fiber disposes
 * the slot registrations with it. So this module carries its own zod mirror of
 * the host snapshot schema (looseObject, matching typert.host.js) to build a
 * genuine strict codec.
 */
import { z } from "zod";
import type {
  RemoteResult,
  TypertClientRemote,
  TypertRemoteContribution,
  TypertRemoteNamespace,
} from "@deepseek-ai/dsh-typert-protocol";
import type { ShadowMindSnapshot } from "./types.js";

declare module "@deepseek-ai/dsh-typert-protocol" {
  interface TypertRemoteMap {
    "shadowMind/snapshot": () => Promise<RemoteResult<ShadowMindSnapshot>>;
  }
  interface TypertRemoteNamespaceMap {
    shadowMind: TypertRemoteNamespace<"shadowMind">;
  }
}

/** Wire namespace of the host Shadow Mind remote service. */
export const SHADOW_MIND_NAMESPACE = "shadowMind" as const;

const runningSchema = z.looseObject({
  childId: z.string(),
  shadowId: z.string(),
  startedAt: z.number(),
  timeoutMs: z.number(),
});

const eventSchema = z.looseObject({
  at: z.string(),
  kind: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const shadowSummarySchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  activationProbability: z.number(),
  tools: z.array(z.string()),
});

const diagnosticSchema = z.looseObject({
  filePath: z.string(),
  message: z.string(),
});

/** Client-side mirror of the host `snapshotSchema` in typert.host.js. */
const snapshotSchema = z.looseObject({
  present: z.boolean(),
  paused: z.boolean(),
  autoEnabled: z.boolean(),
  epoch: z.number(),
  activeCount: z.number(),
  running: z.array(runningSchema),
  eventCount: z.number(),
  recentEvents: z.array(eventSchema),
  shadows: z.array(shadowSummarySchema),
  diagnostics: z.array(diagnosticSchema),
  heartbeatProbability: z.number(),
  maxParallelShadows: z.number(),
  defaultShadowTimeoutSeconds: z.number(),
  defaultShadowModel: z.string().nullable(),
});

/** Explicit contribution mounted through `ctx.remote.$mount`. */
export const SHADOW_MIND_CONTRIBUTION: TypertRemoteContribution = {
  package: "@winterchenhuan/dsh-shadow-mind",
  descriptors: [
    {
      id: "@winterchenhuan/dsh-shadow-mind#shadowMind/snapshot",
      service: SHADOW_MIND_NAMESPACE,
      namespace: SHADOW_MIND_NAMESPACE,
      method: "snapshot",
      invocation: { kind: "direct" },
      parameters: [],
      result: {
        mode: "strict",
        typeSymbol: "@winterchenhuan/dsh-shadow-mind/types#ShadowMindSnapshot",
        schema: snapshotSchema,
      },
    },
  ],
};

/**
 * Tolerant poller fetch: reads the namespace service through the strict
 * `ctx.get` instead of the property proxy, so an unmounted (or mid-remount)
 * `remote.shadowMind` resolves to the `RemoteResult` error branch rather than
 * throwing "cannot get property remote.shadowMind without inject" from a poll
 * tick. Requires no inject declaration, so it cannot participate in the
 * activation deadlock the dotted key would otherwise create.
 */
export function shadowMindSnapshotTolerant(ctx: {
  get(name: string): unknown;
}): Promise<RemoteResult<ShadowMindSnapshot>> {
  const namespace = ctx.get("remote.shadowMind") as
    | TypertClientRemote["shadowMind"]
    | undefined;
  if (namespace === undefined) {
    return Promise.resolve({
      ok: false,
      error: {
        code: "internal",
        message: "shadow-mind: remote.shadowMind namespace is not mounted",
        details: {},
      },
    });
  }
  return namespace.snapshot();
}
