/** Human controls use DSH's existing command results and conversation UI. */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "shadow-mind-commands";
export declare const inject: string[];
/**
 * Register the original human controls while the runtime owns scheduling.
 * @param ctx - Plugin context owning the command registration.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=commands.d.ts.map