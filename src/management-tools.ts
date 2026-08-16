import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolRegistry } from "@deepseek-ai/dsh-tools";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import type { EntityStore } from "./entity-store.js";
import { describeShadow } from "./entity-store.js";
import { ConfigStore, serializeConfig } from "./config.js";
import { ShadowEventLog } from "./event-log.js";

const ID_PATTERN = "^[a-z0-9][a-z0-9_-]*$";

const idSchema = { type: "string", pattern: ID_PATTERN, description: "Shadow id" };

const outputTextSchema: any = { type: "object", additionalProperties: false, properties: { text: { type: "string" } }, required: ["text"] };

function textRender(_args: unknown, value: unknown): ContentBlock[] {
  return [{ type: "text", text: (value as { text: string }).text }];
}

export interface ManagementToolHandlers {
  onList: () => Promise<string>;
  onProbe: (agent: Agent, id?: string, tools?: string[]) => Promise<string>;
  onClean: (agent: Agent) => Promise<string>;
}

export class ManagementTools {
  constructor(
    private readonly entityStore: EntityStore,
    private readonly configStore: ConfigStore,
    private readonly eventLog: ShadowEventLog,
    private readonly handlers: ManagementToolHandlers,
  ) {}

  register(tools: ToolRegistry): () => void {
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
      debug: { type: "boolean", description: "Keep debug logs" },
      activation_probability: { type: "number", minimum: 0, maximum: 1, description: "Activation probability per heartbeat" },
      active_for_models: { type: "array", items: { type: "string" }, description: "Models this shadow applies to (use [\"*\"] for all)" },
      run_with_model: { type: "string", description: "Optional model to run the shadow with" },
      timeout_seconds: { type: "number", exclusiveMinimum: 0, description: "Per-run timeout" },
      tools: { type: "array", items: { type: "string" }, description: "Tool allowlist" },
      prompt: { type: "string", description: "The shadow's instructions" },
    } as const;

    disposers.push(
      tools.register({
        name: "create_shadow",
        description: "Create a new Shadow Mind definition.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: shadowFields as any,
          required: ["id", "prompt"],
        },
        output: { schema: outputTextSchema, render: textRender },
        execute: async (args) => {
          const raw = args as Record<string, unknown>;
          const shadow = await this.entityStore.create({
            id: String(raw.id),
            name: raw.name as string | undefined,
            enabled: raw.enabled as boolean | undefined,
            debug: raw.debug as boolean | undefined,
            activationProbability: raw.activation_probability as number | undefined,
            activeForModels: raw.active_for_models as string[] | undefined,
            runWithModel: raw.run_with_model as string | undefined,
            timeoutSeconds: raw.timeout_seconds as number | undefined,
            tools: raw.tools as string[] | undefined,
            prompt: raw.prompt as string | undefined,
          });
          return { text: `Created ${describeShadow(shadow)}` };
        },
      }),
    );

    disposers.push(
      tools.register({
        name: "update_shadow",
        description: "Update an existing Shadow Mind definition. The id is immutable.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: shadowFields as any,
          required: ["id"],
        },
        output: { schema: outputTextSchema, render: textRender },
        execute: async (args) => {
          const raw = args as Record<string, unknown>;
          const id = String(raw.id);
          const shadow = await this.entityStore.update(id, {
            name: raw.name as string | undefined,
            enabled: raw.enabled as boolean | undefined,
            debug: raw.debug as boolean | undefined,
            activationProbability: raw.activation_probability as number | undefined,
            activeForModels: raw.active_for_models as string[] | undefined,
            runWithModel: raw.run_with_model as string | undefined,
            timeoutSeconds: raw.timeout_seconds as number | undefined,
            tools: raw.tools as string[] | undefined,
            prompt: raw.prompt as string | undefined,
          });
          return { text: `Updated ${describeShadow(shadow)}` };
        },
      }),
    );

    disposers.push(
      tools.register({
        name: "enable_shadow",
        description: "Enable a Shadow Mind definition.",
        parameters: { type: "object", additionalProperties: false, properties: { id: idSchema }, required: ["id"] },
        output: { schema: outputTextSchema, render: textRender },
        execute: async (args) => {
          const shadow = await this.entityStore.setEnabled(String((args as any).id), true);
          return { text: `Enabled ${describeShadow(shadow)}` };
        },
      }),
    );

    disposers.push(
      tools.register({
        name: "disable_shadow",
        description: "Disable a Shadow Mind definition.",
        parameters: { type: "object", additionalProperties: false, properties: { id: idSchema }, required: ["id"] },
        output: { schema: outputTextSchema, render: textRender },
        execute: async (args) => {
          const shadow = await this.entityStore.setEnabled(String((args as any).id), false);
          return { text: `Disabled ${describeShadow(shadow)}` };
        },
      }),
    );

    disposers.push(
      tools.register({
        name: "delete_shadow",
        description: "Delete a Shadow Mind definition.",
        parameters: { type: "object", additionalProperties: false, properties: { id: idSchema }, required: ["id"] },
        output: { schema: outputTextSchema, render: textRender },
        execute: async (args) => {
          await this.entityStore.delete(String((args as any).id));
          return { text: `Deleted ${(args as any).id}` };
        },
      }),
    );

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
          const text = await this.configStore.readConfig();
          return { text };
        },
      }),
    );

    disposers.push(
      tools.register({
        name: "write_shadow_config",
        description: "Write the Shadow Mind global config. Requires user confirmation before calling.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            heartbeat_probability: { type: "number", minimum: 0, maximum: 1 },
            max_parallel_shadows: { type: "integer", minimum: 1 },
            default_shadow_timeout_seconds: { type: "number", minimum: 1 },
            headless_drain_timeout_seconds: { type: "number", minimum: 1 },
            result_batch_window_ms: { type: "integer", minimum: 0 },
            default_shadow_model: { type: "string" },
            default_thinking_level: { type: "string" },
            random_seed: { type: "integer" },
          },
        },
        output: { schema: outputTextSchema, render: textRender },
        execute: async (args) => {
          const raw = args as Record<string, unknown>;
          await this.configStore.writeConfig(raw as any);
          return { text: "Shadow config updated." };
        },
      }),
    );

    return () => disposers.forEach((d) => d());
  }
}
