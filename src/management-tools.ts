import type { Agent } from "@deepseek-ai/dsh-agent";
import type { Context } from "@deepseek-ai/cordis";
import type { JsonSchemaNode, ToolRuntime } from "@deepseek-ai/dsh-tools";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import type { EntityStore, ShadowDraft } from "./entity-store.js";
import { describeShadow } from "./entity-store.js";
import { serializeConfig } from "./config.js";
import { ID_PATTERN } from "./constants.js";
import { ShadowEventLog } from "./event-log.js";

const idSchema = { type: "string", pattern: ID_PATTERN, description: "Shadow id" };

/** Read/write face over the live configuration the tools operate on. */
export interface ShadowConfigController {
  /** @returns the currently authoritative config snapshot. */
  current(): import("./types.js").ShadowConfig;
  /** Persist one partial patch through the settings user layer. */
  update(patch: Record<string, unknown>): Promise<void>;
}

const outputTextSchema: JsonSchemaNode = { type: "object", additionalProperties: false, properties: { text: { type: "string" } }, required: ["text"] };

function textRender(_args: unknown, value: unknown): ContentBlock[] {
  return [{ type: "text", text: (value as { text: string }).text }];
}

/** Map snake_case tool arguments onto the ShadowDraft field names. */
function shadowFieldsFromArgs(raw: Record<string, unknown>): Partial<Omit<ShadowDraft, "id">> {
  return {
    name: raw.name as string | undefined,
    enabled: raw.enabled as boolean | undefined,
    activationProbability: raw.activation_probability as number | undefined,
    activeForModels: raw.active_for_models as string[] | undefined,
    runWithModel: raw.run_with_model as string | undefined,
    thinkingLevel: raw.thinking_level as string | undefined,
    timeoutSeconds: raw.timeout_seconds as number | undefined,
    tools: raw.tools as string[] | undefined,
    prompt: raw.prompt as string | undefined,
  };
}

export interface ManagementToolHandlers {
  onList: () => Promise<string>;
  onProbe: (agent: Agent, id?: string, tools?: string[]) => Promise<string>;
  onClean: (agent: Agent) => Promise<string> | string;
}

type ApprovalOutcome = "allowed-once" | "rejected" | "cancelled" | "unavailable";

interface ApprovalServiceLike {
  request(req: { agent: Agent; toolName: string; reason?: string; signal?: AbortSignal }): Promise<ApprovalOutcome>;
}

export class ManagementTools {
  constructor(
    private readonly ctx: Context,
    private readonly entityStore: EntityStore,
    private readonly config: ShadowConfigController,
    private readonly eventLog: ShadowEventLog,
    private readonly handlers: ManagementToolHandlers,
  ) {}

  register(tools: ToolRuntime): () => void {
    const disposers: Array<() => void> = [];

    disposers.push(
      tools.register({
        name: "list_shadows",
        description: "List all configured Shadow Mind definitions.",
        parameters: { type: "object", additionalProperties: false, properties: {} },
        output: { schema: outputTextSchema, render: textRender },
        execute: async () => {
          const text = await this.handlers.onList();
          return { text };
        },
      }),
    );

    const shadowFields = {
      id: idSchema,
      name: { type: "string", description: "Display name" },
      enabled: { type: "boolean", description: "Whether the shadow is enabled" },
      activation_probability: { type: "number", minimum: 0, maximum: 1, description: "Activation probability per heartbeat" },
      active_for_models: { type: "array", items: { type: "string" }, description: "Models this shadow applies to (use [\"*\"] for all)" },
      run_with_model: { type: "string", description: "Optional model to run the shadow with" },
      thinking_level: { type: "string", description: "Optional thinking level (parsed for compatibility; not yet applied to DSH runs)" },
      timeout_seconds: { type: "number", exclusiveMinimum: 0, description: "Per-run timeout in seconds" },
      tools: { type: "array", items: { type: "string" }, description: "Tool allowlist" },
      prompt: { type: "string", description: "The shadow's instructions" },
    } as const;

    disposers.push(
      tools.register({
        name: "create_shadow",
        description: "Create a new Shadow Mind definition. Requires user approval before writing.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: shadowFields,
          required: ["id", "prompt"],
        },
        output: { schema: outputTextSchema, render: textRender },
        execute: async (args, exec) => {
          const raw = args as Record<string, unknown>;
          if (!(await this.confirmWrite(exec, "create_shadow", `Create shadow "${String(raw.id)}"`))) {
            return { text: "Rejected: create_shadow requires user approval." };
          }
          const shadow = await this.entityStore.create({ id: String(raw.id), ...shadowFieldsFromArgs(raw) });
          return { text: `Created ${describeShadow(shadow)}` };
        },
      }),
    );

