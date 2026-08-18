import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { CommandRuntime } from "@deepseek-ai/dsh-commands";
import type { SubagentRuntime, SubagentRunEndInfo } from "@deepseek-ai/dsh-subagent";
import type { ToolRuntime } from "@deepseek-ai/dsh-tools";
import type { ShadowConfig, ShadowMindSnapshot } from "./types.js";
import { ConfigStore } from "./config.js";
import { ShadowRegistry } from "./registry.js";
import { EntityStore } from "./entity-store.js";
import { ShadowRunner, type ShadowLaunchResult } from "./shadow-runner.js";
import { ShadowCommands } from "./commands.js";
import { ManagementTools } from "./management-tools.js";
import { ShadowEventLog } from "./event-log.js";
import { decideHeartbeat } from "./scheduler.js";
import { SessionLifetime } from "./session-lifetime.js";
import { createRandom } from "./random.js";

export interface ShadowMindRuntimeOptions {
  agentDir: string;
}

/** Bookkeeping for one accepted shadow child; removed on settle, cancel, or expiry. */
interface ShadowRunRecord {
  shadowId: string;
  epoch: number;
  startedAt: number;
  timeoutMs: number;
  timer?: ReturnType<typeof setTimeout>;
  /** Root agent used as interrupt authority (`ancestor`) for this child. */
  agent: Agent;
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

