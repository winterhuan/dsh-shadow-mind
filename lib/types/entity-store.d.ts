import { type Catalog, type Definition } from './definitions.ts';
import { type Config, type ConfigInput, type ResolvedConfig } from './config.ts';
export declare class EntityStore {
    private readonly config;
    private readonly refresh;
    constructor(config: ResolvedConfig | Config | ConfigInput, refresh: () => Promise<Catalog>);
    list(): Promise<Catalog>;
    get(id: string): Promise<Definition>;
    create(input: Definition): Promise<Definition>;
    update(id: string, patch: Partial<Omit<Definition, 'id'>>): Promise<Definition>;
    setEnabled(id: string, enabled: boolean): Promise<Definition>;
    delete(id: string): Promise<void>;
    private path;
}
export declare function formatCatalog(catalog: Catalog): string;
export declare function definitionFromInput(args: Record<string, unknown>): Definition;
export declare function definitionPatch(args: Record<string, unknown>): Partial<Omit<Definition, 'id'>>;
//# sourceMappingURL=entity-store.d.ts.map