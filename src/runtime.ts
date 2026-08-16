import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { CommandService } from "@deepseek-ai/dsh-commands";
import type { SubagentService } from "@deepseek-ai/dsh-subagent";
import type { ToolRegistry } from "@deepseek-ai/dsh-tools";
import { ConfigStore } from "./config.js";
import { ShadowRegistry } from "./registry.js";
import { EntityStore } from "./entity-store.js";
import { ShadowRunner } from "./shadow-runner.js";
import { ShadowCommands } from "./commands.js";
import { ManagementTools } from "./management-tools.js";
import { ShadowEventLog } from "./event-log.js";
import { decideHeartbeat } from "./scheduler.js";
import { SessionLifetime } from "./session-lifetime.js";
import { createRandom } from "./random.js";

export interface ShadowMindRuntimeOptions {
  agentDir: string;
}

export class ShadowMindRuntime {
  private readonly ctx: Context;
  private readonly configStore: ConfigStore;
  private readonly registry: ShadowRegistry;
  private readonly entityStore: EntityStore;
  private readonly eventLog: ShadowEventLog;
  private readonly runner: ShadowRunner;
  private readonly commands: ShadowCommands;
  private readonly tools: ManagementTools;
  private readonly lifetime: SessionLifetime;

  private activeShadowIds = new Set<string>();
  private runningChildren = new Map<string, number>();
  private disposers: Array<() => void> = [];
  private started = false;
  private paused = false;
  private epoch = 0;
  private random = createRandom();

  constructor(
    ctx: Context,
    private readonly options: ShadowMindRuntimeOptions,
  ) {
    this.ctx = ctx;
    this.configStore = new ConfigStore(options.agentDir);
    this.registry = new ShadowRegistry(options.agentDir);
    this.entityStore = new EntityStore(this.registry, this.configStore.configPath);
    this.eventLog = new ShadowEventLog(50);
    this.runner = new ShadowRunner(ctx, this.eventLog);
    this.commands = new ShadowCommands(this.entityStore, this.configStore, this.eventLog, {
      onProbe: (agent, id, tools) => this.launchShadow(agent, id, tools),
      onList: () => this.listShadows(),
      onClean: (agent) => this.cleanShadows(agent),
      onAuto: (enabled) => this.setAuto(enabled),
      onPause: () => this.setPaused(true),
      onResume: () => this.setPaused(false),
      onStatus: () => this.status(),
    });
    this.tools = new ManagementTools(this.entityStore, this.configStore, this.eventLog, {
      onList: () => this.listShadows(),
      onProbe: (agent, id, tools) => this.launchShadow(agent, id, tools),
      onClean: (agent) => this.cleanShadows(agent),
    });
    this.lifetime = new SessionLifetime();
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.lifetime.activate();
    await this.configStore.initialize();
    const { config, error } = await this.configStore.reload();
    if (error) {
      this.eventLog.record("config", { error, path: this.configStore.configPath });
    } else {
      // RNG is seeded once at session start, not on every heartbeat refresh.
      this.random = createRandom(config.randomSeed);
    }

    const commandsService = this.ctx.get("commands");
    if (commandsService) {
      this.disposers.push(this.commands.register(commandsService as CommandService));
    } else {
      this.eventLog.record("warning", { message: "commands service unavailable" });
    }

    const toolsService = this.ctx.get("tools");
    if (toolsService) {
      this.disposers.push(this.tools.register(toolsService as ToolRegistry));
    } else {
      this.eventLog.record("warning", { message: "tools service unavailable" });
    }

    const subagents = this.ctx.get("subagents");
    const agents = this.ctx.get("agents");
    if (subagents && agents) {
      this.disposers.push(this.attachHeartbeat(subagents as SubagentService, agents as any));
      this.disposers.push(this.attachInboxInserted(agents as any));
    } else {
      this.eventLog.record("warning", { message: "subagents or agents service unavailable" });
    }

    this.eventLog.record("started", { agentDir: this.options.agentDir });
  }

  stop(): void {
    this.lifetime.deactivate();
    for (const dispose of this.disposers) {
      try { dispose(); } catch { /* ignore */ }
    }
    this.disposers = [];
    this.started = false;
    this.eventLog.record("stopped", {});
  }

  private async refreshConfig(): Promise<void> {
    const { error } = await this.configStore.reload();
    if (error) this.eventLog.record("config", { error });
  }