    disposers.push(
      tools.register({
        name: "update_shadow",
        description: "Update an existing Shadow Mind definition. The id is immutable. Requires user approval before writing.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: shadowFields,
          required: ["id"],
        },
        output: { schema: outputTextSchema, render: textRender },
        execute: async (args, exec) => {
          const raw = args as Record<string, unknown>;
          const id = String(raw.id);
          if (!(await this.confirmWrite(exec, "update_shadow", `Update shadow "${id}"`))) {
            return { text: "Rejected: update_shadow requires user approval." };
          }
          const shadow = await this.entityStore.update(id, shadowFieldsFromArgs(raw));
          return { text: `Updated ${describeShadow(shadow)}` };
        },
      }),
    );

    this.registerIdAction(tools, disposers, "enable_shadow", "Enable a Shadow Mind definition. Requires user approval before writing.", "Enable", async (id) => {
      return `Enabled ${describeShadow(await this.entityStore.setEnabled(id, true))}`;
    });
    this.registerIdAction(tools, disposers, "disable_shadow", "Disable a Shadow Mind definition. Requires user approval before writing.", "Disable", async (id) => {
      return `Disabled ${describeShadow(await this.entityStore.setEnabled(id, false))}`;
    });
    this.registerIdAction(tools, disposers, "delete_shadow", "Delete a Shadow Mind definition. Requires user approval before writing.", "Delete", async (id) => {
      await this.entityStore.delete(id);
      return `Deleted ${id}`;
    });

    disposers.push(
      tools.register({
        name: "trigger_shadow",
        description: "Manually trigger a Shadow Mind review.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { ...idSchema, description: "Optional shadow id; if omitted a random enabled shadow is chosen" },
            tools: { type: "array", items: { type: "string" }, description: "Optional tool allowlist" },
          },
        },
        output: { schema: outputTextSchema, render: textRender },
        execute: async (args, exec) => {
          const raw = args as { id?: string; tools?: string[] };
          const text = await this.handlers.onProbe(exec.agent as Agent, raw.id, raw.tools);
          return { text };
        },
      }),
    );

    disposers.push(
      tools.register({
        name: "read_shadow_config",
        description: "Read the current Shadow Mind global config.",
        parameters: { type: "object", additionalProperties: false, properties: {} },
        output: { schema: outputTextSchema, render: textRender },
        execute: async () => {
          const text = serializeConfig(this.config.current());
          return { text };
        },
      }),
    );

    disposers.push(
      tools.register({
        name: "write_shadow_config",
        description:
          "Write the Shadow Mind global config (persisted in the shadow-mind settings section). Requires user approval before writing.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            heartbeatProbability: { type: "number", minimum: 0, maximum: 1, description: "Heartbeat activation probability per eligible turn" },
            maxParallelShadows: { type: "integer", minimum: 1, maximum: 8, description: "Maximum concurrently running shadows" },
            defaultShadowTimeoutSeconds: { type: "number", minimum: 1, description: "Default per-shadow run timeout in seconds" },
            headlessDrainTimeoutSeconds: { type: "number", minimum: 0, description: "Grace window for settling children at shutdown" },
            resultBatchWindowMs: { type: "integer", minimum: 0, description: "Report coalescing window in milliseconds" },
            defaultShadowModel: { type: "string", description: "Model used when a shadow declares none; empty string resets to the main model" },
            defaultThinkingLevel: { type: "string", enum: ["minimal", "low", "medium", "high"] },
            randomSeed: { type: "integer", minimum: 0, maximum: 4294967295, description: "Deterministic heartbeat RNG seed for the next session" },
          },
        },
        output: { schema: outputTextSchema, render: textRender },
        execute: async (args, exec) => {
          const raw = args as Record<string, unknown>;
          if (!(await this.confirmWrite(exec, "write_shadow_config", "Update the global Shadow Mind config"))) {
            return { text: "Rejected: write_shadow_config requires user approval." };
          }
          const patch: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(raw)) {
            if (value !== undefined) patch[key] = value;
          }
          await this.config.update(patch);
          return { text: `Shadow config updated: ${serializeConfig(this.config.current()).trim()}` };
        },
      }),
    );

    return () => disposers.forEach((d) => d());
  }

  /** Shared shape for id-only tools (enable/disable/delete) gated on approval. */
  private registerIdAction(
    tools: ToolRuntime,
    disposers: Array<() => void>,
    name: string,
    description: string,
    verb: string,
    run: (id: string) => Promise<string>,
  ): void {
    disposers.push(
      tools.register({
        name,
        description,
        parameters: { type: "object", additionalProperties: false, properties: { id: idSchema }, required: ["id"] },
        output: { schema: outputTextSchema, render: textRender },
        execute: async (args, exec) => {
          const id = String((args as { id?: unknown }).id);
          if (!(await this.confirmWrite(exec, name, `${verb} shadow "${id}"`))) {
            return { text: `Rejected: ${name} requires user approval.` };
          }
          return { text: await run(id) };
        },
      }),
    );
  }

  /**
   * Gate a persistent write behind the DSH approval service when one is
   * mounted. Without the service the write proceeds (minimal compositions
   * that omit user-approval have no answerer to ask); a rejected, cancelled,
   * or unavailable outcome fails closed.
   */
  private async confirmWrite(
    exec: { agent?: Agent; signal?: AbortSignal },
    toolName: string,
    reason: string,
  ): Promise<boolean> {
    if (!exec.agent) return true;
    const approval = this.ctx.get("approval") as ApprovalServiceLike | undefined;
    if (!approval) {
      this.eventLog.record("warning", { message: `no approval service; ${toolName} proceeds unconfirmed` });
      return true;
    }
    try {
      const outcome = await approval.request({ agent: exec.agent, toolName, reason, signal: exec.signal });
      return outcome === "allowed-once";
    } catch (error) {
      this.eventLog.record("approval:error", { toolName, error: String(error) });
      return false;
    }
  }
}