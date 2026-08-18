/**
 * Host-face Typert manifest for the Shadow Mind remote service.
 *
 * Discovered by `@deepseek-ai/dsh-typert-loader` via the `./typert` package
 * export: when the plugin entry mounts, the loader imports this file and calls
 * `ctx.typert.register(manifest)`. The strict DescriptorStore entry for
 * `shadowMind/snapshot` makes the API Gateway claim `/api/shadowMind/snapshot`
 * through generated reflection — independent of SRC marker module identity, so
 * it works across the repo/install module-instance split.
 *
 * The descriptor mirrors the hand-written client contribution in
 * `src/client/protocol.ts` (same id, namespace, invocation shape). Codecs are
 * strict per loader policy; `looseObject` keeps unknown fields intact so
 * forward-compatible snapshot fields survive boundary validation.
 */
import { z } from "zod";

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
  configError: z.string().nullable(),
  heartbeatProbability: z.number(),
  maxParallelShadows: z.number(),
  defaultShadowTimeoutSeconds: z.number(),
  defaultShadowModel: z.string().nullable(),
});

export const TYPERT = {
  package: "@winterchenhuan/dsh-shadow-mind",
  face: "host",
  model: { services: [], events: [], objects: [] },
  schemas: [],
  invocations: [
    {
      id: "@winterchenhuan/dsh-shadow-mind#shadowMind/snapshot",
      service: "shadowMind",
      namespace: "shadowMind",
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
