import { describe, expect, it } from "vitest";
import { serializeTrajectory } from "../src/trajectory.js";
import type { TrajectoryEventLike } from "../src/trajectory.js";

function event(partial: TrajectoryEventLike): TrajectoryEventLike {
  return { type: partial.type, data: partial.data };
}

function userEvent(text: string, kind = "user"): TrajectoryEventLike {
  return event({ type: "user/message", data: { role: "user", content: [{ type: "text", text }], source: { kind } } });
}

function assistantEvent(blocks: unknown[]): TrajectoryEventLike {
  return event({
    type: "assistant/message",
    data: {
      turn: 1,
      step: 1,
      message: {
        role: "assistant",
        content: blocks,
        source: { kind: "model", provider: "p", model: "m" },
      },
    },
  });
}

function toolCall(id: string, name: string, args: string): unknown {
  return { type: "tool-call", id, name, arguments: args };
}

function toolResultEvent(callId: string, name: string, text: string, isError = false): TrajectoryEventLike {
  return event({
    type: "tool/result",
    data: {
      turn: 1,
      step: 1,
      message: {
        role: "user",
        content: [{ type: "tool-result", toolCallId: callId, content: [{ type: "text", text }], isError }],
        source: { kind: "tool", callId },
      },
    },
  });
}

describe("serializeTrajectory", () => {
  it("flattens user and assistant text into labeled lines", () => {
    const text = serializeTrajectory([
      userEvent("design a permission system"),
      assistantEvent([{ type: "text", text: "Let me check the current code." }]),
    ]);
    expect(text).toContain("USER: design a permission system");
    expect(text).toContain("MAIN: Let me check the current code.");
  });

  it("labels plugin-injected context as CONTEXT", () => {
    const text = serializeTrajectory([userEvent("<system-reminder>follow rules</system-reminder>", "plugin")]);
    expect(text).toContain("CONTEXT: <system-reminder>follow rules</system-reminder>");
    expect(text).not.toContain("USER:");
  });

  it("correlates tool calls with summarized results on one line", () => {
    const text = serializeTrajectory([
      assistantEvent([toolCall("call_1", "read", '{"path":"src/auth.ts"}')]),
      toolResultEvent("call_1", "read", "line one\nline two"),
    ]);
    expect(text).toContain("TOOL: read({ path: [redacted] }) · 2 lines · line one");
    expect(text).not.toContain("TOOL RESULT:");
  });

  it("skips reasoning blocks but keeps surrounding text", () => {
    const text = serializeTrajectory([
      assistantEvent([
        { type: "reasoning", text: "internal deliberation" },
        { type: "text", text: "Visible answer." },
      ]),
    ]);
    expect(text).toContain("MAIN: Visible answer.");
    expect(text).not.toContain("internal deliberation");
  });

  it("emits a standalone TOOL RESULT line for an uncorrelated result", () => {
    const text = serializeTrajectory([toolResultEvent("orphan", "grep", "a.ts:1: hit")]);
    expect(text).toContain("TOOL RESULT:");
    // No matching tool-call in the window means no tool name; the generic
    // content description is shown instead.
    expect(text).toContain("text");
  });

  it("renders an empty list as an empty string", () => {
    expect(serializeTrajectory([])).toBe("");
  });

  it("ignores non-text blocks and malformed events without throwing", () => {
    const text = serializeTrajectory([
      userEvent("hi"),
      { type: "assistant/message", data: { message: { content: "not-an-array" } } },
      { type: "unknown/event", data: { anything: true } },
    ]);
    expect(text).toBe("USER: hi");
  });
});