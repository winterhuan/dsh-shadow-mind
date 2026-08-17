import { describe, expect, it } from "vitest";
import { parseShadowMarkdown } from "../src/registry.js";
import { serializeShadow } from "../src/entity-store.js";

describe("parseShadowMarkdown", () => {
  it("parses frontmatter and body", () => {
    const source = [
      "---",
      "id: reviewer",
      "name: Grounded Checker",
      "enabled: false",
      "activation_probability: 0.6",
      "run_with_model: openai/gpt-5-mini",
      "timeout_seconds: 42",
      "tools:",
      "  - read",
      "  - grep",
      "  - read",
      "---",
      "",
      "Check claims against the workspace.",
    ].join("\n");
    const shadow = parseShadowMarkdown(source, "/tmp/reviewer.md");
    expect(shadow.id).toBe("reviewer");
    expect(shadow.name).toBe("Grounded Checker");
    expect(shadow.enabled).toBe(false);
    expect(shadow.activationProbability).toBe(0.6);
    expect(shadow.runWithModel).toBe("openai/gpt-5-mini");
    expect(shadow.timeoutSeconds).toBe(42);
    expect(shadow.tools).toEqual(["read", "grep"]); // deduplicated, order kept
    expect(shadow.prompt).toBe("Check claims against the workspace.");
    expect(shadow.filePath).toBe("/tmp/reviewer.md");
  });

  it("derives id from the file name and applies defaults", () => {
    const shadow = parseShadowMarkdown("---\nname: x\n---\n\nDo work.\n", "/tmp/derived-id.md");
    expect(shadow.id).toBe("derived-id");
    expect(shadow.enabled).toBe(true);
    expect(shadow.activationProbability).toBe(0.3);
    expect(shadow.activeForModels).toEqual(["*"]);
    expect(shadow.tools).toEqual([]);
  });

  it("rejects source without frontmatter", () => {
    expect(() => parseShadowMarkdown("no frontmatter\n", "/tmp/a.md")).toThrow(/frontmatter/);
  });

  it("rejects an invalid id", () => {
    expect(() => parseShadowMarkdown("---\nid: Bad ID!\n---\n\nx\n", "/tmp/a.md")).toThrow(/id must match/);
  });

  it("rejects an empty prompt body", () => {
    expect(() => parseShadowMarkdown("---\nid: a\n---\n\n   \n", "/tmp/a.md")).toThrow(/prompt/);
  });

  it("rejects an out-of-range activation probability", () => {
    expect(() =>
      parseShadowMarkdown("---\nid: a\nactivation_probability: 1.5\n---\n\nx\n", "/tmp/a.md"),
    ).toThrow(/between 0 and 1/);
  });

  it("serializeShadow round-trips through parseShadowMarkdown", () => {
    const source = serializeShadow({
      id: "keeper",
      name: "Requirement Keeper",
      activationProbability: 0.2,
      activeForModels: ["*"],
      runWithModel: "openai/gpt-5-mini",
      thinkingLevel: "low",
      timeoutSeconds: 90,
      tools: ["read"],
      prompt: "Keep requirements.",
    });
    const parsed = parseShadowMarkdown(source, "/tmp/keeper.md");
    expect(parsed.id).toBe("keeper");
    expect(parsed.name).toBe("Requirement Keeper");
    expect(parsed.activationProbability).toBe(0.2);
    expect(parsed.runWithModel).toBe("openai/gpt-5-mini");
    expect(parsed.thinkingLevel).toBe("low");
    expect(parsed.timeoutSeconds).toBe(90);
    expect(parsed.tools).toEqual(["read"]);
    expect(parsed.prompt).toBe("Keep requirements.");
  });
});