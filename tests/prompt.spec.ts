import { describe, expect, it } from "vitest";
import { buildShadowPrompt } from "../src/shadow-runner.js";
import type { ShadowDefinition } from "../src/types.js";

const shadow: ShadowDefinition = {
  id: "reviewer",
  name: "Reviewer",
  enabled: true,
  activationProbability: 0.5,
  activeForModels: ["*"],
  tools: ["read"],
  prompt: "Check the facts.",
  filePath: "/tmp/reviewer.md",
};

describe("buildShadowPrompt", () => {
  it("embeds the shadow definition and the sanitized trajectory", () => {
    const prompt = buildShadowPrompt(shadow, "USER: do x\nMAIN: done");
    expect(prompt).toContain("You are a Shadow Mind: Reviewer.");
    expect(prompt).toContain("Check the facts.");
    expect(prompt).toContain("<main-agent-trajectory>\nUSER: do x\nMAIN: done\n</main-agent-trajectory>");
  });

  it("marks an empty trajectory instead of leaking a bare placeholder", () => {
    const prompt = buildShadowPrompt(shadow, "   ");
    expect(prompt).toContain(" (empty)");
    expect(prompt).not.toContain("<empty-trajectory>");
  });
});