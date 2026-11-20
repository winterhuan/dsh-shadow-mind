/** Persistent, human-readable Shadow responsibilities and capability grants. */
import { mkdir, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import z from '@deepseek-ai/schemastery';
import { resolveConfig } from "./config.js";
const fields = z.object({
    id: z.string().pattern(/^[a-z0-9][a-z0-9_-]{0,63}$/u).required(),
    name: z.string().max(100).required(),
    enabled: z.boolean().default(true),
    debug: z.boolean().default(false),
    trigger: z.array(z.union(['heartbeat', 'final_response'])).default(['heartbeat']),
    activation_probability: z.number().min(0).max(1).default(0.3),
    active_for_models: z.array(z.string()).default(['*']),
    run_with_model: z.string(),
    thinking_level: z.string(),
    timeout_seconds: z.number().min(1).max(3600),
    final_response_rounds: z.number().step(1).min(0).max(100),
    activation_tools: z.array(z.string()).default([]),
    tools: z.array(z.string()).default([]),
});
const allowedFields = new Set(['id', 'name', 'enabled', 'debug', 'trigger', 'activation_probability',
    'active_for_models', 'run_with_model', 'thinking_level', 'timeout_seconds', 'final_response_rounds',
    'activation_tools', 'tools']);
export function parseDefinition(text, filename) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/u.exec(text);
    if (match === null)
        throw new Error('expected YAML frontmatter followed by a responsibility');
    const document = parseDocument(match[1] ?? '', { uniqueKeys: true });
    if (document.errors.length > 0)
        throw new Error(document.errors.map(error => error.message).join('; '));
    const input = document.toJS({ maxAliasCount: 20 });
    if (input === null || typeof input !== 'object' || Array.isArray(input))
        throw new Error('frontmatter must be an object');
    for (const key of Object.keys(input))
        if (!allowedFields.has(key))
            throw new Error(`unsupported field: ${key}`);
    const value = fields({ id: filename, name: filename, ...input });
    const body = (match[2] ?? '').trim();
    if (body === '')
        throw new Error('responsibility must not be empty');
    if (value.trigger.length === 0)
        throw new Error('trigger must contain heartbeat or final_response');
    if (value.activation_tools.some(tool => !tool.trim()))
        throw new Error('activation_tools must contain non-empty names');
    if (value.tools.some(tool => !tool.trim()))
        throw new Error('tools must contain non-empty names');
    let route;
    if (value.run_with_model !== undefined) {
        const separator = value.run_with_model.indexOf('/');
        if (separator <= 0 || separator === value.run_with_model.length - 1)
            throw new Error('run_with_model must be provider/model');
        route = { provider: value.run_with_model.slice(0, separator), model: value.run_with_model.slice(separator + 1) };
    }
    if (value.thinking_level !== undefined && !['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(value.thinking_level)) {
        throw new Error('thinking_level is unsupported');
    }
    return Object.freeze({ id: value.id, name: value.name, enabled: value.enabled, debug: value.debug,
        triggers: Object.freeze([...new Set(value.trigger)]), probability: value.activation_probability,
        activeForModels: Object.freeze(value.active_for_models),
        ...(route === undefined ? {} : { route }),
        ...(value.thinking_level === undefined ? {} : { thinkingLevel: value.thinking_level }),
        ...(value.timeout_seconds === undefined ? {} : { timeoutSeconds: value.timeout_seconds }),
        finalResponseRounds: value.final_response_rounds ?? 0,
        activationTools: Object.freeze(value.activation_tools), tools: Object.freeze(value.tools), body });
}
export async function loadDefinitions(input) {
    const config = resolveConfig(input);
    await mkdir(config.definitionsDirectory, { recursive: true });
    const files = (await readdir(config.definitionsDirectory, { withFileTypes: true }))
        .filter(entry => entry.isFile() && entry.name.endsWith('.md')).map(entry => entry.name).sort();
    if (files.length > config.maxDefinitions)
        throw new Error(`too many Shadow definitions: ${files.length}; limit ${config.maxDefinitions}`);
    const definitions = [];
    const diagnostics = [];
    for (const file of files) {
        try {
            const handle = await open(join(config.definitionsDirectory, file), 'r');
            let text;
            try {
                const buffer = Buffer.alloc(config.maxDefinitionBytes + 1);
                let length = 0;
                while (length < buffer.length) {
                    const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
                    if (bytesRead === 0)
                        break;
                    length += bytesRead;
                }
                if (length > config.maxDefinitionBytes)
                    throw new Error(`exceeds ${config.maxDefinitionBytes} bytes`);
                text = buffer.subarray(0, length).toString('utf8');
            }
            finally {
                await handle.close();
            }
            definitions.push(parseDefinition(text, file.slice(0, -3)));
        }
        catch (error) {
            diagnostics.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    const counts = new Map();
    for (const definition of definitions)
        counts.set(definition.id, (counts.get(definition.id) ?? 0) + 1);
    const duplicateIds = new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));
    for (const id of duplicateIds)
        diagnostics.push(`duplicate Shadow id: ${id}; all definitions with this id are disabled`);
    return { definitions: definitions.filter(definition => !duplicateIds.has(definition.id)), diagnostics };
}
export function serializeDefinition(definition) {
    const frontmatter = {
        id: definition.id, name: definition.name, enabled: definition.enabled, debug: definition.debug,
        activation_probability: definition.probability, trigger: [...definition.triggers],
        active_for_models: [...definition.activeForModels],
        ...(definition.route === undefined ? {} : { run_with_model: `${definition.route.provider}/${definition.route.model}` }),
        ...(definition.thinkingLevel === undefined ? {} : { thinking_level: definition.thinkingLevel }),
        ...(definition.timeoutSeconds === undefined ? {} : { timeout_seconds: definition.timeoutSeconds }),
        ...(definition.finalResponseRounds === 0 ? {} : { final_response_rounds: definition.finalResponseRounds }),
        ...(definition.activationTools.length === 0 ? {} : { activation_tools: [...definition.activationTools] }),
        tools: [...definition.tools],
    };
    return `---\n${Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n${definition.body}\n`;
}
//# sourceMappingURL=definitions.js.map