import type { Config } from './config.ts';
/** Automatic activation point; manual reviews ignore this filter. */
export type Trigger = 'heartbeat' | 'final_response';
/** One immutable responsibility snapshot, with an optional explicit model route. */
export interface Definition {
    readonly id: string;
    readonly name: string;
    readonly enabled: boolean;
    readonly triggers: readonly Trigger[];
    readonly probability: number;
    readonly activationTools: readonly string[];
    readonly body: string;
    readonly route?: {
        readonly provider: string;
        readonly model: string;
    };
    readonly reasoningEffort?: string;
}
/** Usable definitions and file-specific failures from one directory read. */
export interface Catalog {
    readonly definitions: readonly Definition[];
    readonly diagnostics: readonly string[];
}
/**
 * Parse frontmatter and reject unsupported capability fields.
 * @param text - Complete Markdown file.
 * @param filename - File basename used when id or name is omitted.
 * @returns Validated definition; malformed metadata or empty responsibilities throw.
 */
export declare function parseDefinition(text: string, filename: string): Definition;
/**
 * Read bounded top-level Markdown files and exclude every duplicate id.
 * @param config - Directory and read limits.
 * @returns Catalog with diagnostics; directory access failures reject the operation.
 */
export declare function loadDefinitions(config: Config): Promise<Catalog>;