  /** Shadow ids with a live OR in-flight run; reserves the slot before launch. */
  private readonly activeShadowIds = new Set<string>();
  /** childId -> run bookkeeping; entries exist only between accept and settle. */
  private readonly runningChildren = new Map<string, ShadowRunRecord>();
  private disposers: Array<() => void> = [];
  private started = false;
  private paused = false;
  private autoEnabled = true;
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
      onClean: (agent) => this.cancelChildren(agent, "shadow-clean"),
      onAuto: (enabled) => this.setAuto(enabled),
      onPause: (agent) => this.setPaused(true, agent),
      onResume: () => this.setPaused(false),
      onStatus: () => this.status(),
    });
    this.tools = new ManagementTools(ctx, this.entityStore, this.configStore, this.eventLog, {
      onList: () => this.listShadows(),
      onProbe: (agent, id, tools) => this.launchShadow(agent, id, tools),
      onClean: (agent) => this.cancelChildren(agent, "shadow-clean"),
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
      this.disposers.push(this.commands.register(commandsService as CommandRuntime));
    } else {
      this.eventLog.record("warning", { message: "commands service unavailable" });
    }

    const toolsService = this.ctx.get("tools");
    if (toolsService) {
      this.disposers.push(this.tools.register(toolsService as ToolRuntime));
    } else {
      this.eventLog.record("warning", { message: "tools service unavailable" });
    }

    const subagents = this.ctx.get("subagents");
    const agents = this.ctx.get("agents");
    if (subagents && agents) {
      this.disposers.push(this.attachHeartbeat(subagents as SubagentRuntime, agents as any));
      this.disposers.push(this.attachInboxInserted(agents as any));
      this.disposers.push(this.attachChildEnd());
    } else {
      this.eventLog.record("warning", { message: "subagents or agents service unavailable" });
    }

    this.eventLog.record("started", { agentDir: this.options.agentDir });
  }

  stop(): void {
    this.lifetime.deactivate();
    for (const record of this.runningChildren.values()) {
      if (record.timer !== undefined) clearTimeout(record.timer);
    }
    this.runningChildren.clear();
    this.activeShadowIds.clear();
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
    const config = this.configStore.current;
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

    // Reserve the slot synchronously so a concurrent heartbeat cannot launch
    // the same shadow, then release it again when the launch fails.
    this.activeShadowIds.add(shadow.id);
    const epochAtLaunch = this.epoch;
    let child: ShadowLaunchResult;
    try {
      child = await this.runner.launch(agent, shadow, { tools, defaultModel: config.defaultShadowModel });
    } catch (error) {
      this.activeShadowIds.delete(shadow.id);
      throw error;
    }

    if (epochAtLaunch !== this.epoch) {
      // The user moved to a new epoch while the child was starting: it belongs
      // to a stale epoch and must not keep running.
      this.activeShadowIds.delete(shadow.id);
      this.interruptChild(agent, child.childId, "new-epoch-race");
      this.eventLog.record("shadow:discard", { shadowId: shadow.id, childId: child.childId, epoch: this.epoch });
      return child.childId;
    }

    const timeoutMs = this.timeoutFor(shadow, config);
    const record: ShadowRunRecord = {
      shadowId: shadow.id,
      epoch: epochAtLaunch,
      startedAt: Date.now(),
      timeoutMs,
      agent,
    };
    if (timeoutMs > 0) {
      record.timer = setTimeout(() => {
        void this.expireRun(child.childId);
      }, timeoutMs);
    }
    this.runningChildren.set(child.childId, record);
    this.eventLog.record("shadow:launch", { shadowId: shadow.id, childId: child.childId, epoch: epochAtLaunch, timeoutMs });
    return child.childId;
  }

  private async expireRun(childId: string): Promise<void> {
    const record = this.runningChildren.get(childId);
    if (!record) return;
    this.eventLog.record("shadow:timeout", { childId, shadowId: record.shadowId, timeoutMs: record.timeoutMs });
    this.cancelChild(record, childId, "shadow-timeout");
  }

  /** {@link timeout_seconds} per shadow, else the config default, in milliseconds. */
  private timeoutFor(shadow: { timeoutSeconds?: number }, config: ShadowConfig): number {
    const seconds = shadow.timeoutSeconds ?? config.defaultShadowTimeoutSeconds;
    return seconds > 0 ? seconds * 1000 : 0;
  }

  private async doHeartbeat(agent: Agent, mainModelId: string): Promise<void> {
    if (this.paused || !this.autoEnabled) return;
    await this.refreshConfig();
    const config = this.configStore.current;
    const { shadows, diagnostics } = await this.registry.load();
    if (diagnostics.length) {
      for (const d of diagnostics) this.eventLog.record("registry:diagnostic", d as unknown as Record<string, unknown>);
    }

    const decision = decideHeartbeat({
      heartbeatProbability: config.heartbeatProbability,
      availableSlots: Math.max(0, config.maxParallelShadows - this.activeShadowIds.size),
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

  private attachHeartbeat(subagents: SubagentRuntime, agents: any): () => void {
    const onTurnStopping = (payload: { agent: Agent }) => {
      if (!this.lifetime.isActive) return;
      const roots = agents.roots() as Agent[];
      if (!roots || roots.indexOf(payload.agent) < 0) return;
      const options = payload.agent.options;
      const mainModelId = options.provider && options.model ? `${options.provider}/${options.model}` : "*";
      void this.doHeartbeat(payload.agent, mainModelId);
    };
    return this.ctx.on("agent/turn-stopping", onTurnStopping);
  }

  /** Release bookkeeping when a child settles through any path (completed, aborted, error). */
  private attachChildEnd(): () => void {
    return this.ctx.on("subagent/end", (info: SubagentRunEndInfo) => {
      if (!this.lifetime.isActive) return;
      this.finishRun(String(info.id), { stopReason: info.stopReason });
    });
  }

  private finishRun(childId: string, detail: { stopReason: string }): void {
    const record = this.runningChildren.get(childId);
    if (!record) return;
    if (record.timer !== undefined) clearTimeout(record.timer);
    this.runningChildren.delete(childId);
    this.activeShadowIds.delete(record.shadowId);
    this.eventLog.record("shadow:end", { childId, shadowId: record.shadowId, ...detail });
  }

  private interruptChild(agent: Agent, childId: string, cause: string): boolean {
    const subagents = this.ctx.get("subagents") as SubagentRuntime | undefined;
    if (!subagents) return false;
    try {
      subagents.interrupt(childId as any, { kind: "ancestor", agent });
      this.eventLog.record("shadow:interrupt", { childId, cause });
      return true;
    } catch {
      return false;
    }
  }

  private cancelChild(record: ShadowRunRecord, childId: string, cause: string): void {
    if (record.timer !== undefined) clearTimeout(record.timer);
    this.runningChildren.delete(childId);
    this.activeShadowIds.delete(record.shadowId);
    const agents = this.ctx.get("agents") as { get(id: string): Agent | undefined } | undefined;
    let interrupted = false;
    let canceled = false;
    interrupted = this.interruptChild(record.agent, childId, cause);
    if (agents) {
      const child = agents.get(childId);
      if (child) {
        try { (child as any).cancel(cause, { keepInbox: false }); canceled = true; } catch { /* ignore */ }
      }
    }
    this.eventLog.record("shadow:cancel", { childId, shadowId: record.shadowId, cause, interrupted, canceled });
  }

  private cancelChildren(agent: Agent, cause: string): string {
    const records = [...this.runningChildren.entries()];
    for (const [childId, record] of records) {
      this.cancelChild(record, childId, cause);
    }
    // Release reservations that never produced an accepted child (in-flight
    // launches); a child that still completes is discarded by the epoch guard.
    this.activeShadowIds.clear();
    return `cleaned running shadows (${records.length})`;
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

  private setAuto(enabled: boolean): string {
    this.autoEnabled = enabled;
    this.eventLog.record("auto", { enabled });
    return `auto mode ${enabled ? "ON" : "OFF"}`;
  }

  setPaused(paused: boolean, agent?: Agent): string {
    this.paused = paused;
    this.eventLog.record("paused", { paused, epoch: this.epoch });
    if (paused && agent) {
      this.cancelChildren(agent, "shadow-pause");
    }
    return paused ? "shadow-mind paused" : "shadow-mind resumed";
  }

  isPaused(): boolean {
    return this.paused;
  }

  private async listShadows(): Promise<string> {
    const { shadows, diagnostics } = await this.registry.load();
    const lines = shadows.length
      ? shadows.map((s) => `${s.enabled ? "✓" : "✗"} ${s.id} (${s.name}) p=${s.activationProbability} tools=[${s.tools.join(",") || "default"}]`)
      : ["No shadow definitions found."];
    for (const d of diagnostics) lines.push(`! ${d.filePath}: ${d.message}`);
    return lines.join("\n");
  }

  private async status(): Promise<string> {
    const lines = [
      `shadow-mind ${this.paused ? "PAUSED" : "active"} | auto=${this.autoEnabled ? "ON" : "OFF"} | epoch=${this.epoch} | active=${this.runningChildren.size} | events=${this.eventLog.length}`,
    ];
    if (this.configStore.error) {
      lines.push(`config error: ${this.configStore.error}`);
    }
    const { diagnostics } = await this.registry.load();
    for (const d of diagnostics) lines.push(`! ${d.filePath}: ${d.message}`);
    return lines.join("\n");
  }

  /** Produce a wire-serializable snapshot for the Web UI. */
  async snapshot(): Promise<ShadowMindSnapshot> {
    const { shadows, diagnostics } = await this.registry.load();
    const config = this.configStore.current;
    return {
      present: this.started,
      paused: this.paused,
      autoEnabled: this.autoEnabled,
      epoch: this.epoch,
      activeCount: this.runningChildren.size,
      running: [...this.runningChildren.entries()].map(([childId, record]) => ({
        childId,
        shadowId: record.shadowId,
        startedAt: record.startedAt,
        timeoutMs: record.timeoutMs,
      })),
      eventCount: this.eventLog.length,
      recentEvents: [...this.eventLog.recent(20)],
      shadows: shadows.map((s) => ({
        id: s.id,
        name: s.name,
        enabled: s.enabled,
        activationProbability: s.activationProbability,
        tools: s.tools,
      })),
      diagnostics: [...diagnostics],
      configError: this.configStore.error ?? null,
      heartbeatProbability: config.heartbeatProbability,
      maxParallelShadows: config.maxParallelShadows,
      defaultShadowTimeoutSeconds: config.defaultShadowTimeoutSeconds,
      defaultShadowModel: config.defaultShadowModel ?? null,
    };
  }
}
