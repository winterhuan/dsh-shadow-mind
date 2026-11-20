/** Compact paired tool-call evidence without retaining tool output payloads. */
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
export interface ToolObservation {
    readonly name: string;
    readonly arguments: string;
    readonly result: string;
}
export declare function summarizeToolCall(name: string, args: string): string;
export declare function summarizeToolResult(name: string, content: readonly ContentBlock[], failed: boolean): string;
//# sourceMappingURL=summaries.d.ts.map