import { describe, expect, it } from "vitest";
import { decideHeartbeat, matchesModel } from "../src/scheduler.js";
import type { ShadowDefinition } from "../src/types.js";

function shadow(partial: Partial<ShadowDefinition> & { id: string }): ShadowDefinition {
  return {
    name: partial.id,
    enabled: partial.enabled ?? true,
    activationProbability: partial.activationProbability ?? 0.3,
    activeForModels: partial.activeForModels ?? ["*"],
    tools: partial.tools ?? [],
    prompt: "prompt",
    filePath: `${partial.id}.md`,
    ...partial,
  };
}

/** Deterministic PRNG stream for reproducible trials. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

describe("decideHeartbeat", () => {
  it("returns no activations when the heartbeat roll misses", () => {
    const decision = decideHeartbeat({
      heartbeatProbability: 0.5,
      availableSlots: 2,
      shadows: [shadow({ id: "a", activationProbability: 1 })],
      activeShadowIds: new Set(),
      mainModelId: "m",
      random: sequence([0.9]),
    });
    expect(decision.activated).toEqual([]);
    expect(decision.heartbeatRoll).toBe(0.9);
  });

  it("returns no activations without available slots", () => {
    const decision = decideHeartbeat({
      heartbeatProbability: 1,
      availableSlots: 0,
      shadows: [shadow({ id: "a", activationProbability: 1 })],
      activeShadowIds: new Set(),
      mainModelId: "m",
      random: sequence([0.1]),
    });
    expect(decision.activated).toEqual([]);
  });

  it("filters by the main model and running exclusion", () => {
    const decision = decideHeartbeat({
      heartbeatProbability: 1,
      availableSlots: 3,
      shadows: [
        shadow({ id: "a", activeForModels: ["other/model"] }),
        shadow({ id: "b", activationProbability: 1 }),
        shadow({ id: "c", activationProbability: 1 }),
      ],
      activeShadowIds: new Set(["c"]),
      mainModelId: "main/model",
      random: sequence([0.0, 0.0]),
    });
    expect(decision.activated.map(({ shadow }) => shadow.id)).toEqual(["b"]);
    expect(decision.modelFiltered).toEqual(["a"]);
    expect(decision.runningExcluded).toEqual(["c"]);
  });

  it("caps activations at the available slot count", () => {
    const decision = decideHeartbeat({
      heartbeatProbability: 1,
      availableSlots: 1,
      shadows: [
        shadow({ id: "a", activationProbability: 1 }),
        shadow({ id: "b", activationProbability: 1 }),
      ],
      activeShadowIds: new Set(),
      mainModelId: "m",
      // Rolls: heartbeat hit, then per-shadow rolls (all hit), then shuffles.
      random: sequence([0.0, 0.0, 0.0, 0.0]),
    });
    expect(decision.activated).toHaveLength(1);
  });

  it("skips disabled shadows", () => {
    const decision = decideHeartbeat({
      heartbeatProbability: 1,
      availableSlots: 2,
      shadows: [shadow({ id: "a", enabled: false, activationProbability: 1 })],
      activeShadowIds: new Set(),
      mainModelId: "m",
      random: sequence([0.0]),
    });
    expect(decision.activated).toEqual([]);
  });

  it("uses Math.random when no PRNG is supplied", () => {
    const decision = decideHeartbeat({
      heartbeatProbability: 0,
      availableSlots: 1,
      shadows: [shadow({ id: "a" })],
      activeShadowIds: new Set(),
      mainModelId: "m",
    });
    expect(decision.heartbeatRoll).toBeGreaterThanOrEqual(0);
  });
});

describe("matchesModel", () => {
  it("matches the wildcard and exact ids", () => {
    expect(matchesModel(shadow({ id: "a", activeForModels: ["*"] }), "x/y")).toBe(true);
    expect(matchesModel(shadow({ id: "a", activeForModels: ["x/y"] }), "x/y")).toBe(true);
    expect(matchesModel(shadow({ id: "a", activeForModels: ["x/y"] }), "z/w")).toBe(false);
  });
});