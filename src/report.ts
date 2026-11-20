/** Structured result validation and durable attribution for review feedback. */
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import type { MessageId } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'

/** A validated result; infrastructure failures never become silent reviews. */
export interface ReviewResult {
  readonly status: 'report' | 'silent' | 'not_relevant'
  readonly content: string
  readonly refs: readonly number[]
}

/** Attribution carried with every accepted report in the parent's durable message. */
export interface Report extends ReviewResult {
  readonly mode: 'review' | 'worker'
  readonly runId: string
  readonly shadowId: string
  readonly shadowName: string
  readonly childSessionId: SessionId
  readonly capturedThroughSeq: number
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'shadow-report': { readonly kind: 'shadow-report'; readonly form: 'relay'; readonly taskId: MessageId; readonly reports: readonly Report[] }
  }
}

/**
 * Create the native structured-output schema for a bounded result.
 * @param maxChars - Maximum report content length.
 * @returns Object schema accepted by the DSH subagent service.
 */
export function resultSchema(maxChars: number, mode: 'review' | 'worker' = 'review'): ObjectJsonSchema {
  return { type: 'object', additionalProperties: false, properties: {
    status: { type: 'string', enum: ['report', 'silent', 'not_relevant'] },
    content: { type: 'string', description: `At most ${maxChars} characters. Empty for silent and not_relevant.` },
    refs: { type: 'array', items: { type: 'integer' }, description: mode === 'review' ? 'At most 20 displayed seq values. Findings require at least one reference.' : 'At most 20 displayed seq values from the supplied trajectory.' },
  }, required: ['status', 'content', 'refs'] }
}

/**
 * Validate an activation result and every citation against its captured input.
 * @param value - Untrusted structured model output.
 * @param refs - References actually supplied to this child.
 * @param maxChars - Maximum accepted report length.
 * @returns Normalized result; invalid or contradictory results throw.
 */
export function parseResult(value: unknown, refs: readonly number[], maxChars: number, mode: 'review' | 'worker' = 'review'): ReviewResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('review returned no structured result')
  const data = value as Record<string, unknown>
  const { status, content } = data
  if (status !== 'report' && status !== 'silent' && status !== 'not_relevant') throw new Error('invalid review status')
  if (typeof content !== 'string' || content.length > maxChars) throw new Error('invalid review content length')
  if (!Array.isArray(data.refs) || data.refs.length > 20 || !data.refs.every((ref: unknown) => typeof ref === 'number' && Number.isSafeInteger(ref) && refs.includes(ref))) throw new Error('review cited an event outside its captured trajectory')
  const cited: number[] = data.refs
  if (status === 'report' ? content.trim() === '' || (mode === 'review' && cited.length === 0) : content !== '' || cited.length !== 0) throw new Error('reports require content and review findings require evidence; silent results require empty content and refs')
  return { status, content: content.trim(), refs: [...new Set(cited)] }
}
