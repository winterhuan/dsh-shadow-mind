import { type Config, type ConfigInput, type ResolvedConfig } from './config.ts';
export type Trigger = 'heartbeat' | 'final_response';
export interface Definition {
    readonly id: string;
    readonly name: string;
    readonly enabled: boolean;
    readonly debug: boolean;
    readonly triggers: readonly Trigger[];
    readonly probability: number;
    readonly activeForModels: readonly string[];
    readonly route?: {
        readonly provider: string;
        readonly model: string;
    };
    readonly thinkingLevel?: string;
    readonly timeoutSeconds?: number;
    readonly finalResponseRounds: number;
    readonly activationTools: readonly string[];
    readonly tools: readonly string[];
    readonly body: string;
}
export interface Catalog {
    readonly definitions: readonly Definition[];
    readonly diagnostics: readonly string[];
}
export declare function parseDefinition(text: string, filename: string): Definition;
export declare function loadDefinitions(input: ResolvedConfig | Config | ConfigInput): Promise<Catalog>;
export declare function serializeDefinition(definition: Definition): string;
//# sourceMappingURL=definitions.d.ts.map