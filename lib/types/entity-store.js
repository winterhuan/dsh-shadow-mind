/** Confirmed definition edits with stable ids and atomic file replacement. */
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseDefinition, serializeDefinition } from "./definitions.js";
import {} from "./config.js";
export class EntityStore {
    config;
    refresh;
    constructor(config, refresh) {
        this.config = config;
        this.refresh = refresh;
    }
    list() { return this.refresh(); }
    async get(id) {
        const catalog = await this.refresh();
        const definition = catalog.definitions.find(item => item.id === id);
        if (definition === undefined)
            throw new Error(`Shadow definition not found: ${id}`);
        return definition;
    }
    async create(input) {
        const existing = await this.refresh();
        if (existing.definitions.some(item => item.id === input.id))
            throw new Error(`Shadow already exists: ${input.id}`);
        const path = this.path(input.id);
        await mkdir(this.config.definitionsDirectory, { recursive: true });
        const handle = await open(path, 'wx', 0o600);
        try {
            await handle.writeFile(serializeDefinition(input), 'utf8');
        }
        catch (error) {
            await unlink(path).catch(() => { });
            throw error;
        }
        finally {
            await handle.close();
        }
        return input;
    }
    async update(id, patch) {
        const current = await this.get(id);
        const updated = Object.freeze({ ...current, ...patch, id, body: patch.body ?? current.body });
        const path = this.path(id);
        const temporary = `${path}.${randomUUID()}.tmp`;
        try {
            await open(temporary, 'wx', 0o600).then(async (handle) => { try {
                await handle.writeFile(serializeDefinition(updated), 'utf8');
            }
            finally {
                await handle.close();
            } });
            parseDefinition(await readFile(temporary, 'utf8'), id);
            await rename(temporary, path);
        }
        finally {
            await unlink(temporary).catch(() => { });
        }
        return updated;
    }
    async setEnabled(id, enabled) { return this.update(id, { enabled }); }
    async delete(id) {
        const definition = await this.get(id);
        await unlink(this.path(definition.id));
    }
    path(id) {
        if (!/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(id))
            throw new Error('Shadow id must use lowercase letters, numbers, underscores, or hyphens');
        return join(this.config.definitionsDirectory, `${basename(id)}.md`);
    }
}
export function formatCatalog(catalog) {
    const rows = catalog.definitions.map(item => `${item.enabled ? 'enabled' : 'disabled'} ${item.id} (${item.name}) triggers=${item.triggers.join(',')} tools=${item.tools.join(',') || 'read-only'}`);
    return [...rows, ...catalog.diagnostics.map(item => `diagnostic: ${item}`), ...(rows.length === 0 ? ['No Shadow definitions configured.'] : [])].join('\n');
}
export function definitionFromInput(args) {
    const id = typeof args.id === 'string' ? args.id : '';
    const name = typeof args.name === 'string' ? args.name : id;
    const body = typeof args.body === 'string' ? args.body : typeof args.prompt === 'string' ? args.prompt : '';
    if (!id || !body)
        throw new Error('create requires id and body');
    return parseDefinition(serializeDefinition({
        id, name, enabled: args.enabled !== false, debug: args.debug === true,
        triggers: Array.isArray(args.trigger) ? args.trigger.filter((value) => value === 'heartbeat' || value === 'final_response') : ['heartbeat'],
        probability: typeof args.activation_probability === 'number' ? args.activation_probability : 0.3,
        activeForModels: Array.isArray(args.active_for_models) ? args.active_for_models.filter((value) => typeof value === 'string') : ['*'],
        ...(typeof args.run_with_model === 'string' ? { route: { provider: args.run_with_model.split('/')[0] ?? '', model: args.run_with_model.split('/').slice(1).join('/') } } : {}),
        ...(typeof args.thinking_level === 'string' ? { thinkingLevel: args.thinking_level } : {}),
        ...(typeof args.timeout_seconds === 'number' ? { timeoutSeconds: args.timeout_seconds } : {}),
        finalResponseRounds: typeof args.final_response_rounds === 'number' ? args.final_response_rounds : 0,
        activationTools: Array.isArray(args.activation_tools) ? args.activation_tools.filter((value) => typeof value === 'string') : [],
        tools: Array.isArray(args.tools) ? args.tools.filter((value) => typeof value === 'string') : [], body,
    }), id);
}
export function definitionPatch(args) {
    const patch = {};
    if (typeof args.name === 'string')
        patch.name = args.name;
    if (typeof args.body === 'string' || typeof args.prompt === 'string')
        patch.body = typeof args.body === 'string' ? args.body : args.prompt;
    if (typeof args.enabled === 'boolean')
        patch.enabled = args.enabled;
    if (typeof args.debug === 'boolean')
        patch.debug = args.debug;
    if (typeof args.activation_probability === 'number')
        patch.probability = args.activation_probability;
    if (Array.isArray(args.trigger))
        patch.triggers = args.trigger.filter((value) => value === 'heartbeat' || value === 'final_response');
    if (Array.isArray(args.active_for_models))
        patch.activeForModels = args.active_for_models.filter((value) => typeof value === 'string');
    if (Array.isArray(args.activation_tools))
        patch.activationTools = args.activation_tools.filter((value) => typeof value === 'string');
    if (Array.isArray(args.tools))
        patch.tools = args.tools.filter((value) => typeof value === 'string');
    if (typeof args.run_with_model === 'string') {
        const separator = args.run_with_model.indexOf('/');
        if (separator <= 0)
            throw new Error('run_with_model must be provider/model');
        patch.route = { provider: args.run_with_model.slice(0, separator), model: args.run_with_model.slice(separator + 1) };
    }
    if (typeof args.thinking_level === 'string')
        patch.thinkingLevel = args.thinking_level;
    if (typeof args.timeout_seconds === 'number')
        patch.timeoutSeconds = args.timeout_seconds;
    if (typeof args.final_response_rounds === 'number')
        patch.finalResponseRounds = args.final_response_rounds;
    return patch;
}
//# sourceMappingURL=entity-store.js.map