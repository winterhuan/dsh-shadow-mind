/** Markdown responsibilities are reloaded for each batch; invalid files stay visible as diagnostics. */
import { mkdir, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import z from '@deepseek-ai/schemastery';
const fields = z.object({
    id: z.string().pattern(/^[a-z0-9][a-z0-9_-]{0,63}$/u).required(),
    name: z.string().max(100).required(),
    enabled: z.boolean().default(true),
    trigger: z.array(z.union(['heartbeat', 'final_response'])).default(['final_response']),
    activation_probability: z.number().min(0).max(1).default(0.1),
    activation_tools: z.array(z.string()).default([]),
    run_with_model: z.string(),
    reasoning_effort: z.string(),
});
const allowedFields = new Set(['id', 'name', 'enabled', 'trigger', 'activation_probability', 'activation_tools', 'run_with_model', 'reasoning_effort']);
/**
 * Parse frontmatter and reject unsupported capability fields.
 * @param text - Complete Markdown file.
 * @param filename - File basename used when id or name is omitted.
 * @returns Validated definition; malformed metadata or empty responsibilities throw.
 */
export function parseDefinition(text, filename) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/u.exec(text);
    if (match === null)
        throw new Error('expected YAML frontmatter followed by a review responsibility');
    const document = parseDocument(match[1] ?? '', { uniqueKeys: true });
    if (document.errors.length > 0)
        throw new Error(document.errors.map(error => error.message).join('; '));
    const input = document.toJS({ maxAliasCount: 20 });
    if (input === null || typeof input !== 'object' || Array.isArray(input))
        throw new Error('frontmatter must be an object');
    for (const key of Object.keys(input))
        if (!allowedFields.has(key))
            throw new Error(`unsupported field: ${key}`);
    const values = fields({ id: filename, name: filename, ...input });
    const body = (match[2] ?? '').trim();
    if (body === '')
        throw new Error('review responsibility must not be empty');
    if (values.trigger.length === 0)
        throw new Error('trigger must contain heartbeat or final_response');
    let route;
    if (values.run_with_model !== undefined) {
        const separator = values.run_with_model.indexOf('/');
        if (separator <= 0 || separator === values.run_with_model.length - 1)
            throw new Error('run_with_model must be provider/model');
        route = { provider: values.run_with_model.slice(0, separator), model: values.run_with_model.slice(separator + 1) };
    }
    return Object.freeze({ id: values.id, name: values.name, enabled: values.enabled,
        triggers: Object.freeze([...new Set(values.trigger)]), probability: values.activation_probability,
        activationTools: Object.freeze(values.activation_tools), body,
        ...route === undefined ? {} : { route },
        ...values.reasoning_effort === undefined ? {} : { reasoningEffort: values.reasoning_effort },
    });
}
/**
 * Read bounded top-level Markdown files and exclude every duplicate id.
 * @param config - Directory and read limits.
 * @returns Catalog with diagnostics; directory access failures reject the operation.
 */
export async function loadDefinitions(config) {
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
    const duplicated = new Set(definitions.filter((definition, index) => definitions.findIndex(other => other.id === definition.id) !== index).map(definition => definition.id));
    for (const id of duplicated)
        diagnostics.push(`duplicate Shadow id: ${id}; all definitions with this id are disabled`);
    return { definitions: definitions.filter(definition => !duplicated.has(definition.id)), diagnostics };
}
