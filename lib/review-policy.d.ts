/** Read-only tool exposure and execution policy shared by every review child. */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "shadow-mind-review-policy";
export declare const inject: string[];
/**
 * Apply the same allowlist to prompt assembly and actual tool dispatch.
 * @param ctx - Review preset context; all effects unwind with its scope.
 */
export declare function apply(ctx: Context): void;