  private async launchShadow(agent: Agent, shadowId?: string, tools?: string[]): Promise<string> {
    await this.refreshConfig();
    const { shadows } = await this.registry.load();

    let shadow = shadows.find((s) => s.id === shadowId);
    if (shadowId && !shadow) {
      throw new Error(`shadow not found: ${shadowId}`);
    }
    if (!shadow) {
      const enabled = shadows.filter((s) => s.enabled);
      if (!enabled.length) throw new Error("no enabled shadows");
      shadow = enabled[Math.floor(this.random() * enabled.length)];
    }

    if (this.activeShadowIds.has(shadow.id)) {
      throw new Error(`shadow ${shadow.id} is already running`);
    }

    const child = await this.runner.launch(agent, shadow, tools);
    this.activeShadowIds.add(shadow.id);
    this.runningChildren.set(child.childId, this.epoch);
    this.eventLog.record("shadow:launch", { shadowId: shadow.id, childId: child.childId, epoch: this.epoch });
    return child.childId;
  }

  private async doHeartbeat(agent: Agent, mainModelId: string): Promise<void> {
    if (this.paused) return;
    await this.refreshConfig();
    const config = this.configStore.current;
    const { shadows, diagnostics } = await this.registry.load();
    if (diagnostics.length) {
      for (const d of diagnostics) this.eventLog.record("registry:diagnostic", d as unknown as Record<string, unknown>);
    }

    const decision = decideHeartbeat({
      heartbeatProbability: config.heartbeatProbability,
      availableSlots: Math.max(0, config.maxParallelShadows - this.runningChildren.size),
      shadows,
      activeShadowIds: this.activeShadowIds,
      mainModelId,
      random: this.random,
    });

    this.eventLog.record("heartbeat", { roll: decision.heartbeatRoll, activated: decision.activated.map((a) => a.shadow.id) });

    for (const { shadow } of decision.activated) {
      this.launchShadow(agent, shadow.id, shadow.tools).catch((error) => {
        this.eventLog.record("shadow:launch-error", { shadowId: shadow.id, error: String(error) });
      });
    }
  }

  private attachHeartbeat(subagents: SubagentService, agents: any): () => void {
    const onTurnStopping = (payload: { agent: Agent }) => {
      if (!this.lifetime.isActive) return;
      const roots = agents.roots() as Agent[];
      if (!roots || roots.indexOf(payload.agent) < 0) return;
      const mainModelId = (payload.agent as any).modelId ?? "*";
      void this.doHeartbeat(payload.agent, mainModelId);
    };
    return this.ctx.on("agent/turn-stopping", onTurnStopping);
  }

  private setAuto(enabled: boolean): string {
    this.eventLog.record("auto", { enabled });
    // Heartbeat activation probability is the on/off switch for auto mode.
    // In a fuller implementation this toggles a flag; here we just record it.
    return `auto mode ${enabled ? "ON" : "OFF"}`;
  }

  setPaused(paused: boolean): string {
    this.paused = paused;
    this.eventLog.record("paused", { paused });
    return paused ? "shadow-mind paused" : "shadow-mind resumed";
  }

  isPaused(): boolean {
    return this.paused;
  }

  private async listShadows(): Promise<string> {
    const { shadows } = await this.registry.load();
    if (!shadows.length) return "No shadow definitions found.";
    return shadows.map((s) => `${s.enabled ? "✓" : "✗"} ${s.id} (${s.name}) p=${s.activationProbability} tools=[${s.tools.join(",") || "default"}]`).join("\n");
  }

  private async cleanShadows(agent: Agent): Promise<string> {
    return this.cancelChildren(agent, "shadow-clean");
  }

  private cancelChildren(agent: Agent, cause: string): string {
    const subagents = this.ctx.get("subagents") as SubagentService | undefined;
    const agents = this.ctx.get("agents") as { get(id: string): Agent | undefined } | undefined;
    let interrupted = 0;
    let canceled = 0;
    for (const childId of [...this.runningChildren.keys()]) {
      if (subagents) { try { subagents.interrupt(childId as any, { kind: "ancestor", agent }); interrupted++; } catch { /* ignore */ } }
      if (agents) {
        const child = agents.get(childId);
        if (child) { try { (child as any).cancel(cause, { keepInbox: false }); canceled++; } catch { /* ignore */ } }
      }
    }
    this.activeShadowIds.clear();
    this.runningChildren.clear();
    return `cleaned running shadows (interrupt=${interrupted}, cancel=${canceled})`;
  }

  private attachInboxInserted(agents: any): () => void {
    const onInboxInserted = (payload: { agent: Agent; message: any }) => {
      if (!this.lifetime.isActive) return;
      const roots = agents.roots() as Agent[];
      if (!roots || roots.indexOf(payload.agent) < 0) return;
      if (payload.message?.source?.kind !== "user") return;
      this.epoch += 1;
      this.eventLog.record("epoch", { epoch: this.epoch });
      if (this.runningChildren.size > 0) {
        this.cancelChildren(payload.agent, "new-epoch");
      }
    };
    return this.ctx.on("agent/inbox/inserted", onInboxInserted);
  }

  private status(): string {
    return `shadow-mind ${this.paused ? "PAUSED" : "active"} | epoch=${this.epoch} | active=${this.runningChildren.size} | events=${this.eventLog.length}`;
  }
}
