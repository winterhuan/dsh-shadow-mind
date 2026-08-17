import { describe, expect, it } from "vitest";
import { summarizeToolCall, summarizeToolResult } from "../src/summaries.js";

describe("summarizeToolCall", () => {
  it("redacts argument values while keeping the keys", () => {
    expect(summarizeToolCall("read", { path: "src/auth.ts" })).toBe("read({ path: [redacted] })");
    expect(summarizeToolCall("grep", { query: "UserRole", include: "*.ts" })).toBe(
      "grep({ query: [redacted], include: [redacted] })",
    );
  });

  it("parses the raw JSON-string arguments produced by DSH tool-call blocks", () => {
    expect(summarizeToolCall("read", '{"path":"src/auth.ts"}')).toBe("read({ path: [redacted] })");
  });

  it("falls back to the bare name for absent or unparseable arguments", () => {
    expect(summarizeToolCall("read", undefined)).toBe("read()");
    expect(summarizeToolCall("read", "not-json")).toBe("read()");
    expect(summarizeToolCall("read", {})).toBe("read()");
  });
});

describe("summarizeToolResult", () => {
  it("summarizes a read result by line count with a preview", () => {
    const summary = summarizeToolResult({
      toolName: "read",
      content: [{ type: "text", text: "line one\nline two" }],
    });
    expect(summary).toBe("2 lines · line one");
  });

  it("summarizes grep matches by count", () => {
    const summary = summarizeToolResult({
      toolName: "grep",
      content: [{ type: "text", text: "a.ts:1: match\nb.ts:2: match" }],
    });
    expect(summary).toMatch(/^2 matches/);
  });

  it("falls back to a generic description for unknown tools", () => {
    const summary = summarizeToolResult({
      toolName: "shell",
      content: [{ type: "text", text: "ok" }],
    });
    expect(summary).toContain("text");
  });

  it("prefixes errors", () => {
    const summary = summarizeToolResult({
      toolName: "read",
      content: [{ type: "text", text: "boom" }],
      isError: true,
    });
    expect(summary).toMatch(/^error/);
  });

  it("handles an empty result", () => {
    expect(summarizeToolResult({ toolName: "read", content: [] })).toBe("0 lines");
  });
});