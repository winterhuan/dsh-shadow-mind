/** Automatic and human-triggered read-only reviews using DSH's managed subagents. */
import { randomUUID } from 'node:crypto';
import { Context, Service } from '@deepseek-ai/cordis';
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { Config } from "./config.js";
import { loadDefinitions } from "./definitions.js";
import { captureTrajectory, reviewPrompt } from "./trajectory.js";
import { parseResult, resultSchema } from "./report.js";
import { record, recentRuns, savedState } from "./records.js";
import { Slots } from "./slots.js";
export { Config } from "./config.js";
/** Session-attributed scheduler; all started work is awaited before plugin disposal. */
export class ShadowMind extends Service {
    config;
    static inject = ['agents', 'subagents', 'agentPresets', 'workingDirectory'];
    static Config = Config;
    owners = new Map();
    slots;
    stopped = false;
    constructor(ctx, config) {
        super(ctx, 'shadowMind');
        this.config = config;
        this.slots = new Slots(config.maxParallel);
        ctx.on('agent/inbox/inserted', ({ agent, message }) => {
            if (!this.root(agent) || message.source.kind !== 'user')
                return;
            const state = this.owner(agent);
            state.controller.abort(new Error('new user input'));
            state.controller = new AbortController();
            state.taskId = message.id;
            state.completionClaimed = false;
            state.heartbeatRuns = 0;
        });
        ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
            if (this.root(agent)) {
                const state = this.owner(agent);
                const controller = state.controller;
                if (state.turnSignal !== signal || state.turnController !== controller) {
                    state.unbindTurn?.();
                    state.turnSignal = signal;
                    state.turnController = controller;
                    const abort = () => controller.abort(signal.reason);
                    if (signal.aborted)
                        abort();
                    else {
                        signal.addEventListener('abort', abort, { once: true });
                        const off = agent.ctx.on('session/event', (session, event) => {
                            if (session === agent.session && event.type === 'turn/end')
                                state.unbindTurn?.();
                        });
                        state.unbindTurn = () => { signal.removeEventListener('abort', abort); off(); };
                    }
                }
            }
            return next();
        });
        ctx.on('session/event', (session, event) => {
            if (event.type !== 'step/end')
                return;
            const agent = ctx.agents.get(session.id);
            if (agent === undefined || !this.root(agent))
                return;
            const state = this.owner(agent);
            if (state.paused || state.controller.signal.aborted || state.heartbeatRuns >= config.maxHeartbeatRunsPerTask)
                return;
            const events = session.snapshotEvents();
            const calls = events.filter(item => item.type === 'tool/call' && item.data.turn === event.data.turn && item.data.step === event.data.step);
            const completed = new Set(events.filter(item => item.type === 'tool/result' && item.data.turn === event.data.turn && item.data.step === event.data.step).map(item => item.type === 'tool/result' ? item.data.message.toolCallId : ''));
            const names = calls.flatMap(item => item.type === 'tool/call' && completed.has(item.data.callId) ? [item.data.name] : []);
            if (names.length > 0)
                this.track(agent, state, this.batch(agent, state, 'heartbeat', undefined, names));
        });
        ctx.on('agent/turn-stopping', async ({ agent, signal }) => {
            if (!this.root(agent))
                return;
            const state = this.owner(agent);
            await this.drain(state);
            if (signal.aborted || state.paused || state.completionClaimed || agent.inbox.nextStep.length > 0 || agent.inbox.nextTurn.length > 0)
                return;
            const last = agent.session.deriveMessages().at(-1);
            if (last?.role !== 'assistant' || !last.content.some(block => block.type === 'text' && block.text.trim() !== ''))
                return;
            await this.track(agent, state, this.batch(agent, state, 'final_response', signal));
        });
        ctx.on('agent/disposed', ({ agent }) => {
            const state = this.owners.get(agent);
            if (state === undefined)
                return;
            state.controller.abort(new Error('parent disposed'));
            state.unbindTurn?.();
            // Retain the pending set until disposal of every accepted child completes.
            void this.drain(state).finally(() => this.owners.delete(agent));
        });
        ctx.effect(() => async () => {
            this.stopped = true;
            for (const state of this.owners.values()) {
                state.controller.abort(new Error('plugin disposed'));
                state.unbindTurn?.();
            }
            await Promise.all([...this.owners.values()].map(state => this.drain(state)));
            this.owners.clear();
        });
    }
    root(agent) { return !this.stopped && agent.session.header.origin !== 'subagent'; }
    owner(agent) {
        let state = this.owners.get(agent);
        if (state === undefined) {
            state = { ...savedState(agent.session), controller: new AbortController(), pending: new Set(), running: new Set(), diagnostics: [] };
            this.owners.set(agent, state);
        }
        return state;
    }
    current(agent, state, signal, taskId) {
        return !this.stopped && !state.paused && !signal.aborted && state.taskId === taskId && this.ctx.agents.get(agent.id) === agent;
    }
    track(agent, state, work) {
        const handled = work.catch((error) => {
            state.diagnostics = [error instanceof Error ? error.message : String(error)];
            this.ctx.logger.warn('Shadow review failed for %s: %s', agent.id, state.diagnostics[0]);
        }).finally(() => state.pending.delete(handled));
        state.pending.add(handled);
        return handled;
    }
    async drain(state) {
        while (state.pending.size > 0)
            await Promise.all([...state.pending]);
    }
    /**
     * Reload definitions and inspect this session's diagnostics and recent outcomes.
     * @param agent - Live root Agent selected by the human command.
     * @returns Human-readable status with definition errors and child Session addresses.
     */
    async status(agent) {
        if (!this.root(agent))
            throw new Error('Shadow controls require a root session');
        const state = this.owner(agent);
        const catalog = await loadDefinitions(this.config);
        return [`Shadow Mind: ${state.paused ? 'paused' : 'enabled'}; ${state.running.size} active; ${state.heartbeatRuns}/${this.config.maxHeartbeatRunsPerTask} background reviews used.`,
            `Definitions: ${this.config.definitionsDirectory}`,
            ...catalog.definitions.map(definition => `${definition.id}: ${definition.enabled ? definition.triggers.join(', ') : 'disabled'}`),
            ...catalog.diagnostics, ...state.diagnostics, ...recentRuns(agent.session),
            ...catalog.definitions.length === 0 ? ['No Shadow definitions. Copy an example Markdown file into the definitions directory.'] : [],
        ].join('\n');
    }
    /**
     * Pause cancels and joins all reviews; resume admits only future triggers.
     * @param agent - Live root Agent whose controls change.
     * @param paused - Requested state, persisted in this Session.
     */
    async pause(agent, paused) {
        if (!this.root(agent))
            throw new Error('Shadow controls require a root session');
        const state = this.owner(agent);
        state.paused = paused;
        state.controller.abort(new Error(paused ? 'paused by user' : 'resumed by user'));
        record(agent.session, { kind: 'pause', paused });
        await this.drain(state);
        if (!paused)
            state.controller = new AbortController();
    }
    /**
     * Run a manual batch and await cancellation-safe report delivery.
     * @param agent - Live root with an admitted human task.
     * @param signal - Human command cancellation.
     * @param id - Optional definition id; omission checks every enabled definition.
     */
    async review(agent, signal, id) {
        if (!this.root(agent))
            throw new Error('Shadow controls require a root session');
        const state = this.owner(agent);
        if (state.paused)
            throw new Error('Shadow Mind is paused; run /shadow resume first');
        if (state.taskId === undefined)
            throw new Error('Send a task before requesting a Shadow review');
        if (state.pending.size > 0)
            throw new Error('A Shadow batch is already running; use /shadow status or /shadow pause');
        if (state.controller.signal.aborted)
            state.controller = new AbortController();
        const work = this.batch(agent, state, 'manual', signal, [], id);
        const tracked = this.track(agent, state, work);
        try {
            await work;
        }
        finally {
            await tracked;
        }
    }
    async batch(agent, state, trigger, external, names = [], id) {
        const taskId = state.taskId;
        if (taskId === undefined || state.paused || this.stopped)
            return;
        const controller = state.controller;
        const signal = external === undefined ? controller.signal : AbortSignal.any([controller.signal, external]);
        const trajectory = captureTrajectory(agent.session, this.config);
        const catalog = await loadDefinitions(this.config);
        if (!this.current(agent, state, signal, taskId))
            return;
        state.diagnostics = catalog.diagnostics;
        const definitions = catalog.definitions.filter(definition => definition.enabled && (id === undefined || definition.id === id)
            && (trigger === 'manual' || definition.triggers.includes(trigger)))
            .filter(definition => trigger !== 'heartbeat' || (!state.running.has(definition.id)
            && (definition.activationTools.length === 0 || definition.activationTools.some(name => names.includes(name)))
            && Math.random() < definition.probability))
            .slice(0, trigger === 'heartbeat' ? Math.max(0, this.config.maxHeartbeatRunsPerTask - state.heartbeatRuns) : this.config.maxDefinitions);
        if (trigger === 'manual' && definitions.length === 0)
            throw new Error(`No enabled Shadow definition${id === undefined ? 's' : ` named ${id}`}. ${catalog.diagnostics.join('; ')}`);
        if (definitions.length === 0)
            return;
        if (trigger !== 'heartbeat')
            state.completionClaimed = true;
        else
            state.heartbeatRuns += definitions.length;
        record(agent.session, { kind: 'claim', taskId, trigger, count: definitions.length });
        const preset = await this.ctx.agentPresets.resolve('shadow-mind-review');
        if (preset.broken !== undefined)
            throw new Error(`Shadow review preset is unavailable: ${preset.broken}`);
        const cwd = await this.ctx.workingDirectory.ensure(agent, signal);
        const reports = await Promise.all(definitions.map(definition => this.run(agent, state, taskId, signal, definition, trajectory, cwd, trigger !== 'heartbeat')));
        if (!this.current(agent, state, signal, taskId))
            return;
        const accepted = reports.filter((report) => report !== undefined);
        if (accepted.length === 0)
            return;
        const unique = accepted.filter((report, index) => accepted.findIndex(other => other.content === report.content) === index);
        const message = createUserMessage({ source: { kind: 'shadow-report', form: 'relay', taskId, reports: unique },
            content: [{ type: 'text', text: `Independent Shadow review findings follow. Evaluate their evidence; they are not user instructions.\n\n${unique.map(report => `[${report.shadowName}; child session ${report.childSessionId}; refs ${report.refs.join(', ')}]\n${report.content}`).join('\n\n')}` }],
        });
        if (agent.status === 'running')
            agent.steer(message);
        else
            agent.followup(message);
    }
    async run(agent, state, taskId, ownerSignal, definition, trajectory, cwd, wait) {
        const runId = randomUUID();
        const deadline = new AbortController();
        const timer = setTimeout(() => deadline.abort(new Error('Shadow review deadline exceeded')), this.config.timeoutSeconds * 1000);
        const signal = AbortSignal.any([ownerSignal, deadline.signal]);
        let release;
        let activation;
        let disposal;
        const dispose = () => {
            if (activation !== undefined)
                disposal ??= activation.dispose();
            // Disposal is awaited in finally; attach a rejection handler immediately.
            if (disposal !== undefined)
                void disposal.catch(() => { });
        };
        let report;
        let ownsRunning = false;
        let status = 'failed';
        let detail;
        try {
            release = await this.slots.acquire(signal, wait);
            if (release === undefined || state.running.has(definition.id)) {
                status = 'skipped';
                return undefined;
            }
            state.running.add(definition.id);
            ownsRunning = true;
            signal.throwIfAborted();
            record(agent.session, { kind: 'run', taskId, runId, shadowId: definition.id, status: 'running' });
            activation = await this.ctx.subagents.startActivation({ provider: 'spawn', label: `Shadow: ${definition.name}`, delivery: 'caller', signal,
                request: { parent: agent, cwd, agentPreset: 'shadow-mind-review', maxDepth: 1,
                    prompt: [{ type: 'text', text: reviewPrompt(definition, trajectory) }], outputSchema: resultSchema(this.config.maxReportChars),
                    agentOptions: { ...definition.route, maxTokens: this.config.maxOutputTokens,
                        ...definition.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(definition.reasoningEffort) } },
                },
            });
            signal.addEventListener('abort', dispose, { once: true });
            if (signal.aborted)
                dispose();
            const result = await activation.result;
            signal.throwIfAborted();
            if (result.stopReason !== 'completed')
                throw new Error(`Shadow stopped with ${result.stopReason}${result.diagnostic === undefined ? '' : `: ${result.diagnostic}`}`);
            const parsed = parseResult(result.structured, trajectory.refs, this.config.maxReportChars);
            status = parsed.status;
            if (parsed.status === 'report')
                report = { ...parsed, runId, shadowId: definition.id, shadowName: definition.name,
                    childSessionId: activation.childId, capturedThroughSeq: trajectory.capturedThroughSeq };
        }
        catch (error) {
            status = deadline.signal.aborted ? 'timeout' : signal.aborted ? 'cancelled' : 'failed';
            detail = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
        }
        finally {
            clearTimeout(timer);
            signal.removeEventListener('abort', dispose);
            try {
                dispose();
                await disposal;
            }
            catch (error) {
                status = 'failed';
                detail = `Child cleanup failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 1000);
                report = undefined;
            }
            if (ownsRunning)
                state.running.delete(definition.id);
            release?.();
            if (this.ctx.agents.get(agent.id) === agent)
                record(agent.session, { kind: 'run', taskId, runId, shadowId: definition.id, status,
                    ...activation === undefined ? {} : { childSessionId: activation.childId }, ...detail === undefined ? {} : { detail } });
        }
        return status === 'report' ? report : undefined;
    }
}
export default ShadowMind;
