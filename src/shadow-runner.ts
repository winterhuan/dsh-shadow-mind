import type { Agent } from "@deepseek-ai/dsh-agent";
import type { Context } from "@deepseek-ai/cordis";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import type { SubagentService } from "@deepseek-ai/dsh-subagent";
import type { ShadowDefinition } from "./types.js";
import { ShadowEventLog } from "./event-log.js";
import { serializeTrajectory } from "./trajectory.js";
import { DEFAULT_READ_TOOLS } from "./constants.js";

export interface ShadowLaunchResult {
  childId: string;
  messageId: string;
}

export interface ShadowLaunchOptions {
  /** Explicit tool allowlist; falls back to the shadow's or the default read tools. */
  tools?: string[];
  /** Plugin-level default shadow model (config `default_shadow_model`). */
  defaultModel?: string;
}

export class ShadowRunner {
  constructor(
    private readonly ctx: Context,
    private readonly eventLog: ShadowEventLog,
  ) {}

  async launch(agent: Agent, shadow: ShadowDefinition, options?: ShadowLaunchOptions): Promise<ShadowLaunchResult> {
    const subagents = this.ctx.get("subagents") as SubagentService | undefined;
    if (!subagents) {
      throw new Error("subagents service unavailable");
    }
    const providers = subagents.list();
    if (!providers.length) {
      throw new Error("no subagent provider registered");
    }

    const trajectory = await this.buildTrajectory(agent);
    const prompt = buildShadowPrompt(shadow, trajectory);
    const allow = options?.tools?.length
      ? options.tools
      : shadow.tools.length
        ? shadow.tools
        : [...DEFAULT_READ_TOOLS];
    const agentOptions = this.resolveAgentOptions(agent, shadow, options?.defaultModel);

    const spec = {
      provider: providers[0],
      label: `shadow-${shadow.id}`,
      request: {
        prompt: [{ type: "text", text: prompt }] as ContentBlock[],
        parent: agent,
        toolFilter: { allow },
        agentOptions,
      },
      signal: this.createSignal(),
    };

    this.eventLog.record("shadow:request", { shadowId: shadow.id, provider: providers[0], tools: allow, agentOptions });
    const started = await subagents.startContinuable(spec);
    return { childId: started.childId, messageId: started.messageId };
  }

  /**
   * Model selection: shadow's `run_with_model` → plugin `default_shadow_model`
   * → the current main agent's model. Returns `undefined` when nothing
   * resolvable exists (the child then inherits the harness default).
   */
  private resolveAgentOptions(agent: Agent, shadow: ShadowDefinition, defaultModel?: string): { provider?: string; model?: string } | undefined {
    const modelId = shadow.runWithModel
      ?? defaultModel
      ?? (agent.options.provider ? `${agent.options.provider}/${agent.options.model}` : undefined);
    if (!modelId) return undefined;
    const separator = modelId.indexOf("/");
    if (separator <= 0 || separator === modelId.length - 1) {
      return undefined;
    }
    return {
      provider: modelId.slice(0, separator),
      model: modelId.slice(separator + 1),
    };
  }

  private createSignal(): AbortSignal {
    if (typeof AbortController !== "undefined") {
      return new AbortController().signal;
    }
    return {
      aborted: false,
      onabort: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
      throwIfAborted: () => {},
    } as any;
  }

  private async buildTrajectory(agent: Agent): Promise<string> {
    const sessionQuery = this.ctx.get("sessionQuery") as any;
    if (!sessionQuery || !agent.session?.id) {
      return "<no-trajectory-available>";
    }
    try {
      const surface = await sessionQuery.readSurface(agent.session.id);
      // `readSurface` resolves to `{ session, capturedThroughSeq, events }`;
      // the sanitized trajectory is serialized from the surface events.
      if (!surface || !Array.isArray(surface.events) || surface.events.length === 0) {
        return "<empty-trajectory>";
      }
      return serializeTrajectory(surface.events);
    } catch (error) {
      this.eventLog.record("trajectory:error", { error: String(error) });
      return "<trajectory-unavailable>";
    }
  }
}

export function buildShadowPrompt(shadow: ShadowDefinition, trajectory: string): string {
  const body = trajectory.trim();
  return [
    `You are a Shadow Mind: ${shadow.name}.`,
    "",
    "You are running in parallel to the main agent. Your job:",
    shadow.prompt,
    "",
    "Use only the tools you have been given. Do not modify anything unless explicitly allowed.",
    "If you find nothing worth reporting, reply exactly NOT_RELEVANT and stop.",
    "Otherwise, reply with a concise, actionable report; it will be delivered to the main agent as a background notice.",
    "",
    `<main-agent-trajectory>${body ? `\n${body}\n` : " (empty)"}</main-agent-trajectory>`,
  ].join("\n");
}