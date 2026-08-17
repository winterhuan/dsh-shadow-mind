import { describe, expect, it, vi } from "vitest";
import type { CommandInvocation } from "@deepseek-ai/dsh-commands";
import { ShadowCommands } from "../src/commands.js";

type Handler = (invocation: CommandInvocation) => Promise<{ kind: string; text: string }>;

function makeCommand() {
  const handlers = {
    onProbe: vi.fn(async () => "probe-result"),
    onListAgents: vi.fn(async () => "agents-result"),
    onList: vi.fn(async () => "list-result"),
    onClean: vi.fn(() => "clean-result"),
    onAuto: vi.fn(() => "auto-result"),
    onPause: vi.fn(() => "pause-result"),
    onResume: vi.fn(() => "resume-result"),
    onStatus: vi.fn(async () => "status-result"),
  };
  let handler: Handler | undefined;
  const register = vi.fn((def: { handler: Handler }) => {
    handler = def.handler;
    return () => {};
  });
  const commands = new ShadowCommands({} as never, {} as never, {} as never, handlers);
  commands.register({ register } as never);
  return { handler: () => handler, handlers };
}

function invocation(rawInput: string): CommandInvocation {
  return { rawInput, agent: { id: "main" } } as unknown as CommandInvocation;
}

describe("ShadowCommands probe routing", () => {
  it("routes `probe agents` to onListAgents", async () => {
    const { handler, handlers } = makeCommand();
    const result = await handler()!(invocation("probe agents"));
    expect(handlers.onListAgents).toHaveBeenCalledOnce();
    expect(handlers.onProbe).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "success", text: "agents-result" });
  });

  it("routes `probe <id>` to onProbe with the shadow id", async () => {
    const { handler, handlers } = makeCommand();
    const result = await handler()!(invocation("probe reviewer"));
    expect(handlers.onProbe).toHaveBeenCalledWith(expect.anything(), "reviewer", undefined);
    expect(result).toEqual({ kind: "success", text: "probe-result" });
  });

  it("routes `probe <id> <tools>` and splits the tool list", async () => {
    const { handler, handlers } = makeCommand();
    await handler()!(invocation("probe reviewer read,grep,glob"));
    expect(handlers.onProbe).toHaveBeenCalledWith(expect.anything(), "reviewer", ["read", "grep", "glob"]);
  });

  it("routes `probe` without arguments to onProbe with an undefined id", async () => {
    const { handler, handlers } = makeCommand();
    await handler()!(invocation("probe"));
    expect(handlers.onProbe).toHaveBeenCalledWith(expect.anything(), undefined, undefined);
  });
});
