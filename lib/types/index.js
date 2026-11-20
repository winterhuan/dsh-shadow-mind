var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
/** DSH-native Shadow scheduler, per-run permissions, and managed Agent lifecycles. */
import { createHash, randomUUID } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { entryListProblem } from '@deepseek-ai/dsh-agent-preset-registry';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { Config, resolveConfig, serializeConfig } from "./config.js";
import { loadDefinitions } from "./definitions.js";
import { captureTrajectory, reviewPrompt } from "./trajectory.js";
import { parseResult, resultSchema } from "./report.js";
import { eventHistory, record, recentRuns, savedState } from "./records.js";
import { Slots } from "./slots.js";
import { createRandom } from "./random.js";
import { decideFinalResponse, decideHeartbeat } from "./scheduler.js";
import { applyShadowPolicy } from "./review-policy.js";
import { ReportBatcher, formatReports } from "./reports.js";
import { EntityStore, definitionFromInput, definitionPatch, formatCatalog } from "./entity-store.js";
import { matchesModel } from "./scheduler.js";
export { Config } from "./config.js";
const workerReadOnlyTools = new Set(['read', 'grep', 'glob', 'list_shadows', 'read_shadow_config']);
/** Owns scheduling and joins every child it starts before profile teardown. */
let ShadowMind = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _snapshot_decorators;
    return class ShadowMind extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _snapshot_decorators = [Remote({ resources: { session: (sessionId) => sessionId } })];
            __esDecorate(this, null, _snapshot_decorators, { kind: "method", name: "snapshot", static: false, private: false, access: { has: obj => "snapshot" in obj, get: obj => obj.snapshot }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        config = __runInitializers(this, _instanceExtraInitializers);
        static inject = ['agents', 'subagents', 'agentPresets', 'workingDirectory', 'tools', 'llm'];
        static Config = Config;
        owners = new Map();
        active = new Map();
        slots;
        random;
        batches = new WeakMap();
        liveBatches = new Map();
        workerPresets = new Map();
        pendingPolicies = new Map();
        pendingThinking = new Map();
        autoEnabled = true;
        stopped = false;
        constructor(ctx, config) {
            super(ctx, 'shadowMind');
            this.config = config;
            const initial = resolveConfig(config);
            this.slots = new Slots(initial.maxParallel);
            this.random = createRandom(initial.randomSeed);
            ctx.on('loader/volatile-update', paths => {
                if (paths.length === 0)
                    return;
                const changed = new Set(paths.map(path => path[0]));
                const config = this.currentConfig();
                if (changed.has('resultBatchWindowMs')) {
                    for (const batcher of this.liveBatches.values())
                        batcher.setWindow(config.resultBatchWindowMs);
                }
                if (changed.has('randomSeed'))
                    this.random = createRandom(config.randomSeed);
            });
            // startActivation() owns child construction.  The public request contract has
            // no setup callback, so install per-run policy at the child publication edge.
            ctx.on('agent/created', async ({ agent, signal }) => {
                if (agent.session.header.origin !== 'subagent')
                    return;
                const pending = this.pendingPolicies.get(agent.id);
                if (pending?.mode === 'worker')
                    pending.release = applyShadowPolicy(agent, pending.policy, report => this.acceptRunReport(agent.id, pending.policy.runId, report));
                const thinking = this.pendingThinking.get(agent.id);
                if (thinking !== undefined)
                    await this.selectThinkingLevel(agent, thinking, signal);
            });
            ctx.on('agent/inbox/inserted', ({ agent, message: input }) => {
                if (!this.root(agent) || input.source.kind !== 'user')
                    return;
                const owner = this.owner(agent);
                owner.controller.abort(new Error('new user input'));
                this.cancelOwned(agent, owner, new Error('new user input'));
                owner.taskId = input.id;
                owner.heartbeatRuns = 0;
                owner.finalRounds.clear();
                owner.completionClaimed = false;
                owner.controller = new AbortController();
            });
            ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
                if (this.root(agent))
                    this.bindTurn(agent, this.owner(agent), signal);
                return next();
            });
            ctx.on('session/event', (session, event) => {
                if (event.type !== 'step/end')
                    return;
                const agent = ctx.agents.get(session.id);
                if (agent === undefined || !this.root(agent))
                    return;
                const owner = this.owner(agent);
                const config = this.currentConfig();
                if (!this.autoEnabled || owner.paused || owner.heartbeatRuns >= config.maxHeartbeatRunsPerTask || owner.controller.signal.aborted)
                    return;
                const events = session.snapshotEvents();
                const calls = events.filter(item => item.type === 'tool/call' && item.data.turn === event.data.turn && item.data.step === event.data.step);
                const completed = new Set(events.filter(item => item.type === 'tool/result' && item.data.turn === event.data.turn && item.data.step === event.data.step)
                    .map(item => item.type === 'tool/result' ? item.data.message.toolCallId : ''));
                const names = calls.flatMap(item => item.type === 'tool/call' && completed.has(item.data.callId) ? [item.data.name] : []);
                if (names.length === 0)
                    return;
                owner.lastHeartbeatTools = names;
                const pending = this.batch(agent, owner, 'heartbeat', undefined, names);
                this.track(agent, owner, pending);
            });
            ctx.on('agent/turn-stopping', async ({ agent, signal }) => {
                if (!this.root(agent))
                    return;
                const owner = this.owner(agent);
                await this.drain(owner);
                const batcher = this.batches.get(agent);
                if (batcher?.hasPending && !signal.aborted && !owner.paused) {
                    try {
                        await batcher.flush();
                    }
                    catch (error) {
                        owner.diagnostics.push(`Report delivery failed: ${message(error)}`);
                    }
                }
                if (signal.aborted || owner.paused || owner.completionClaimed || agent.inbox.nextStep.length || agent.inbox.nextTurn.length)
                    return;
                const last = agent.session.deriveMessages().at(-1);
                if (last?.role === 'assistant' && last.content.some(block => block.type === 'text' && block.text.trim())) {
                    const pending = this.batch(agent, owner, 'final_response', signal);
                    await this.track(agent, owner, pending);
                }
            });
            ctx.on('agent/disposed', ({ agent }) => {
                const owner = this.owners.get(agent);
                if (owner === undefined)
                    return;
                owner.controller.abort(new Error('parent disposed'));
                this.cancelOwned(agent, owner, new Error('parent disposed'));
                void this.drain(owner).finally(() => {
                    this.batches.get(agent)?.dispose();
                    this.liveBatches.delete(agent);
                    this.owners.delete(agent);
                });
            });
            ctx.effect(() => async () => {
                this.stopped = true;
                for (const active of this.active.values())
                    this.interrupt(active);
                for (const owner of this.owners.values())
                    owner.controller.abort(new Error('plugin disposed'));
                const drainTimeoutMs = this.currentConfig().headlessDrainTimeoutSeconds * 1000;
                await Promise.all([...this.owners.values()].map(owner => this.drain(owner, drainTimeoutMs)));
                for (const batch of this.liveBatches.values())
                    batch.dispose();
                this.liveBatches.clear();
                this.active.clear();
                this.owners.clear();
                await Promise.all([...this.workerPresets.values()].map(dispose => dispose()));
                this.workerPresets.clear();
            });
            ctx.effect(() => registerManagementTools(ctx.tools, this));
            ctx.inject(['settings'], child => {
                child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
            });
        }
        root(agent) { return !this.stopped && agent.session.header.origin !== 'subagent'; }
        currentConfig() {
            const config = resolveConfig(this.config);
            this.slots.setLimit(config.maxParallel);
            return config;
        }
        owner(agent) {
            let owner = this.owners.get(agent);
            if (owner === undefined) {
                const restored = savedState(agent.session);
                owner = { ...restored, controller: new AbortController(), pending: new Set(), running: new Set(),
                    workerChildren: new Set(), diagnostics: [], lastHeartbeatTools: [], completionClaimed: restored.completionClaimed };
                this.owners.set(agent, owner);
            }
            return owner;
        }
        batchesFor(agent) {
            let batcher = this.batches.get(agent);
            if (batcher === undefined) {
                const config = this.currentConfig();
                batcher = new ReportBatcher(config.resultBatchWindowMs, reports => this.deliver(agent, reports), error => {
                    const owner = this.owners.get(agent);
                    if (owner !== undefined)
                        owner.diagnostics.push(`Report delivery failed: ${message(error)}`);
                    this.ctx.logger.warn('Shadow report delivery failed for %s: %s', agent.id, message(error));
                });
                this.batches.set(agent, batcher);
                this.liveBatches.set(agent, batcher);
            }
            else {
                batcher.setWindow(this.currentConfig().resultBatchWindowMs);
            }
            return batcher;
        }
        isCurrent(agent, owner, taskId, signal) {
            return this.root(agent) && !signal.aborted && !owner.paused && owner.taskId === taskId && this.ctx.agents.get(agent.id) === agent;
        }
        track(agent, owner, work) {
            const tracked = work.catch(error => {
                owner.diagnostics.push(message(error));
                if (owner.diagnostics.length > 20)
                    owner.diagnostics.shift();
                this.ctx.logger.warn('Shadow run failed for %s: %s', agent.id, message(error));
            }).finally(() => owner.pending.delete(tracked));
            owner.pending.add(tracked);
            return tracked;
        }
        async drain(owner, timeoutMs) {
            const wait = (async () => {
                while (owner.pending.size > 0)
                    await Promise.all([...owner.pending]);
            })();
            if (timeoutMs === undefined) {
                await wait;
                return;
            }
            if (timeoutMs <= 0) {
                if (owner.pending.size > 0)
                    this.ctx.logger.warn('Shadow drain deadline reached with %s pending run(s).', owner.pending.size);
                return;
            }
            let timer;
            await Promise.race([wait, new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); })]);
            if (timer !== undefined)
                clearTimeout(timer);
            if (owner.pending.size > 0)
                this.ctx.logger.warn('Shadow drain deadline reached with %s pending run(s).', owner.pending.size);
        }
        bindTurn(agent, owner, signal) {
            const controller = owner.controller;
            if (owner.turnSignal === signal && owner.turnController === controller)
                return;
            owner.unbindTurn?.();
            owner.turnSignal = signal;
            owner.turnController = controller;
            const abort = () => controller.abort(signal.reason);
            if (signal.aborted)
                abort();
            else {
                signal.addEventListener('abort', abort, { once: true });
                const off = agent.ctx.on('session/event', (session, event) => {
                    if (session === agent.session && event.type === 'turn/end')
                        owner.unbindTurn?.();
                });
                owner.unbindTurn = () => { signal.removeEventListener('abort', abort); off(); };
            }
        }
        cancelOwned(agent, owner, _cause) {
            for (const active of this.active.values())
                if (owner.workerChildren.has(active.activation.childId))
                    this.interrupt(active);
            this.batchesFor(agent).clear();
        }
        interrupt(active) {
            active.dispose().catch(error => this.ctx.logger.warn('Shadow child cleanup failed: %s', message(error)));
        }
        /** Read live configuration, definitions and current-session run state. */
        async status(agent) {
            const owner = this.owner(agent);
            const config = this.currentConfig();
            const catalog = await loadDefinitions(config);
            return [`Shadow Mind: ${owner.paused ? 'paused' : 'enabled'}; auto ${this.autoEnabled ? 'on' : 'off'}; ${owner.running.size} active; heartbeat ${owner.heartbeatRuns}/${config.maxHeartbeatRunsPerTask}.`,
                `Definitions: ${config.definitionsDirectory}`,
                ...catalog.definitions.map(definition => `${definition.id}: ${definition.enabled ? definition.triggers.join(', ') : 'disabled'}; tools=${definition.tools.join(',') || 'default read-only'}; final rounds=${owner.finalRounds.get(definition.id) ?? 0}/${definition.finalResponseRounds || 'unlimited'}`),
                ...catalog.diagnostics, ...owner.diagnostics, ...recentRuns(agent.session),
                ...(catalog.definitions.length === 0 ? ['No Shadow definitions are configured. Add a Markdown responsibility file to the definitions directory.'] : []),
            ].join('\n');
        }
        /** Return only the live state owned by the requested root Session. */
        async snapshot(sessionId, signal) {
            signal.throwIfAborted();
            const agent = this.ctx.agents.get(sessionId);
            if (agent === undefined || !this.root(agent)) {
                return { present: false, paused: false, autoEnabled: this.autoEnabled, epoch: 0, activeCount: 0, running: [], eventCount: 0,
                    recentEvents: [], shadows: [], diagnostics: [], heartbeatProbability: 0, maxParallelShadows: 0, defaultShadowTimeoutSeconds: 0, defaultShadowModel: null };
            }
            const owner = this.owner(agent);
            const config = this.currentConfig();
            const catalog = await loadDefinitions(config);
            const owned = [...this.active.values()].filter(run => owner.workerChildren.has(run.activation.childId));
            const events = eventHistory(agent.session);
            return {
                present: true, paused: owner.paused, autoEnabled: this.autoEnabled, epoch: events.recent.at(-1)?.seq ?? 0,
                activeCount: owned.length,
                running: owned.map(run => ({ childId: String(run.activation.childId), shadowId: run.definition.id, startedAt: run.startedAt, timeoutMs: run.timeoutMs })),
                eventCount: events.count, recentEvents: events.recent,
                shadows: catalog.definitions.map(definition => ({ id: definition.id, name: definition.name, enabled: definition.enabled,
                    activationProbability: definition.probability, tools: [...definition.tools] })),
                diagnostics: [...catalog.diagnostics, ...owner.diagnostics].map(message => ({ filePath: config.definitionsDirectory, message })),
                heartbeatProbability: config.heartbeatProbability, maxParallelShadows: config.maxParallel,
                defaultShadowTimeoutSeconds: config.timeoutSeconds, defaultShadowModel: config.defaultShadowModel ?? null,
            };
        }
        async pause(agent, paused) {
            if (!this.root(agent) || this.ctx.agents.get(agent.id) !== agent)
                throw new Error('Shadow controls require a live root-session Agent');
            const owner = this.owner(agent);
            owner.paused = paused;
            owner.controller.abort(new Error(paused ? 'paused by user' : 'resumed by user'));
            this.cancelOwned(agent, owner, new Error(paused ? 'paused by user' : 'resumed by user'));
            record(agent.session, { kind: 'pause', paused });
            await this.drain(owner);
            if (!paused)
                owner.controller = new AbortController();
        }
        async review(agent, signal, id, extraTools = []) {
            if (!this.root(agent) || this.ctx.agents.get(agent.id) !== agent)
                throw new Error('Shadow checks require a live root-session Agent');
            const owner = this.owner(agent);
            if (owner.paused)
                throw new Error('Shadow Mind is paused; run /shadow resume first');
            if (owner.taskId === undefined)
                throw new Error('Send a task before requesting a Shadow run');
            if (owner.pending.size > 0)
                throw new Error('A Shadow batch is already running; use /shadow status or pause it first');
            const pending = this.batch(agent, owner, 'manual', signal, [], id, extraTools);
            this.track(agent, owner, pending);
            await pending;
        }
        async probe(agent, signal, id, extraTools = []) {
            if (!this.root(agent) || this.ctx.agents.get(agent.id) !== agent)
                throw new Error('Shadow probes require a live root-session Agent');
            const owner = this.owner(agent);
            if (owner.paused)
                throw new Error('Shadow Mind is paused; run /shadow resume first');
            if (owner.taskId === undefined)
                throw new Error('Send a task before requesting a Shadow run');
            if (owner.pending.size > 0)
                throw new Error('A Shadow batch is already running; use /shadow status or pause it first');
            const pending = this.batch(agent, owner, 'manual', signal, [], id, extraTools, true);
            this.track(agent, owner, pending);
            await pending;
            return await this.status(agent);
        }
        setAuto(enabled) {
            this.autoEnabled = enabled;
            return `Shadow automatic heartbeat reviews ${enabled ? 'enabled' : 'disabled'}.`;
        }
        async clean(agent) {
            if (!this.root(agent) || this.ctx.agents.get(agent.id) !== agent)
                throw new Error('Shadow controls require a live root-session Agent');
            const owner = this.owner(agent);
            const count = owner.running.size;
            owner.controller.abort(new Error('cleaned by user'));
            this.cancelOwned(agent, owner, new Error('cleaned by user'));
            await this.drain(owner);
            if (!owner.paused && !this.stopped)
                owner.controller = new AbortController();
            return `Stopped ${count} active Shadow run${count === 1 ? '' : 's'}.`;
        }
        async manage(agent, operation, args = {}, signal) {
            if (!this.root(agent) || this.ctx.agents.get(agent.id) !== agent)
                throw new Error('Shadow management requires a live root-session Agent');
            const config = this.currentConfig();
            const entity = new EntityStore(config, () => loadDefinitions(config));
            if (operation === 'list')
                return formatCatalog(await entity.list());
            if (operation === 'read-config')
                return serializeConfig(this.config);
            if (operation === 'update-config') {
                await this.confirm(agent, 'update_shadow_config', 'Update global Shadow Mind configuration?', args, signal);
                await this.updateSettings(args);
                return 'Shadow Mind configuration updated.';
            }
            const id = typeof args.id === 'string' ? args.id : '';
            if (operation === 'create') {
                const definition = definitionFromInput(args);
                await this.confirm(agent, 'create_shadow', `Create Shadow "${definition.name}"?`, args, signal);
                await entity.create(definition);
                return `Created ${definition.id}.`;
            }
            const definition = await entity.get(id);
            await this.confirm(agent, `${operation}_shadow`, `${operation} Shadow "${definition.name}"?`, args, signal);
            if (operation === 'delete') {
                await entity.delete(id);
                return `Deleted ${id}; debug logs remain.`;
            }
            if (operation === 'enable' || operation === 'disable') {
                await entity.setEnabled(id, operation === 'enable');
                return `${operation}d ${id}.`;
            }
            const patch = definitionPatch(args);
            await entity.update(id, patch);
            return `Updated ${id}.`;
        }
        async updateSettings(args) {
            const settings = this.ctx.get('settings');
            if (settings?.update === undefined)
                throw new Error('Shadow Mind settings are unavailable in this profile.');
            const keys = {
                heartbeat_probability: 'heartbeatProbability', heartbeat_tools: 'heartbeatTools', max_parallel_shadows: 'maxParallel',
                default_shadow_timeout_seconds: 'timeoutSeconds', headless_drain_timeout_seconds: 'headlessDrainTimeoutSeconds',
                result_batch_window_ms: 'resultBatchWindowMs', max_heartbeat_runs_per_task: 'maxHeartbeatRunsPerTask',
                max_definitions: 'maxDefinitions', max_definition_bytes: 'maxDefinitionBytes', max_trajectory_chars: 'maxTrajectoryChars',
                max_entry_chars: 'maxEntryChars', max_report_chars: 'maxReportChars', max_output_tokens: 'maxOutputTokens',
                excluded_extensions: 'excludedExtensions', default_shadow_model: 'defaultShadowModel',
                default_thinking_level: 'defaultThinkingLevel', random_seed: 'randomSeed',
            };
            const patch = Object.fromEntries(Object.entries(args).flatMap(([key, value]) => {
                const mapped = keys[key];
                return mapped === undefined || value === undefined ? [] : [[mapped, value]];
            }));
            await settings.update('shadow-mind-runtime', patch);
        }
        async manageForCurrentAgent(operation, args = {}) {
            const agent = this.ctx.agents.currentInitiator();
            if (agent === undefined || !this.root(agent))
                throw new Error('Shadow management requires a live root-session tool call');
            return this.manage(agent, operation, args);
        }
        async confirm(agent, toolName, message, args, signal) {
            const approval = this.ctx.get('approval');
            if (approval === undefined || (await approval.request({ agent, toolName, reason: `${message}\n\n${JSON.stringify(args, null, 2).slice(0, 4000)}`, ...(signal === undefined ? {} : { signal }) })) !== 'allowed-once') {
                throw new Error('User approval is required for this Shadow Mind change.');
            }
        }
        acceptRunReport(childId, runId, report) {
            const active = this.active.get(childId);
            if (active !== undefined && active.runId === runId && active.mode === 'worker') {
                active.report(report);
                return;
            }
            const pending = this.pendingPolicies.get(childId);
            if (pending?.policy.runId !== runId || pending.mode !== 'worker')
                throw new Error('This Shadow worker run is no longer active.');
            pending.report(report);
        }
        async selectThinkingLevel(agent, pending, creationSignal) {
            const signal = creationSignal ?? pending.signal;
            signal.throwIfAborted();
            const selection = agent.model.current();
            if (selection === undefined)
                throw new Error('Shadow child has no selected provider/model route');
            const model = await this.ctx.llm.resolveModelInfo(selection.provider, selection.model, signal);
            signal.throwIfAborted();
            const efforts = model.reasoning?.efforts;
            if (efforts === undefined) {
                this.ctx.logger.debug('Shadow model %s/%s does not declare thinking levels; using its default.', selection.provider, selection.model);
                return;
            }
            if (!efforts.some(effort => effort.id === pending.level)) {
                if (pending.explicit)
                    throw new Error(`Shadow model ${selection.provider}/${selection.model} does not support thinking_level ${pending.level}`);
                this.ctx.logger.debug('Shadow model %s/%s does not support default thinking level %s; using its default.', selection.provider, selection.model, pending.level);
                return;
            }
            agent.model.select({ ...selection, reasoningEffort: ReasoningEffortId(pending.level) });
        }
        async batch(agent, owner, trigger, external, executedTools = [], id, extraTools = [], singleManual = false) {
            const config = this.currentConfig();
            const taskId = owner.taskId;
            if (taskId === undefined || owner.paused || this.stopped)
                return;
            const signal = external === undefined ? owner.controller.signal : AbortSignal.any([owner.controller.signal, external]);
            const catalog = await loadDefinitions(config);
            if (!this.isCurrent(agent, owner, taskId, signal))
                return;
            owner.latestTrajectory = captureTrajectory(agent.session, config);
            const route = agent.model.current();
            const model = route === undefined ? '*' : `${route.provider}/${route.model}`;
            let decision;
            if (trigger === 'heartbeat') {
                if (owner.heartbeatRuns >= config.maxHeartbeatRunsPerTask)
                    return;
                decision = decideHeartbeat({ definitions: catalog.definitions, heartbeatProbability: config.heartbeatProbability, heartbeatTools: config.heartbeatTools,
                    mainModel: model, executedTools, active: owner.running, availableSlots: Math.max(0, config.maxParallel - this.active.size), random: this.random });
                record(agent.session, { kind: 'scheduler', trigger, taskId, ...(decision.heartbeatRoll === undefined ? {} : { heartbeatRoll: decision.heartbeatRoll }), candidates: decision.candidates,
                    modelFiltered: decision.modelFiltered, runningExcluded: decision.runningExcluded, toolFiltered: decision.toolFiltered });
            }
            else if (trigger === 'final_response') {
                decision = decideFinalResponse({ definitions: catalog.definitions, mainModel: model, active: owner.running, rounds: owner.finalRounds });
            }
            else {
                const candidates = catalog.definitions.filter(definition => definition.enabled && matchesModel(definition, model) && !owner.running.has(definition.id));
                const eligible = id === undefined ? candidates : candidates.filter(item => item.id === id);
                const selected = singleManual && eligible.length > 0 ? [eligible[Math.floor(this.random() * eligible.length)]] : eligible;
                if (selected.length === 0) {
                    throw new Error(`No eligible Shadow definition${id === undefined ? 's' : ` named ${id}`}. ${catalog.diagnostics.join('; ')}`);
                }
                decision = { activated: selected.map(definition => ({ definition, roll: 0 })), candidates: selected.map(({ id: candidateId }) => ({ id: candidateId, roll: 0, selected: true })), modelFiltered: [], runningExcluded: [], toolFiltered: [], roundFiltered: [] };
                record(agent.session, { kind: 'scheduler', trigger, taskId, candidates: decision.candidates, modelFiltered: decision.modelFiltered,
                    runningExcluded: decision.runningExcluded, roundFiltered: decision.roundFiltered });
            }
            let activations = [...decision.activated];
            if (id !== undefined)
                activations = activations.filter(item => item.definition.id === id);
            if (activations.length === 0)
                return;
            if (trigger === 'heartbeat')
                owner.heartbeatRuns += activations.length;
            else if (trigger === 'final_response')
                for (const { definition } of activations)
                    owner.finalRounds.set(definition.id, (owner.finalRounds.get(definition.id) ?? 0) + 1);
            const finalCheck = trigger === 'final_response' || (trigger === 'manual' && !singleManual);
            if (finalCheck)
                owner.completionClaimed = true;
            record(agent.session, { kind: 'claim', taskId, trigger, ids: activations.map(item => item.definition.id), ...(finalCheck ? { finalCheck: true } : {}) });
            if (trigger === 'final_response')
                record(agent.session, { kind: 'final-round', taskId, ids: activations.map(item => item.definition.id) });
            const cwd = await this.ctx.workingDirectory.ensure(agent, signal);
            const runs = await Promise.all(activations.map(({ definition }) => this.start(agent, owner, taskId, signal, definition, owner.latestTrajectory, cwd, trigger, trigger !== 'heartbeat', definition.tools.length > 0 || extraTools.length > 0 ? 'worker' : 'review', extraTools)));
            if (!this.isCurrent(agent, owner, taskId, signal))
                return;
            const completed = runs.filter((run) => run !== undefined);
            if (completed.length === 0)
                return;
            for (const report of completed)
                this.batchesFor(agent).add(report);
            if (trigger !== 'heartbeat')
                this.batchesFor(agent).flush().catch(error => { owner.diagnostics.push(message(error)); });
        }
        async start(agent, owner, taskId, ownerSignal, definition, trajectory, cwd, trigger, wait, mode, extraTools = []) {
            const config = this.currentConfig();
            const runId = randomUUID();
            const deadline = new AbortController();
            const timeout = setTimeout(() => deadline.abort(new Error('Shadow deadline exceeded')), (definition.timeoutSeconds ?? config.timeoutSeconds) * 1000);
            const signal = AbortSignal.any([ownerSignal, deadline.signal]);
            let release;
            let activation;
            let disposePromise;
            let status = 'failed';
            let detail;
            let report;
            let ownsId = false;
            const childId = SessionId(randomUUID());
            let pendingPolicy;
            const onReport = (value) => {
                report = { status: 'report', ...value, mode, runId, shadowId: definition.id,
                    shadowName: definition.name, childSessionId: childId, capturedThroughSeq: trajectory.capturedThroughSeq };
            };
            const requestDispose = () => { if (activation !== undefined)
                disposePromise ??= activation.dispose(); if (disposePromise !== undefined)
                void disposePromise.catch(() => { }); };
            try {
                release = await this.slots.acquire(signal, wait);
                if (release === undefined || owner.running.has(definition.id)) {
                    status = 'skipped';
                    return undefined;
                }
                owner.running.add(definition.id);
                ownsId = true;
                signal.throwIfAborted();
                record(agent.session, { kind: 'run', taskId, runId, shadowId: definition.id, trigger, mode, status: 'running' });
                if (mode === 'worker') {
                    const allowedTools = await this.resolveWorkerTools(agent, definition, extraTools);
                    signal.throwIfAborted();
                    const policy = { runId, shadowId: definition.id, shadowName: definition.name, mode, allowedTools,
                        writeTools: allowedTools.filter(name => !workerReadOnlyTools.has(name) && name !== 'report_to_main'),
                        reportableRefs: trajectory.refs, capturedThroughSeq: trajectory.capturedThroughSeq, taskId: String(taskId), maxReportChars: config.maxReportChars };
                    pendingPolicy = { policy, mode, report: onReport };
                    this.pendingPolicies.set(childId, pendingPolicy);
                }
                this.pendingThinking.set(childId, {
                    level: definition.thinkingLevel ?? config.defaultThinkingLevel,
                    explicit: definition.thinkingLevel !== undefined,
                    signal,
                });
                activation = await this.ctx.subagents.startActivation({ provider: 'spawn', label: `Shadow ${mode}: ${definition.name}`, delivery: 'caller', signal,
                    childId,
                    request: { parent: agent, cwd, ...(mode === 'review' ? { agentPreset: 'shadow-mind-review' } : { agentPreset: await this.ensureWorkerPreset(agent) }),
                        maxDepth: 1, prompt: [{ type: 'text', text: reviewPrompt(definition, trajectory, mode) }], ...(mode === 'review' ? { outputSchema: resultSchema(config.maxReportChars, mode) } : {}),
                        // Clear inherited effort; the child selects a supported Shadow level in agent/created.
                        agentOptions: { ...(definition.route ?? config.defaultShadowModel ? parseRoute(definition.route ? `${definition.route.provider}/${definition.route.model}` : config.defaultShadowModel) : {}),
                            maxTokens: config.maxOutputTokens, reasoningEffort: undefined },
                    },
                });
                const id = activation.childId;
                owner.workerChildren.add(id);
                const active = { runId, taskId, definition, mode, activation, dispose: activation.dispose, report: onReport,
                    startedAt: Date.now(), timeoutMs: (definition.timeoutSeconds ?? config.timeoutSeconds) * 1000 };
                this.active.set(id, active);
                signal.addEventListener('abort', requestDispose, { once: true });
                if (signal.aborted)
                    requestDispose();
                const result = await activation.result;
                signal.throwIfAborted();
                if (result.stopReason !== 'completed')
                    throw new Error(`Shadow stopped with ${result.stopReason}${result.diagnostic ? `: ${result.diagnostic}` : ''}`);
                if (mode === 'worker' && report !== undefined)
                    status = 'report';
                else if (mode === 'worker')
                    status = 'silent';
                else {
                    const parsed = parseResult(result.structured, trajectory.refs, config.maxReportChars, mode);
                    status = parsed.status;
                    if (parsed.status === 'report')
                        report = { ...parsed, mode, runId, shadowId: definition.id, shadowName: definition.name,
                            childSessionId: id, capturedThroughSeq: trajectory.capturedThroughSeq };
                }
            }
            catch (error) {
                status = deadline.signal.aborted ? 'timeout' : signal.aborted ? 'cancelled' : 'failed';
                detail = message(error).slice(0, 1000);
            }
            finally {
                this.pendingPolicies.delete(childId);
                this.pendingThinking.delete(childId);
                clearTimeout(timeout);
                signal.removeEventListener('abort', requestDispose);
                try {
                    requestDispose();
                    await disposePromise;
                }
                catch (error) {
                    status = 'failed';
                    detail = `Child cleanup failed: ${message(error)}`.slice(0, 1000);
                    report = undefined;
                }
                pendingPolicy?.release?.();
                const id = activation?.childId;
                if (id !== undefined) {
                    this.active.delete(id);
                    owner.workerChildren.delete(id);
                }
                if (ownsId)
                    owner.running.delete(definition.id);
                release?.();
                if (this.ctx.agents.get(agent.id) === agent)
                    record(agent.session, { kind: 'run', taskId, runId, shadowId: definition.id, trigger, mode, status,
                        ...(id === undefined ? {} : { childSessionId: id }), ...(detail === undefined ? {} : { detail }) });
            }
            return status === 'report' ? report : undefined;
        }
        async resolveWorkerTools(agent, definition, extraTools = []) {
            const presetId = this.ctx.agentPresets.composedPreset(agent.ctx);
            if (presetId === undefined)
                throw new Error('Worker mode requires an active parent Agent preset');
            const available = new Set(this.ctx.tools.schemas(agent).map(item => item.name));
            const configured = extraTools.length > 0 ? extraTools : definition.tools;
            const requested = configured.includes('*') ? [...available] : configured;
            const missing = requested.filter(name => !available.has(name));
            if (missing.length)
                throw new Error(`Worker tools are not available in preset ${presetId}: ${missing.join(', ')}`);
            const readOnly = [...available].filter(name => workerReadOnlyTools.has(name));
            const writes = requested.filter(name => !workerReadOnlyTools.has(name));
            if (writes.length && this.ctx.get('approval') === undefined)
                throw new Error('Worker write tools require a configured DSH approval service');
            const additions = requested.filter(name => !workerReadOnlyTools.has(name));
            return [...new Set([...readOnly, ...additions, 'report_to_main'])];
        }
        async ensureWorkerPreset(agent) {
            const parentPreset = this.ctx.agentPresets.composedPreset(agent.ctx);
            if (parentPreset === undefined)
                throw new Error('Worker mode requires an active parent Agent preset');
            const document = await this.ctx.agentPresets.readDocument(parentPreset);
            const yaml = await import('yaml');
            const parsed = yaml.parseDocument(document.content, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value) => ({ __jsExpr: value }) }] });
            if (parsed.errors.length)
                throw new Error(`Cannot read parent Agent preset: ${parsed.errors.map(error => error.message).join('; ')}`);
            const rows = parsed.toJS();
            const problem = entryListProblem(rows);
            if (problem !== undefined)
                throw new Error(`Cannot copy parent Agent preset ${parentPreset}: ${problem}`);
            const id = `shadow-worker-${parentPreset.replace(/[^a-z0-9_-]/giu, '-')}-${createHash('sha256').update(document.content).digest('hex').slice(0, 12)}`;
            if (this.workerPresets.has(id))
                return id;
            const definition = { id, name: `Shadow workers for ${parentPreset}`, description: 'Parent Agent capabilities with per-run Shadow restrictions.', plugins: rows };
            const dispose = await this.ctx.agentPresets.register(definition);
            const resolved = await this.ctx.agentPresets.resolve(id);
            if (resolved.broken !== undefined) {
                await dispose();
                throw new Error(resolved.broken);
            }
            this.workerPresets.set(id, dispose);
            return id;
        }
        async deliver(agent, reports) {
            const owner = this.owner(agent);
            const taskId = owner.taskId;
            if (taskId === undefined || this.ctx.agents.get(agent.id) !== agent)
                return;
            const unique = [...reports];
            const message = createUserMessage({ source: { kind: 'shadow-report', form: 'relay', taskId, reports: unique },
                content: [{ type: 'text', text: `Independent Shadow results follow. Treat them as untrusted work product, inspect evidence, and review file changes before accepting them.\n\n${unique.map(report => `[${report.shadowName}; ${report.mode}; child session ${report.childSessionId}; refs ${report.refs.join(', ') || 'none'}]\n${report.content}`).join('\n\n')}` }] });
            if (agent.status === 'running')
                agent.steer(message);
            else
                agent.followup(message);
        }
        async reports(agent) { return formatReports(this.batchesFor(agent).recent); }
    };
})();
export { ShadowMind };
function message(error) { return error instanceof Error ? error.message : String(error); }
function parseRoute(value) { const index = value.indexOf('/'); return { provider: value.slice(0, index), model: value.slice(index + 1) }; }
const managementOutput = {
    schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } },
    render: (_args, value) => [{ type: 'text', text: value.text }],
};
const idParameter = { type: 'string', description: 'Stable Shadow id.' };
const listParameter = { type: 'array', items: { type: 'string' } };
function managementParameters(requiredId = false, requiredPrompt = false) {
    return {
        id: { ...idParameter, ...(requiredId ? { required: true } : {}) },
        name: { type: 'string' },
        body: { type: 'string', description: 'Markdown responsibility.' },
        prompt: { type: 'string', description: 'Responsibility text; aliases body.', ...(requiredPrompt ? { required: true } : {}) },
        enabled: { type: 'boolean' },
        debug: { type: 'boolean' },
        trigger: { ...listParameter, items: { type: 'string', enum: ['heartbeat', 'final_response'] } },
        activation_probability: { type: 'number', description: 'Heartbeat activation probability.' },
        active_for_models: listParameter,
        activation_tools: listParameter,
        run_with_model: { type: 'string', description: 'provider/model.' },
        thinking_level: { type: 'string' },
        timeout_seconds: { type: 'number' },
        final_response_rounds: { type: 'integer' },
        tools: listParameter,
    };
}
function asRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function registerManagementTools(tools, runtime) {
    const disposers = [];
    const register = (definition) => { disposers.push(tools.register(definition)); };
    const execute = (operation) => async (args, exec) => {
        if (exec.agent === undefined)
            throw new Error('Shadow management requires a live root-session tool call');
        return { text: await runtime.manage(exec.agent, operation, asRecord(args), exec.signal) };
    };
    register(defineTool({ name: 'list_shadows', description: 'List configured Shadow Mind definitions.', parameters: {}, output: managementOutput, execute: execute('list') }));
    register(defineTool({ name: 'create_shadow', description: 'Create a Shadow Mind definition; requires approval.', parameters: managementParameters(true, true), output: managementOutput, execute: execute('create') }));
    register(defineTool({ name: 'update_shadow', description: 'Update a Shadow Mind definition; requires approval.', parameters: managementParameters(true), output: managementOutput, execute: execute('update') }));
    register(defineTool({ name: 'enable_shadow', description: 'Enable a Shadow Mind definition; requires approval.', parameters: { id: { ...idParameter, required: true } }, output: managementOutput, execute: execute('enable') }));
    register(defineTool({ name: 'disable_shadow', description: 'Disable a Shadow Mind definition; requires approval.', parameters: { id: { ...idParameter, required: true } }, output: managementOutput, execute: execute('disable') }));
    register(defineTool({ name: 'delete_shadow', description: 'Delete a Shadow Mind definition; requires approval.', parameters: { id: { ...idParameter, required: true } }, output: managementOutput, execute: execute('delete') }));
    register(defineTool({ name: 'trigger_shadow', description: 'Run one Shadow review or worker now.', parameters: { id: idParameter, tools: listParameter }, output: managementOutput,
        execute: async (args, exec) => { if (exec.agent === undefined)
            throw new Error('Shadow management requires a live root-session tool call'); const raw = asRecord(args); return { text: await runtime.probe(exec.agent, exec.signal, typeof raw.id === 'string' ? raw.id : undefined, Array.isArray(raw.tools) ? raw.tools.filter((item) => typeof item === 'string') : []) }; } }));
    register(defineTool({ name: 'read_shadow_config', description: 'Read Shadow Mind configuration.', parameters: {}, output: managementOutput, execute: execute('read-config') }));
    register(defineTool({ name: 'write_shadow_config', description: 'Update Shadow Mind configuration; requires approval.', parameters: {
            heartbeat_probability: { type: 'number' }, heartbeat_tools: listParameter, max_parallel_shadows: { type: 'integer' },
            default_shadow_timeout_seconds: { type: 'number' }, headless_drain_timeout_seconds: { type: 'number' }, result_batch_window_ms: { type: 'integer' },
            max_heartbeat_runs_per_task: { type: 'integer' }, max_definitions: { type: 'integer' }, max_definition_bytes: { type: 'integer' },
            max_trajectory_chars: { type: 'integer' }, max_entry_chars: { type: 'integer' }, max_report_chars: { type: 'integer' }, max_output_tokens: { type: 'integer' },
            excluded_extensions: listParameter, default_shadow_model: { type: 'string' }, default_thinking_level: { type: 'string' }, random_seed: { type: 'integer' },
        }, output: managementOutput, execute: execute('update-config') }));
    return () => { for (const dispose of disposers)
        dispose(); };
}
export default ShadowMind;
//# sourceMappingURL=index.js.map