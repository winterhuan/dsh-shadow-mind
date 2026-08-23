import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { CommandRuntime } from "@deepseek-ai/dsh-commands";
import type { SubagentRuntime, SubagentRunEndInfo } from "@deepseek-ai/dsh-subagent";
import type { ToolRuntime } from "@deepseek-ai/dsh-tools";
import type { SettingsScope } from "@deepseek-ai/dsh-settings";
import { ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import type { ShadowConfig, ShadowMindSnapshot } from "./types.js";
import { DEFAULT_CONFIG } from "./config.js";
import { attachSettingsSection, SHADOW_SETTINGS_NAMESPACE } from "./settings-section.js";
import { ShadowRegistry } from "./registry.js";
import { EntityStore } from "./entity-store.js";
import { ShadowRunner, type ShadowLaunchResult } from "./shadow-runner.js";
import { ShadowCommands } from "./commands.js";
import { ManagementTools } from "./management-tools.js";
import { ShadowEventLog } from "./event-log.js";
import { decideHeartbeat, shouldEvaluateHeartbeat } from "./scheduler.js";
import { SessionLifetime } from "./session-lifetime.js";
import { createRandom } from "./random.js";
import { ReportBatcher, type ShadowReport } from "./report-batcher.js";
import { waitForSettled } from "./shutdown-drain.js";

export interface ShadowMindRuntimeOptions {
  agentDir: string;
}

/** Bookkeeping for one accepted shadow child; removed on settle, cancel, or expiry. */
interface ShadowRunRecord {
  shadowId: string;
  shadowName: string;
  epoch: number;
  startedAt: number;
  timeoutMs: number;
  timer?: ReturnType<typeof setTimeout>;
  /** Root agent used as interrupt authority (`ancestor`) for this child. */
  agent: Agent;
  /** Whether the shadow called report_to_main before ending. */
  reported?: boolean;
}

export class ShadowMindRuntime {
  private readonly ctx: Context;
  private readonly registry: ShadowRegistry;
  private readonly entityStore: EntityStore;
  private readonly eventLog: ShadowEventLog;
  private readonly runner: ShadowRunner;
  private readonly commands: ShadowCommands;
  private readonly tools: ManagementTools;
  private readonly lifetime: SessionLifetime;
  private readonly batcher: ReportBatcher;
  /** Active config source; defaults until the settings section attaches. */
  private configSource: () => ShadowConfig = () => DEFAULT_CONFIG;
  /** Write scope while the settings service stands; tools persist through it. */
  private settingsScope: SettingsScope<ShadowConfig> | undefined;

  /** Shadow ids with a live OR in-flight run; reserves the slot before launch. */
  private readonly activeShadowIds = new Set<string>();
  /** childId -> run bookkeeping; entries exist only between accept and settle. */
  private readonly runningChildren = new Map<string, ShadowRunRecord>();
  /** Per-root-agent tool-activity count for the current turn. */
  private readonly toolActivity = new WeakMap<Agent, number>();
  /** childSessionId -> thinking level for `agent/request` override. */
  private readonly thinkingLevels = new Map<string, string>();
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
    this.registry = new ShadowRegistry(options.agentDir);
    this.entityStore = new EntityStore(this.registry);
    this.eventLog = new ShadowEventLog(50);
    this.runner = new ShadowRunner(ctx, this.eventLog);
    this.commands = new ShadowCommands(this.entityStore, this.eventLog, {
      onProbe: (agent, id, tools) => this.launchShadow(agent, id, tools),
      onList: () => this.listShadows(),
      onClean: (agent) => this.cancelChildren(agent, "shadow-clean"),
      onAuto: (enabled) => this.setAuto(enabled),
      onPause: (agent) => this.setPaused(true, agent),
      onResume: () => this.setPaused(false),
      onStatus: () => this.status(),
    });
    this.tools = new ManagementTools(
      ctx,
      this.entityStore,
      { current: () => this.config, update: (patch) => this.updateConfig(patch) },
      this.eventLog,
      {
        onList: () => this.listShadows(),
        onProbe: (agent, id, tools) => this.launchShadow(agent, id, tools),
        onClean: (agent) => this.cancelChildren(agent, "shadow-clean"),
      },
    );
    this.lifetime = new SessionLifetime();
    this.batcher = new ReportBatcher(DEFAULT_CONFIG.resultBatchWindowMs, (reports) => this.deliverReports(reports));
  }

  /** The currently authoritative configuration snapshot. */
  private get config(): ShadowConfig {
    return this.configSource();
  }

  /** Persist one partial patch through the settings user layer. */
  private async updateConfig(patch: Record<string, unknown>): Promise<void> {
    const scope = this.settingsScope;
    if (!scope) throw new Error("settings service unavailable; configuration is read-only");
    await scope.update(patch);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.lifetime.activate();
    // Settings attach is synchronous when the service exists (registration,
    // legacy import, first onChange all settle inside); without one the hooks
    // never fire and the runtime runs on schema defaults.
    void attachSettingsSection(this.ctx, this.options.agentDir, {
      setSource: (source) => { this.configSource = source; },
      onChange: () => {
        this.batcher.setWindow(this.config.resultBatchWindowMs);
        this.eventLog.record("config", {
          namespace: SHADOW_SETTINGS_NAMESPACE,
          heartbeatProbability: this.config.heartbeatProbability,
          maxParallelShadows: this.config.maxParallelShadows,
        });
      },
    }).then((scope) => { this.settingsScope = scope; }, (error) => {
      this.eventLog.record("config", { error: error instanceof Error ? error.message : String(error) });
    });
    // RNG is seeded once at session start from the effective seed; later seed
    // edits take effect on the next session.
    this.random = createRandom(this.config.randomSeed);

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
      this.disposers.push(this.attachToolActivity(agents as any));
      this.disposers.push(this.registerReportTool(subagents as SubagentRuntime));
      this.disposers.push(this.registerThinkingLevelOverride(subagents as SubagentRuntime));
    } else {
      this.eventLog.record("warning", { message: "subagents or agents service unavailable" });
    }

    this.eventLog.record("started", { agentDir: this.options.agentDir });
  }

  stop(): void {
    this.lifetime.deactivate();
    // Interrupt and cancel every in-flight shadow child before tearing down;
    // leaving them running would orphan the subagents (their parent is gone).
    for (const [childId, record] of [...this.runningChildren.entries()]) {
      this.cancelChild(record, childId, "shadow-stop");
    }
    this.activeShadowIds.clear();
    for (const dispose of this.disposers) {
      try { dispose(); } catch { /* ignore */ }
    }
    this.disposers = [];
    this.started = false;
    this.eventLog.record("stopped", {});

    // Best-effort headless drain: if any child is still settling, give it the
    // configured drain window before the process tears down.
    if (this.runningChildren.size > 0) {
      const timeoutMs = this.config.headlessDrainTimeoutSeconds * 1000;
      void waitForSettled({
        timeoutMs,
        isSettled: () => this.runningChildren.size === 0,
      }).then(() => this.eventLog.record("drained", {})).catch(() => {});
    }
  }

  private async launchShadow(agent: Agent, shadowId?: string, tools?: string[]): Promise<string> {
    const config = this.config;
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
      shadowName: shadow.name,
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
    const thinkingLevel = shadow.thinkingLevel ?? config.defaultThinkingLevel;
    if (thinkingLevel) {
      this.thinkingLevels.set(child.childId, thinkingLevel);
    }
    this.runningChildren.set(child.childId, record);
    this.eventLog.record("shadow:launch", { shadowId: shadow.id, childId: child.childId, epoch: epochAtLaunch, timeoutMs });
    return child.childId;
  }

  private async expireRun(childId: string): Promise<void> {
    const record = this.runningChildren.get(childId);
    if (!record) return;
    this.eventLog.record("shadow:timeout", { childId, shadowId: record.shadowId, timeoutMs: record.timeoutMs });
    if (record.reported) {
      await this.batcher.flush();
    }
    this.cancelChild(record, childId, "shadow-timeout");
  }

  /** {@link timeout_seconds} per shadow, else the config default, in milliseconds. */
  private timeoutFor(shadow: { timeoutSeconds?: number }, config: ShadowConfig): number {
    const seconds = shadow.timeoutSeconds ?? config.defaultShadowTimeoutSeconds;
    return seconds > 0 ? seconds * 1000 : 0;
  }

  private async doHeartbeat(agent: Agent, mainModelId: string): Promise<void> {
    if (this.paused || !this.autoEnabled) return;
    const toolCount = this.toolActivity.get(agent) ?? 0;
    if (!shouldEvaluateHeartbeat(toolCount)) {
      this.eventLog.record("heartbeat-skipped", { reason: "no-tool-activity" });
      return;
    }
    // Reset for the next turn once we've consumed the current turn's activity.
    this.toolActivity.set(agent, 0);
    const config = this.config;
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

  /** Track tool results on root agents so heartbeat can skip no-activity turns. */
  private attachToolActivity(agents: any): () => void {
    return this.ctx.on("tools/result", (exec: { agent?: Agent }) => {
      if (!this.lifetime.isActive) return;
      const agent = exec?.agent;
      if (!agent) return;
      const roots = agents.roots() as Agent[];
      if (!roots || roots.indexOf(agent) < 0) return;
      const current = this.toolActivity.get(agent) ?? 0;
      this.toolActivity.set(agent, current + 1);
    });
  }

  /**
   * Inject a scoped `report_to_main` tool into every continuable child. It is
   * only visible to children whose allowlist includes it (shadow-mind includes
   * it for every shadow). The tool queues the report in the batcher and pauses
   * the child until flush; delivery uses `subagents.reportFrom` and then cancels
   * the child, mirroring pi-shadow-mind's `report_to_main` + abort.
   */
  private registerReportTool(subagents: SubagentRuntime): () => void {
    const outputSchema = { type: "object", additionalProperties: false, properties: { text: { type: "string" } }, required: ["text"] } as const;
    const render = (_args: unknown, value: unknown) => [{ type: "text", text: (value as { text: string }).text }] as any;
    return subagents.registerContinuableSetup((childCtx) => {
      const tools = childCtx.get("tools") as ToolRuntime | undefined;
      if (!tools) return () => {};
      return tools.register({
        name: "report_to_main",
        description: "Report a concrete finding to the main agent and immediately end this Shadow Mind run.",
        parameters: { type: "object", additionalProperties: false, properties: { content: { type: "string", description: "Concise, actionable report for the main agent" } }, required: ["content"] },
        output: { schema: outputSchema as any, render },
        execute: async (args: unknown, exec: { agent?: Agent; signal?: AbortSignal }) => {
          const childAgent = exec.agent;
          const content = (args as { content: string }).content;
          if (!childAgent) {
            return { text: "Failed to deliver report: no calling agent." };
          }
          const childId = (childAgent as any).session?.id as string | undefined;
          const record = childId ? this.runningChildren.get(childId) : undefined;
          if (!record) {
            return { text: "Failed to deliver report: shadow run not tracked." };
          }
          record.reported = true;
          this.batcher.add({
            shadowId: record.shadowId,
            shadowName: record.shadowName,
            content,
            epoch: record.epoch,
            runId: childId!,
            childAgent,
          });
          // Interrupt the child's current turn so it does not keep working while
          // the report waits in the batch window. Delivery will cancel it after flush.
          queueMicrotask(() => {
            try { this.interruptChild(record.agent, childId!, "report-queued"); } catch { /* ignore */ }
          });
          this.eventLog.record("shadow:report-queued", { childId, shadowId: record.shadowId, content: content.slice(0, 200) });
          return { text: "Report queued for delivery." };
        },
      });
    });
  }

  /**
   * Override the child agent's reasoning effort when a thinking level has been
   * configured for the shadow. The pi-shadow-mind `thinking_level` frontmatter
   * is mapped to a DSH `ReasoningEffortId` on each model request.
   */
  private registerThinkingLevelOverride(subagents: SubagentRuntime): () => void {
    return subagents.registerContinuableSetup((childCtx) => {
      const handler = async (payload: { agent: Agent }, next: () => Promise<unknown>) => {
        const config = (await next()) as { reasoningEffort?: unknown };
        const childId = payload.agent.session?.id;
        const level = childId ? this.thinkingLevels.get(childId) : undefined;
        if (level) {
          config.reasoningEffort = ReasoningEffortId(level);
        }
        return config;
      };
      return childCtx.on("agent/request", handler as any);
    });
  }

  /** Release bookkeeping when a child settles through any path (completed, aborted, error). */
  private attachChildEnd(): () => void {
    return this.ctx.on("subagent/end", (info: SubagentRunEndInfo) => {
      if (!this.lifetime.isActive) return;
      const reason = this.resolveStopReason(String(info.id), info.stopReason, info.lastAssistantMessage);
      this.finishRun(String(info.id), { stopReason: reason });
    });
  }

  /** Map DSH stop reasons onto pi-shadow-mind's vocabulary. */
  private resolveStopReason(
    childId: string,
    dshReason: string,
    lastAssistantMessage?: unknown[],
  ): string {
    const record = this.runningChildren.get(childId);
    const text = (lastAssistantMessage ?? [])
      .filter((block): block is { type: string; text?: string } => typeof block === "object" && block !== null && (block as any).type === "text")
      .map((block) => block.text ?? "")
      .join("");
    if (record?.reported) return "report";
    if (text.trim() === "NOT_RELEVANT") return "silent";
    switch (dshReason) {
      case "aborted": return "aborted";
      case "error": return "error";
      case "max-tokens": return "error";
      case "refusal": return "error";
      case "completed":
      default: return "silent";
    }
  }

  private finishRun(childId: string, detail: { stopReason: string }): void {
    const record = this.runningChildren.get(childId);
    if (!record) return;
    if (record.timer !== undefined) clearTimeout(record.timer);
    this.runningChildren.delete(childId);
    this.activeShadowIds.delete(record.shadowId);
    this.thinkingLevels.delete(childId);
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

  private async cancelChildren(agent: Agent, cause: string): Promise<string> {
    const records = [...this.runningChildren.entries()];
    for (const [childId, record] of records) {
      if (record.reported) {
        await this.batcher.flush();
        break;
      }
    }
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
        void this.cancelChildren(payload.agent, "new-epoch");
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
      void this.cancelChildren(agent, "shadow-pause");
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
    const config = this.config;
    const lines = [
      `shadow-mind ${this.paused ? "PAUSED" : "active"} | auto=${this.autoEnabled ? "ON" : "OFF"} | epoch=${this.epoch} | active=${this.runningChildren.size} | events=${this.eventLog.length}`,
      `config: heartbeat=${config.heartbeatProbability} parallel=${config.maxParallelShadows} timeout=${config.defaultShadowTimeoutSeconds}s model=${config.defaultShadowModel ?? "(main)"} source=${SHADOW_SETTINGS_NAMESPACE} settings`,
    ];
    const { diagnostics } = await this.registry.load();
    for (const d of diagnostics) lines.push(`! ${d.filePath}: ${d.message}`);
    return lines.join("\n");
  }

  /** Deliver a batch of shadow reports to the main agent via DSH reportFrom. */
  private async deliverReports(reports: ShadowReport[]): Promise<void> {
    const subagents = this.ctx.get("subagents") as SubagentRuntime | undefined;
    if (!subagents) return;
    for (const report of reports) {
      if (report.epoch !== this.epoch) {
        this.eventLog.record("shadow:report-discard", { shadowId: report.shadowId, childId: report.childAgent.session?.id, epoch: report.epoch, currentEpoch: this.epoch });
        continue;
      }
      try {
        await subagents.reportFrom(
          report.childAgent,
          [{ type: "text", text: report.content }] as any,
          { delivery: "next-step", signal: new AbortController().signal },
        );
        this.eventLog.record("shadow:report-delivered", { shadowId: report.shadowId, childId: report.childAgent.session?.id, epoch: report.epoch });
      } catch (error) {
        this.eventLog.record("shadow:report-error", { shadowId: report.shadowId, childId: report.childAgent.session?.id, error: error instanceof Error ? error.message : String(error) });
      } finally {
        try { (report.childAgent as any).cancel("report-delivered", { keepInbox: false }); } catch { /* ignore */ }
      }
    }
  }

  /** Produce a wire-serializable snapshot for the Web UI. */
  async snapshot(): Promise<ShadowMindSnapshot> {
    const { shadows, diagnostics } = await this.registry.load();
    const config = this.config;
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
      heartbeatProbability: config.heartbeatProbability,
      maxParallelShadows: config.maxParallelShadows,
      defaultShadowTimeoutSeconds: config.defaultShadowTimeoutSeconds,
      defaultShadowModel: config.defaultShadowModel ?? null,
    };
  }
}
