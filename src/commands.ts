import type { Agent } from "@deepseek-ai/dsh-agent";
import type { CommandService, CommandInvocation } from "@deepseek-ai/dsh-commands";
import { ConfigStore } from "./config.js";
import { EntityStore } from "./entity-store.js";
import { ShadowEventLog } from "./event-log.js";

export interface ShadowCommandsOptions {
  onProbe: (agent: Agent, id?: string, tools?: string[]) => Promise<string>;
  onListAgents: () => Promise<string> | string;
  onList: () => Promise<string>;
  onClean: (agent: Agent) => Promise<string> | string;
  onAuto: (enabled: boolean) => string;
  onPause: (agent: Agent) => string;
  onResume: () => string;
  onStatus: () => Promise<string> | string;
}

export class ShadowCommands {
  constructor(
    private readonly entityStore: EntityStore,
    private readonly configStore: ConfigStore,
    private readonly eventLog: ShadowEventLog,
    private readonly handlers: ShadowCommandsOptions,
  ) {}

  register(commands: CommandService): () => void {
    return commands.register({
      name: "shadow",
      description: "Shadow Mind: /shadow status | probe <id|agents> [tools] | list | clean | auto <on|off> | pause | resume",
      input: { hint: "status | probe <id|agents> [tools] | list | clean | auto <on|off> | pause | resume" },
      handler: async (invocation: CommandInvocation) => {
        const raw = invocation.rawInput.trim();
        const parts = raw.split(/\s+/);
        const sub = parts[0] || "status";
        const rest = parts.slice(1).join(" ");
        try {
          switch (sub) {
            case "status":
              return { kind: "success", text: await this.handlers.onStatus() };
            case "probe": {
              const probeParts = rest.trim().split(/\s+/);
              const first = probeParts[0];
              if (first === "agents") {
                return { kind: "success", text: await this.handlers.onListAgents() };
              }
              const id = first || undefined;
              const tools = probeParts[1] ? probeParts[1].split(",") : undefined;
              const text = await this.handlers.onProbe(invocation.agent, id, tools);
              return { kind: "success", text };
            }
            case "list":
              return { kind: "success", text: await this.handlers.onList() };
            case "clean":
              return { kind: "success", text: await this.handlers.onClean(invocation.agent) };
            case "auto":
              return { kind: "success", text: this.handlers.onAuto(rest.trim().toLowerCase() === "on") };
            case "pause":
              return { kind: "success", text: this.handlers.onPause(invocation.agent) };
            case "resume":
              return { kind: "success", text: this.handlers.onResume() };
            default:
              return { kind: "success", text: "Usage: /shadow status | probe <id|agents> [tools] | list | clean | auto <on|off> | pause | resume\n" + await this.handlers.onStatus() };
          }
        } catch (error) {
          return { kind: "error", text: String(error) };
        }
      },
    });
  }
}