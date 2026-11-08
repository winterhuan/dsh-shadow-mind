/** Structured result validation and durable attribution for review feedback. */
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools';
import type { MessageId } from '@deepseek-ai/dsh-llm';
import type { SessionId } from '@deepseek-ai/dsh-session';
/** A validated result; infrastructure failures never become silent reviews. */
export interface ReviewResult {
    readonly status: 'report' | 'silent' | 'not_relevant';
    readonly content: string;
    readonly refs: readonly number[];
}
/** Attribution carried with every accepted report in the parent's durable message. */
export interface Report extends ReviewResult {
    readonly runId: string;
    readonly shadowId: string;
    readonly shadowName: string;
    readonly childSessionId: SessionId;
    readonly capturedThroughSeq: number;
}
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'shadow-report': {
            readonly kind: 'shadow-report';
            readonly form: 'relay';
            readonly taskId: MessageId;
            readonly reports: readonly Report[];
        };
    }
}
/**
 * Create the native structured-output schema for a bounded result.
 * @param maxChars - Maximum report content length.
 * @returns Object schema accepted by the DSH subagent service.
 */
export declare function resultSchema(maxChars: number): ObjectJsonSchema;
/**
 * Validate an activation result and every citation against its captured input.
 * @param value - Untrusted structured model output.
 * @param refs - References actually supplied to this child.
 * @param maxChars - Maximum accepted report length.
 * @returns Normalized result; invalid or contradictory results throw.
 */
export declare function parseResult(value: unknown, refs: readonly number[], maxChars: number): ReviewResult;
