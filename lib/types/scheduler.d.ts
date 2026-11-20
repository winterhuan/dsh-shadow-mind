/** Pure trigger and model-filter decisions for Shadow activations. */
import type { Definition } from './definitions.ts';
export interface Activation {
    readonly definition: Definition;
    readonly roll: number;
}
export interface Decision {
    readonly heartbeatRoll?: number;
    readonly activated: readonly Activation[];
    readonly candidates: readonly {
        id: string;
        roll: number;
        selected: boolean;
    }[];
    readonly modelFiltered: readonly string[];
    readonly runningExcluded: readonly string[];
    readonly toolFiltered: readonly string[];
    readonly roundFiltered: readonly string[];
}
export declare function matchesModel(definition: Definition, mainModel: string): boolean;
export declare function decideHeartbeat(options: {
    definitions: readonly Definition[];
    heartbeatProbability: number;
    heartbeatTools: readonly string[];
    mainModel: string;
    executedTools: readonly string[];
    active: ReadonlySet<string>;
    availableSlots: number;
    random: () => number;
}): Decision;
export declare function decideFinalResponse(options: {
    definitions: readonly Definition[];
    mainModel: string;
    active: ReadonlySet<string>;
    rounds: ReadonlyMap<string, number>;
}): Decision;
//# sourceMappingURL=scheduler.d.ts.map